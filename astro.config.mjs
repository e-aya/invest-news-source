// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://invest-news-source.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      // 410ページ・検索・問い合わせ完了などはサイトマップに載せない
      filter: (page) => !/\/(gone|search|contact\/thanks)\/$/.test(page),
    }),
  ],
});
