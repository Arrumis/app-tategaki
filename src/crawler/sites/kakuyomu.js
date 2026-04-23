/**
 * カクヨム (kakuyomu) 用スクレイパー
 */
import * as storage from '../../lib/storage.js';
import { config } from '../../config.js';
import path from 'path';
import fs from 'fs/promises';

export const siteType = 'kakuyomu';

/**
 * 軽量な更新チェック (HTML Fetch & Regex)
 * @param {string} novelId
 */
export async function checkInfoLowCost(novelId) {
    try {
        const url = `https://kakuyomu.jp/works/${novelId}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (!res.ok) return null;

        const html = await res.text();

        // __NEXT_DATA__ を抽出
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) return null;

        const nextData = JSON.parse(match[1]);
        const apolloState = nextData.props?.pageProps?.__APOLLO_STATE__;
        if (!apolloState) return null;

        // Work:ID を探す
        const workKey = Object.keys(apolloState).find(k => k.startsWith('Work:') && apolloState[k].id === novelId);
        if (!workKey) return null;

        const work = apolloState[workKey];

        // 著者名解決
        let author = 'Unknown';
        if (work.author && work.author.__ref) {
            const authorObj = apolloState[work.author.__ref];
            if (authorObj) {
                author = authorObj.activityName || authorObj.name || 'Unknown';
            }
        }

        return {
            title: work.title,
            author: author,
            total_episodes: work.publicEpisodeCount || 0,
            last_update: work.lastEpisodePublishedAt || new Date().toISOString()
        };

    } catch (e) {
        console.warn(`[Kakuyomu-LowCost] Failed: ${e.message}`);
        return null;
    }
}

/**
 * 小説の基本情報を取得
 * Next.jsのHydration Data (__NEXT_DATA__) から直接パースする高速版
 */
export async function getNovelInfo(page, novelId) {
    const url = `https://kakuyomu.jp/works/${novelId}`;
    console.log(`[Kakuyomu] Scraping novel info: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // __NEXT_DATA__ からJSONを取得
    const nextDataJson = await page.locator('#__NEXT_DATA__').innerText().catch(() => null);
    if (!nextDataJson) {
        throw new Error('Failed to find __NEXT_DATA__ in page source');
    }

    const nextData = JSON.parse(nextDataJson);
    const apolloState = nextData.props?.pageProps?.__APOLLO_STATE__;

    if (!apolloState) {
        throw new Error('Apollo State not found in __NEXT_DATA__');
    }

    // Workオブジェクトを探す (Work:{id})
    // 形式は "Work:(novelId)" または単に "Work:..." でIDが一致するもの
    const workKey = Object.keys(apolloState).find(k => k.startsWith('Work:') && apolloState[k].id === novelId);
    if (!workKey) {
        throw new Error(`Work data not found for ID: ${novelId}`);
    }
    const work = apolloState[workKey];

    // 基本情報取得
    const title = work.title;
    const catchphrase = work.catchphrase || '';
    const introduction = work.introduction || '';
    const synopsis = (catchphrase ? catchphrase + '\n\n' : '') + introduction;

    // 著者情報
    let author = 'Unknown';
    if (work.author && work.author.__ref) {
        const authorObj = apolloState[work.author.__ref];
        if (authorObj) {
            author = authorObj.activityName || authorObj.name || 'Unknown';
        }
    }

    // エピソード総数・更新日
    const totalEpisodes = work.publicEpisodeCount || 0;
    let lastUpdateStr = work.lastEpisodePublishedAt || new Date().toISOString();

    console.log(`[Kakuyomu] Title: ${title}, Author: ${author}, Total: ${totalEpisodes}`);

    /*
      目次構造の解析:
      apolloState 内において、Work オブジェクトの tableOfContents フィールドが目次配列を持つ。
      各要素は { __ref: "TableOfContentsChapter:..." } (章) または { __ref: "Episode:..." } (章なしエピソード)
    */

    const chapters = [];
    let currentChapter = { chapter_title: '本編', episodes: [] };
    let epCount = 1;

    // Helper: Ref文字列からエピソード実データを抽出
    const extractEpisode = (refKey) => {
        const epObj = apolloState[refKey];
        if (!epObj) return null;

        return {
            ep_no: epCount++,
            ep_title: epObj.title,
            post_date: epObj.publishedAt || lastUpdateStr,
            episode_id: epObj.id
        };
    };

    const tocList = Array.isArray(work.tableOfContentsV2)
        ? work.tableOfContentsV2
        : (Array.isArray(work.tableOfContents) ? work.tableOfContents : []);

    if (tocList.length > 0) {
        for (const itemRef of tocList) {
            const refKey = itemRef.__ref;
            if (!refKey) continue;

            // refKeyが Chapter か Episode かで分岐
            if (refKey.startsWith('TableOfContentsChapter:') || refKey.startsWith('Chapter:')) {
                // 章オブジェクトを取得
                const toCChapObj = apolloState[refKey];
                if (!toCChapObj) continue;

                // タイトル決定
                // TableOfContentsChapter -> chapter -> {__ref: "Chapter:..."} というネスト構造の場合あり
                let chapTitle = toCChapObj.title || '無題';

                // もし toCChapObj.chapter があればそちらのタイトルを優先 (Chapter実体)
                if (toCChapObj.chapter && toCChapObj.chapter.__ref) {
                    const realChap = apolloState[toCChapObj.chapter.__ref];
                    if (realChap && realChap.title) {
                        chapTitle = realChap.title;
                    }
                }

                const newChapter = {
                    chapter_title: chapTitle,
                    episodes: []
                };

                // この章に含まれるエピソードIDリスト (Note: work.tableOfContents 内の Episode Ref とは別？)
                // 実は TableOfContentsChapter ではなく、Work データの構造によってはフラットではない。
                // さっきの curl ログだと:
                // "TableOfContentsChapter:..." : { episodes: [ {__ref:"Episode:..."}, ... ], chapter: {__ref:"Chapter:..."} }
                // となっていた。

                // Inspection result: Key is 'episodeUnions'
                const epList = toCChapObj.episodeUnions || toCChapObj.episodes || [];

                if (Array.isArray(epList)) {
                    for (const epRefWrapper of epList) {
                        const ref = epRefWrapper.__ref || epRefWrapper.id;
                        const epData = extractEpisode(ref);
                        if (epData) newChapter.episodes.push(epData);
                    }
                }

                if (newChapter.episodes.length > 0) {
                    chapters.push(newChapter);
                }

            } else if (refKey.startsWith('Episode:')) {
                // 章に属さないエピソードが直接並んでいる場合 (短編など)
                const epData = extractEpisode(refKey);
                if (epData) currentChapter.episodes.push(epData);
            }
        }
    }

    // Work直下にfirstPublicEpisodeUnionがある場合、それが目次から漏れていないかチェック？
    // 基本的にはtableOfContentsに含まれるはず。

    // 章なしエピソード(currentChapter)に中身があれば追加
    if (currentChapter.episodes.length > 0) {
        if (chapters.length > 0) {
            // "本編" として先頭に追加
            chapters.unshift(currentChapter);
        } else {
            chapters.push(currentChapter);
        }
    }

    console.log(`[Kakuyomu] Parsed ${chapters.length} chapters, ${epCount - 1} episodes.`);

    return {
        title, author, synopsis, url, site_type: siteType, novel_id: novelId,
        total_episodes: totalEpisodes,
        last_checked: new Date().toISOString(),
        last_update: lastUpdateStr,
        chapters
    };
}

/**
 * エピソード本文を取得
 */
export async function getEpisodeContent(page, novelId, epNo) {
    // Infoファイルから episode_id を解決する
    const infoPath = path.join(config.paths.novels, siteType, novelId, 'info.json');
    let info = await storage.readJson(infoPath);

    let targetEp = null;
    const resolveTarget = () => {
        if (info && info.chapters) {
            for (const ch of info.chapters) {
                const found = ch.episodes.find(e => e.ep_no === parseInt(epNo));
                if (found) { targetEp = found; return; }
            }
        }
    };

    resolveTarget();

    // 旧info.jsonやダミーIDの場合は、最新情報を再取得してリトライ
    if (!targetEp || !targetEp.episode_id || String(targetEp.episode_id).startsWith('dummy_')) {
        console.log(`[Kakuyomu] Episode info missing or dummy. Refreshing info.json... epNo=${epNo}`);
        try {
            const refreshed = await getNovelInfo(page, novelId);
            await storage.saveNovelInfo(siteType, novelId, refreshed);
            info = refreshed;
            targetEp = null;
            resolveTarget();
        } catch (e) {
            console.warn(`[Kakuyomu] Failed to refresh info.json: ${e.message}`);
        }
    }

    if (!targetEp || !targetEp.episode_id || String(targetEp.episode_id).startsWith('dummy_')) {
        throw new Error(`Episode info not found or invalid for Kakuyomu epNo: ${epNo}`);
    }

    const url = `https://kakuyomu.jp/works/${novelId}/episodes/${targetEp.episode_id}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // 警告ページ（「カクヨムオンリー」や性描写/暴力描写の警告）の対応
    try {
        // "閲覧する" ボタンがあればクリック (セレクタは推測、テキストマッチが確実)
        const button = page.locator('button:has-text("閲覧する"), a:has-text("閲覧する")').first();
        if (await button.isVisible()) {
            console.log('[Kakuyomu] Warning page detected. Clicking "閲覧する"...');
            await button.click();
            await page.waitForLoadState('domcontentloaded');
        }
    } catch (e) {
        // 無視
    }

    try {
        await page.waitForSelector('.widget-episodeBody', { timeout: 5000 });
    } catch (e) { }

    const contentHtml = await page.locator('.widget-episodeBody').innerHTML().catch(async () => {
        // セレクタが変わっている場合のフォールバック
        return '<p>本文の取得に失敗しました。セレクタが変更されている可能性があります。</p>';
    });

    const epTitle = await page.locator('.widget-episodeTitle').innerText().catch(() => `第${epNo}話`);

    return {
        novel_id: novelId,
        ep_no: epNo,
        ep_title: epTitle,
        content: contentHtml,
        image_urls: []
    };
}
