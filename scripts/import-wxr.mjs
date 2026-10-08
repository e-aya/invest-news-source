// WordPress のエクスポート（WXR）と追加CSSから、移行対象の記事を取り込む。
//
//   使い方:
//     import/export.xml      … WordPress「ツール → エクスポート → 投稿」で作ったファイル
//     import/additional.css  … 「外観 → カスタマイズ → 追加CSS」の全文
//     npm run import:wp
//
//   出力:
//     src/content/articles/<slug>/meta.json, content.html, style.css
//     import/report.md       … 取り込み結果と要確認事項
//
// 移行対象は scripts/migration-list.json（選定シートから作成）。再実行すると上書きする。
import fs from 'node:fs';
import path from 'node:path';

const WXR = 'import/export.xml';
const CSS = 'import/additional.css';
const LIST = 'scripts/migration-list.json';
const OUT = 'src/content/articles';
const SITE = 'https://invest-news-source.com';

for (const f of [WXR, CSS, LIST]) {
  if (!fs.existsSync(f)) {
    console.error(`✗ ${f} がありません`);
    process.exit(1);
  }
}

/* ---------- WXR の読み込み（依存ライブラリなしの最小パーサー） ---------- */
const xml = fs.readFileSync(WXR, 'utf-8');
const cdata = (s) => (s ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
const field = (item, name) => {
  const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? cdata(m[1]).trim() : '';
};
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');

const posts = new Map();
for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
  if (field(item, 'wp:post_type') !== 'post') continue;
  const id = Number(field(item, 'wp:post_id'));
  const cats = [...item.matchAll(/<category domain="(category|post_tag)" nicename="([^"]*)">([\s\S]*?)<\/category>/g)].map((m) => ({
    domain: m[1],
    name: unesc(cdata(m[3]).trim()),
  }));
  const meta = {};
  for (const m of item.matchAll(/<wp:postmeta>[\s\S]*?<wp:meta_key>([\s\S]*?)<\/wp:meta_key>[\s\S]*?<wp:meta_value>([\s\S]*?)<\/wp:meta_value>[\s\S]*?<\/wp:postmeta>/g)) {
    meta[cdata(m[1]).trim()] = cdata(m[2]).trim();
  }
  posts.set(id, {
    id,
    title: unesc(field(item, 'title')),
    slug: decodeURIComponent(field(item, 'wp:post_name')),
    status: field(item, 'wp:status'),
    date: field(item, 'wp:post_date_gmt'),
    modified: field(item, 'wp:post_modified_gmt'),
    content: field(item, 'content:encoded'),
    excerpt: field(item, 'excerpt:encoded'),
    categories: cats.filter((c) => c.domain === 'category').map((c) => c.name),
    tags: cats.filter((c) => c.domain === 'post_tag').map((c) => c.name),
    meta,
  });
}

