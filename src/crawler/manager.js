import { launchBrowser, closeBrowser, sleep, downloadImage } from './utils.js';
import * as storage from '../lib/storage.js';
import { config } from '../config.js';
import * as narou from './sites/narou.js';
import * as kakuyomu from './sites/kakuyomu.js';
import path from 'path';

// サイト別ハンドラの登録
const SITES = {
    narou,
    kakuyomu
};

// 排他制御用ロック (Key: "siteType:novelId:epNo")
const PROCESSING_LOCKS = new Map();

export async function crawlNovel(siteType, novelId, listId) {
    const scraper = SITES[siteType];
    if (!scraper) {
        throw new Error(`Unknown site type: ${siteType}`);
    }

    // 0. APIによる軽量更新チェック (実装されている場合のみ)
    if (typeof scraper.checkInfoViaApi === 'function') {
        const remoteInfo = await scraper.checkInfoViaApi(novelId);
        if (remoteInfo) {
            // ローカルの最新情報を取得して比較
            // (注意: listIdがnullの場合は強制クロールかもしれないが、ここでは軽量化優先)
            // ただし、listIdが渡されていない手動実行等の場合は常に最新を取りたいかもしれない。
            // schedule実行時はlistIdが渡される想定。

            // まずはストレージから現在の情報を取得するには、listIdが必要。
            // listIdがない場合でも info.json はあるのでそれと比較できる。

            const infoPath = path.join(config.paths.novels, siteType, novelId, 'info.json');
            const localInfo = await storage.readJson(infoPath);

            if (localInfo) {
                // エピソード数が同じ、かつ、最終更新日が古くないならスキップ
                // (念のため episode数のみチェックでも十分強力)
                if (remoteInfo.total_episodes <= localInfo.total_episodes) {
                    console.log(`[Narou-API] No updates found for ${remoteInfo.title} (Ep: ${localInfo.total_episodes} -> ${remoteInfo.total_episodes}). Skipping browser launch.`);
                    return;
                } else {
                    console.log(`[Narou-API] Update detected for ${remoteInfo.title} (Ep: ${localInfo.total_episodes} -> ${remoteInfo.total_episodes}). Starting crawl...`);
                }
            }
        }
    }

    const browser = await launchBrowser();
    const page = await browser.newPage();

    try {
        console.log(`[Crawler] Info取得開始: ${siteType} / ${novelId}`);

        // 1. 基本情報の取得
        const info = await scraper.getNovelInfo(page, novelId);

        // 基本情報の保存 (ファイル)
        await storage.saveNovelInfo(siteType, novelId, info);
        // 全リストのメタデータを更新 (ここで790/789問題を解決)
        await storage.updateNovelMetadataInAllLists(novelId, info);
        console.log(`[Crawler] 基本情報を保存しました: ${info.title} (全${info.total_episodes}話)`);

        // リスト情報の更新 (リストに残っている場合のみ更新)
        if (listId) {
            // キャンセル(削除)チェック
            const current = await storage.getNovelFromList(listId, novelId);
            if (current) {
                const tempNovelData = {
                    novel_id: novelId,
                    site_type: siteType,
                    title: info.title,
                    author: info.author,
                    total_episodes: info.total_episodes,
                    last_update: info.last_update,
                    description: info.description || '',
                    is_downloading: true // ダウンロード続行中
                };
                await storage.addNovelToList(listId, tempNovelData);
                console.log(`[Crawler] リストのメタデータを更新しました: ${info.title} (ダウンロード中)`);
            } else {
                console.log(`[Crawler] リストから削除されているため、メタデータ更新をスキップしました: ${novelId}`);
            }
        }

        // 2. 各話の取得ループ
        let downloadCount = 0;

        for (const chapter of info.chapters) {
            for (const ep of chapter.episodes) {
                const epNo = ep.ep_no;
                const lockKey = `${siteType}:${novelId}:${epNo}`;

                // 都度DLで処理中の場合はスキップ (競合回避)
                if (PROCESSING_LOCKS.has(lockKey)) {
                    console.log(`[Crawler] Locked (On-Demand processing): ep.${epNo}. Skipping.`);
                    continue;
                }

                const exists = await checkEpisodeExists(siteType, novelId, epNo);

                if (exists) {
                    // console.log(`[Crawler] Skip ep.${epNo}`);
                    continue;
                }

                try {
                    console.log(`[Crawler] 本文取得中: ep.${epNo} - ${ep.ep_title}`);
                    await sleep(3000); // 3秒待機

                    // 再度ロックチェック (待機中にロックされた場合)
                    if (PROCESSING_LOCKS.has(lockKey)) continue;

                    const content = await scraper.getEpisodeContent(page, novelId, epNo);

                    // 画像ダウンロード処理
                    if (content.image_urls && content.image_urls.length > 0) {
                        const localImages = [];
                        let imgIndex = 0;
                        const imgSaveDir = path.join(config.paths.novels, siteType, novelId, 'images');

                        for (const imgUrl of content.image_urls) {
                            try {
                                const ext = path.extname(imgUrl) || '.jpg';
                                const filename = `ep${epNo}_${imgIndex}${ext}`;

                                await sleep(1000); // 画像DLも少し休む
                                const savedPath = await downloadImage(imgUrl, imgSaveDir, filename);

                                if (savedPath) {
                                    localImages.push({ original: imgUrl, local: `images/${filename}` });
                                }
                                imgIndex++;
                            } catch (imgErr) {
                                console.warn(`[Crawler] Image download failed: ${imgUrl}`, imgErr);
                            }
                        }
                        content.local_images = localImages;
                    }

                    // 本文保存
                    content.download_date = new Date().toISOString();
                    await storage.saveEpisode(siteType, novelId, epNo, content);
                    downloadCount++;

                } catch (epErr) {
                    console.error(`[Crawler] Error in ep.${epNo}:`, epErr);
                    // 1話失敗しても次へ進む
                }
            }
        }

        console.log(`[Crawler] 完了。新規ダウンロード: ${downloadCount}件`);

        // ダウンロード完了フラグを更新
        if (listId) {
            const current = await storage.getNovelFromList(listId, novelId);
            if (current) {
                await storage.addNovelToList(listId, {
                    ...current,
                    is_downloading: false
                });
                console.log(`[Crawler] ダウンロード完了フラグを更新しました: ${info.title} (Success)`);
            }
        }

    } catch (err) {
        console.error(`[Crawler] エラー発生:`, err);
        throw err;
    } finally {
        // browser.close() ではなく closeBrowser(release通知) を呼ぶ
        await closeBrowser(browser);
    }
}

