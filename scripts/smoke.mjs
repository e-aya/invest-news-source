// 公開したサイトの点検。旧URLの転送・410・RSS・サイトマップ・広告まわりが期待どおりか確かめる。
//   npm run smoke -- https://invest-news-source-staging.<アカウント名>.workers.dev
//   npm run smoke -- https://invest-news-source.com
import fs from 'node:fs';

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('使い方: npm run smoke -- <サイトのURL>（例: https://invest-news-source.com）');
  process.exit(1);
}
const isProd = new URL(base).hostname === 'invest-news-source.com';
const legacy = JSON.parse(fs.readFileSync('worker/generated/legacy-map.json', 'utf-8'));
const [wpId, slug] = Object.entries(legacy.byWpId)[0];

let failed = 0;
async function check(label, path, expect) {
  try {
    const res = await fetch(base + path, { redirect: 'manual', headers: { 'user-agent': 'invest-news-source smoke test' } });
    const body = res.status === 200 ? await res.text() : '';
    const problem = expect(res, body);
    if (problem) { failed++; console.log(`✗ ${label}（${path}）: ${problem}`); }
    else console.log(`✓ ${label}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${label}（${path}）: 接続できません ${e.message}`);
  }
}
const status = (n) => (res) => (res.status === n ? '' : `${n} のはずが ${res.status}`);
const redirectTo = (to) => (res) =>
  res.status !== 301 ? `301 のはずが ${res.status}` : new URL(res.headers.get('location'), base).pathname !== to ? `転送先が ${res.headers.get('location')}` : '';

await check('トップページ', '/', status(200));
await check(`旧URL /?p=${wpId} → /${slug}/`, `/?p=${wpId}`, redirectTo(`/${slug}/`));
await check('移行しなかった記事は 410', '/?p=1', status(410));
await check('WordPress 管理画面は 410', '/wp-login.php', status(410));
await check('固定ページの旧URLは転送', '/?page_id=2', (res) => (res.status === 301 ? '' : `301 のはずが ${res.status}`));
for (const [id, to] of Object.entries(legacy.pages)) {
  await check(`固定ページ /?p=${id} → ${to}`, `/?p=${id}`, redirectTo(to));
}
await check('記事ページ', `/${slug}/`, status(200));
await check('存在しないページは 404', '/this-page-does-not-exist/', status(404));
await check('RSS（/feed/）', '/feed/', (res, body) => status(200)(res) || (body.includes('<rss') ? '' : 'RSS ではありません'));
await check('旧サイトマップ → 新サイトマップ', '/sitemap_index.xml', redirectTo('/sitemap-index.xml'));
await check('サイトマップ', '/sitemap-index.xml', status(200));
await check('robots.txt', '/robots.txt', (res, body) => status(200)(res) || (body.includes('Sitemap:') ? '' : 'Sitemap の行がありません'));
await check('ads.txt', '/ads.txt', (res, body) => status(200)(res) || (body.includes('pub-') ? '' : 'AdSense の行がありません'));
await check('相互RSS（/api/rss）', '/api/rss', (res, body) => {
  if (res.status !== 200) return `200 のはずが ${res.status}`;
  const n = JSON.parse(body).items?.length ?? 0;
  return n > 0 ? '' : '記事が0件（cron の初回取得前か、相手サイトに届いていない）';
});
await check(isProd ? '本番は検索エンジンに載る（noindex なし）' : '確認用は noindex', '/', (res) => {
  const noindex = (res.headers.get('x-robots-tag') || '').includes('noindex');
  return isProd === !noindex ? '' : isProd ? 'noindex が付いています' : 'noindex が付いていません';
});
if (isProd) {
  try {
    const res = await fetch('https://www.invest-news-source.com/', { redirect: 'manual' });
    if (res.status === 301 && new URL(res.headers.get('location')).hostname === 'invest-news-source.com') console.log('✓ www なしへ転送');
    else { failed++; console.log(`✗ www なしへ転送: ${res.status}`); }
  } catch (e) { failed++; console.log(`✗ www なしへ転送: 接続できません ${e.message}`); }
}

console.log(failed ? `\n${failed} 件の問題があります` : '\nすべて期待どおりです');
process.exit(failed ? 1 : 0);
