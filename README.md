# app-tategaki

Web 小説を縦書きで読むためのセルフホスト型リーダーです。
小説データ、しおり、履歴、ログを指定した保存先へ置けます。

## 使い方

```bash
cp .env.example .env.local
./scripts/init-data-dirs.sh
docker compose --env-file .env.local up -d --build
```

ブラウザで開く画面:

- `http://localhost:3000`

## 変更する値

`.env.example` は公開用の見本です。実際の値は `.env.local` に書きます。

- `HOST_DATA_DIR`: 小説データや履歴を保存する場所です。
- `APP_PORT`: ブラウザから開くポートです。他サービスと重なるときだけ変えます。
- `CRAWL_INTERVAL_MS`: 定期巡回の間隔です。短くしすぎないようにします。
- `REQUEST_DELAY_MS`: 外部サイトへアクセスする間隔です。短くしすぎないようにします。
- `APP_TATEGAKI__...`: 親リポジトリからまとめて設定するときに使います。

## 機能

- 小説家になろう、カクヨムの作品をローカル保存
- ブラウザで縦書き読書
- お気に入りリスト
- しおりと閲覧履歴
- 定期巡回

## データ

GitHub に上げるもの:

- `compose.yaml`
- `.env.example`
- `scripts/`
- `public/`
- `src/`
- `README.md`

GitHub に上げないもの:

- `.env.local`
- `data/favs/`
- `data/novels/`
- `data/logs/`
- `data/users/`

## ローカル開発

```bash
npm install
npx playwright install chromium
node src/app.js
```

## 補助スクリプト

孤立データを確認します。

```bash
DATA_DIR=./data node check_orphans.js
```

テスト用リストを掃除します。

```bash
LIST_ID=list_123 DATA_DIR=./data node cleanup_test_list.js
```

## 補足

- リバースプロキシ連携は親リポジトリ側の設定で扱います。
- 旧環境のデータが残っている場合は、`HOST_DATA_DIR` に指定する保存先へ移してから起動します。
