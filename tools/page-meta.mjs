// Static share tags and navigation, also used by the content generators.
// Refresh tracked pages: node tools/page-meta.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const origin = 'https://www.filipbiljic.com/';
const photo = 'https://photos.filipbiljic.com/istanbul-2025/istanbul-2025-22-1000.jpg';
const photoAlt = 'A street food cart with a red awning on wet paving, a mosque and two minarets in scaffolding behind';
const versions = Object.fromEntries(['site.css', 'site.js'].map(name =>
  [name, createHash('sha1').update(readFileSync(new URL(`../site/${name}`, import.meta.url))).digest('hex').slice(0, 8)]));
const descriptions = {
  'blog.html': 'Notes from my homelab and my day job',
  'cv.html': 'Filip Biljić, cloud DevOps engineer in Paris. Experience, education and certification.',
  'projects.html': 'micko, homelab-inventory and PhotoCull. Projects by Filip Biljić.',
  'photos.html': 'Photos by Filip Biljić: Istanbul, France, Ljubljana, Belgrade, Montenegro, Italy and Amsterdam.',
  'music.html': 'Some of the songs im least embarassed to share',
  'contact.html': 'Write to Filip Biljić',
};
const decode = s => s.replace(/&(?:amp|quot|#39|apos|lt|gt);/g, c => ({ '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' })[c]);
const plain = s => decode(s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function completePage(source, path) {
  path = path.replaceAll('\\', '/');
  let html = source.replace(/\n?<!-- page-meta:start -->[\s\S]*?<!-- page-meta:end -->\n?/g, '\n');
  const head = html.match(/<head>[\s\S]*?<\/head>/)?.[0] || '';
  const tags = [...head.matchAll(/<(?:meta|link)\b[^>]*>/g)].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, decode(v)])));
  const get = key => tags.find(t => t.name === key || t.property === key)?.content;
  const title = plain(head.match(/<title>([\s\S]*?)<\/title>/)?.[1] || 'Filip Biljić');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
  const first = [...main.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)].find(([, attrs]) => !/class="[^"]*(?:soft|facts|meta)/.test(attrs));
  const excerpt = first ? plain(first[2]) : title;
  const description = get('description') || descriptions[path] || (excerpt.length > 180 ? excerpt.slice(0, 177).replace(/\s+\S*$/, '') + '…' : excerpt);
  const url = new URL(path.replace(/index\.html$/, ''), origin).href;
  const additions = [];
  const meta = (key, value) => {
    if (!get(key)) additions.push(`<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${esc(value)}">`);
  };
  meta('description', description);
  meta('og:title', title);
  meta('og:description', description);
  meta('og:type', path.startsWith('posts/') ? 'article' : 'website');
  meta('og:url', url);
  meta('og:site_name', 'Filip Biljić');
  if (!get('og:image')) {
    meta('og:image', photo);
    meta('og:image:width', '1000');
    meta('og:image:height', '667');
  }
  meta('og:image:alt', get('og:image') ? title : photoAlt);
  meta('twitter:card', 'summary_large_image');
  meta('twitter:title', get('og:title') || title);
  meta('twitter:description', get('og:description') || description);
  meta('twitter:image', get('og:image') || photo);
  meta('twitter:image:alt', get('og:image:alt') || (get('og:image') ? title : photoAlt));
  if (!tags.some(t => t.rel === 'canonical')) additions.push(`<link rel="canonical" href="${url}">`);
  if (!tags.some(t => t.rel === 'icon')) additions.push('<link rel="icon" href="/favicon.ico" sizes="any">');
  if (!tags.some(t => t.rel === 'apple-touch-icon')) additions.push('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
  if (additions.length) html = html.replace(/\s*<\/head>/, `\n<!-- page-meta:start -->\n${additions.join('\n')}\n<!-- page-meta:end -->\n</head>`);
  return html.replace(/<nav(?:\s[^>]*)?>([\s\S]*?)<\/nav>/, (_, links) =>
    `<nav aria-label="Main">${links.replace(/\s*\|\s*/g, '').replace(/<b>/g, '<b aria-current="page">')}</nav>`)
    .replace(/((?:href|src)="(?:\.\.\/)*)(site\.(?:css|js))(?:\?[^"\s]*)?"/g, (_, prefix, name) => `${prefix}${name}?v=${versions[name]}"`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = execFileSync('git', ['ls-files', 'site/*.html'], { encoding: 'utf8' }).trim().split('\n');
  let count = 0;
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    if (!/src="(?:\.\.\/)*site\.js(?:\?[^"\s]*)?"/.test(html)) continue;
    const result = completePage(html, file.slice(5));
    if (result !== html) { writeFileSync(file, result); count++; }
  }
  console.log(`Updated metadata and navigation on ${count} pages`);
}
