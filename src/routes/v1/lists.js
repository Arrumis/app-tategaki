
import express from 'express';
import * as storage from '../../lib/storage.js';

const router = express.Router();

// お気に入りリスト取得 (互換性のための /favs エンドポイント)
// TODO: RESTful的には /users/:id/lists/:listId/novels に統合したいが、現状UIとの兼ね合いで維持
router.get('/favs/:id', async (req, res) => {
    try {
        const listId = req.params.id;

        // 'default' (=すべて) の場合、ユーザーの全リストから結合して返す
        if (listId === 'default') {
            const data = await storage.getUserAllNovels('default');
            res.json(data);
        } else {
            const data = await storage.getFavList(listId);
            res.json(data);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get favorite list' });
    }
});

// ユーザーのリスト一覧取得
router.get('/users/:id/lists', async (req, res) => {
    try {
        const userId = req.params.id;
        const data = await storage.getUserLists(userId);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get user lists' });
    }
});

// 新しいリストの作成
router.post('/users/:id/lists', async (req, res) => {
    try {
        const userId = req.params.id;
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const newList = await storage.createUserList(userId, name);
        res.json(newList);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create list' });
    }
});

// リストの削除（小説はdefaultへ退避）
router.delete('/users/:id/lists/:listId', async (req, res) => {
    try {
        const { id, listId } = req.params;
        if (listId === 'default') {
            return res.status(400).json({ error: 'Cannot delete default list' });
        }
        await storage.deleteUserList(id, listId);
        res.json({ message: 'List deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete list' });
    }
});

// リストへ小説を追加・移動
router.post('/users/:userId/lists/:targetListId/novels', async (req, res) => {
    try {
        const { targetListId } = req.params;
        const { novelData, sourceListId } = req.body;

        if (!novelData || !novelData.novel_id) {
            return res.status(400).json({ error: 'Invalid novel data' });
        }

        // 追加先に追加
        await storage.addNovelToList(targetListId, novelData);

        // 移動元の指定があれば削除 (移動処理)
        if (sourceListId && sourceListId !== targetListId) {
            await storage.removeNovelFromList(sourceListId, novelData.novel_id);
        }

        res.json({ message: 'Success' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to add/move novel' });
    }
});

// リストから小説を削除
router.delete('/users/:userId/lists/:listId/novels/:novelId', async (req, res) => {
    try {
        const { listId, novelId } = req.params;
        await storage.removeNovelFromList(listId, novelId);
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete novel' });
    }
});

export default router;
