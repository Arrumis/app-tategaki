import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

// ヘルパー: ディレクトリが存在することを確認する（なければ作る）
async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// JSON読み込み
export async function readJson(filePath, defaultValue = null) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return defaultValue;
        }
        if (err instanceof SyntaxError) {
            console.warn(`[Storage] JSON parse error at ${filePath}: ${err.message}. Returning default value.`);
            return defaultValue;
        }
        throw err;
    }
}

// JSON書き込み
export async function writeJson(filePath, data) {
    const dir = path.dirname(filePath);
    await ensureDir(dir);
    // 整形して書き込む
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * お気に入りリストを取得
 * @param {string} listId 
 */
export async function getFavList(listId) {
    const filePath = path.join(config.paths.favs, `${listId}.json`);
    return await readJson(filePath, {
        list_id: listId,
        novels: [],
        created_at: new Date().toISOString()
    });
}

/**
 * 小説一覧情報を保存
 * @param {string} siteType 
 * @param {string} novelId 
 * @param {object} infoData 
 */
export async function saveNovelInfo(siteType, novelId, infoData) {
    const filePath = path.join(config.paths.novels, siteType, novelId, 'info.json');
    await writeJson(filePath, infoData);
}

/**
 * 小説のエピソード本文を保存
 * @param {string} siteType 
 * @param {string} novelId 
 * @param {number} epNo 
 * @param {object} contentData 
 */
export async function saveEpisode(siteType, novelId, epNo, contentData) {
    const filePath = path.join(config.paths.novels, siteType, novelId, `ep_${epNo}.json`);
    await writeJson(filePath, contentData);
}

// ヘルパー: 小説が含まれている実際のリストIDを探す (最初に見つかった1つを返す)
async function findNovelListId(userId, novelId) {
    const ids = await findAllListsContainingNovel(novelId, userId);
    return ids.length > 0 ? ids[0] : null;
}

// ヘルパー: 小説が含まれているすべてのリストIDを探す
async function findAllListsContainingNovel(novelId, userId = 'default') {
    const meta = await getUserLists(userId);
    const foundIds = [];
    for (const listMeta of meta.lists) {
        const filePath = path.join(config.paths.favs, `${listMeta.id}.json`);
        // ファイル読み込みコスト削減のため、本当はキャッシュしたほうがいいが今回は直接読む
        const listData = await readJson(filePath);
        if (listData && listData.novels && listData.novels.some(n => n.novel_id === novelId)) {
            foundIds.push(listMeta.id);
        }
    }
    return foundIds;
}

/**
 * 全リスト内の特定小説のメタデータを一括更新する
 * @param {string} novelId
 * @param {object} metadata { title, author, total_episodes, last_update, description }
 */
export async function updateNovelMetadataInAllLists(novelId, metadata) {
    return await runWithLock(async () => {
        const targetListIds = await findAllListsContainingNovel(novelId);
        let updatedCount = 0;

        for (const listId of targetListIds) {
            const filePath = path.join(config.paths.favs, `${listId}.json`);
            const list = await readJson(filePath);
            if (!list || !list.novels) continue;

            let changed = false;
            list.novels = list.novels.map(novel => {
                if (novel.novel_id === novelId) {
                    // 変更があるか簡易チェック（最終更新日時などで）
                    if (novel.total_episodes !== metadata.total_episodes ||
                        novel.last_update !== metadata.last_update ||
                        novel.title !== metadata.title) {

                        changed = true;
                        return {
                            ...novel,
                            title: metadata.title,
                            author: metadata.author,
                            total_episodes: metadata.total_episodes,
                            last_update: metadata.last_update,
                            description: metadata.description || novel.description
                        };
                    }
                }
                return novel;
            });

            if (changed) {
                await writeJson(filePath, list);
                updatedCount++;
            }
        }
        if (updatedCount > 0) {
            console.log(`[Storage] Synced metadata for ${novelId} across ${updatedCount} lists.`);
        }
    });
}

/**
 * しおりを更新する
 * @param {string} listId 
 * @param {string} novelId 
 * @param {object} bookmarkData { ep_no, ep_title, scroll_pos }
 */
let storageLock = Promise.resolve();
async function runWithLock(fn) {
    const prevLock = storageLock;
    storageLock = (async () => {
        await prevLock;
        return await fn();
    })();
    return storageLock;
}

export async function updateBookmark(listId, novelId, bookmarkData) {
    return await runWithLock(async () => {
        // 1. その小説が含まれるすべてのリストIDを取得
        // (listIdが 'default' の場合も考慮して、まずは全検索相当を行うのが確実)
        // 引数の listId が特定リストの場合、そこには必ずあるはずだが、
        // 他のリストにもあるかもしれないので全検索する。
        const targetListIds = await findAllListsContainingNovel(novelId);

        if (targetListIds.length === 0) {
            console.warn(`[Storage] Novel ${novelId} not found in any list for bookmark update.`);
            return null;
        }

        let resultList = null;

        // 2. 見つかった全リストに対して更新を実行
        for (const targetId of targetListIds) {
            const filePath = path.join(config.paths.favs, `${targetId}.json`);
            const list = await readJson(filePath);

            if (!list) continue;

            const novel = list.novels.find(n => n.novel_id === novelId);
            if (novel) {
                // しおり更新
                novel.bookmark = {
                    ...novel.bookmark,
                    ...bookmarkData
                };
                // 保存
                await writeJson(filePath, list);

                // 要求されたlistIdのリストであれば、戻り値用に保持
                if (targetId === listId) {
                    resultList = list;
                } else if (listId === 'default' && !resultList) {
                    // default要求でまだ結果がないなら、とりあえずこれを入れる
                    resultList = list;
                }
            }
        }

        return resultList;
    });
}

/**
 * 閲覧履歴を更新する (オートセーブ用)
 * @param {string} listId 
 * @param {string} novelId 
 * @param {object} historyData { ep_no, ep_title, scroll_pos }
 */
export async function updateHistory(listId, novelId, historyData) {
    return await runWithLock(async () => {
        const targetListIds = await findAllListsContainingNovel(novelId);

        if (targetListIds.length === 0) {
            console.warn(`[Storage] Novel ${novelId} not found in any list for history update.`);
            return null;
        }

        let resultList = null;

        for (const targetId of targetListIds) {
            const filePath = path.join(config.paths.favs, `${targetId}.json`);
            const list = await readJson(filePath);

            if (!list) continue;

            const novel = list.novels.find(n => n.novel_id === novelId);
            if (novel) {
                // 履歴更新
                novel.history = {
                    ...novel.history,
                    ...historyData,
                    updated_at: new Date().toISOString()
                };
                // 保存
                await writeJson(filePath, list);

                if (targetId === listId) {
                    resultList = list;
                } else if (listId === 'default' && !resultList) {
                    resultList = list;
                }
            }
        }

        return resultList;
    });
}

/**
 * ユーザーの保持するリスト一覧を取得
 * @param {string} userId
 */
export async function getUserLists(userId = 'default') {
    const metaPath = path.join(config.paths.users, userId, 'meta.json');
    const defaultMeta = {
        lists: [
            { id: 'default', name: 'すべて', description: 'デフォルトのリスト' }
        ]
    };
    return await readJson(metaPath, defaultMeta);
}

/**
 * 新しいリストを作成
 * @param {string} userId
 * @param {string} listName
 * @param {string} description
 */
export async function createUserList(userId, listName, description = '') {
    return await runWithLock(async () => {
        const metaPath = path.join(config.paths.users, userId, 'meta.json');
        const meta = await getUserLists(userId);

        const listId = `list_${Date.now()}`; // 簡易ユニークID
        const newList = {
            id: listId,
            name: listName,
            description: description
        };

        // メタデータ更新
        meta.lists.push(newList);
        await writeJson(metaPath, meta);

        // 空のリストファイル作成 (data/favs/{listId}.json)
        const listPath = path.join(config.paths.favs, `${listId}.json`);
        await writeJson(listPath, {
            list_id: listId,
            user_id: userId,
            novels: [],
            created_at: new Date().toISOString()
        });

        return newList;
    });
}

/**
 * 指定のリストに小説を追加・登録する
 */
export async function addNovelToList(listId, novelData) {
    return await runWithLock(async () => {
        // ゴミ箱に入っていれば削除（有効化するため）
        await removeFromTrash(novelData.novel_id);

        const filePath = path.join(config.paths.favs, `${listId}.json`);
        let list = await readJson(filePath);
        if (!list) {
            list = { list_id: listId, novels: [], created_at: new Date().toISOString() };
        }

        const exists = list.novels.some(n => n.novel_id === novelData.novel_id);
        if (exists) {
            list.novels = list.novels.map(n => {
                if (n.novel_id === novelData.novel_id) {
                    const oldBm = n.bookmark || { ep_no: 0 };
                    const newBm = novelData.bookmark || { ep_no: 0 };
                    const mergedBookmark = (newBm.ep_no > oldBm.ep_no) ? (novelData.bookmark || n.bookmark) : n.bookmark;
                    const oldHist = n.history || { updated_at: '1970-01-01' };
                    const newHist = novelData.history || { updated_at: '1970-01-01' };
                    const mergedHistory = (new Date(newHist.updated_at) > new Date(oldHist.updated_at)) ? (novelData.history || n.history) : n.history;
                    return { ...novelData, bookmark: mergedBookmark, history: mergedHistory };
                }
                return n;
            });
        } else {
            list.novels.push(novelData);
        }
        await writeJson(filePath, list);
        return list;
    });
}

/**
 * 指定のリストから小説を削除する
 */
export async function removeNovelFromList(listId, novelId) {
    return await runWithLock(async () => {
        const filePath = path.join(config.paths.favs, `${listId}.json`);
        const list = await readJson(filePath);
        if (!list || !list.novels) return null;

        const novelToDelete = list.novels.find(n => n.novel_id === novelId);
        if (!novelToDelete) return list;

        const initialLength = list.novels.length;
        list.novels = list.novels.filter(n => n.novel_id !== novelId);

        if (list.novels.length !== initialLength) {
            await writeJson(filePath, list);
            console.log(`[Storage] Removed ${novelId} from list ${listId}`);

            // 他のどのリストにも残っていないかチェック
            const otherListId = await findNovelListId('default', novelId);
            if (!otherListId) {
                // どこにも登録されていないので「ゴミ箱」へ移動（物理削除はしない）
                console.log(`[Storage] Moving ${novelId} to trash (archived)`);
                await addToTrash(novelToDelete);
            }
        }
        return list;
    });
}

// --- Trash (ゴミ箱) 管理ヘルパー ---

async function getTrash() {
    const trashPath = path.join(config.paths.favs, 'trash.json');
    return await readJson(trashPath, { list_id: 'trash', novels: [] });
}

async function addToTrash(novelData) {
    const trashPath = path.join(config.paths.favs, 'trash.json');
    const trash = await getTrash();
    if (!trash.novels.some(n => n.novel_id === novelData.novel_id)) {
        trash.novels.push({ ...novelData, deleted_at: new Date().toISOString() });
        await writeJson(trashPath, trash);
    }
}

async function removeFromTrash(novelId) {
    const trashPath = path.join(config.paths.favs, 'trash.json');
    const trash = await getTrash();
    const initialLength = trash.novels.length;
    trash.novels = trash.novels.filter(n => n.novel_id !== novelId);
    if (trash.novels.length !== initialLength) {
        await writeJson(trashPath, trash);
    }
}

/**
 * リストを削除する
 * 削除されるリスト内の小説はすべて 'default' リストへ移動（マージ）される
 * @param {string} userId
 * @param {string} listId
 */
export async function deleteUserList(userId, listId) {
    if (listId === 'default') {
        throw new Error('Cannot delete default list');
    }

    // ロック外でリスト情報を取得（addNovelToListが中でロックを管理するため）
    // ただし、一連の処理がアトミックである必要があるため、ここもロック内で実行するように調整。
    return await runWithLock(async () => {
        // 1. 削除対象リストのデータを取得
        const targetListPath = path.join(config.paths.favs, `${listId}.json`);
        const targetList = await readJson(targetListPath);

        // 2. 小説データを default リストへ退避 (addNovelToList内部のrunWithLockがネストするため回避が必要)
        // 簡易化のため、ここでは直接default.jsonを操作するか、Promise管理を工夫する。
        if (targetList && targetList.novels && targetList.novels.length > 0) {
            const defaultPath = path.join(config.paths.favs, `default.json`);
            let defaultList = await readJson(defaultPath, { list_id: 'default', novels: [], created_at: new Date().toISOString() });

            for (const novel of targetList.novels) {
                delete novel._sourceListId;

                const existsIdx = defaultList.novels.findIndex(n => n.novel_id === novel.novel_id);
                if (existsIdx >= 0) {
                    // 既存ならマージ
                    const existing = defaultList.novels[existsIdx];
                    const mergedBm = (novel.bookmark?.ep_no > existing.bookmark?.ep_no) ? novel.bookmark : existing.bookmark;
                    defaultList.novels[existsIdx] = { ...novel, bookmark: mergedBm };
                } else {
                    defaultList.novels.push(novel);
                }
            }
            await writeJson(defaultPath, defaultList);
        }

        // 3. メタデータからリスト定義を削除
        const metaPath = path.join(config.paths.users, userId, 'meta.json');
        const meta = await getUserLists(userId);
        meta.lists = meta.lists.filter(l => l.id !== listId);
        await writeJson(metaPath, meta);

        // 4. ファイル削除
        try { await fs.unlink(targetListPath); } catch (e) { if (e.code !== 'ENOENT') console.error(e); }

        return { success: true };
    });
}

/**
 * ユーザーの全リストに含まれる小説を結合して返す
 * @param {string} userId 
 */
export async function getUserAllNovels(userId) {
    const meta = await getUserLists(userId);
    const allNovelsMap = new Map();

    for (const listMeta of meta.lists) {
        const filePath = path.join(config.paths.favs, `${listMeta.id}.json`);
        const listData = await readJson(filePath);

        if (listData && listData.novels) {
            listData.novels.forEach(novel => {
                novel._sourceListId = listMeta.id;

                if (allNovelsMap.has(novel.novel_id)) {
                    const existing = allNovelsMap.get(novel.novel_id);
                    const getHistoryTime = (n) => n.history && n.history.updated_at ? new Date(n.history.updated_at).getTime() : 0;
                    const timeNew = getHistoryTime(novel);
                    const timeOld = getHistoryTime(existing);

                    if (timeNew > timeOld) {
                        allNovelsMap.set(novel.novel_id, novel);
                    } else if (timeNew === timeOld) {
                        const bmNew = novel.bookmark ? novel.bookmark.ep_no : 0;
                        const bmOld = existing.bookmark ? existing.bookmark.ep_no : 0;
                        if (bmNew > bmOld) allNovelsMap.set(novel.novel_id, novel);
                    }
                } else {
                    allNovelsMap.set(novel.novel_id, novel);
                }
            });
        }
    }

    return {
        list_id: 'default',
        novels: Array.from(allNovelsMap.values())
    };
}

/**
 * リスト内の特定の小説を取得（存在確認用）
 */
export async function getNovelFromList(listId, novelId) {
    const filePath = path.join(config.paths.favs, `${listId}.json`);
    const list = await readJson(filePath);
    if (!list || !list.novels) return null;
    return list.novels.find(n => n.novel_id === novelId) || null;
}

/**
 * 起動時に「ダウンロード中」のまま止まっているものを正常化する
 */
/**
 * ダウンロード中断状態の小説をすべて取得する (再開用)
 */
export async function getInterruptedNovels() {
    console.log('[Storage] Checking for interrupted downloads...');
    const interrupted = [];

    const userDir = config.paths.users;
    let userIds = [];
    try {
        const entries = await fs.readdir(userDir, { withFileTypes: true });
        userIds = entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch (e) {
        userIds = ['default'];
    }

    for (const userId of userIds) {
        const meta = await getUserLists(userId);
        if (!meta || !meta.lists) continue;

        for (const listMeta of meta.lists) {
            const filePath = path.join(config.paths.favs, `${listMeta.id}.json`);
            const list = await readJson(filePath);
            if (!list || !list.novels) continue;

            for (const novel of list.novels) {
                if (novel.is_downloading) {
                    interrupted.push({
                        listId: listMeta.id,
                        novelId: novel.novel_id,
                        siteType: novel.site_type,
                        title: novel.title
                    });
                }
            }
        }
    }

    // 孤立ファイルの救済もついでに行う
    await recoverOrphanedNovels();

    return interrupted;
}

// Retrofit for compatibility if needed, or just remove export if unused
export async function recoverDownloadingStatus() {
    // Deprecated: Now handled by resumeInterruptedDownloads in app.js
    // We do nothing here to preserve the 'is_downloading' state for the resumer.
    return;
}

/**
 * ディスク上のデータ(novels/)にあるが、どのお気に入りリストにも登録されていないものを救済する
 */
async function recoverOrphanedNovels() {
    console.log('[Storage] Checking for orphaned novels on disk...');

    // 全リストから現在登録済みの全IDを取得（Trashにあるものも含む）
    const allNovels = await getUserAllNovels('default');
    const trackedIds = new Set(allNovels.novels.map(n => n.novel_id));

    // ゴミ箱に入っているものも「追跡済み」に含める
    const trash = await getTrash();
    trash.novels.forEach(n => trackedIds.add(n.novel_id));

    const sites = ['narou', 'kakuyomu'];
    let recoveredCount = 0;

    for (const site of sites) {
        const sitePath = path.join(config.paths.novels, site);
        try {
            const novelDirs = await fs.readdir(sitePath, { withFileTypes: true });
            for (const entry of novelDirs) {
                if (entry.isDirectory() && !trackedIds.has(entry.name)) {
                    const novelId = entry.name;

                    const infoPath = path.join(sitePath, novelId, 'info.json');
                    const info = await readJson(infoPath);

                    if (info) {
                        const novelData = {
                            novel_id: novelId,
                            site_type: site,
                            title: info.title,
                            author: info.author,
                            total_episodes: info.total_episodes,
                            last_update: info.last_update,
                            description: info.description || '',
                            is_downloading: false
                        };
                        // デフォルトリストに追加
                        await addNovelToList('default', novelData);
                        recoveredCount++;
                        console.log(`[Storage] Recovered orphaned novel to "default": ${info.title} (${site}/${novelId})`);
                    }
                }
            }
        } catch (e) {
            if (e.code !== 'ENOENT') console.warn(`[Storage] Failed to read ${site} directory:`, e);
        }
    }

    if (recoveredCount > 0) {
        console.log(`[Storage] Orphan recovery completed. Recovered ${recoveredCount} novels.`);
    } else {
        console.log('[Storage] No orphaned novels found.');
    }
}
