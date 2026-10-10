import { getCollection, type CollectionEntry } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';
import { categories, type CategoryId } from '../site.config';

export type Article = CollectionEntry<'articles'>;

const ARTICLE_DIR = path.resolve('src/content/articles');

/** 公開中の記事だけを、新しい順で返す。一覧・RSS・サイトマップはすべてここを通す */
export async function getPublished(): Promise<Article[]> {
  const all = await getCollection('articles', (a) => a.data.status === 'published');
  return all.sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

/** 削除済み（410を返す）記事 */
export async function getWithdrawn(): Promise<Article[]> {
  return getCollection('articles', (a) => a.data.status === 'withdrawn');
}

export function articleUrl(a: Article | string) {
  return `/${typeof a === 'string' ? a : a.id}/`;
}

/** 一覧に出す日付。更新日があれば更新日を優先する */
export function displayDate(a: Article) {
  const updated = a.data.updatedAt && a.data.updatedAt > a.data.publishedAt;
  const date = updated ? a.data.updatedAt! : a.data.publishedAt;
  return { date, label: updated ? '更新' : '公開', updated: Boolean(updated) };
}

export function fmtDate(d: Date) {
  // 日本時間で YYYY/MM/DD
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, '0')}/${String(jst.getUTCDate()).padStart(2, '0')}`;
}

export function isoDate(d: Date) {
  return d.toISOString();
}

export function categoryLabel(id: CategoryId) {
  return categories.find((c) => c.id === id)?.label ?? id;
}

export function readBody(slug: string): string {
  const p = path.join(ARTICLE_DIR, slug, 'content.html');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

// style.css は取り込みで毎回作り直すので、手で直した分は fix.css に置く（後から読み込んで上書きする）
export function readStyle(slug: string): string {
  return ['style.css', 'fix.css']
    .map((f) => path.join(ARTICLE_DIR, slug, f))
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, 'utf-8'))
    .join('\n');
}

/** 本文の文字数から読了目安（分）を出す。日本語は1分あたり約600字で計算 */
export function readingMinutes(html: string) {
  const text = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return Math.max(1, Math.round(text.length / 600));
}

/** シリーズ内の記事（古い順＝連載の順番） */
export function seriesArticles(all: Article[], seriesId: string) {
  return all.filter((a) => a.data.series === seriesId).sort((a, b) => a.data.publishedAt.getTime() - b.data.publishedAt.getTime());
}

/** 銘柄コードごとの記事。コードは大文字で統一 */
export function tickerIndex(all: Article[]) {
  const map = new Map<string, { code: string; name: string; articles: Article[] }>();
  for (const a of all) {
    for (const t of a.data.tickers) {
      const code = t.code.toUpperCase();
      if (!map.has(code)) map.set(code, { code, name: t.name, articles: [] });
      map.get(code)!.articles.push(a);
    }
  }
  return map;
}

export function tickerUrl(code: string) {
  return `/stocks/${code.toLowerCase()}/`;
}

/** タグのURL用キー。URLで問題になる記号（% / ? # & 空白など）はハイフンに置き換える */
export function tagKey(tag: string) {
  return tag.trim().replace(/[%/?#&\\\s.]+/g, '-').replace(/^-+|-+$/g, '') || 'tag';
}

export function tagUrl(tag: string) {
  return `/tag/${encodeURIComponent(tagKey(tag))}/`;
}

/** 関連記事：同じ銘柄 > 同じシリーズ > 同じタグ数 > 同じ区分 の順に点数を付ける */
export function related(all: Article[], a: Article, n = 3) {
  const codes = new Set(a.data.tickers.map((t) => t.code.toUpperCase()));
  const tags = new Set(a.data.tags);
  return all
    .filter((b) => b.id !== a.id)
    .map((b) => {
      let s = 0;
      if (b.data.tickers.some((t) => codes.has(t.code.toUpperCase()))) s += 8;
      if (a.data.series && b.data.series === a.data.series) s += 5;
      s += b.data.tags.filter((t) => tags.has(t)).length * 2;
      if (b.data.category === a.data.category) s += 1;
      return { b, s };
    })
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || y.b.data.publishedAt.getTime() - x.b.data.publishedAt.getTime())
    .slice(0, n)
    .map((x) => x.b);
}

/** カードの大きな文字：銘柄コードがあればコード、なければ区分名 */
export function tileOf(a: Article) {
  const t = a.data.tickers[0];
  return t ? { big: t.code, sub: t.name, logo: logoOf(t.code) } : { big: categoryLabel(a.data.category), sub: '', logo: undefined };
}

// 企業ロゴ。public/logos/<銘柄コード>.svg|webp|png|jpg を置くとカードに表示する（大文字・小文字は問わない）
const LOGO_DIR = path.resolve('public/logos');
const logoFiles = fs.existsSync(LOGO_DIR) ? fs.readdirSync(LOGO_DIR) : [];
export function logoOf(code: string): string | undefined {
  for (const ext of ['svg', 'webp', 'png', 'jpg', 'jpeg']) {
    const f = logoFiles.find((n) => n.toLowerCase() === `${code.toLowerCase()}.${ext}`);
    if (f) return `/logos/${f}`;
  }
}

// 記事のアイキャッチ画像。public/covers/<スラッグ>.webp|jpg|png を置くと記事の冒頭に表示し、
// X などのシェア画像（og:image）にも使う。横 1200 × 縦 630 前後（1.91:1）がシェアカードにちょうど収まる
const COVER_DIR = path.resolve('public/covers');
const coverFiles = fs.existsSync(COVER_DIR) ? fs.readdirSync(COVER_DIR) : [];
export function coverOf(slug: string): { src: string; width?: number; height?: number } | undefined {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    const f = coverFiles.find((n) => n.toLowerCase() === `${slug.toLowerCase()}.${ext}`);
    if (f) return { src: `/covers/${f}`, ...imageSize(path.join(COVER_DIR, f)) };
  }
}

/** PNG / JPEG / WebP のヘッダーから縦横の大きさを読む（表示前に枠の高さを確保して、読み込み時のガタつきを防ぐ） */
function imageSize(file: string): { width: number; height: number } | undefined {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const n = b.readUInt32LE(21);
      return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      // SOF0〜SOF15（DHT・JPG・DAC を除く）に大きさが入っている
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
}
