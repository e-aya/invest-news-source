// AdSense の ads.txt。site.config.ts の adsense.client（ca-pub-...）から作る
import type { APIRoute } from 'astro';
import { site } from '../site.config';

export const GET: APIRoute = () => {
  const pub = site.adsense.client.replace(/^ca-/, '');
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '# AdSense 未設定\n';
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
