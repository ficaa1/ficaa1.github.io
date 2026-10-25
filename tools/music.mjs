// Normalize music.json media URLs for publishing, or MUSIC_BASE=music for local preview, then write music.html.
// Local copies under site/music/ are optional and ignored by git.
import { readFileSync, writeFileSync } from 'node:fs';

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
// One song to a line, as Filip wrote it.
writeFileSync(manifest, `[\n${songs.map(s => `  ${JSON.stringify(s)}`).join(',\n')}\n]\n`);

// The music page is built from the same list.
await import('./music-page.mjs');
