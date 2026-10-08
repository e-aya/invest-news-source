// 自サイトのRSS。WordPress時代と同じ /feed/ で配信する（相互RSSの相手サイトが購読しているため）
import type { APIRoute } from 'astro';
import { getPublished, articleUrl } from '../../lib/articles';
import { site } from '../../site.config';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async () => {
  const items = (await getPublished()).slice(0, 30);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${esc(site.name)}</title>
<link>${site.url}/</link>
<atom:link href="${site.url}/feed/" rel="self" type="application/rss+xml" />
<description>${esc(site.description)}</description>
<language>ja</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items
  .map((a) => {
    const url = new URL(articleUrl(a), site.url).href;
    return `<item>
<title>${esc(a.data.title)}</title>
<link>${url}</link>
<guid isPermaLink="true">${url}</guid>
<pubDate>${a.data.publishedAt.toUTCString()}</pubDate>
<dc:creator>${esc(site.author.name)}</dc:creator>
<description>${esc(a.data.description)}</description>
</item>`;
  })
  .join('\n')}
</channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
