# Adding a photo dump

Each dump has its own page that you design by hand, at `site/photos/<id>/index.html`, with its own `dump.css` beside it.
Some parts are shared:
- the switcher: `photos.html` lists every dump, and each page has tabs and a "next" stub;
- the nav, the player, the footer and the viewer.

The build never rewrites a dump page. It only fills the markers the page contains.

Run every command from the repo root. Run picture work niced, one dump at a time: this machine has 8 GB of RAM.

## 0. What you need

- **The plex folder** holding the exported frames, under `/mnt/nextcloud/Nextcloud/Photos/`, for example `Crna Gora 2024`.
- **The frames to print**: their file names in that folder. JPEG works best, because plex resizes it before sending it back. A JPEG XL file comes over whole and is decoded here, which takes about 1 GB of RAM per 7000 px frame.
- **For each frame:**
  - a caption, saying only what is visible;
  - alt text;
  - a short file id such as `dsc09415`.
- **Optional:** a mood or a direction for the page.

To get one, run `node <skill>/scripts/draw.mjs`, as described in the design-taste-frontend skill.

**Finding the edited photos.** The library's folders don't separate edits from camera files, but each file records what wrote it: Lightroom exports say `Adobe Photoshop Lightroom…` and camera files say `ILCE-…`. `tools/edited.mjs` reads that field:

```sh
node tools/edited.mjs --scan          # read the whole library (read only, niced, about 10 minutes); repeat after exporting more
node tools/edited.mjs                 # the edited photos, grouped by folder or shoot, with counts
node tools/edited.mjs normandie       # the full plex paths of the edited files matching every word given
```

The scan is saved in `photos-src-local/edited.tsv`, which is gitignored. Edited exports can sit loose at the top of the library or among camera files under `Sony Raw/` and `2025/`, so search by name rather than trusting the folders.

## 1. Register the dump and read its contact sheet

Add an entry to `site/photos.json`. Use only these fields; the build fills in the rest:

```json
{ "id": "montenegro-2024", "title": "Montenegro", "folder": "Crna Gora 2024", "note": "One or two plain sentences.", "photos": [] }
```

Then read the folder on plex. This is read only. It reads the rolls, the frame labels and each frame's time, and writes `rolls`, `frames`, `from` and `to`:

```sh
node tools/library.mjs montenegro-2024
```

Run it again whenever more frames are exported. Only the new frames are read.

## 2. Choose the printed frames

Add the chosen frames to the dump's `photos` list in `site/photos.json`:

```json
{ "file": "dsc09415", "original": "DSC09415-Edit.jpg", "caption": "A pebble beach in a small cove as the sun goes down.", "alt": "…", "provisional": true }
```

Remove `"provisional"` once Filip has signed off on the frame.

## 3. Fetch, convert and fill

```sh
nice -n 19 ionice -c3 node tools/photos.mjs montenegro-2024 --fetch
```

This command does four things:
1. It copies each missing original into `photos-src-local/<id>/`, which is gitignored. A JPEG is scaled to 2000 px on plex with niced ffmpeg, in a `mktemp -d` folder that is removed afterwards.
2. It reads the camera settings from the original's first 256 KB.
3. It writes the web copies to `site/photos/<id>/`: `<file>-1000.jpg/.jxl`, `<file>-2000.jpg/.jxl` and `<file>-400.jpg`. Their sizes are saved in `photos.json` under `"web"`. The copies are gitignored.
4. It fills the markers on the page and refreshes the switcher.

## 4. Start the page

Run one of these, once per dump:

```sh
node tools/photos.mjs montenegro-2024 --new          # from the kit: contact sheet, interlock note, full-screen prints
node tools/photos.mjs montenegro-2024 --new=blank    # nearly empty: tabs, a title, the prints, the stub
```

This writes `site/photos/<id>/index.html` and `dump.css`. From then on the page is yours, so edit it by hand.

