---
layout: post
title: "Homelab Series Part 4: The Plex Experience with Hardware Transcoding"
date: 2025-07-18 13:28:21 +0200
categories: homelab docker plex
---

We've built a [secure network](/posts/homelab-vpn-gateway), an
[automated acquisition engine](/posts/homelab-arr-stack), and a
[smart tiered storage system](/posts/homelab-tiered-storage). Now it's
time for the grand finale: setting up the user-facing service that brings it all
together. For this, I use Plex Media Server.

My goal for Plex was to have a setup that could handle multiple streams,
including 4K content, without putting a heavy load on my server's CPU. This is
where hardware-accelerated transcoding comes in.

### The Hardware and The "Why"

My server is an old PC I had with a 4th gen intel cpu and a cheap GTX 1050Ti.
The key component is the NVIDIA GPU. By passing this GPU through
to the Plex Docker container, Plex can use the dedicated encoding/decoding chips
on the GPU (NVENC/NVDEC) to transcode video streams. This is vastly more
efficient than using the CPU and is essential for a smooth multi-user
experience.

### The Implementation: Plex in Docker

Here is the `docker-compose.yml` for my Plex instance. It's surprisingly simple,
but a few key lines make all the difference.

```yaml
version: "3.9"
services:
  plex:
    container_name: plex
    image: plexinc/pms-docker:latest
    restart: unless-stopped
    # Host networking is simplest for Plex's discovery protocols
    network_mode: host
    # --- GPU Passthrough Configuration ---
    runtime: nvidia
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - NVIDIA_DRIVER_CAPABILITIES=all
      # --- General Configuration ---
      - TZ=Europe/Paris
      # Get your claim token from https://www.plex.tv/claim
      - PLEX_CLAIM=CLAIM_TOKEN_HERE
      # Allow local networks to access without authentication
      - ALLOWED_NETWORKS=192.168.1.0/24,192.168.0.0/24,192.168.20.0/24,192.168.30.0/24
    volumes:
      # Path for Plex's database and metadata
      - /plex/config:/config
      # Path for temporary transcode files
      - /plex/transcode:/transcode
      # The two media locations we set up in previous posts
      - /mnt/share:/media # HDD (long-term)
      - /mnt/nvme:/nvme   # NVMe (short-term)
```

### Key Concepts

*   **`network_mode: host`**: This gives the Plex container direct access to the
    host's network interfaces. It's the easiest way to ensure that Plex's automatic
    discovery features (like GDM) work correctly on the local network.
*   **`runtime: nvidia`**: This tells Docker to use the NVIDIA container runtime,
    which is necessary for exposing the GPU to the container.
*   **`volumes`**: We mount both our fast `/mnt/nvme` and slow `/mnt/share`
    storage into the container. Inside Plex, I simply add both `/nvme` and
    `/media` to my media library, and Plex scans them both to present a single,
    unified view.
*   **`PLEX_CLAIM`**: This is a one-time token used on the first run to securely
    claim the server and attach it to your Plex account.

### Conclusion of the Series

And there you have it! A complete, end-to-end automated media server. From a
secure VPN gateway to an intelligent, self-managing storage system, and finally,
a powerful Plex server to deliver the content. This project has been a good
learning experience, touching on networking, scripting, API integration, and
hardware management—all within the Docker ecosystem.

Thanks for following along! I hope this series has been informative and perhaps
inspired you to start or enhance your own homelab projects.