// ヘルパー: エピソードファイルが存在するか確認
async function checkEpisodeExists(siteType, novelId, epNo) {
    const filePath = path.join(config.paths.novels, siteType, novelId, `ep_${epNo}.json`);
    const data = await storage.readJson(filePath);
    return !!data;
}

/**
 * URLからサイトタイプとIDを判定
 * @param {string} url 
 */
export function detectSiteAndId(url) {
    // なろう: https://ncode.syosetu.com/n1234abc/
    if (url.includes('syosetu.com')) {
        const match = url.match(/ncode\.syosetu\.com\/([nN]\d+[a-zA-Z]+)/);
        if (match) return { siteType: 'narou', novelId: match[1].toLowerCase() };
    }
    // カクヨム: https://kakuyomu.jp/works/1177354054880238351
    if (url.includes('kakuyomu.jp')) {
        const match = url.match(/works\/(\d+)/);
        if (match) return { siteType: 'kakuyomu', novelId: match[1] };
    }
    throw new Error('Unsupported URL');
}

/**
 * URLを指定して小説を追加・登録
 * @param {string} url 
 * @param {string} listId 
 */
const DOWNLOAD_QUEUE = [];
let activeDownloads = 0;
const MAX_CONCURRENT_DOWNLOADS = 1;

export async function addNovelByUrl(url, listId) {
    const { siteType, novelId } = detectSiteAndId(url);

    // 0. API等による軽量事前チェック (タイトル即時取得)
    let tempTitle = 'ダウンロード待ち...';
    let tempAuthor = url;
    let fetchedEpisodes = 0;

    try {
        const scraper = SITES[siteType];
        if (scraper && typeof scraper.checkInfoLowCost === 'function') {
            const lowCostInfo = await scraper.checkInfoLowCost(novelId);
            if (lowCostInfo && lowCostInfo.title) {
                tempTitle = lowCostInfo.title;
                tempAuthor = lowCostInfo.author || url;
                fetchedEpisodes = lowCostInfo.total_episodes || 0;
                console.log(`[Crawler] Pre-fetched title: ${tempTitle}`);

                // Placeholder Infoを作成して保存
                if (fetchedEpisodes > 0) {
                    let chapters = [];

                    if (lowCostInfo.chapters && lowCostInfo.chapters.length > 0) {
                        // カクヨムなど完全なデータが取れた場合
                        chapters = lowCostInfo.chapters;
                        console.log(`[Crawler] Using fetched chapter structure (${chapters.length} chapters)`);
                    } else {
                        // なろうなど簡易データの場合 (ダミー生成)
                        chapters = [{
                            chapter_title: '本編',
                            episodes: Array.from({ length: fetchedEpisodes }, (_, i) => ({
                                ep_no: i + 1,
                                ep_title: `第${i + 1}話`,
                                post_date: lowCostInfo.last_update,
                                episode_id: `dummy_${i + 1}`
                            }))
                        }];
                    }

                    const placeholderInfo = {
                        title: tempTitle,
                        author: tempAuthor,
                        description: 'ダウンロード待ち... (詳細情報は順次取得されます)',
                        total_episodes: fetchedEpisodes,
                        last_update: lowCostInfo.last_update,
                        url: url,
                        site_type: siteType,
                        novel_id: novelId,
                        chapters: chapters
                    };

                    // フォルダ作成と保存
                    await storage.saveNovelInfo(siteType, novelId, placeholderInfo);
                    console.log(`[Crawler] Saved placeholder info.json for ${tempTitle}`);
                }
            }
        }
    } catch (e) {
        console.warn('[Crawler] Pre-fetch title failed:', e);
    }

    // 1. 仮データ保存
    const tempNovelData = {
        novel_id: novelId,
        site_type: siteType,
        title: tempTitle,
        author: tempAuthor,
        total_episodes: fetchedEpisodes,
        last_update: new Date().toISOString(),
        is_downloading: true
    };

    // 既存データを保持しつつ更新
    try {
        const current = await storage.getNovelFromList(listId, novelId);
        if (current) {
            // 既にダウンロード中なら何もしない（二重登録防止）
            if (current.is_downloading && current.title !== 'ダウンロード失敗') {
                console.log(`[Crawler] ${current.title} は既にダウンロードキューまたは進行中です。`);
                return current;
            }
        }
        await storage.addNovelToList(listId, tempNovelData);
    } catch (e) {
        console.warn('[Crawler] 仮データ保存に失敗しましたが続行します', e);
    }

    // キューに追加して処理開始を試みる
    return new Promise((resolve, reject) => {
        DOWNLOAD_QUEUE.push({
            url,
            listId,
            siteType,
            novelId,
            resolve,
            reject
        });
        processQueue();
    });
}

