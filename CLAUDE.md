# CLAUDE.md — ずんだもん投資速報（invest-news-source.com）

WordPress から移行した個人の投資ブログ。Astro の静的サイトを Cloudflare Workers（静的アセット＋Worker）で配信する。
運営者とのやりとり・説明はすべて日本語で行う。

## 構成の要点

- 記事は `src/content/articles/<slug>/` に `meta.json` / `content.html` / `style.css`。スキーマは `src/content.config.ts`
- 一覧・シリーズ・銘柄ハブ（`/stocks/<code>/`）・関連記事・RSS（`/feed/`）・サイトマップは、公開中の記事から毎回生成する（`src/lib/articles.ts` の `getPublished()` を必ず通す）
- 公開状態は `meta.json` の `status`：`published` / `draft` / `withdrawn`（withdrawn は Worker が 410 を返す）
- 外部サービスのID（GA4・AdSense・Blozoo・Turnstile）と著者情報は `src/site.config.ts`
- 企業ロゴは `public/logos/<銘柄コード>.svg|webp|png|jpg`。あれば記事カードに表示（`src/lib/articles.ts` の `logoOf()`）
- 記事のアイキャッチは `public/covers/<スラッグ>.webp|jpg|png`（1200×630 前後。置くときは `npm run cover` で WebP に縮める）。あれば記事冒頭に表示し、og:image（X のカード画像）にも使う（`coverOf()`）。なければ銘柄のロゴを冒頭に表示（本文に独自の h1 がある旧記事は除く）。どちらもなければ何も出さない
- `worker/index.js`：旧URL `/?p=ID` → スラッグへ 301（`worker/generated/legacy-map.json` は `scripts/gen-worker-data.mjs` がビルド時に生成。Git では管理しない）、未移行記事と `wp-*` は 410、`/feed/` と `/?feed=rss2`（アンテナ・ブログ村などの登録URL。転送せず RSS をそのまま返す）、`/api/contact`（Email Routing の send_email）、`/api/rss`（相互RSSを cron で取得し KV に保存）
- CSS は `src/styles/global.css` の `@layer` で読み込み順を固定。旧記事の `style.css` はレイヤー外で、その記事の名前空間（`.akp-` など）だけに効く
- 旧記事の表示を手で直すときは `src/content/articles/<slug>/fix.css` に書く（`style.css` は再取り込みで上書きされる。fix.css は後から読み込まれる）。名前空間（`.arc-` など）は複数の記事で共有されていて、別記事の指定が効いてしまうことがある
- 白い紙面前提の旧記事（背景透明で文字が暗い）は、本文直後のスクリプトが判定して `is-paper` を付け、ダーク表示のときだけ明るい紙面に載せる（`src/pages/[slug].astro`）
- デザインの基準は確定済みのモックアップ（生成りの新聞紙風背景、ずんだグリーン #2F7A2C、ヘッダー下の二重罫、ライト／ダーク対応）

## コマンド

- `npm run build` … 記事CSSのセレクタ検査 → 転送表生成 → astro build → pagefind → 全内部リンク検査（リンク切れがあると失敗する。失敗したら直してから進める）
- `npm run preview` … ビルドして wrangler dev で Worker 込みの確認
- `npm run deploy` … ビルドして Cloudflare に公開（本番：独自ドメイン）。最後に `scripts/ping.mjs` がブログ村へ更新通知（Ping）を送る（最新記事が前回から変わったときだけ。送り先は `src/data/ping.json`）
- `npm run ping -- --force` … 更新通知を手動で送る
- `npm run cover -- <元の画像> <スラッグ>` … アイキャッチを横1200pxの WebP（画質80）に縮めて `public/covers/<スラッグ>.webp` に保存し、同じ記事の古い画像は消す。2MB の PNG が 100〜200KB ほどになる
- `npm run deploy:staging` … 確認用（workers.dev、noindex、メール送信なし）に公開
- `npm run smoke -- <URL>` … 公開したサイトの点検（旧URL転送・410・RSS・サイトマップ・ads.txt・noindex）
- `npm run import:wp` … `import/export.xml`（WXR）と `import/additional.css` から再取り込み。`import/` は git 管理外

## 取り込み（WordPress → 新サイト）

- 対象は `scripts/migration-list.json`（159本、選定シートから作成）
- スラッグは `scripts/slugs.json`（記事ID → スラッグ）。一度公開したら変えない
- シリーズ・銘柄・追加タグは `scripts/migration-list.json` の `series` / `tickers` / `addTags` で指定する（`meta.json` だけ直すと再取り込みで戻る）
- 本文の仮リンク `href="#"` は `scripts/link-overrides.json`（手動）→ 銘柄コード → タイトルの類似度 の順で解決し、決まらないものはリンクを外す
- 結果は `import/report.md`

## 新しい記事の書き方

- 記事制作パイプライン（calc.py → SVG生成 → assemble → QA）は従来どおり。出力先を `src/content/articles/<slug>/` に変え、`format: "native"` で書く
- WordPress 向けの防御（全面 `!important`、SVG の1行化、wpautop 対策）は不要。記事CSSは名前空間を付けて `style.css` に置く
- 「この記事のポイント」は `meta.json` の `points` に書く（ページ側で表示し、JSON-LD の説明にも使う）
- 公開・更新日は `publishedAt` / `updatedAt`（ISO 8601、+09:00）

## 本番の状態

- 2026-10-09 に本番へ切り替え済み（Cloudflare DNS・Workers 独自ドメイン・Email Routing）。smoke はすべて通過。相互RSS・Blozoo も本番で表示を確認済み
- Search Console には `/sitemap-index.xml` を登録済み（旧 `/sitemap.xml` は新サイトマップへ転送、旧 `/sitemap.rss` は転送なし。どちらも Search Console から削除してよい）
- メール：`support@` は Email Routing で `invest-news-source@outlook.jp` へ転送（受信専用）。フォームは `form@` から送信。MX・SPF は Cloudflare のもの
- DNS に残っている `mail` / `ml-cp` の A と `default._domainkey` の TXT はお名前メール用。解約したら削除してよい

## 未完了

以下はすべてアカウント側の操作。手順は README.md の「初回セットアップ」にまとめてある

- Turnstile（任意。迷惑投稿が増えたら）
- 旧サーバー・お名前メールの解約（1〜2週間様子を見てから）

以下はティッカー発表待ち

- Anthropic は仮のティッカー `ANTH`（表示名「Anthropic（仮）」）で銘柄ページを作っている。正式に決まったら、3記事の `meta.json`・`scripts/migration-list.json`・`scripts/import-wxr.mjs` の `TICKER_NAMES` を書き換え、旧URL `/stocks/anth/` から新しい銘柄ページへの転送を `worker/index.js` に入れる
