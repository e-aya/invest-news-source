// Worker が使う転送表を、記事の meta.json から作る。
//   byWpId    … 旧URL /?p=ID → 新しいスラッグ（公開中の記事だけ）
//   withdrawn … 削除済み（410を返す）スラッグ
//   pages     … 固定ページ /?page_id=ID → 新URL（scripts/wp-pages.json で手動管理）
import fs from 'node:fs';
import path from 'node:path';

const dir = 'src/content/articles';
const byWpId = {};
const withdrawn = [];
const seen = new Map();

for (const slug of fs.readdirSync(dir)) {
  const p = path.join(dir, slug, 'meta.json');
  if (!fs.existsSync(p)) continue;
  const m = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const status = m.status || 'published';
  if (status === 'withdrawn') withdrawn.push(slug);
  if (m.wpId && status === 'published') {
    if (seen.has(m.wpId)) {
      console.error(`✗ wpId ${m.wpId} が重複しています: ${seen.get(m.wpId)} と ${slug}`);
      process.exitCode = 1;
    }
    seen.set(m.wpId, slug);
    byWpId[m.wpId] = slug;
  }
}

const pagesFile = 'scripts/wp-pages.json';
const pages = fs.existsSync(pagesFile) ? JSON.parse(fs.readFileSync(pagesFile, 'utf-8')) : {};

fs.mkdirSync('worker/generated', { recursive: true });
fs.writeFileSync('worker/generated/legacy-map.json', JSON.stringify({ byWpId, withdrawn, pages }, null, 2));
console.log(`転送表: 旧URL ${Object.keys(byWpId).length} 件 / 削除済み ${withdrawn.length} 件 / 固定ページ ${Object.keys(pages).length} 件`);
