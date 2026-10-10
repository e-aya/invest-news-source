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
npm run deploy     # ビルドして Cloudflare に公開し、新しい記事があればブログ村へ更新通知（Ping）を送る
npm run import:wp  # import/export.xml と import/additional.css から記事を取り込む
```

## 記事の公開・非公開・削除

`meta.json` の `status` を書き換えて push するだけ。

- `published` … 公開
- `draft` … 下書き（どこにも出ない）
- `withdrawn` … 削除済み（URLにアクセスすると 410 を返す）

一覧・シリーズ・銘柄ページ・関連記事・RSS・サイトマップは公開中の記事から毎回作り直すので、
削除した記事はすべての画面から同時に消える。本文に手で書いたリンクはビルド時の検査で検出する。

## 企業ロゴ（記事カード）

`public/logos/<銘柄コード>.svg`（`.webp` / `.png` / `.jpg` も可）を置くと、その銘柄の記事カードにロゴを表示する。置いていない銘柄は従来どおりコードと社名を表示する。

- ファイル名は `meta.json` の `tickers` のコード（例：`627A.svg`、`SPCX.png`）。大文字・小文字は問わない
- ロゴは幅 240px 程度の白い枠に、縦横比を保ったまま収まるよう縮小される。余白の少ない画像を使う（余白が多いとロゴが小さく見える）
- 画像は幅 600px 程度あれば十分。大きな画像はページが重くなるので縮小してから置く
- ロゴは各社のブランドガイドライン・プレスキットで使用条件を確認してから置く

## 初回セットアップ（Cloudflare）

上から順に進める。★はアカウントでの操作（コードの変更は不要）。

### 1. 確認用環境に出す（ネームサーバー切り替え前でもできる）

1. ★ `npx wrangler login`
2. `npm run deploy:staging`
   - `invest-news-source-staging.<アカウント名>.workers.dev` に公開される（検索エンジンには載らないよう `noindex` を付けている）
   - 相互RSS用の KV は初回デプロイ時に自動で作られる（`wrangler.jsonc` に id を書く必要はない）
3. `npm run smoke -- https://invest-news-source-staging.<アカウント名>.workers.dev` で転送・410・RSS・サイトマップなどを一括点検（すべて ✓ になればよい）
4. 目で確認する項目
   - トップ・記事・検索・ダークモードの表示
   - `/?p=<旧記事ID>` が新URLへ 301、`/wp-login.php` が 410
   - `/feed/` が RSS を返す
   - `/api/rss` に kitaaa.net / twobeko.com などの記事が入っている（cron は毎時17分。初回はアクセス時に取得）
   - サイドバーの Blozoo が表示される
   - お問い合わせは確認用環境では 503（メール送信を付けていないため。正常）

### 2. ドメインを Cloudflare に移す

0. 切り替え前の準備
   - ★ WordPress 管理画面で固定ページ（運営者情報・プライバシーポリシー・お問い合わせ・免責事項）の ID を確認し、`scripts/wp-pages.json` に `{"ID": "/about/"}` の形で書く。書かなかった旧URL `/?page_id=…` はトップへ転送される
   - ★ お名前.com の DNS 設定画面を開き、全レコードを控えておく（特に MX・TXT。ドメインのメールを使っていないか確認）
1. ★ Cloudflare ダッシュボードで「サイトを追加」→ `invest-news-source.com`（Free プラン）
   - 既存の DNS レコードが読み込まれるので、控えたレコード（メールの MX・TXT など）がすべて入っているか確認する
2. ★ お名前.com のネームサーバーを、Cloudflare が表示した2つに変更する
   - 反映まで数時間〜最大48時間。切り替わるまでは旧 WordPress が表示される
3. ドメインが「有効」になったら `npm run deploy`
   - `invest-news-source.com` と `www` に独自ドメインとして割り当てられる（DNS レコードも自動で作られる）
   - 旧サーバーを指す A / CNAME レコードが残っていると割り当てに失敗するので、その場合は削除してから再実行する
4. `npm run smoke -- https://invest-news-source.com` で本番を点検する
5. ★ Google Search Console
   - サイトマップに `https://invest-news-source.com/sitemap-index.xml` を登録する（旧 `/sitemap_index.xml` も新しいサイトマップへ転送している）
   - 「URL 検査」でトップと記事を数本「インデックス登録をリクエスト」
   - 数日は「ページ」レポートで 404・410 が想定外に増えていないか見る（移行しなかった記事の 410 は想定どおり）

### 3. メール（Email Routing）

`support@invest-news-source.com` は受信専用。Cloudflare の Email Routing で `invest-news-source@outlook.jp` に転送する。お問い合わせフォームの送信も Email Routing を使う。

0. ★ 切り替え前に、今 `support@` を受け取っているサービスに残っているメールを確認・保存しておく
   - ネームサーバーを切り替えた直後は、お名前.com から引き継いだ MX のまま旧サービスで受信が続く（この間は届かなくなることはない）
1. ★ ダッシュボード →「メール」→「Email Routing」を有効化
   - MX・SPF のレコードが Cloudflare のものに置き換わる。ここから旧サービスにはメールが届かなくなる
2. ★「宛先アドレス」に `invest-news-source@outlook.jp` を追加し、届いた確認メールのリンクを開く
3. ★「ルーティングルール」→「カスタムアドレス」で `support` を作り、アクション「メールを転送」・宛先 `invest-news-source@outlook.jp`
   - キャッチオール（それ以外の宛先）は「削除（破棄）」のままでよい
4. テストする
   - 外部のアドレス（Gmail など）から `support@invest-news-source.com` に送り、outlook.jp に届くか
   - お問い合わせフォームから送信し、outlook.jp に届くか（送信元は `form@invest-news-source.com`。返信すると問い合わせた人に届く）
   - outlook.jp の迷惑メールフォルダも確認する
5. ★ 問題なければ旧メールサービスを解約する

### 4. Turnstile（ボット対策、任意）

1. ★ ダッシュボード →「Turnstile」→ ウィジェットを追加（ホスト名 `invest-news-source.com`、モード「マネージド」）
2. サイトキーを `src/site.config.ts` の `turnstileSiteKey` に書く
3. `npx wrangler secret put TURNSTILE_SECRET --env=""` でシークレットキーを登録
4. `npm run deploy`

サイトキーとシークレットは必ずセットで設定する（シークレットだけ入れるとフォームが常に失敗する）。

### 5. AdSense

設定済み（`src/site.config.ts` の `adsense`）。`/ads.txt` は `client` から自動生成される。

| スロット | 場所 | 管理画面のフォーマット |
|---|---|---|
| `inArticle` | 記事の第2セクションの後 | 記事内 |
| `multiplex` | まとめの後・関連記事の前 | Multiplex |
| `sidebarTop` | PCサイドバー上部 300×250 | ディスプレイ |
| `sidebar` | PCサイドバー下部・追従 300×600 | ディスプレイ |
| `listing` | トップの一覧内 | 記事内 |

ユニットを作り直したら ID を差し替えて `npm run deploy`。サイドバー広告は 1000px 以下の画面では出さない。
