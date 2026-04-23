import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../config.js';

// ブラウザ起動オプション
const BROWSER_OPTIONS = {
    headless: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
};

/**
 * ブラウザ管理クラス (Singleton)
 * - ブラウザインスタンスを使い回す
 * - 一定時間(5分)アイドル状態が続いたら閉じる
 */
class BrowserManager {
    constructor() {
        this.browser = null;
        this.timer = null;
        this.IDLE_TIMEOUT = 5 * 60 * 1000; // 5分
    }

    async getBrowser() {
        // タイマーがあればクリア (アクティブ化)
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        // ブラウザが無ければ起動 or 切断されてたら再起動
        if (!this.browser || !this.browser.isConnected()) {
            console.log('[BrowserManager] Launching new browser...');
            this.browser = await chromium.launch(BROWSER_OPTIONS);
        }

        return this.browser;
    }

    release() {
        // 使用終了通知。タイマーをセットする。
        // ※ 複数の処理が走っている場合を考慮し、単純なカウントではなく
        // 「最後のreleaseからN分後」に閉じる戦略をとる。
        // 本来は参照カウントなどが厳密だが、今回はシンプルに
        // 「getBrowser呼出ごとにタイマー解除 -> release呼出ごとにタイマーセット」で運用する。
        // 頻繁に呼ばれる限りタイマーはリセットされ続ける。
        
        if (this.timer) clearTimeout(this.timer);
        
        this.timer = setTimeout(async () => {
            if (this.browser) {
                console.log('[BrowserManager] Idle timeout. Closing browser.');
                await this.browser.close().catch(e => console.error(e));
                this.browser = null;
            }
        }, this.IDLE_TIMEOUT);
    }
}

const manager = new BrowserManager();

export async function launchBrowser() {
    // 既存のコードとの互換性のため、ブラウザインスタンスを返すが、
    // 呼び出し元が browser.close() を呼ぶと全体が閉じてしまう問題がある。
    // そのため、browser.close() を無効化したプロキシを返すか、
    // 呼び出し元で manager.release() を呼ぶ規約にする必要がある。
    
    // 今回は既存コード(manager.js)の try-finally で browser.close() している箇所を
    // closeBrowser(browser) 関数に置き換えてもらう方が安全。
    
    // しかし変更範囲を抑えるため、ここで「閉じないブラウザオブジェクト」を返す手もあるが、
    // 結局 release() を呼ばないとタイマーが動かない。
    
    // よって、launchBrowser は manager.getBrowser() を返すが、
    // 追加で closeBrowser という関数もexportし、そちらを使ってもらう形にリファクタする。
    
    return await manager.getBrowser();
}

/**
 * ブラウザ使用終了を通知する (旧 browser.close() の代わり)
 */
export async function closeBrowser(browser) {
    manager.release();
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 画像ダウンロード保存
export async function downloadImage(url, saveDir, filename) {
    try {
        // URLの正規化 (//example.com -> https://example.com)
        if (url.startsWith('//')) {
            url = 'https:' + url;
        }

        // ディレクトリ確保
        await fs.mkdir(saveDir, { recursive: true });

        // fetchで取得
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const headers = response.headers;

        // 拡張子の補正が必要ならここで行うが、今回はfilenameを信頼する
        const savePath = path.join(saveDir, filename);
        await fs.writeFile(savePath, Buffer.from(arrayBuffer));

        return savePath;
    } catch (err) {
        console.error(`Failed to download image ${url}:`, err);
        return null;
    }
}
