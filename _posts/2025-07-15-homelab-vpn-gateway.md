---
layout: post
title: "Homelab Series Part 1: Building a Secure VPN Gateway with Docker"
date: 2025-07-15 13:28:21 +0200
categories: homelab docker networking
---

Welcome to the first post in my new series on building a fully automated media
ecosystem in my homelab. Before we can get to the fun stuff like media servers
and request systems, we need to build a solid, secure foundation. For any services
that reach out to the internet, I want to ensure that traffic is routed through a
VPN.

The goal is to create a "VPN gateway" container. Any other containers that need
secure internet access can then simply use this container's network stack,
forcing all their traffic through the VPN tunnel without any complex routing
rules on the host.

### The Architecture: A Dedicated WireGuard Gateway

While there are many popular all-in-one VPN containers, I opted for a more
specific and performant solution for my provider (Private Internet Access):
[`thrnz/docker-wireguard-pia`](https://github.com/thrnz/docker-wireguard-pia).
This container is purpose-built to maintain a stable WireGuard tunnel to PIA. In
my experience, this approach has proven to be more reliable and has yielded
faster connection speeds than other, more generalized solutions.

You'll notice in the `docker-compose.yml` below that I've named the service
`gluetun`. This is just a convenient, descriptive name for the service's role as
a VPN gateway, even though the underlying image is `thrnz/docker-wireguard-pia`.

Here is the `docker-compose.yml` for my downloader stack:

```yaml
version: "3"
services:
  gluetun:
    container_name: gluetun
    # This image is specifically for WireGuard with PIA
    image: thrnz/docker-wireguard-pia
    cap_add:
      - NET_ADMIN
    networks:
      - staticnet
    volumes:
      - pia:/pia
    environment:
      # Replace with your actual PIA credentials
      - USER=YOUR_VPN_USERNAME
      - PASS=YOUR_VPN_PASSWORD
      - LOC=YOUR_VPN_LOCATION
      # This allows local devices to still access the services
      - LOCAL_NETWORK=192.168.1.0/24
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
    ports:
      # Port forward all necessary ports for the services that will use this network
      - 8080:8080 # qBittorrent WebUI
      - 6881:6881 # qBittorrent P2P
      - 6881:6881/udp # qBittorrent P2P
      - 9117:9117 # Prowlarr WebUI
    restart: always

  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest
    container_name: qbittorrent
    # This is the magic line!
    network_mode: "service:gluetun"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
      - WEBUI_PORT=8080
    volumes:
      - /opt/qbittorrent:/config
      - data:/data
      - nvme_volume:/nvme
    restart: always

  prowlarr:
    container_name: prowlarr
    image: ghcr.io/hotio/prowlarr
    # Prowlarr also uses the gluetun network stack
    network_mode: "service:gluetun"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC
    volumes:
      - prowlarr:/config
    restart: always

volumes:
  prowlarr:
  pia:
  nvme_volume:
    external: true
    name: nvme_volume
  data:
    external: true
    name: data

networks:
  staticnet:
    external: true
    name: staticnet
```

### Key Concepts

The most important line in this configuration is `network_mode: "service:gluetun"`. This tells Docker that the `qbittorrent` and `prowlarr` containers should not get their own network interface. Instead, they share the network stack of the `gluetun` service.

This has two major benefits:

1.  **Simplicity:** I don't need to configure anything inside qBittorrent or Prowlarr. They operate as if they're on a normal network, but all their traffic is transparently routed through the gateway's VPN tunnel.
2.  **Security:** If the `gluetun` container fails or the VPN disconnects, the network stack for the dependent services goes down with it. This acts as a kill-switch, preventing any accidental IP leaks.

### What's Next?

With our secure foundation in place, we can now build the services that will use it. In the next post, I'll cover the "arr" stack (Sonarr, Radarr, Overseerr) and how it integrates with our downloaders to create a fully automated media acquisition pipeline.
