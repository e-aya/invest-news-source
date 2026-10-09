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

// セレクタ列をトップレベルのカンマで分ける（:is(p, li) や [data-x="a,b"] の中のカンマでは切らない）
function splitSelectors(prelude) {
  const out = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of prelude) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

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
      const sels = splitSelectors(b.prelude).filter(hit);
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
  NVDA: 'NVIDIA', MU: 'マイクロン', TSM: 'TSMC', SBE: 'SBエナジー', IBM: 'IBM', ASML: 'ASML', ORCL: 'オラクル', SPCX: 'SpaceX',
};
const SERIES_TAGS = [
  ['geo-risk', /地政学リスクウォッチ/],
  ['central-bank', /中央銀行ウォッチ|通貨政策ウォッチ/],
  ['ai-light-shadow', /AI熱狂の光と影/],
  ['national-policy', /国策テーマウォッチ/],
  ['good-company-bad-timing', /良い会社.?悪いタイミング/],
];
const asciiSlug = (s) => /^[a-z0-9][a-z0-9-]{2,80}$/.test(s) && !/^\d+$/.test(s);
// 手動で決めたスラッグ（scripts/slugs.json）を最優先にする
const SLUGS = fs.existsSync('scripts/slugs.json') ? JSON.parse(fs.readFileSync('scripts/slugs.json', 'utf-8')) : {};
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
  let slug = SLUGS[row.wpId] || (asciiSlug(post.slug) ? post.slug : `archives-${row.wpId}`);
  if (!SLUGS[row.wpId] && !asciiSlug(post.slug)) warn(row.no, `英語のスラッグが未設定のため「${slug}」にしました（${post.title}）`);
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

