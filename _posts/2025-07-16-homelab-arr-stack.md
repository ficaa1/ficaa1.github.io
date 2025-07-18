---
layout: post
title: "Homelab Series Part 2: The 'Arr' Automation Engine"
date: 2025-07-16 13:28:21 +0200
categories: homelab docker automation
---

In [Part 1](/posts/homelab-vpn-gateway.html), we built a secure VPN gateway
to protect our internet-facing services. Now, let's build the engine that will
power our media ecosystem. The goal is to automate the entire process: from
requesting media to finding it, downloading it, and placing it in the right
folder.

This is where the popular "Arr" stack comes in:

*   **Radarr:** Monitors for movies.
*   **Sonarr:** Monitors for TV shows.
*   **Prowlarr:** Manages indexer configurations and syncs them to Radarr/Sonarr.
*   **Overseerr:** A user-friendly web interface for requesting media.

### The Architecture: A Symphony of Services

These services work together beautifully. A request in Overseerr triggers a
search in Radarr or Sonarr. They then query Prowlarr for indexers and, upon
finding a match, send the download job to qBittorrent (which we set up in Part
1).

Here's the `docker-compose.yml` that defines this stack:

```yaml
version: "3"
services:
  radarr:
    container_name: radarr
    image: lscr.io/linuxserver/radarr
    networks:
      - staticnet
    volumes:
      - /opt/arrstack/radarr:/config
      # Shared volume for long-term storage
      - data:/data
      # Shared volume for fast, temporary storage
      - nvme_volume:/nvme
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
    ports:
      - 7878:7878
    restart: always

  sonarr:
    container_name: sonarr
    image: linuxserver/sonarr
    networks:
      - staticnet
    volumes:
      - /opt/arrstack/sonarr:/config
      - data:/data
      - nvme_volume:/nvme
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
    ports:
      - 8989:8989
    restart: always

  overseerr:
    image: sctx/overseerr
    container_name: overseerr
    networks:
      - staticnet
    environment:
      - LOG_LEVEL=debug
      - TZ=Etc/Utc
    ports:
      - 5055:5055
    volumes:
      - /opt/arrstack/overseerr:/app/config
    restart: always

volumes:
  data:
    external: true
    name: data
  nvme_volume:
    external: true
    name: nvme_volume

networks:
  staticnet:
    external: true
    name: staticnet
```

### Key Concepts: Tiered Storage Paths

You'll notice two media-related volumes are mounted into the Sonarr and Radarr
containers: `data` and `nvme_volume`. This is intentional and is the key to my
storage strategy.

*   `/nvme`: This path points to a fast NVMe SSD. All new downloads from
    qBittorrent are placed here for quick unpacking and processing.
*   `/data`: This path points to a larger, slower array of HDDs for long-term
    storage.

Inside Sonarr and Radarr, I configure qBittorrent to download to the `/nvme`
path. Once the download is complete, the 'Arr' app processes it and moves it to
the final library folder, which is also on `/nvme`. But what happens when the
fast drive fills up?

### What's Next?

This setup works, but it requires manual intervention to move older media from
the fast NVMe drive to the slower HDD array to free up space. That's not very
automated! In the next post, I'll share the custom script I wrote to handle this
process automatically, using the Sonarr and Radarr APIs to manage the media
intelligently.
