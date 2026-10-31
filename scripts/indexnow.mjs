// Submits every URL in a sitemap to IndexNow (Bing, Yandex, Seznam, Naver...).
// Usage: node scripts/indexnow.mjs dist/sitemap.xml   (run by pages.yml after a deploy to main)
import { readFileSync } from 'node:fs';

const KEY = 'a02c23620b24433ba3470d53547479ec';
const file = process.argv[2] ?? 'dist/sitemap.xml';
const urlList = [...readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) throw new Error(`no <loc> URLs in ${file}`);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: 'creynia.com',
    key: KEY,
    keyLocation: `https://creynia.com/${KEY}.txt`,
    urlList,
  }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs`);
if (!res.ok) {
  console.log(await res.text());
  process.exit(1);
}
