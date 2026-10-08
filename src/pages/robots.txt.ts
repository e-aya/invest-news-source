// robots.txt。サイトマップの場所を検索エンジンに知らせる
import type { APIRoute } from 'astro';
import { site } from '../site.config';

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nDisallow: /api/\n\nSitemap: ${site.url}/sitemap-index.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
