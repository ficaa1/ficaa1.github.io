# filipbiljic.com

Plain HTML, one stylesheet, one script. No build step for the site itself.

- `site/` is the whole website. Serve it as it is: `python3 tools/serve.py 8767 site`.
- `_posts/` holds the blog posts in Markdown. After editing one, regenerate the post pages and `site/posts.json`:
  `node tools/build-posts.mjs _posts site`
- `site/music.json` and `site/photos.json` are the curated lists the Music and Photos pages and the player read. Adding a photo dump, and where its pictures live (R2, photos.filipbiljic.com), is in `PHOTOS.md`.
- After changing page titles, descriptions, `site.css` or `site.js`, run `node tools/page-meta.mjs` to refresh sharing tags, navigation and asset versions. The post, song and photo generators also do this for the pages they write.

The old Jekyll (Chirpy) site lives on `main`.