// キュー処理ワーカー
async function processQueue() {
    if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS || DOWNLOAD_QUEUE.length === 0) {
        return;
    }

    activeDownloads++;
    const task = DOWNLOAD_QUEUE.shift();

    try {
        console.log(`[Crawler] ダウンロード開始: ${task.url} (残りキュー: ${DOWNLOAD_QUEUE.length})`);

        // ステータスを「ダウンロード中」に更新
        try {
            const current = await storage.getNovelFromList(task.listId, task.novelId);
            if (current) {
                await storage.addNovelToList(task.listId, {
                    ...current,
                    title: current.title === 'ダウンロード待ち...' ? 'ダウンロード中...' : current.title,
                });
            }
        } catch (e) { /* ignore */ }


        // 1. クロール実行 (Info & 本文保存)
        await crawlNovel(task.siteType, task.novelId, task.listId);

        // 2. Info読み込み
        const infoPath = path.join(config.paths.novels, task.siteType, task.novelId, 'info.json');
        const info = await storage.readJson(infoPath);

        if (!info) throw new Error('Crawl failed (Info not found)');

        // 3. リスト用データの構築
        const novelData = {
            novel_id: task.novelId,
            site_type: task.siteType,
            title: info.title,
            author: info.author,
            total_episodes: info.total_episodes,
            last_update: info.last_update,
            description: info.description || '',
            bookmark: null,
            history: null,
            is_downloading: false // 完了
        };

        // 4. 指定リストに追加
        const current = await storage.getNovelFromList(task.listId, task.novelId);
        if (current) {
            // 既存の栞などを維持
            const mergedData = { ...novelData, bookmark: current.bookmark, history: current.history };
            await storage.addNovelToList(task.listId, mergedData);
            console.log(`[Crawler] 完了: ${info.title}`);
            task.resolve(mergedData);
        } else {
            console.log(`[Crawler] リストから削除されたため更新スキップ: ${task.novelId}`);
            task.resolve(null);
        }

    } catch (e) {
        console.error(`[Crawler] Error processing ${task.url}: ${e.message}`);

        // エラー状態の保存
        try {
            const current = await storage.getNovelFromList(task.listId, task.novelId);
            if (current && current.is_downloading) {
                const errorData = {
                    ...current,
                    title: current.title === 'ダウンロード中...' || current.title === 'ダウンロード待ち...' ? 'ダウンロード失敗' : current.title,
                    is_downloading: false
                };
                await storage.addNovelToList(task.listId, errorData);
            }
        } catch (recoverErr) {
            console.error('Failed to recover status:', recoverErr);
        }

        task.reject(e);
    } finally {
        activeDownloads--;
        // 次のタスクがあれば少し間隔を空けて実行（連続アクセス緩和）
        setTimeout(() => processQueue(), 2000);
    }
}