/* ---------- 追加CSS を「ルール単位」に分解 ---------- */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}
// トップレベルのブロックを { prelude, body } の列にする（@media の中はさらに分解できる）
function blocks(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    out.push({ prelude, body: css.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}
const cssBlocks = blocks(stripComments(fs.readFileSync(CSS, 'utf-8')));

function cssFor(namespaces) {
  const hit = (sel) => namespaces.some((ns) => new RegExp(`\\.${ns}-`).test(sel));
  const parts = [];
  for (const b of cssBlocks) {
    if (b.prelude.startsWith('@media') || b.prelude.startsWith('@supports') || b.prelude.startsWith('@container')) {
      const inner = blocks(b.body).filter((x) => hit(x.prelude));
      if (inner.length) parts.push(`${b.prelude}{${inner.map((x) => `${x.prelude}{${x.body.trim()}}`).join('')}}`);
    } else if (b.prelude.startsWith('@keyframes')) {
      // 名前空間付きのアニメーション名だけ持っていく
      if (hit(b.prelude.replace(/@keyframes\s+/, '.'))) parts.push(`${b.prelude}{${b.body}}`);
    } else if (!b.prelude.startsWith('@') && hit(b.prelude)) {
      // 1つのルールに複数のセレクタがある場合、この記事の名前空間を含むものだけ残す
      const sels = b.prelude.split(',').map((s) => s.trim()).filter(hit);
      parts.push(`${sels.join(',')}{${b.body.trim()}}`);
    }
  }
  return parts.join('\n');
}

/* ---------- 補助 ---------- */
const TICKER_NAMES = {
  '285A': 'キオクシアHD', '627A': 'akippa', '634A': 'レイヤード', '648A': 'ルクレ', '581A': 'GO', '593A': 'ティアフォー',
  '618A': 'KOMPEITO', '619A': 'オリバー', '625A': 'Skyfall', '622A': 'テクノクラフト', '623A': 'ベルテックス', '598A': 'チャットプラス',
  '543A': 'ARCHION', '9334': 'アイビスHD', '9984': 'ソフトバンクグループ', '8848': 'レオパレス21', '8473': 'SBIホールディングス',
  '7475': 'アルビス', '8035': '東京エレクトロン', '8316': '三井住友FG', '4062': 'イビデン', '6976': '太陽誘電', '6857': 'アドバンテスト',
  '3382': 'セブン＆アイHD', '7011': '三菱重工業', '7267': 'ホンダ', '5803': 'フジクラ',
  NVDA: 'NVIDIA', MU: 'マイクロン', SBE: 'SBエナジー', IBM: 'IBM', ASML: 'ASML', ORCL: 'オラクル', SPCX: 'SpaceX',
};
const SERIES_TAGS = [
  ['geo-risk', /地政学リスクウォッチ/],
  ['central-bank', /中央銀行ウォッチ|通貨政策ウォッチ/],
  ['ai-light-shadow', /AI熱狂の光と影/],
  ['national-policy', /国策テーマウォッチ/],
  ['good-company-bad-timing', /良い会社.?悪いタイミング/],
];
const asciiSlug = (s) => /^[a-z0-9][a-z0-9-]{2,80}$/.test(s);
const plain = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const toDate = (gmt) => (gmt && gmt !== '0000-00-00 00:00:00' ? new Date(gmt.replace(' ', 'T') + 'Z') : null);

/* ---------- 取り込み ---------- */
const list = JSON.parse(fs.readFileSync(LIST, 'utf-8')).articles;
const report = [];
const warn = (no, msg) => report.push(`- No.${no}: ${msg}`);
const byWpId = new Map();
const usedSlugs = new Set();
const done = new Set();

// 1回目：スラッグを決める（本文中の旧リンクを書き換えるため、先に全記事分を決める）
const plan = [];
for (const row of list) {
  if (done.has(row.wpId)) {
    warn(row.no, `記事ID ${row.wpId} は別の行（${[...plan].find((p) => p.row.wpId === row.wpId)?.row.no}）と重複しています。正しいIDを確認してください（この行は取り込みません）`);
    continue;
  }
  const post = posts.get(row.wpId);
  if (!post) { warn(row.no, `記事ID ${row.wpId} がエクスポートファイルにありません`); continue; }
  done.add(row.wpId);
  let slug = asciiSlug(post.slug) ? post.slug : `archives-${row.wpId}`;
  if (!asciiSlug(post.slug)) warn(row.no, `英語のスラッグが設定されていないため「${slug}」にしました（${post.title}）`);
  while (usedSlugs.has(slug)) slug += '-2';
  usedSlugs.add(slug);
  byWpId.set(row.wpId, slug);
  plan.push({ row, post, slug });
}

// 本文中の旧URL（/?p=ID）を新しいURLに書き換える。移行しない記事へのリンクは外して文字だけ残す
const rewriteLinks = (html, no) =>
  html.replace(/<a\b([^>]*?)href=(["'])(?:https?:\/\/(?:www\.)?invest-news-source\.com)?\/?\?p=(\d+)[^"']*\2([^>]*)>([\s\S]*?)<\/a>/g, (m, pre, q, id, post, text) => {
    const s = byWpId.get(Number(id));
    if (s) return `<a${pre}href=${q}/${s}/${q}${post}>${text}</a>`;
    warn(no, `移行しない記事（?p=${id}）へのリンクを外しました：「${plain(text)}」`);
    return `<span>${text}</span>`;
  });

fs.mkdirSync(OUT, { recursive: true });
// 動作確認用のサンプル記事（meta.json に sample: true）は取り込み時に削除する
for (const d of fs.readdirSync(OUT)) {
  const m = path.join(OUT, d, 'meta.json');
  if (fs.existsSync(m) && JSON.parse(fs.readFileSync(m, 'utf-8')).sample) fs.rmSync(path.join(OUT, d), { recursive: true });
}
let placeholderTotal = 0;
for (const { row, post, slug } of plan) {
  let html = post.content
    .replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '') // ブロックエディタのコメント
    .trim();
  html = rewriteLinks(html, row.no);
  const placeholders = (html.match(/href=["']#["']/g) || []).length;
  placeholderTotal += placeholders;
  if (placeholders) warn(row.no, `仮リンク href="#" が ${placeholders} 箇所あります（${slug}）`);

  // 名前空間：選定シートの値 + 本文のクラス名から推定
  const nsFound = new Set([...html.matchAll(/class=["']([^"']+)["']/g)].flatMap((m) => m[1].split(/\s+/)).map((c) => (c.match(/^([a-z][a-z0-9]{1,7})-/) || [])[1]).filter(Boolean));
  const namespaces = [...new Set([row.namespace, ...nsFound].filter(Boolean))];
  const css = cssFor(namespaces);
  if (!css) warn(row.no, `追加CSSに名前空間 ${namespaces.map((n) => `.${n}-`).join(' ') || '（不明）'} のスタイルが見つかりません`);

  const published = toDate(post.date);
  const modified = toDate(post.modified);
  const desc =
    post.meta.rank_math_description || post.meta._yoast_wpseo_metadesc || post.excerpt || plain(html).slice(0, 110);
  const categoryNames = new Set(post.categories);
  const tags = post.tags.filter((t) => !categoryNames.has(t));
  const allLabels = [...post.tags, ...post.categories].join(' ');
  const series = row.category === 'ipo' ? 'ipo' : (SERIES_TAGS.find(([, re]) => re.test(allLabels)) || [])[0];

  const meta = {
    title: post.title,
    description: desc,
    status: post.status === 'publish' ? 'published' : 'draft',
    publishedAt: published?.toISOString(),
    ...(modified && published && modified.getTime() - published.getTime() > 3600e3 ? { updatedAt: modified.toISOString() } : {}),
    category: row.category,
    ...(series ? { series } : {}),
    tickers: row.tickers.map((c) => ({ code: c, name: TICKER_NAMES[c] || c })),
    tags,
    wpId: row.wpId,
    format: 'legacy',
  };
  row.tickers.filter((c) => !TICKER_NAMES[c]).forEach((c) => warn(row.no, `銘柄 ${c} の名前が未登録です`));
  if (post.status !== 'publish') warn(row.no, `WordPress上の状態が「${post.status}」のため下書き扱いにしました`);

  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'content.html'), html + '\n');
  fs.writeFileSync(path.join(dir, 'style.css'), css + '\n');
}

fs.mkdirSync('import', { recursive: true });
fs.writeFileSync(
  'import/report.md',
  [
    `# 取り込み結果（${new Date().toISOString()}）`,
    '',
    `- 対象: ${list.length} 行 / 取り込み: ${plan.length} 本 / エクスポート内の投稿: ${posts.size} 本`,
    `- 仮リンク href="#" の合計: ${placeholderTotal} 箇所`,
    '',
    '## 要確認',
    ...(report.length ? report : ['- なし']),
    '',
  ].join('\n'),
);
console.log(`取り込み ${plan.length} 本。要確認 ${report.length} 件 → import/report.md`);
