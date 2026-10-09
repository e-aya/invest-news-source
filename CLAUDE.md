# CLAUDE.md — ずんだもん投資速報（invest-news-source.com）

WordPress から移行した個人の投資ブログ。Astro の静的サイトを Cloudflare Workers（静的アセット＋Worker）で配信する。
運営者とのやりとり・説明はすべて日本語で行う。

## 構成の要点

- 記事は `src/content/articles/<slug>/` に `meta.json` / `content.html` / `style.css`。スキーマは `src/content.config.ts`
- 一覧・シリーズ・銘柄ハブ（`/stocks/<code>/`）・関連記事・RSS（`/feed/`）・サイトマップは、公開中の記事から毎回生成する（`src/lib/articles.ts` の `getPublished()` を必ず通す）
- 公開状態は `meta.json` の `status`：`published` / `draft` / `withdrawn`（withdrawn は Worker が 410 を返す）
- 外部サービスのID（GA4・AdSense・Blozoo・Turnstile）と著者情報は `src/site.config.ts`
- 企業ロゴは `public/logos/<銘柄コード>.svg|webp|png|jpg`。あれば記事カードに表示（`src/lib/articles.ts` の `logoOf()`）
- `worker/index.js`：旧URL `/?p=ID` → スラッグへ 301（`worker/generated/legacy-map.json` は `scripts/gen-worker-data.mjs` がビルド時に生成）、未移行記事と `wp-*` は 410、`/feed/`、`/api/contact`（Email Routing の send_email）、`/api/rss`（相互RSSを cron で取得し KV に保存）
- CSS は `src/styles/global.css` の `@layer` で読み込み順を固定。旧記事の `style.css` はレイヤー外で、その記事の名前空間（`.akp-` など）だけに効く
- 旧記事の表示を手で直すときは `src/content/articles/<slug>/fix.css` に書く（`style.css` は再取り込みで上書きされる。fix.css は後から読み込まれる）。名前空間（`.arc-` など）は複数の記事で共有されていて、別記事の指定が効いてしまうことがある
- 白い紙面前提の旧記事（背景透明で文字が暗い）は、本文直後のスクリプトが判定して `is-paper` を付け、ダーク表示のときだけ明るい紙面に載せる（`src/pages/[slug].astro`）
- デザインの基準は確定済みのモックアップ（生成りの新聞紙風背景、ずんだグリーン #2F7A2C、ヘッダー下の二重罫、ライト／ダーク対応）

## コマンド

- `npm run build` … 記事CSSのセレクタ検査 → 転送表生成 → astro build → pagefind → 全内部リンク検査（リンク切れがあると失敗する。失敗したら直してから進める）
- `npm run preview` … wrangler dev で Worker 込みの確認
- `npm run deploy` … ビルドして Cloudflare に公開（本番：独自ドメイン）
- `npm run deploy:staging` … 確認用（workers.dev、noindex、メール送信なし）に公開
- `npm run import:wp` … `import/export.xml`（WXR）と `import/additional.css` から再取り込み。`import/` は git 管理外

## 取り込み（WordPress → 新サイト）

- 対象は `scripts/migration-list.json`（159本、選定シートから作成）
- スラッグは `scripts/slugs.json`（記事ID → スラッグ）。一度公開したら変えない
- シリーズ・銘柄は `scripts/migration-list.json` の `series` / `tickers` で指定する（`meta.json` だけ直すと再取り込みで戻る）
- 本文の仮リンク `href="#"` は `scripts/link-overrides.json`（手動）→ 銘柄コード → タイトルの類似度 の順で解決し、決まらないものはリンクを外す
- 結果は `import/report.md`

## 新しい記事の書き方

- 記事制作パイプライン（calc.py → SVG生成 → assemble → QA）は従来どおり。出力先を `src/content/articles/<slug>/` に変え、`format: "native"` で書く
- WordPress 向けの防御（全面 `!important`、SVG の1行化、wpautop 対策）は不要。記事CSSは名前空間を付けて `style.css` に置く
- 「この記事のポイント」は `meta.json` の `points` に書く（ページ側で表示し、JSON-LD の説明にも使う）
- 公開・更新日は `publishedAt` / `updatedAt`（ISO 8601、+09:00）

## 未完了

以下はすべてアカウント側の操作。手順は README.md の「初回セットアップ」にまとめてある（KV は初回デプロイで自動作成されるので作業不要）

- Cloudflare：確認用デプロイ → サイト追加・お名前.com のネームサーバー変更 → 本番デプロイ → Email Routing の宛先確認 → Turnstile
- 相互RSS（kitaaa.net / twobeko.com）と Blozoo の `https` 読み込みは本番で動作確認する
