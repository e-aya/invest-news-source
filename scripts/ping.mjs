// 更新通知（Ping）を送る。WordPress が記事の公開時に自動でしていたことの代わり。
//   npm run deploy の最後に呼ばれる。最新記事が前回の送信時から変わっていなければ送らない
//   npm run ping            … 同じ判定で手動送信
//   npm run ping -- --force … 新しい記事がなくても送る
// 送信に失敗してもデプロイ自体は失敗にしない（警告だけ出す）
import fs from 'node:fs';

const SITE_NAME = 'ずんだもん投資速報';
const SITE_URL = 'https://invest-news-source.com/';
const STATE = '.ping-state.json'; // 最後に通知した記事（Git では管理しない）
const force = process.argv.includes('--force');

const { targets } = JSON.parse(fs.readFileSync('src/data/ping.json', 'utf-8'));
const feed = fs.existsSync('dist/feed/index.xml') ? fs.readFileSync('dist/feed/index.xml', 'utf-8') : '';
const latest = (feed.match(/<guid[^>]*>([^<]+)<\/guid>/) || [])[1] || '';
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf-8')) : {};

if (!latest) {
  console.warn('⚠ Ping: dist/feed/index.xml が見つからないので送りません（先に npm run build）');
  process.exit(0);
}
if (!force && state.latest === latest) {
  console.log('Ping: 新しい記事がないので送りません（送るときは npm run ping -- --force）');
  process.exit(0);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const body = `<?xml version="1.0"?>
<methodCall>
<methodName>weblogUpdates.ping</methodName>
<params>
<param><value><string>${esc(SITE_NAME)}</string></value></param>
<param><value><string>${esc(SITE_URL)}</string></value></param>
</params>
</methodCall>`;

let allOk = true;
for (const t of targets) {
  try {
    const res = await fetch(t.url, {
      method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8', 'user-agent': `invest-news-source ping (+${SITE_URL})` },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    // flerror が 1（true）なら失敗。0 なら受け付け
    const flerror = /<name>flerror<\/name>\s*<value>\s*<boolean>\s*1/.test(text);
    if (res.ok && !flerror) console.log(`✓ Ping: ${t.label}`);
    else { allOk = false; console.warn(`⚠ Ping: ${t.label} が失敗（HTTP ${res.status}）: ${text.replace(/\s+/g, ' ').slice(0, 200)}`); }
  } catch (e) {
    allOk = false;
    console.warn(`⚠ Ping: ${t.label} に接続できません: ${e.message}`);
  }
}

// 1か所でも失敗したら記録しない（次のデプロイでもう一度送る）
if (allOk) fs.writeFileSync(STATE, JSON.stringify({ latest, sentAt: new Date().toISOString() }, null, 2));
