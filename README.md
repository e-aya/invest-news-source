# ずんだもん投資速報（invest-news-source.com）

Astro で作る静的サイトを、Cloudflare Workers（静的アセット）で配信する。

## 構成

| 場所 | 内容 |
|---|---|
| `src/content/articles/<slug>/` | 記事1本＝1フォルダ。`meta.json`（タイトル・日付・銘柄など）、`content.html`（本文）、`style.css`（記事専用CSS） |
| `src/data/series.json` | 連載シリーズの定義 |
| `src/data/rss-feeds.json` | 相互RSSの相手サイト |
| `src/site.config.ts` | GA4・AdSense・Blozoo などのID、著者情報 |
| `worker/index.js` | 旧URL（`/?p=ID`）の301転送、未移行記事の410、`/feed/`、お問い合わせ、相互RSS |
| `scripts/import-wxr.mjs` | WordPress のエクスポートから記事を取り込む |
| `scripts/check-links.mjs` | ビルド後に全内部リンクを検査（リンク切れがあるとビルド失敗） |

## よく使うコマンド

```sh
npm run dev        # ローカルで表示確認（http://localhost:4321）
npm run build      # 本番ビルド＋検索インデックス作成＋リンク検査
npm run preview    # Worker込みでローカル確認（旧URL転送・410・API）
npm run deploy     # ビルドして Cloudflare に公開
npm run import:wp  # import/export.xml と import/additional.css から記事を取り込む
```

## 記事の公開・非公開・削除

`meta.json` の `status` を書き換えて push するだけ。

- `published` … 公開
- `draft` … 下書き（どこにも出ない）
- `withdrawn` … 削除済み（URLにアクセスすると 410 を返す）

一覧・シリーズ・銘柄ページ・関連記事・RSS・サイトマップは公開中の記事から毎回作り直すので、
削除した記事はすべての画面から同時に消える。本文に手で書いたリンクはビルド時の検査で検出する。

## 初回セットアップ（Cloudflare）

1. `npx wrangler login`
2. `npx wrangler kv namespace create RSS_CACHE` → 表示された id を `wrangler.jsonc` に書く
3. Email Routing を有効にし、宛先 `invest-news-source@outlook.jp` を確認する
4. （任意）Turnstile のサイトキーを `site.config.ts`、秘密鍵を `npx wrangler secret put TURNSTILE_SECRET` で登録
5. `npm run deploy`
6. 切り替え当日：お名前.com のネームサーバーを Cloudflare に変更
