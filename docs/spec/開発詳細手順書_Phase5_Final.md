# **tategaki 開発詳細手順書 Phase 5 (Final)**

本ドキュメントは、仕様書Ver.5に基づき、アプリケーションの完成に向けた残タスクの実装手順を示す。

---

## Task 1: 小説新規登録フローの実装
**目標**: ホーム画面からURLを入力し、保存先のリストを指定して小説をダウンロード登録できるようにする。

### 1-1. バックエンド API 拡張 (`src/routes/api.js`, `src/crawler/manager.js`)
*   **クローラー起動APIの修正**:
    *   `POST /api/crawl` (既存か要確認、なければ作成) が `url` と `listId` を受け取るようにする。
    *   ダウンロード完了後、指定された `listId` のリストファイル (`data/favs/[id].json`) に小説情報を追加する (`addNovelToList` 利用)。

### 1-2. フロントエンド UI 実装 (`public/index.html`, `public/js/home.js`)
*   **FAB (Floating Action Button) の有効化**:
    *   現在「未実装」アラートが出る右下のFABを実装する。
    *   クリックでメニュー展開、または直接「小説追加」モーダルを表示。
*   **小説追加モーダル**:
    *   入力項目: `小説トップページURL`
    *   選択項目: `保存先リスト` (現在の `userLists` からプルダウン生成)
    *   アクション: APIをコールし、「バックグラウンドで処理を開始しました」とトースト表示。

---

## Task 2: リーダー機能の強化
**目標**: 読書中に文字サイズを変更したり、目次から別エピソードへジャンプできるようにする。

### 2-1. 設定メニューの実装 (`public/js/viewer.js`, `public/reader.html`)
*   **設定オーバーレイ**:
    *   中央タップ時に出るメニュー内に「設定（歯車アイコン）」を追加。
    *   設定項目:
        *   文字サイズ: [小] [中] [大] [特大] (クラス切り替え or CSS変数操作)
        *   行間: [狭] [中] [広]
        *   テーマ: [明] [セピア] [暗]
    *   設定は `localStorage` に保存し、次回起動時に適用。

### 2-2. 目次機能の実装
*   **目次オーバーレイ**:
    *   メニュー内に「目次（リストアイコン）」を追加。
    *   API (`GET /novels/:site/:id/info` または専用API) からエピソード一覧を取得し、リスト表示。
    *   クリックで該当エピソードへ遷移。

---

## Task 3: 自動定期巡回 (Scheduler)
**目標**: 放置していても小説の更新が自動で保存されるようにする。

### 3-1. スケジューラーの実装 (`src/scheduler.js`)
*   `node-schedule` などのライブラリ、または単純な `setInterval` を使用。
*   サーバー起動時 (`src/app.js`) にスケジューラーを初期化。
*   **処理内容**:
    *   `getUserAllNovels('default')` で全小説を取得。
    *   各小説の `url` を対象に、前回の更新確認から一定時間経過していればクローラーを起動。
    *   サーバー負荷を考慮し、1件ずつ直列実行＋待機時間を設ける。

---

## Task 4: Docker環境構築
**目標**: コマンド一発で環境構築・実行可能にする。

### 4-1. Dockerfile の作成
*   Base Image: `mcr.microsoft.com/playwright:v1.40.0-jammy` (Playwright込みの公式イメージ推奨)
*   Steps:
    *   `npm install`
    *   `npx playwright install` (念のため)
    *   `npm start`

### 4-2. docker-compose.yml の作成
*   Service: `app`
*   Volumes:
    *   `./data:/app/data` (データの永続化)
*   Ports:
    *   `3000:3000`
*   Restart: `always`

---

## 開発順序の提案
1.  **Task 1 (新規登録)**: アプリとして「新しい本を追加できない」のは致命的なため最優先。
2.  **Task 2 (リーダー強化)**: 「読む」体験の質を向上。
3.  **Task 3 (自動化)**: 運用機能。
4.  **Task 4 (Docker)**: 配布・デプロイ準備。
