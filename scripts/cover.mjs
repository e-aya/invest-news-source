// 記事のアイキャッチ画像を、表示に十分な大きさ（横1200px）の WebP に縮めて public/covers/<スラッグ>.webp に保存する。
//   npm run cover -- <元の画像> <スラッグ>
//   npm run cover -- <元の画像> <スラッグ> --quality 85   … 画質を変える（既定 80。数字が大きいほど高画質・大きいファイル）
// 同じ記事の古いアイキャッチ（.png / .jpg など）は削除する（残っていても WebP が優先されるが、容量の無駄になるため）
import fs from 'node:fs';
import path from 'node:path';

const WIDTH = 1200;
const args = process.argv.slice(2);
const qi = args.indexOf('--quality');
const quality = qi >= 0 ? Number(args.splice(qi, 2)[1]) : 80;
const [input, slug] = args;

if (!input || !slug) {
  console.error('使い方: npm run cover -- <元の画像> <スラッグ>\n  例: npm run cover -- C:\\Users\\me\\Downloads\\cpi.png sp500-record-vs-10y-5-24-cpi-yen-chain');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error(`✗ 画像が見つかりません: ${input}`);
  process.exit(1);
}
if (!fs.existsSync(path.join('src/content/articles', slug, 'meta.json'))) {
  console.error(`✗ 記事が見つかりません: src/content/articles/${slug}/（スラッグの綴りを確認してください）`);
  process.exit(1);
}
if (!(quality >= 1 && quality <= 100)) {
  console.error('✗ --quality は 1〜100 で指定してください');
  process.exit(1);
}

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('✗ 画像処理ライブラリ（sharp）が入っていません。npm install sharp を実行してから、もう一度試してください');
  process.exit(1);
}

const dir = 'public/covers';
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${slug}.webp`);
const tmp = `${out}.tmp`;
const info = await sharp(input)
  .rotate() // スマホ写真の向き情報を反映
  .resize({ width: WIDTH, withoutEnlargement: true })
  .webp({ quality })
  .toFile(tmp);
fs.renameSync(tmp, out);

for (const f of fs.readdirSync(dir)) {
  const ext = path.extname(f).toLowerCase();
  if (path.basename(f, path.extname(f)).toLowerCase() === slug.toLowerCase() && ext !== '.webp') {
    fs.unlinkSync(path.join(dir, f));
    console.log(`  古いアイキャッチを削除: ${f}`);
  }
}

const kb = (n) => `${Math.round(n / 1024).toLocaleString()}KB`;
console.log(`✓ ${out}（${info.width}×${info.height}、${kb(fs.statSync(input).size)} → ${kb(info.size)}）`);
if (info.size > 400 * 1024) console.log('  ファイルが大きめです。--quality 70 などで小さくできます');
const ratio = info.width / info.height;
if (ratio < 1.7 || ratio > 2.1) console.log(`  縦横比が ${ratio.toFixed(2)}:1 です。X のカードは 1.91:1（1200×630）なので、上下か左右が切れて表示されることがあります`);
