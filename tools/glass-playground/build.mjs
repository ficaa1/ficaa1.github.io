// Private preview only. Rebuild after editing the renderer or the playground.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const source = new URL('./', import.meta.url);
const site = new URL('../../site/', source);
const hash = url => createHash('sha1').update(readFileSync(url)).digest('hex').slice(0, 8);
const versions = {
  __GLASS_VERSION__: hash(new URL('photos/glass.js', site)),
  __LANDS_VERSION__: hash(new URL('photos/lands.css', site)),
  __UI_VERSION__: hash(new URL('playground.js', source)) + hash(new URL('playground.css', source)),
};
mkdirSync(new URL('picker/', site), { recursive: true });
for (const [from, to] of [['index.html', 'glass.html'], ['playground.css', 'glass-playground.css'], ['playground.js', 'glass-playground.js']]) {
  let text = readFileSync(new URL(from, source), 'utf8');
  for (const [key, value] of Object.entries(versions)) text = text.replaceAll(key, value);
  writeFileSync(new URL('picker/' + to, site), text);
}
console.log('Private glass playground: ' + fileURLToPath(new URL('picker/glass.html', site)));
