// サイト全体の入口になる Worker。
//   1. WordPress 時代のURL（/?p=ID など）を新しいURLへ 301 転送、移行しなかった記事は 410
//   2. /feed/ と /?feed=rss2 で自サイトのRSSを返す（WordPress時代と同じURL）
//   3. /api/contact … お問い合わせをメールで転送
//   4. /api/rss …… 相互RSS（1時間ごとに取得してKVに保存したもの）を返す
//   5. それ以外は静的ファイル（Astroのビルド結果）をそのまま返す
import { EmailMessage } from 'cloudflare:email';
import legacy from './generated/legacy-map.json';
import feeds from '../src/data/rss-feeds.json';

const HOST = 'invest-news-source.com';

export default {
  async fetch(request, env, ctx) {
    const res = await handle(request, env, ctx);
    // 本番ドメイン以外（確認用の workers.dev など）は検索エンジンに載せない
    const host = new URL(request.url).hostname;
    if (host === HOST || host === `www.${HOST}` || res.status === 101) return res;
    const out = new Response(res.body, res);
    out.headers.set('x-robots-tag', 'noindex, nofollow');
    return out;
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshRss(env));
  },
};

async function handle(request, env, ctx) {
  const url = new URL(request.url);

  // www なしに統一
  if (url.hostname === `www.${HOST}`) {
    url.hostname = HOST;
    return Response.redirect(url.toString(), 301);
  }

  // ---- WordPress 時代のURL ----
  const q = url.searchParams;
  if (q.has('p')) {
    // 記事 → 固定ページ（WordPress では固定ページも /?p=ID で開ける）の順に探す
    const slug = legacy.byWpId[q.get('p')];
    if (slug) return redirect(url, `/${slug}/`);
    const page = legacy.pages[q.get('p')];
    return page ? redirect(url, page) : gone(env, request);
  }
  if (q.has('page_id')) {
    // 固定ページ（運営者情報・プライバシーポリシーなど）は scripts/wp-pages.json の対応表で転送。
    // 対応表にないものもトップへ転送する（固定ページは削除扱いの 410 にしない）
    const to = legacy.pages[q.get('page_id')];
    return redirect(url, to || '/');
  }
  if (q.has('s')) return redirect(url, `/search/?q=${encodeURIComponent(q.get('s') || '')}`);
  // 相互RSS・アンテナサイトには /?feed=rss2 で登録されている。転送をたどらない取得元もあるので、転送せずにそのまま返す
  if (q.has('feed')) return feed(env, url);
  if (q.has('cat') || q.has('tag') || q.has('m') || q.has('author') || q.has('attachment_id')) {
    return redirect(url, '/');
  }
  if (/^\/(wp-admin|wp-includes|wp-content|wp-json)(\/|$)|^\/(wp-login\.php|xmlrpc\.php|wp-cron\.php)$/.test(url.pathname)) {
    return gone(env, request);
  }

  // ---- WordPress（Rank Math・標準）のサイトマップ → 新しいサイトマップ ----
  // Search Console に旧サイトマップが登録されたままでも、新しいサイトマップを読みに来られるようにする
  if (/^\/(sitemap_index|sitemap|wp-sitemap|post-sitemap\d*|page-sitemap|category-sitemap|post_tag-sitemap)\.xml$/.test(url.pathname)) {
    return redirect(url, '/sitemap-index.xml');
  }

  // ---- 自サイトのRSS ----
  if (/^\/feed(\/(rss2?\/?|atom\/?)?)?$/.test(url.pathname)) return feed(env, url);

  // ---- 削除済み記事 ----
  const first = decodeURIComponent(url.pathname.split('/')[1] || '');
  if (first && legacy.withdrawn.includes(first)) return gone(env, request);

  // ---- API ----
  if (url.pathname === '/api/contact') {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    return contact(request, env, url);
  }
  if (url.pathname === '/api/rss') return rssApi(env, ctx);

  // ---- 静的ファイル ----
  return env.ASSETS.fetch(request);
}

async function feed(env, url) {
  const res = await env.ASSETS.fetch(new URL('/feed/index.xml', url));
  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600' },
  });
}

function redirect(url, to, status = 301) {
  return Response.redirect(new URL(to, url).toString(), status);
}

async function gone(env, request) {
  const res = await env.ASSETS.fetch(new URL('/gone/', request.url));
  return new Response(res.body, {
    status: 410,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-robots-tag': 'noindex' },
  });
}

/* ================= お問い合わせ ================= */

