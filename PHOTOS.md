# Adding a photo dump

Each dump has its own page that you design by hand, at `site/photos/<id>/index.html`, with its own `dump.css` beside it.
Some parts are shared:
- the switcher: `photos.html` lists every dump, and each page has tabs and a "next" stub;
- the nav, the player, the footer, the viewer and the day grid.

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

## Private picker

```sh
nice -n 19 ionice -c3 node tools/thumbs.mjs             # make missing thumbnails; resume with the same command
nice -n 19 ionice -c3 node tools/thumbs.mjs --page      # rebuild the picker without reading plex
```

Open https://hermes.tail92948.ts.net:10443/picker/. The page and thumbnail links stay local and are gitignored; do not publish them. Click frames, then copy their full plex paths. Selection stays in this browser. Filter by path; the corner button opens the 800 px thumbnail.

Thumbnails and `metadata.json` live in `photos-src-local/thumbs/`. Metadata reads at most 256 KB per frame. TIFFs are left out: they are Dehancer intermediates, not finished photos. JXL files keep filename tiles.

Only one run can hold the local lock. Plex reads are limited to 10 MiB/s with `pv` when available, or a sleep after each file to keep the average at or below that rate. Header reads count too. The run checks plex load before every file and waits 60 seconds while load is above 3. ffmpeg runs on plex with one thread and low priority; nothing is written there. The log counts source bytes from completed file reads, plus headers, over elapsed time including waits. A thumbnail is installed only after the stream finishes. No thumbnails or originals are decoded here.

For a background run, from the repo root:

```sh
setsid nohup nice -n 19 ionice -c3 node tools/thumbs.mjs --page-every=25 >photos-src-local/thumbs.log 2>&1 </dev/null &
```

Stop the whole run, including its active SSH command:

```sh
kill -TERM -- -$(ps -o pgid= -p "$(cat photos-src-local/thumbs/run.pid)" | tr -d ' ')
```

Resume with the background command above. The page rebuilds every 25 processed files and at the end; reload it to see new thumbnails. `--limit=10` processes at most ten uncached files for a short check.

## 1. Register the dump and read its contact sheet

Add an entry to `site/photos.json`. Use only these fields; the build fills in the rest:

```json
{ "id": "montenegro-2024", "title": "Montenegro", "folder": "Crna Gora 2024", "note": "One or two plain sentences.", "photos": [] }
```

If the folder also holds a roll from another trip, name its export in `"except"` and it is left off this dump's sheet. For example, `"except": ["CG Konoba"]` on rome-2025. A loose file that isn't a frame, such as a panorama cut into tiles for Instagram, goes in `"except"` by its file name: `"except": ["row-1-column-1.png"]`.

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

A frame filed in another dump's folder names that folder itself, and is fetched from there:

```json
{ "file": "cg-konoba-1-2", "original": "CG Konoba (1 of 3)-2.jxl", "folder": "Rim edited 2025", "caption": "", "alt": "…" }
```

To take a frame off the pages, delete it from `photos`, take its marker off the page (a country's pages too) and rebuild. Its copies stay on R2, so also delete its local copies in `site/photos/<id>/` before the dump's next `--upload`, which copies the whole folder.

## 3. Fetch, convert and fill

```sh
nice -n 19 ionice -c3 node tools/photos.mjs montenegro-2024 --fetch
```

This command does four things:
1. It copies each missing original into `photos-src-local/<id>/`, which is gitignored. A JPEG is scaled to 2000 px on plex with niced ffmpeg, in a `mktemp -d` folder that is removed afterwards.
2. It reads the camera settings from the original's first 256 KB.
3. It writes the web copies to `site/photos/<id>/`: `<file>-1000.jpg/.jxl`, `<file>-2000.jpg/.jxl` and `<file>-400.jpg`. Their sizes are saved in `photos.json` under `"web"`. The copies are gitignored.
   A JPEG XL original is decoded with libjxl's `djxl` when it is installed (`DJXL`, or `~/.local/opt/libjxl/usr/bin/djxl`). It reads every colour encoding and tone maps Lightroom's HDR exports to an ordinary screen; without it, the wasm decoder leaves those exports nearly black.
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
| `picture:<file>` | a bare picture that opens the viewer. Options: `sizes=60vw`, `link=no`, `lazy=no`; a value with spaces goes in quotes, `sizes="(min-width: 900px) 50vw, 100vw"` |
| `days` | one tile per day the dump was shot, one mark per frame |
| `day:YYYY-MM-DD` | the tile for a single day |
| `places` | (country and place pages) the country's places, each with its years |

Options go before `:start`, for example `<!-- print:dsc09415 lazy=no:start -->`.

Anything with `data-view`, or any `.print`, opens the viewer.

Every dump also gets the day grid. Group the frames by day (or by stop, if a dump is one day) and mark it up:
- each day's container gets an `id`, `data-sheet="Tuesday 20 August"` and a short `data-sheet-tab="20"`;
- every date on the page (the day heading, a list of days near the top, a big numeral) gets
  `data-sheet-open="<that container's id>"`, on a real link to the day so it still works without script.

Clicking a date opens that day's pictures as a large grid, uncropped, rows of mixed widths. A picture opens the
viewer; Esc goes back to the grid, Esc again back to the page where you were. Style the openers in the dump's own
type; the grid itself is shared and has no per-dump styling.

## Countries and places

Some dumps are shelved under a country, whose pages gather the frames of every year. `site/places.json` lists them:

```json
{ "id": "montenegro", "title": "Montenegro", "dumps": ["montenegro-2024", "montenegro-2025"] },
{ "id": "montenegro/budva", "title": "Budva", "in": "montenegro" }
```

- A country page is `site/photos/<country>/index.html`; a place page is `site/photos/<country>/<place>/index.html`.
- In the switcher and in `photos.html`, the country stands in for its dumps.
- Both are made by hand like a dump's page. A picture on them names its dump: `<!-- picture:montenegro-2025/dsc06009:start -->`. A frame's link and its label in the viewer go to the deepest page that shows it.
- The `places` marker lists the country's places. Order them in `places.json` as they should appear.
- Scope their CSS to `main[data-country="<country>"]`, in one stylesheet beside the country page.

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

Run this build without an id, so every page and `photos.html` point to R2.

The live site is `main`. On every push to `main`, `.github/workflows/pages.yml` runs the same build with `PHOTOS_DONE=1`, which leaves the dumps without a page out of the switcher and the archive box, and publishes `site/`. To see that build before merging, export the commit and build it there: `git archive redesign | tar -x -C <empty dir>`, then in that dir `PHOTOS_BASE=https://photos.filipbiljic.com PHOTOS_DONE=1 node tools/photos.mjs` and serve its `site/`. To preview with your local copies again, rebuild without `PHOTOS_BASE`, but don't commit that build.

Add specific paths only; never `git add -A`. Don't commit:
- `photos-src`;
- `photos-src-local/`;
- `node_modules`;
- the picture copies, which are gitignored.
