# **開発詳細手順書 (Phase 1 & 2)**

本ドキュメントは、tategakiプロジェクトの初期構築における具体的な作業手順をまとめたものである。

---

## **Phase 1: プロジェクト基盤の構築**

### **Step 1-1: ディレクトリ構造の作成**
まず、プロジェクトの骨格となるフォルダを作成する。

- **実行コマンド:**
  ```bash
  mkdir -p data/favs data/novels data/logs src/lib src/routes src/crawler/sites public/css public/js
  ```
- **確認:** `ls -R` でディレクトリツリーが作成されていることを確認。

### **Step 1-2: Node.jsプロジェクトの初期化**
プロジェクトの定義ファイル `package.json` を生成する。

- **実行コマンド:**
  ```bash
  npm init -y
  ```
- **編集:** `package.json` を開き、`"type": "module"` を追記する（ES Modulesを使用するため）。

### **Step 1-3: 必要なライブラリのインストール**
開発に必要なパッケージを一括でインストールする。

- **実行コマンド:**
  ```bash
  # 本番用依存パッケージ
  npm install express playwright dotenv cors morgan
  
  # 開発用パッケージ（ホットリロードなど）
  npm install -D nodemon
  ```

### **Step 1-4: Git設定と除外ファイルの指定**
データファイルや環境依存ファイルをGit管理から除外する。

- **作成ファイル:** `.gitignore`
- **内容:**
  ```text
  node_modules/
  .env
  .DS_Store
  
  # データディレクトリ内の実ファイルは除外（フォルダ構造のみ維持の場合は.gitkeepを置くが、今回は無視）
  data/novels/*
  data/favs/*
  data/logs/*
  !data/novels/.gitkeep
  !data/favs/.gitkeep
  ```

### **Step 1-5: サーバー動作確認 (Hello World)**
- **作成ファイル:** `src/app.js` (エントリーポイント)
- **内容:** 簡単なExpressサーバーを立ち上げ、アクセスできるか確認するコード。

---

## **Phase 2: データアクセス層とAPIの実装**

### **Step 2-1: 共通定数・設定ファイルの作成**
- **作成ファイル:** `src/config.js`
- **内容:** ポート番号、データディレクトリのパスなどを定数として管理する。

### **Step 2-2: ファイル操作ユーティリティの実装 (Core)**
ここで「金庫」となる重要モジュールを作る。

- **作成ファイル:** `src/lib/storage.js`
- **実装する機能（関数）:**
  1.  `readJson(filePath, defaultValue)`: 安全にJSONを読み込む。ファイルが無ければデフォルト値を返す。
  2.  `writeJson(filePath, data)`: データをJSONとして保存する。
  3.  `saveNovelInfo(novelId, data)`: 小説の基本情報を保存するラッパー関数。
  4.  `getFavList(listId)`: 指定IDのお気に入りリストを取得する。

### **Step 2-3: モックデータ（ダミーデータ）の投入**
フロントエンド開発やAPIテストのために、仮のデータを作る。

- **作業:** `data/favs/default.json` や `data/novels/narou/12345/info.json` を手動作成する。

### **Step 2-4: APIエンドポイントの実装**
フロントエンドがデータを取得するための窓口を作る。

- **作成ファイル:** `src/routes/api.js`
- **実装ルート:**
  - `GET /api/favs/:id` -> `storage.getFavList` を呼んで返す。
  - `GET /api/novels/:site/:id/info` -> 小説情報を返す。
  
- **接続:** `src/app.js` にこのルーターを組み込む (`app.use('/api', apiRouter)`)。

### **Step 2-5: 動作確認 (APIテスト)**
- **確認方法:** `curl` コマンドやブラウザで `http://localhost:3000/api/favs/default` にアクセスし、JSONが返ってくるか確認する。
