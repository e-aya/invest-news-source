// 記事の style.css を検査する。セレクタのカッコ（ ) ] ）が閉じていないと、
// それ以降のルールがすべて無効になり「スタイルが当たらない」記事になるため、ビルドを失敗させる。
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'src/content/articles';
const bad = [];
for (const slug of fs.readdirSync(DIR)) {
  const f = path.join(DIR, slug, 'style.css');
  if (!fs.existsSync(f)) continue;
  const css = fs.readFileSync(f, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]*)\{/g)) {
    const sel = m[1].replace(/"[^"]*"|'[^']*'/g, '');
    const count = (re) => (sel.match(re) || []).length;
    if (count(/\(/g) !== count(/\)/g) || count(/\[/g) !== count(/\]/g)) bad.push(`${slug}: ${m[1].trim().slice(0, 80)}`);
  }
}
if (bad.length) {
  console.error(`記事CSSのセレクタが壊れています（${bad.length}件）`);
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log('✓ 記事CSSのセレクタはすべて正常です');
