/**
 * scheduler.js
 * 定期的な自動巡回を管理する
 */
import { config } from './config.js';
import * as storage from './lib/storage.js';
import * as crawlerManager from './crawler/manager.js';
import { sleep } from './crawler/utils.js';

// 巡回間隔 (ms): 3時間
const CHECK_INTERVAL = 3 * 60 * 60 * 1000;

export function initScheduler() {
    console.log('[Scheduler] Initialized. Setting up initial crawl in 5 seconds...');

    // 起動5秒後に最初のチェックを実行
    setTimeout(() => {
        console.log('[Scheduler] Starting initial crawl...');
        runCrawlAll().catch(err => {
            console.error('[Scheduler] Initial crawl failed:', err);
        });
    }, 5000);

    setInterval(runCrawlAll, CHECK_INTERVAL);
}

// 手動トリガー用
export async function runNow() {
    console.log('[Scheduler] Manual Trigger');
    await runCrawlAll();
}

/**
 * 登録されている全小説を巡回・更新する
 */
async function runCrawlAll() {
    console.log('[Scheduler] Starting scheduled crawl...');

    try {
        // 現状はシングルユーザー(default)のみ対象
        const data = await storage.getUserAllNovels('default');
        const novels = data.novels;

        console.log(`[Scheduler] Check targets: ${novels.length} novels`);

        for (const novel of novels) {
            try {
                // 3時間おきなので、全件チェックしても良いが、
                // 前回の更新から時間が経っていないものはスキップするロジックを入れても良い。
                // update_at は "最後にローカルデータが変更された日時"。

                // 今回は全件チェックする (更新があるかわからないため)
                console.log(`[Scheduler] Checking: ${novel.title}`);
                await crawlerManager.crawlNovel(novel.site_type, novel.novel_id, novel._sourceListId);

                // サーバー負荷軽減のSleep (20秒程度あける)
                // 100件あると 2000秒 = 33分かかる。3時間間隔なら許容範囲。
                await sleep(20000);

            } catch (err) {
                console.error(`[Scheduler] Error checking ${novel.title}:`, err);
            }
        }

        console.log('[Scheduler] All checks completed.');

    } catch (err) {
        console.error('[Scheduler] Critical Error:', err);
    }
}
