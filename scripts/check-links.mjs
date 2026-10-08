// ビルド後のサイト（dist）にある全ページの内部リンクを検査する。
// 存在しないページへのリンクが1本でもあれば、ビルドを失敗させて場所を表示する。
// 本文に残った仮リンク href="#" は警告として一覧表示する。
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const SITE = 'https://invest-news-source.com';
// Worker が処理するパス（静的ファイルとしては存在しない）
const DYNAMIC = [/^\/api\//, /^\/feed\/?$/, /^\/pagefind\//];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function exists(urlPath) {
  let p = decodeURIComponent(urlPath.split('#')[0].split('?')[0]);
  if (DYNAMIC.some((r) => r.test(p))) return true;
  const f = path.join(DIST, p);
  if (p.endsWith('/')) return fs.existsSync(path.join(f, 'index.html'));
  return fs.existsSync(f) || fs.existsSync(path.join(f, 'index.html'));
}

if (!fs.existsSync(DIST)) {
  console.error('dist がありません。先に astro build を実行してください。');
  process.exit(1);
}

const broken = [];
const placeholders = [];
for (const file of walk(DIST)) {
  const html = fs.readFileSync(file, 'utf-8');
  const page = '/' + path.relative(DIST, file).replace(/index\.html$/, '').replace(/\\/g, '/');
  for (const m of html.matchAll(/\s(href|src)=["']([^"']*)["']/g)) {
    let u = m[2].trim();
    if (u === '#') { placeholders.push(page); continue; }
    if (!u || u.startsWith('#') || /^(mailto:|tel:|javascript:|data:)/.test(u)) continue;
    if (u.startsWith(SITE)) u = u.slice(SITE.length) || '/';
    if (/^(https?:)?\/\//.test(u)) continue; // 外部サイト
    if (!u.startsWith('/')) u = path.posix.join(page, u);
    if (!exists(u)) broken.push({ page, link: m[2] });
  }
}

const uniq = (arr) => [...new Map(arr.map((x) => [JSON.stringify(x), x])).values()];
const ph = [...new Set(placeholders)];
if (ph.length) {
  console.warn(`⚠ 仮リンク href="#" が残っているページ: ${ph.length}件`);
  ph.slice(0, 30).forEach((p) => console.warn(`   ${p}`));
}
const b = uniq(broken);
if (b.length) {
  console.error(`✗ リンク切れ: ${b.length}件`);
  b.forEach((x) => console.error(`   ${x.page}  →  ${x.link}`));
  process.exit(1);
}
console.log('✓ 内部リンクはすべて有効です');
