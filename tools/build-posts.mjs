// Turns the old Jekyll _posts/*.md into plain HTML pages and a posts.json index.
// Usage: node tools/build-posts.mjs <posts-dir> <site-dir>
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [src, out] = process.argv.slice(2);
mkdirSync(join(out, 'posts'), { recursive: true });

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) => `<a href="${h.replace(/^\/posts\/([^/]+)\/?$/, '$1.html')}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<i>$2</i>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
};

function md(text) {
  const lines = text.split('\n');
  const html = [];
  let para = [], list = null;
  const flush = () => {
    if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`), (para = []);
    if (list) html.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`), (list = null);
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { flush(); html.push(`<h3>${inline(m[2])}</h3>`); continue; }
    if ((m = l.match(/^\s*([-*]|\d+\.)\s+(.*)/))) {
      if (para.length) flush();
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(m[2]);
      continue;
    }
    if (!l.trim()) { flush(); continue; }
    if (list && /^\s+\S/.test(l)) { list.items[list.items.length - 1] += ' ' + l.trim(); continue; }
    if (list) flush();
    para.push(l.trim());
  }
  flush();
  return html.join('\n');
}

const posts = readdirSync(src).filter(f => f.endsWith('.md')).sort().reverse().map(f => {
  const raw = readFileSync(join(src, f), 'utf8');
  const [, front, body] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const get = k => (front.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1]?.replace(/^"|"$/g, '').trim();
  const slug = f.replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.md$/, '').replace(/\s+/g, '-');
  const date = f.slice(0, 10);
  // Two old posts share a title; the filename says what the second one is.
  let title = get('title');
  if (slug === 'Migration-day') title = 'Migration day';
  const words = body.split(/\s+/).filter(Boolean).length;
  return { slug, date, title, words, html: md(body.replace(/^\s*#\s+.*\n/, '')) };
});

const page = p => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} - Filip Biljić</title>
<link rel="stylesheet" href="../site.css">
</head>
<body data-page="post">
<nav><a href="../index.html">Welcome</a> | <a href="../blog.html">Blog</a> | <a href="../cv.html">CV</a> | <a href="../contact.html">Contact</a> | <a href="../photos.html">Photos</a> | <a href="../music.html">Music</a></nav>
<main>
<h1 class="post-title">${esc(p.title)}</h1>
<p class="soft">Written ${p.date}. ${p.words} words, about ${Math.max(1, Math.round(p.words / 230))} minutes.</p>
${p.html}
<p><a href="../blog.html">Back to the list of posts</a></p>
</main>
<footer><div id="trace"><p>Filip Biljić, Paris.</p></div></footer>
<script src="../site.js"></script>
</body>
</html>
`;

for (const p of posts) writeFileSync(join(out, 'posts', `${p.slug}.html`), page(p));
writeFileSync(join(out, 'posts.json'), JSON.stringify(posts.map(({ html, ...p }) => p), null, 1));
console.log(posts.map(p => `${p.date}  ${p.slug}  ${p.words}w`).join('\n'));
