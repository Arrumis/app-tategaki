# ブラウザ環境に含まれる旧版を使わず、セキュリティ修正版のNode.jsを使う。
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS node-runtime

# ベースイメージ: Playwright公式 (Chromium等のブラウザ依存関係込み)
FROM mcr.microsoft.com/playwright:v1.57.0-jammy
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN ln -sf /usr/local/bin/node /usr/bin/node && \
    test "$(node --version)" = "v24.22.1"

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Tokyo

# 日本語フォントのインストール (Linux環境での文字化け防止)
# fonts-noto-cjk: 日本語を含むCJKフォント
RUN apt-get update && \
    apt-get install -y fonts-noto-cjk tzdata && \
    ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime && \
    echo ${TZ} > /etc/timezone && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 作業ディレクトリの設定
WORKDIR /app

# 依存関係定義ファイルのコピー
COPY package*.json ./

# 依存関係のインストール (本番環境向け)
# Playwrightのブラウザバイナリはベースイメージに含まれているので、
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 を設定して重複ダウンロードを防ぐことも可能だが、
# バージョン整合性を確実にするためnpm ciに任せる (通常はバイナリダウンロードはnpm install時に走る)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --only=production

# ソースコードのコピー
COPY . .

# 環境変数の設定
ENV NODE_ENV=production
ENV PORT=3000

# ポートの公開 (ドキュメント用)
EXPOSE 3000

# アプリケーションの起動
CMD ["npm", "start"]
