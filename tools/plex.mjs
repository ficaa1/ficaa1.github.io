// Talks to the photo library on plex over ssh. Read only: the one thing it writes there is a mktemp -d
// directory for a resize, removed by the same command. One shared connection is reused for every call.
import { execFileSync } from 'node:child_process';

export const HOST = process.env.PLEX_HOST || 'root@192.168.1.162';
export const PORT = process.env.PLEX_PORT || '69';
export const LIBRARY = process.env.PLEX_PHOTOS || '/mnt/nextcloud/Nextcloud/Photos';

const OPTS = ['-p', PORT, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
  '-o', 'ControlMaster=auto', '-o', `ControlPath=/tmp/fb-plex-%r@%h-%p`, '-o', 'ControlPersist=120'];

// Single-quotes a string for the remote shell.
export const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

// Runs a command on plex and returns its stdout as a Buffer (binary-safe).
export function ssh(command, { maxBuffer = 256 << 20 } = {}) {
  return execFileSync('ssh', [...OPTS, HOST, command], { maxBuffer, stdio: ['ignore', 'pipe', 'inherit'] });
}

export const folderPath = folder => `${LIBRARY}/${folder}`;

// File names in one library folder, unsorted.
export const list = folder => ssh(`ls -1 -- ${q(folderPath(folder))}`).toString('utf8').split('\n').filter(Boolean);

// The first bytes of a file; Exif sits in the first ~256 KB of both JPEG and JPEG XL exports.
export const head = (folder, file, bytes = 262144) => ssh(`head -c ${bytes} -- ${q(`${folderPath(folder)}/${file}`)}`);

// A JPEG scaled to `width` on plex with ffmpeg (niced, in a temp dir), streamed back.
export function resizedJpeg(folder, file, width = 2000) {
  const src = q(`${folderPath(folder)}/${file}`);
  return ssh(`t=$(mktemp -d) && trap 'rm -rf "$t"' EXIT && nice -n 19 ffmpeg -nostdin -loglevel error -i ${src} ` +
    `-vf "scale='min(${width},iw)':-2:flags=lanczos" -q:v 2 -frames:v 1 "$t/out.jpg" && cat "$t/out.jpg"`);
}

// The whole file. Used for JPEG XL originals, which nothing on plex can decode.
export const whole = (folder, file) => ssh(`cat -- ${q(`${folderPath(folder)}/${file}`)}`);
