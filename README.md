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

上から順に進める。★はアカウントでの操作（コードの変更は不要）。

### 1. 確認用環境に出す（ネームサーバー切り替え前でもできる）

1. ★ `npx wrangler login`
2. `npm run deploy:staging`
   - `invest-news-source-staging.<アカウント名>.workers.dev` に公開される（検索エンジンには載らないよう `noindex` を付けている）
   - 相互RSS用の KV は初回デプロイ時に自動で作られる（`wrangler.jsonc` に id を書く必要はない）
3. 確認する項目
   - トップ・記事・検索・ダークモードの表示
   - `/?p=<旧記事ID>` が新URLへ 301、`/wp-login.php` が 410
   - `/feed/` が RSS を返す
   - `/api/rss` に kitaaa.net / twobeko.com などの記事が入っている（cron は毎時17分。初回はアクセス時に取得）
   - サイドバーの Blozoo が表示される
   - お問い合わせは確認用環境では 503（メール送信を付けていないため。正常）

### 2. ドメインを Cloudflare に移す

1. ★ Cloudflare ダッシュボードで「サイトを追加」→ `invest-news-source.com`（Free プラン）
   - 既存の DNS レコードが読み込まれるので、メール（MX）など WordPress 以外で使っているレコードが残っているか確認する
2. ★ お名前.com のネームサーバーを、Cloudflare が表示した2つに変更する
   - 反映まで数時間〜最大48時間。切り替わるまでは旧 WordPress が表示される
3. ドメインが「有効」になったら `npm run deploy`
   - `invest-news-source.com` と `www` に独自ドメインとして割り当てられる（DNS レコードも自動で作られる）
   - 旧サーバーを指す A / CNAME レコードが残っていると割り当てに失敗するので、その場合は削除してから再実行する

### 3. お問い合わせ（Email Routing）

1. ★ ダッシュボード →「メール」→「Email Routing」を有効化（MX / SPF レコードが追加される）
2. ★「宛先アドレス」に `invest-news-source@outlook.jp` を追加し、届いた確認メールのリンクを開く
3. フォームから送信してテストする（送信元は `form@invest-news-source.com`）

### 4. Turnstile（ボット対策、任意）

1. ★ ダッシュボード →「Turnstile」→ ウィジェットを追加（ホスト名 `invest-news-source.com`、モード「マネージド」）
2. サイトキーを `src/site.config.ts` の `turnstileSiteKey` に書く
3. `npx wrangler secret put TURNSTILE_SECRET --env=""` でシークレットキーを登録
4. `npm run deploy`

サイトキーとシークレットは必ずセットで設定する（シークレットだけ入れるとフォームが常に失敗する）。

### 5. AdSense

1. ★ AdSense 管理画面でサイト `invest-news-source.com` を確認済みにする
2. ★ 「広告」→「広告ユニットごと」で手動ユニットを5つ作る（記事内×2、マルチプレックス、サイドバー、一覧）
3. `src/site.config.ts` の `adsense.client`（`ca-pub-...`）と各 `slots` を埋めて `npm run deploy`
   - `client` を入れると `/ads.txt` が自動で正しい内容になる