async function contact(request, env, url) {
  const form = await request.formData();
  const field = (k, max) => String(form.get(k) || '').trim().slice(0, max);
  const name = field('name', 100);
  const email = field('email', 200);
  const subject = field('subject', 200);
  const message = field('message', 5000);

  // 人には見えない入力欄に値がある＝ボット。成功したふりをして捨てる
  if (field('company', 100)) return redirect(url, '/contact/thanks/', 303);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response('お名前とメールアドレスを正しく入力してください。', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (env.TURNSTILE_SECRET) {
    const token = String(form.get('cf-turnstile-response') || '');
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET);
    body.append('response', token);
    body.append('remoteip', request.headers.get('cf-connecting-ip') || '');
    const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body }).then((r) => r.json());
    if (!v.success) return new Response('送信を確認できませんでした。もう一度お試しください。', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const text = [
    `お名前: ${name}`,
    `メールアドレス: ${email}`,
    `題名: ${subject || '（なし）'}`,
    '',
    message || '（本文なし）',
    '',
    `送信元: ${request.headers.get('cf-connecting-ip') || '-'} / ${new Date().toISOString()}`,
  ].join('\n');

  // 確認用環境（send_email なし）や Email Routing の設定前は送れない
  if (!env.MAILER) {
    return new Response(`ただいまフォームから送信できません。お手数ですが support@${HOST} まで直接ご連絡ください。`, {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const raw = mime({
    from: env.MAIL_FROM,
    to: env.MAIL_TO || 'invest-news-source@outlook.jp',
    replyTo: email,
    subject: `【お問い合わせ】${subject || name}`,
    text,
  });
  await env.MAILER.send(new EmailMessage(env.MAIL_FROM, env.MAIL_TO || 'invest-news-source@outlook.jp', raw));
  return redirect(url, '/contact/thanks/', 303);
}

function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function mime({ from, to, replyTo, subject, text }) {
  const body = b64(text).replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Message-ID: <${crypto.randomUUID()}@${HOST}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

/* ================= 相互RSS ================= */

async function rssApi(env, ctx) {
  let data = await env.RSS_CACHE.get('rss:all', 'json');
  if (!data) {
    data = await refreshRss(env);
  }
  return new Response(JSON.stringify({ ...data, maxInAll: feeds.maxInAll }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}

async function refreshRss(env) {
  const results = await Promise.allSettled(feeds.feeds.map((f) => fetchFeed(f)));
  // 取得に失敗したフィードは、前回の結果を使い続ける
  const prev = (await env.RSS_CACHE.get('rss:all', 'json')) || { items: [] };
  const items = [];
  results.forEach((r, i) => {
    const f = feeds.feeds[i];
    if (r.status === 'fulfilled' && r.value.length) items.push(...r.value);
    else items.push(...prev.items.filter((x) => x.feed === f.id));
  });
  items.sort((a, b) => b.date - a.date);
  const data = { items: items.slice(0, 120), fetchedAt: Date.now() };
  await env.RSS_CACHE.put('rss:all', JSON.stringify(data));
  return data;
}

async function fetchFeed(f) {
  const res = await fetch(f.url, {
    headers: { 'user-agent': `Mozilla/5.0 (compatible; ${HOST} RSS reader; +https://${HOST}/)` },
    cf: { cacheTtl: 600 },
  });
  if (!res.ok) throw new Error(`${f.id}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const xml = decode(buf, res.headers.get('content-type') || '');
  return parseFeed(xml)
    .filter((i) => i.title && /^https?:\/\//.test(i.link))
    .slice(0, 20)
    .map((i) => ({ feed: f.id, blog: f.label, title: i.title, link: i.link, date: i.date || Date.now() }));
}

// 文字コード：Content-Type → XML宣言 → UTF-8 の順に判定する（Shift_JIS / EUC-JP のフィードに対応）
function decode(buf, contentType) {
  const head = new TextDecoder('ascii').decode(buf.slice(0, 200));
  const cs = (contentType.match(/charset=([\w-]+)/i) || head.match(/encoding=["']([\w-]+)["']/i) || [])[1] || 'utf-8';
  try {
    return new TextDecoder(cs.toLowerCase()).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

// RSS 2.0 / RSS 1.0(RDF) / Atom の最小限のパーサー
function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) || [];
  return blocks.map((b) => {
    const title = text(tag(b, 'title'));
    let link = text(tag(b, 'link'));
    if (!link) link = (b.match(/<link\b[^>]*href=["']([^"']+)["']/) || [])[1] || '';
    const d = text(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'updated') || tag(b, 'published'));
    const t = d ? Date.parse(d) : NaN;
    return { title, link: link.trim(), date: Number.isNaN(t) ? 0 : t };
  });
}

function tag(s, name) {
  const m = s.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : '';
}

function text(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}
