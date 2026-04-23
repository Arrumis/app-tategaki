# **開発詳細手順書 (Phase 3: クローラー実装)**

本ドキュメントは、tategakiプロジェクトにおけるクローラー（データ収集機能）の実装手順をまとめたものである。Phase 2で作成したデータアクセス層を活用し、ウェブ上の小説データを安全かつ確実に保存する仕組みを構築する。

---

## **Phase 3: クローラーの実装**

### **Step 3-1: Playwright ブラウザ環境のセットアップ**
Playwrightが使用するブラウザバイナリをインストールする。

- **実行コマンド:**
  ```bash
  npx playwright install chromium
  ```
  ※今回はヘッドレスモードでChromiumを使用するため、Chromiumのみで十分。

### **Step 3-2: ユーティリティ・基底処理の実装**
サイト共通で使う機能（ブラウザ起動、待機処理、画像DL）をまとめる。

- **作成ファイル:** `src/crawler/utils.js`
- **実装機能:**
  - `launchBrowser()`: ブラウザインスタンスを生成して返す（User-Agent設定など含む）。
  - `sleep(ms)`: 指定時間待機する（アクセス負荷軽減用）。
  - `downloadImage(url, savePath)`: 画像をダウンロードして保存する。

### **Step 3-3: サイト別スクレイパー (なろう版)**
「小説家になろう」形式のサイトから情報を抽出するロジック。

- **作成ファイル:** `src/crawler/sites/narou.js`
- **実装関数:**
  - `getNovelInfo(page, novelId)`: タイトル、あらすじ、各話リストを取得。
  - `getEpisodeContent(page, novelId, epNo)`: 本文HTMLと画像URLリストを取得。
- **ポイント:**
  - ページ構造が変わっても修正しやすいよう、CSSセレクタを一箇所で管理する設計にする。
  - **重要**: `htmlOnly: true` 等のオプションで余計な装飾を除去し、純粋な本文のみを抽出する。

### **Step 3-4: サイト別スクレイパー (カクヨム版)**
「カクヨム」形式のサイトに対応するロジック。

- **作成ファイル:** `src/crawler/sites/kakuyomu.js`
- **実装関数:**
  - `narou.js` と同じインターフェース（`getNovelInfo`, `getEpisodeContent`）を持つように作る。これにより呼び出し側でポリモーフィズムを実現する。

### **Step 3-5: クローラー統括マネージャー**
「どの小説を」「どのサイトとして」クロールするかを制御し、`storage.js` に保存を依頼する指揮官。

- **作成ファイル:** `src/crawler/manager.js`
- **実装機能:**
  - `crawlNovel(siteType, novelId)`: 
    1. 小説基本情報を取得して保存 `storage.saveNovelInfo`。
    2. 未保存のエピソード、または更新されたエピソードを検知。
    3. 1話ごとに数秒ウェイトを入れながら本文を取得して保存 `storage.saveEpisode`。
    4. 本文に含まれる画像があればダウンロード。

### **Step 3-6: 手動実行用 CLIスクリプト**
定期実行の前に、手動で特定小説をダウンロードできるコマンドを作る。開発中の動作確認に必須。

- **作成ファイル:** `src/crawler/cli.js`
- **使用法:**
  ```bash
  node src/crawler/cli.js narou n123456
  ```

---

## **補足: データフロー**

```
[Webサイト] --(Playwright)--> [Scraper(Narou/Kakuyomu)] 
                                      | (抽出データ: Object)
                                      v
                                [Crawler Manager]
                                      | (保存依頼)
                                      v
                                [Storage Lib (Phase 2)]
                                      | (書き込み)
                                      v
                               [JSON Files]
```
