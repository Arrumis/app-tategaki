
import express from 'express';
import crawlerRoutes from './v1/crawler.js';
import novelsRoutes from './v1/novels.js';
import listsRoutes from './v1/lists.js';

const router = express.Router();

// v1 Routes
// 既存のフロントエンド実装 (/api/...) とパスを合わせるため、
// app.js で /api にマウントした上で、ここでのパス定義を調整する。

router.use('/', crawlerRoutes); // POST /crawl -> /api/crawl
router.use('/', listsRoutes);   // GET /favs, /users -> /api/favs, /api/users
router.use('/novels', novelsRoutes); // GET /novels/:site/:id... -> /api/novels/:site/:id...

export default router;
