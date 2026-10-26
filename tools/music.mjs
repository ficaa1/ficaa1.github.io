// Normalize music.json media URLs for publishing, or MUSIC_BASE=music for local preview, then write music.html, the
// banners for the songs' links and every song's own page (site/songs/<slug>.html).
// Local copies under site/music/ are optional and ignored by git.
//   node tools/music.mjs              everything; banners are only drawn again for songs whose banner would change
//   node tools/music.mjs --no-cards   skip the banners (no browser, no upload); pages keep the banners they had
import { readFileSync, writeFileSync } from 'node:fs';
import { slugOf } from './songs.mjs';

const manifest = new URL('../site/music.json', import.meta.url);
const base = (process.env.MUSIC_BASE || 'https://photos.filipbiljic.com/music').replace(/\/*$/, '/');
const songs = JSON.parse(readFileSync(manifest, 'utf8'));
for (const song of songs) {
  for (const key of ['src', 'cover', 'coverFull', 'thumb']) {
    if (!song[key]) continue;
    const path = new URL(song[key], 'https://local.invalid/').pathname;
    if (!path.startsWith('/music/')) throw new Error(`Unexpected music path: ${song[key]}`);
    song[key] = base + path.slice('/music/'.length);
  }
}
// Each song's page address, given once from its title and kept, so a renamed song keeps its links. No two alike.
const taken = new Set(songs.map(s => s.slug).filter(Boolean));
if (taken.size !== songs.filter(s => s.slug).length) throw new Error('Two songs in music.json have the same slug.');
for (const song of songs) {
  if (song.slug) continue;
  let slug = slugOf(song.title);
  for (let k = 2; taken.has(slug); k++) slug = `${slugOf(song.title)}-${k}`;
  taken.add((song.slug = slug));
}
// One song to a line, as Filip wrote it.
writeFileSync(manifest, `[\n${songs.map(s => `  ${JSON.stringify(s)}`).join(',\n')}\n]\n`);

// The music page is built from the same list.
await import('./music-page.mjs');
// The banners need a browser and upload to R2. A failure there leaves the pages with the banners they had.
if (!process.argv.includes('--no-cards')) {
  try { await (await import('./song-cards.mjs')).cards(); } catch (e) { console.error(`song cards: ${e.message}`); }
}
await import('./song-pages.mjs');
