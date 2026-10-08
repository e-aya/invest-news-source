// サイト全体の設定。外部サービスのIDはここだけで管理する。
// 空文字のものは「未設定」。未設定のあいだは該当タグを出力しない（広告は枠だけ表示）。

export const site = {
  name: 'ずんだもん投資速報',
  url: 'https://invest-news-source.com',
  description:
    '速報はXで、深掘りはこちら。AIも国策もIPOも、数字でほどいてから話すのだ。IPO・株式市場・マクロを図解で読み解く個人投資家向けブログ。',
  lang: 'ja',
  ogImage: '/og/default-1200x630.png',

  author: {
    name: '睦月六弦',
    title: 'ITエンジニア × 長期投資家',
    summary:
      '投資歴は約10年。FXや信用取引など短期売買での失敗を経て、現在は個別株とインデックス投資を中心に、長期保有を基本とした運用を続けています。本業のITエンジニアの仕事柄、数字やデータから「なぜそうなるのか」を考えるのが好きです。',
    policy:
      '「上がる・下がる」だけでなく、なぜ動いたのか、そのニュースが企業や投資にどうつながるのかを、決算・金利・為替などの数字や一次情報をもとに読み解いています。',
    profileUrl: '/about/',
    icon: '/brand/icon-512.png',
  },

  x: { handle: 'invest_sou57873', url: 'https://x.com/invest_sou57873' },
  blogmura: {
    url: 'https://blogmura.com/profiles/11195173/?p_cid=11195173&reader=11195173',
    banner: 'https://b.blogmura.com/banner-blogmura-reader-pink-small.svg',
  },

  // Google Analytics 4（G-XXXXXXX）
  ga4Id: 'G-H1V784847Y',

  // AdSense。client は ca-pub-XXXXXXXX。各スロットIDは管理画面で作った手動ユニットのID
  adsense: {
    client: '',
    slots: {
      inArticle: '', // 記事内（第2セクションの後）
      inArticleSecond: '', // 長い記事の中盤
      multiplex: '', // まとめ後・関連記事の前
      sidebar: '', // PCサイドバー追従
      listing: '', // トップの一覧内
    },
  },

  // 逆アクセスランキング（Blozoo）
  blozoo: { u: '8024', t: '4613' },

  contactEmail: 'invest-news-source@outlook.jp',

  // お問い合わせフォームのボット対策（Cloudflare Turnstile のサイトキー。秘密鍵は Worker のシークレットに置く）
  turnstileSiteKey: '',
} as const;

// 記事の区分（WordPressのカテゴリに相当）。表示順もこの並び
export const categories = [
  { id: 'ipo', label: 'IPO', color: 'ac' },
  { id: 'stock', label: '個別株・決算', color: 'or' },
  { id: 'ai-semi', label: 'AI・半導体', color: 'or' },
  { id: 'macro', label: '金融政策・為替', color: 'or' },
  { id: 'market', label: '市況・相場', color: 'or' },
  { id: 'geo', label: '地政学・資源', color: 'or' },
  { id: 'life', label: '制度・暮らし', color: 'or' },
] as const;

export type CategoryId = (typeof categories)[number]['id'];
