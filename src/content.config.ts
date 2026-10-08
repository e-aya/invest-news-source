import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

// 記事は 1記事 = 1フォルダ。
//   src/content/articles/<slug>/meta.json   … タイトル・日付・銘柄などのメタ情報（このファイルがコレクションの実体）
//   src/content/articles/<slug>/content.html … 本文（WordPressのカスタムHTMLブロックと同じ中身）
//   src/content/articles/<slug>/style.css    … その記事専用のCSS（旧記事は追加CSSから名前空間ごとに切り出したもの）
const articles = defineCollection({
  loader: glob({
    pattern: '*/meta.json',
    base: './src/content/articles',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // published = 公開 / draft = 下書き（どこにも出ない）/ withdrawn = 削除済み（410を返す）
    status: z.enum(['published', 'draft', 'withdrawn']).default('published'),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    category: z.enum(['ipo', 'stock', 'ai-semi', 'macro', 'market', 'geo', 'life']),
    series: z.string().optional(), // series.json の id
    tickers: z.array(z.object({ code: z.string(), name: z.string() })).default([]),
    tags: z.array(z.string()).default([]),
    points: z.array(z.string()).default([]), // 「この記事のポイント」
    wpId: z.number().optional(), // 旧URL /?p=ID からの転送に使う
    ogImage: z.string().optional(),
    // legacy = WordPressから移行した記事（本文に独自の見出し・ヒーローを含む）/ native = 新サイト用テンプレートの記事
    format: z.enum(['legacy', 'native']).default('native'),
    sample: z.boolean().default(false), // 動作確認用のサンプル記事
  }),
});

const series = defineCollection({
  loader: file('./src/data/series.json'),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    order: z.number(),
  }),
});

export const collections = { articles, series };
