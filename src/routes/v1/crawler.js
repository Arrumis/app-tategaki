
import express from 'express';
import * as crawlerManager from '../../crawler/manager.js';

const router = express.Router();

/**
 * 小説の新規登録 (URLから)
 */
router.post('/crawl', async (req, res) => {
    try {
        const { url, listId } = req.body;
        if (!url || !listId) {
            return res.status(400).json({ error: 'url and listId are required' });
        }

        // ID特定
        let novelInfo = {};
        try {
            novelInfo = crawlerManager.detectSiteAndId(url);
        } catch (e) {
            return res.status(400).json({ error: 'Unsupported URL' });
        }

        // クロール実行（バックグラウンドで処理）
        crawlerManager.addNovelByUrl(url, listId)
            .then(data => {
                console.log(`[Crawler] Background crawl finished: ${data.title}`);
            })
            .catch(err => {
                console.error(`[Crawler] Background crawl failed:`, err);
            });

        // 即時レスポンス
        res.json({
            message: 'Accepted. Crawling started in background.',
            novel_id: novelInfo.novelId,
            site_type: novelInfo.siteType
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to start crawl', details: error.message });
    }
});

export default router;
