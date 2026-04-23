# app-tategaki

縦書きで Web 小説を読むためのセルフホスト型リーダーです。`app-tategaki` は GitHub 再編に向けた新しい正本候補で、PC 固有パスや運用データを repo から切り離せる構成にしています。

## 特徴

- 小説家になろう / カクヨムの作品をローカル保存
- ブラウザで縦書き読書
- お気に入りリスト、しおり、履歴
- Playwright ベースのクローラー
- Docker Compose ですぐ起動可能

## 目標構成

- アプリコード、Compose、初期化スクリプトだけを Git 管理する
- 実データは `HOST_DATA_DIR` に保存する
- `/home/...` のような絶対パスに依存しない

## 必要要件

- Docker Engine
- Docker Compose v2

ローカル開発のみ行う場合は以下も必要です。

- Node.js 18 以上
- npm

## Docker で起動

```bash
cp .env.example .env.local
./scripts/init-data-dirs.sh
docker compose --env-file .env.local up -d --build
```

ブラウザでは `http://localhost:3000` にアクセスします。  
ポートを変えたい場合は `.env.local` の `APP_PORT` を変更してください。

### `.env.local` の例

```bash
APP_PORT=3000
HOST_DATA_DIR=./data
TZ=Asia/Tokyo
CRAWL_INTERVAL_MS=10800000
REQUEST_DELAY_MS=3000
```

## ローカル開発

```bash
npm install
npx playwright install chromium
node src/app.js
```

必要に応じて以下を設定できます。

```bash
PORT=3000
DATA_DIR=./data
CRAWL_INTERVAL_MS=10800000
REQUEST_DELAY_MS=3000
```

## データの扱い

以下は Git 管理しません。

- `data/favs/`
- `data/novels/`
- `data/logs/`
- `data/users/`
- `.env.local`

初回起動前に空ディレクトリだけ作るため、`scripts/init-data-dirs.sh` を用意しています。

## 補助スクリプト

- `check_orphans.js`
  - `DATA_DIR` を指定して孤児データを確認します
- `cleanup_test_list.js`
  - `DATA_DIR` と `LIST_ID` を指定してテスト用リストを掃除します

例:

```bash
DATA_DIR=./data node check_orphans.js
LIST_ID=list_123 DATA_DIR=./data node cleanup_test_list.js
```

## ディレクトリ構成

```text
app-tategaki/
├── compose.yaml
├── .env.example
├── scripts/
├── data/              # 空ディレクトリのみ管理
├── public/
├── src/
└── docs/
```

## 移行メモ

- 旧 `tategaki` / `practice01` 系の混在を解消するための新正本候補
- installer 配下への丸ごとコピー運用は前提にしない
- reverse proxy 連携は `docker-compose.traefik.example.yml` をベースに別途組み込む