// 仮リンク href="#" を、リンク文と記事タイトルの近さで実際の記事に結びつける。
// 確信が持てないものはリンクを外して文字だけ残す（どちらも report.md に記録）
const norm = (t) => t.replace(/<[^>]+>/g, '').replace(/（URL[^）]*）|\(URL[^)]*\)|（既存記事[^）]*）|関連記事[:：]|URL挿入待ち/g, '')
  .replace(/[\s「」『』【】（）()｜|・、。—―─\-–:：！？!?"“”'’…]/g, '').toLowerCase();
const bigrams = (t) => { const s = new Set(); for (let i = 0; i < t.length - 1; i++) s.add(t.slice(i, i + 2)); return s; };
const sim = (a, b) => { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return (2 * n) / (A.size + B.size); };
const OVERRIDES = fs.existsSync('scripts/link-overrides.json') ? JSON.parse(fs.readFileSync('scripts/link-overrides.json', 'utf-8')).rules : [];
function resolvePlaceholders(html, no, self, srcId) {
  return html.replace(/<a\b([^>]*?)href=(["'])(?:#|REPLACE[^"']*|\{[^"']*\})\2([^>]*)>([\s\S]*?)<\/a>/g, (m, pre, q, post, text) => {
    const t = norm(text);
    const label = plain(text);
    // 1. 手動対応表
    const rule = OVERRIDES.find(([src, needle]) => src === srcId && label.includes(needle));
    if (rule) {
      const target = rule[2] && plan.find((p) => p.row.wpId === rule[2]);
      if (target) {
        linkLog.push(`- No.${no}（${self}）「${label}」→ /${target.slug}/（手動指定）`);
        return `<a${pre}href=${q}/${target.slug}/${q}${post}>${text}</a>`;
      }
      linkLog.push(`- No.${no}（${self}）「${label}」→ リンクを外した（手動指定）`);
      return `<span>${text}</span>`;
    }
    // 2. リンク文に銘柄コードがあれば、その銘柄の記事の中から選ぶ
    const codes = [...label.matchAll(/[（(]([0-9]{3}[0-9A-Z])[）)]/g)].map((x) => x[1]);
    if (codes.length) {
      const cands = plan.filter((p) => p.slug !== self && p.row.tickers.some((c) => codes.includes(c)))
        .map((p) => ({ p, s: sim(t, norm(p.post.title)) })).sort((a, b) => b.s - a.s || a.p.post.date.localeCompare(b.p.post.date));
      if (cands.length) {
        linkLog.push(`- No.${no}（${self}）「${label}」→ /${cands[0].p.slug}/（銘柄コード ${codes.join(',')} で照合：${cands[0].p.post.title}）`);
        return `<a${pre}href=${q}/${cands[0].p.slug}/${q}${post}>${text}</a>`;
      }
    }
    const scored = plan.filter((p) => p.slug !== self).map((p) => ({ p, s: sim(t, norm(p.post.title)) })).sort((a, b) => b.s - a.s);
    const [best, second] = scored;
    if (best && best.s >= 0.42 && best.s - (second?.s ?? 0) >= 0.08) {
      linkLog.push(`- No.${no}（${self}）「${plain(text)}」→ /${best.p.slug}/（${best.p.post.title}）一致度 ${best.s.toFixed(2)}`);
      return `<a${pre}href=${q}/${best.p.slug}/${q}${post}>${text}</a>`;
    }
    linkLog.push(`- No.${no}（${self}）「${plain(text)}」→ 該当なし（リンクを外した）${best ? `　最も近い候補：${best.p.post.title}（${best.s.toFixed(2)}）` : ''}`);
    return `<span>${text}</span>`;
  });
}
const linkLog = [];

// WordPress にアップロードした画像（/wp-content/uploads/...）を public/media/... に置き換える。
// public/media にファイルがまだ無い画像は、画像ごと外して report.md に記録する
const mediaNeeded = [];
function localizeMedia(html, no, self) {
  const re = /(?:https?:)?\/\/(?:www\.)?invest-news-source\.com\/wp-content\/uploads\/([^"'\s)]+)/g;
  const missing = new Set();
  html = html.replace(re, (m, rel) => {
    if (!fs.existsSync(path.join('public/media', rel))) missing.add(rel);
    return `/media/${rel}`;
  });
  for (const rel of missing) {
    const u = `/media/${rel}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html
      .replace(new RegExp(`<img\\b[^>]*src=["']${u}["'][^>]*>`, 'g'), '')
      .replace(new RegExp(`<a\\b[^>]*href=["']${u}["'][^>]*>([\\s\\S]*?)<\\/a>`, 'g'), '$1');
    mediaNeeded.push(`- No.${no}（${self}）画像 wp-content/uploads/${rel} → public/media/${rel} に置けば表示されます（今は外しています）`);
  }
  return html;
}

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
  html = html.replace(/<!--[\s\S]*?-->/g, ''); // 制作メモなどのコメントは公開しない
  html = rewriteLinks(html, row.no);
  html = resolvePlaceholders(html, row.no, slug, row.wpId);
  html = localizeMedia(html, row.no, slug);
  const placeholders = (html.match(/href=["']#["']/g) || []).length;
  placeholderTotal += placeholders;
  if (placeholders) warn(row.no, `仮リンク href="#" が ${placeholders} 箇所残っています（${slug}）`);

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
  // シリーズは移行リストの指定が優先（null は「シリーズなし」）。指定がなければ IPO 区分 → タグ・カテゴリ名 の順で決める。
  // WordPress のタグには複数のシリーズ名が付いていることが多く、タグだけだと本来と違うシリーズになりやすい
  const series = 'series' in row ? row.series : row.category === 'ipo' ? 'ipo' : (SERIES_TAGS.find(([, re]) => re.test(allLabels)) || [])[0];

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
    '## 画像',
    ...(mediaNeeded.length ? mediaNeeded : ['- なし']),
    '',
    '## 仮リンク（href="#"）の自動対応',
    ...(linkLog.length ? linkLog : ['- なし']),
    '',
  ].join('\n'),
);
console.log(`取り込み ${plan.length} 本。要確認 ${report.length} 件 → import/report.md`);
