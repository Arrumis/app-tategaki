
import express from 'express';
import path from 'path';
import { config } from '../../config.js';
import * as storage from '../../lib/storage.js';
import * as crawlerManager from '../../crawler/manager.js';

const router = express.Router();

// 小説情報取得 (Info)
router.get('/:site/:id/info', async (req, res) => {
    try {
        const { site, id } = req.params;
        const filePath = path.join(config.paths.novels, site, id, 'info.json');
        const data = await storage.readJson(filePath, null);

        if (!data) {
            return res.status(404).json({ error: 'Novel not found' });
        }
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// エピソード本文取得
router.get('/:site/:id/ep/:no', async (req, res) => {
    try {
        const { site, id, no } = req.params;
        const epNo = parseInt(no);
        const filePath = path.join(config.paths.novels, site, id, `ep_${epNo}.json`);

        // 1. まずローカルを探す
        let data = await storage.readJson(filePath, null);

        // 2. なければ都度取得 (On-Demand Fetch)
        if (!data) {
            console.log(`[API] Episode not found locally. Triggering on-demand fetch: ${site}/${id}/${epNo}`);
            try {
                data = await crawlerManager.fetchAndSaveEpisode(site, id, epNo);
            } catch (fetchErr) {
                console.error(`[API] On-demand fetch failed:`, fetchErr);
                return res.status(404).json({ error: 'Episode not found and fetch failed' });
            }
        }

        if (!data) {
            // ここには来ないはずだが念のため
            return res.status(404).json({ error: 'Episode not found' });
        }

        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 画像ファイル配信
router.get('/:site/:id/images/:filename', (req, res) => {
    try {
        const { site, id, filename } = req.params;
        const imagePath = path.join(config.paths.novels, site, id, 'images', filename);

        res.sendFile(imagePath, (err) => {
            if (err) {
                // console.error('Image send error:', err); // 頻出するので抑制
                if (!res.headersSent) {
                    res.status(404).send('Image not found');
                }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// しおり更新
router.post('/:site/:id/bookmark', async (req, res) => {
    try {
        const { site, id } = req.params;
        const { listId, epNo, epTitle, scrollPos } = req.body;

        if (!listId) return res.status(400).json({ error: 'listId is required' });

        await storage.updateBookmark(listId, id, {
            ep_no: parseInt(epNo),
            ep_title: epTitle,
            scroll_pos: parseFloat(scrollPos)
        });

        res.json({ message: 'Bookmark updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update bookmark' });
    }
});

// 閲覧履歴 (オートセーブ) 更新
router.post('/:site/:id/history', async (req, res) => {
    try {
        const { site, id } = req.params;
        const { listId, epNo, epTitle, scrollPos } = req.body;

        if (!listId) return res.status(400).json({ error: 'listId is required' });

        await storage.updateHistory(listId, id, {
            ep_no: parseInt(epNo),
            ep_title: epTitle,
            scroll_pos: parseFloat(scrollPos)
        });

        res.json({ message: 'History updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update history' });
    }
});

export default router;