/**
 * 都度ダウンロード実行 (On-Demand Fetch)
 * シングルブラウザインスタンスを使い、指定された1話だけをDLする。
 * バックグラウンド処理との競合をロックで防ぐ。
 */
export async function fetchAndSaveEpisode(siteType, novelId, epNo) {
    const lockKey = `${siteType}:${novelId}:${epNo}`;

    // 1. ロックチェック
    if (PROCESSING_LOCKS.has(lockKey)) {
        console.log(`[Lock] Waiting for background download... ${lockKey}`);
        try {
            // ロックが解除されるのを待つ (Promise)
            await PROCESSING_LOCKS.get(lockKey);
            // 解除後、既にファイルがあるはずなので再読み込みを促す意味で完了を返す
            console.log(`[Lock] Background download finished. Return content.`);
            const filePath = path.join(config.paths.novels, siteType, novelId, `ep_${epNo}.json`);
            return await storage.readJson(filePath);
        } catch (e) {
            throw new Error('Background download failed, cannot fetch.');
        }
    }

    // 2. ロック取得
    // コンテンツ取得のPromiseをセットする (外部から待てるように)
    let resolveLock;
    let rejectLock;
    const lockPromise = new Promise((resolve, reject) => {
        resolveLock = resolve;
        rejectLock = reject;
    });
    PROCESSING_LOCKS.set(lockKey, lockPromise);

    const scraper = SITES[siteType];
    let browser = null;

    try {
        console.log(`[On-Demand] Fetching ${lockKey}...`);

        // ブラウザ取得 (Singleton)
        browser = await launchBrowser();
        const page = await browser.newPage();

        try {
            // 本文取得
            const content = await scraper.getEpisodeContent(page, novelId, epNo);

            // 本文保存
            content.download_date = new Date().toISOString();
            await storage.saveEpisode(siteType, novelId, epNo, content);

            console.log(`[On-Demand] Success: ${content.ep_title}`);
            resolveLock(); // ロック解除通知

            return content;

        } catch (err) {
            rejectLock(err);
            throw err;
        } finally {
            if (page) await page.close().catch(() => { });
        }

    } catch (err) {
        console.error(`[On-Demand] Error:`, err);
        throw err;
    } finally {
        // ロック削除
        PROCESSING_LOCKS.delete(lockKey);

        // ブラウザリリース (閉じずにアイドルタイマーへ)
        if (browser) {
            await closeBrowser(browser);
        }
    }
}

/**
 * 起動時に中断されたダウンロードを再開する
 */
export async function resumeInterruptedDownloads() {
    const interrupted = await storage.getInterruptedNovels();
    if (interrupted.length === 0) return;

    console.log(`[Crawler] Resuming ${interrupted.length} interrupted downloads...`);

    for (const item of interrupted) {
        // Queueに直接突っ込む
        let url = item.title; // fallback
        if (item.siteType === 'narou') url = `https://ncode.syosetu.com/${item.novelId}/`;
        else if (item.siteType === 'kakuyomu') url = `https://kakuyomu.jp/works/${item.novelId}`;

        DOWNLOAD_QUEUE.push({
            url: url,
            listId: item.listId,
            siteType: item.siteType,
            novelId: item.novelId,
            resolve: () => console.log(`[Resume] Finished: ${item.title}`),
            reject: (e) => console.error(`[Resume] Failed: ${item.title}`, e)
        });
    }

    // 処理開始
    processQueue();
}