**Scoping rules for `dump.css`:**
- It is linked inside `<main>`, so it arrives and leaves with the page when the site swaps pages in place.
- Scope every rule to `main[data-dump="<id>"] …`.
- To change page colours, the nav, the player or the footer, use `body:has(main[data-dump="<id>"]) …`.
- Set the house variables there: `--bg --surface --ink --soft --paper --paper-ink --film --mark`.

`site/photos/montenegro-2024/` is a page built from scratch, and `site/photos/istanbul-2025/` is built from the kit.

**Markers.** A marker is `<!-- name:start --><!-- name:end -->`. The build fills it on every run, so keep your own markup outside markers.

| Marker | Fills in |
|---|---|
| `meta` (in `<head>`) | the title, the description and the share image |
| `tabs`, `next` | the switcher; every page should have both |
| `stamp` | the small picture on the footer |
| `sheet` | the paper contact sheet; `rolls` gives only the film strips |
| `prints` | every printed frame as a full-screen print |
| `print:<file>` | one print, with its caption and camera settings |
| `picture:<file>` | a bare picture that opens the viewer. Options: `sizes=60vw`, `link=no`, `lazy=no` |
| `days` | one tile per day the dump was shot, one mark per frame |
| `day:YYYY-MM-DD` | the tile for a single day |

Options go before `:start`, for example `<!-- print:dsc09415 lazy=no:start -->`.

Anything with `data-view`, or any `.print`, opens the viewer.

## 5. Check

```sh
node tools/photos.mjs montenegro-2024
python3 tools/serve.py 8790 site     # or just use the running preview on 8766
```

Open `http://127.0.0.1:8790/photos/montenegro-2024/` and check the page:
- with JavaScript off;
- on a phone width;
- after clicking between tabs, which swap pages in place;
- with the back button;
- by opening a picture.

Then run the gate:

```sh
S=~/.claude-proxy/skills/design-taste-frontend/scripts
node $S/lint.mjs site/photos/montenegro-2024
node $S/inspect.mjs http://127.0.0.1:8790/photos/montenegro-2024/ --widths 1440,390
```

Stop the server when you are done.

## 6. Upload the pictures to R2

The pictures are served from the R2 bucket `filipbiljic-photos`. Its public address is **https://photos.filipbiljic.com/**, and its objects are named `<id>/<file>-<width>.<ext>`, the same layout as `site/photos/`.

```sh
node tools/photos.mjs montenegro-2024 --upload
```

This command:
- copies only that dump's `.jpg` files, then its `.jxl` files, with the rclone remote `r2:`;
- sends `Cache-Control: public, max-age=31536000, immutable` and the right `Content-Type`, including `image/jxl`;
- never deletes anything;
- fetches one `.jxl` and one `.jpg` back twice and prints their status, type, cache header and Cloudflare cache status. Expect `200`, `image/jxl` or `image/jpeg`, the cache header, and `HIT` on the second fetch. Check by hand with a GET (`curl -s -o /dev/null -D - <url>`), not `curl -I`: Cloudflare reports HEAD requests as `DYNAMIC` even when the file is cached.

Because uploads are cached as immutable, a changed picture needs a new file id; don't overwrite an existing one.

## 7. Build the published pages and commit

The pages that get committed load their pictures from R2:

```sh
PHOTOS_BASE=https://photos.filipbiljic.com node tools/photos.mjs
grep -c 'photos.filipbiljic.com/montenegro-2024/' site/photos/montenegro-2024/index.html   # should not be 0
git add site/photos.json site/photos.html site/photos/*/index.html site/photos/*/dump.css
git commit -m "Photos: add the Montenegro 2024 dump"
```

Run this build without an id, so every page and `photos.html` point to R2. To preview with your local copies again, rebuild without `PHOTOS_BASE`, but don't commit that build.

Add specific paths only; never `git add -A`. Don't commit:
- `photos-src`;
- `photos-src-local/`;
- `node_modules`;
- the picture copies, which are gitignored.
