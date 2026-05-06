import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import apiRouter from './routes/index.js';
import { initScheduler } from './scheduler.js';
import * as crawlerManager from './crawler/manager.js';

const app = express();

// 共通処理
app.set('etag', false);
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static('public'));

// 経路設定
app.use('/api', apiRouter);

// 稼働確認
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// サーバー起動
app.listen(config.port, () => {
    console.log(`サーバー起動: http://localhost:${config.port}`);
    console.log(`実行環境: ${process.env.NODE_ENV || 'development'}`);

    // 中断されたダウンロードの再開
    crawlerManager.resumeInterruptedDownloads().catch(err => {
        console.error('[App] Failed to resume downloads:', err);
    });

    // スケジューラー開始
    initScheduler();
});

