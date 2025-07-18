---
layout: post
title: "Homelab Series Part 3: The Brains - Automated Tiered Storage with Bash and APIs"
date: 2025-07-17 13:28:21 +0200
categories: homelab docker automation scripting
---

In the [previous post](/posts/homelab-arr-stack), we set up a media
acquisition engine that downloads files to a fast NVMe drive. The problem? Fast
storage is expensive and limited. This is where the real fun begins: building a
system to automatically move older content to a larger, slower storage pool
without breaking our media library.

A simple `mv` command won't work here. Sonarr and Radarr need to know that the
files have moved, otherwise they'll lose track of the media. The solution is to
use their APIs to orchestrate the move.

### The Goal: A Self-Managing Cache

I wanted a script that would:

1.  Check the free space on my NVMe drive.
2.  If free space is below a certain threshold (e.g., 200GB), proceed.
3.  Use the Radarr and Sonarr APIs to identify all media still living on the NVMe
    drive.
4.  Instruct the APIs to move that media to the long-term HDD storage path.
5.  Run this automatically on a schedule.

### The Implementation: A Cron Job and a Bash Script

I created a simple bash script to handle the logic and a cron job to run it a
few times a week.

**The Cron Job:**
This runs the script at 4:00 AM every Monday, Wednesday, and Friday.

```bash
# /etc/cron.d/media-manager
0 4 * * 1,3,5 ficaa1 bash /home/ficaa1/arr-storage-manager.sh >> /var/log/user-scripts/storage-manager.log
```

**The Script (`arr-storage-manager.sh`):**
This script uses `curl` to talk to the APIs and `jq` to parse the JSON
responses.

```bash
#!/bin/bash

# --- Configuration ---
# Host path for the fast SSD
SSD_MOUNT="/mnt/nvme"
# Trigger move when SSD has less than this much free space
MIN_FREE="200G"

# --- Container Paths (as seen by Sonarr/Radarr) ---
MOVIES_SSD_PATH="/nvme/Movies"
TV_SSD_PATH="/nvme/Shows"
MOVIES_HDD_PATH="/data/MOVIES"
TV_HDD_PATH="/data/TV SHOWS"

# --- API Configuration ---
RADARR_URL="http://192.168.1.1:7878"
RADARR_KEY="YOUR_RADARR_API_KEY"
SONARR_URL="http://192.168.1.1:8989"
SONARR_KEY="YOUR_SONARR_API_KEY"

echo "--- Starting Storage Management on $(date) ---"

# Get SSD free space in gigabytes
ssd_free_gb=$(df -BG "$SSD_MOUNT" | awk 'NR==2 {print $4}' | sed 's/G//')
if [ -z "$ssd_free_gb" ]; then
  echo "Error: Could not determine free space on $SSD_MOUNT."
  exit 1
fi

# Only proceed if we are below the free space threshold
min_free_gb=${MIN_FREE/G}
if [ "$ssd_free_gb" -ge "$min_free_gb" ]; then
  echo "OK: SSD has ${ssd_free_gb}G free, which is above the ${MIN_FREE} threshold."
  exit 0
fi

echo "WARNING: SSD free space is ${ssd_free_gb}G, below threshold of ${MIN_FREE}. Initiating move."

# --- Function to move content via API ---
# Arguments: $1:service_name, $2:ssd_path, $3:hdd_path, $4:api_url, $5:api_key
move_content() {
  local service=$1
  local ssd_path=$2
  local hdd_path=$3
  local api_url=$4
  local api_key=$5
  local api_endpoint_name=$6 # "movie" or "series"

  echo "Processing $service..."

  # Get a comma-separated list of IDs for all media in the SSD path
  ids=$(
    curl -s "$api_url/api/v3/$api_endpoint_name" -H "X-Api-Key: $api_key" |
      jq -r --arg path "$ssd_path" '[.[] | select(.rootFolderPath == $path) | .id] | join(",")'
  )

  if [ -z "$ids" ]; then
    echo "No $service content found on SSD path ($ssd_path)."
    return
  fi

  echo "Found $service on SSD. Preparing to move IDs: $ids"

  # Construct the JSON payload for the editor endpoint
  payload=$(
    cat <<EOF
{
  "${api_endpoint_name}Ids": [$ids],
  "rootFolderPath": "$hdd_path",
  "moveFiles": true
}
EOF
  )

  # Call the API to move the files
  curl -X PUT "$api_url/api/v3/${api_endpoint_name}/editor" \
    -H "X-Api-Key: $api_key" \
    -H "Content-Type: application/json" \
    -d "$payload"

  echo -e "\n$service move command sent."
}

# Move movies with Radarr
move_content "Radarr Movies" "$MOVIES_SSD_PATH" "$MOVIES_HDD_PATH" "$RADARR_URL" "$RADARR_KEY" "movie"

# Move TV shows with Sonarr
move_content "Sonarr TV Shows" "$TV_SSD_PATH" "$TV_HDD_PATH" "$SONARR_URL" "$SONARR_KEY" "series"

echo "--- Storage management completed ---"
```

### What's Next?

We now have a fully automated, self-managing system for acquiring and storing
media. The final piece of the puzzle is making it accessible and enjoyable to
watch. In the final part of this series, we'll set up Plex with NVIDIA GPU
hardware transcoding to serve our library beautifully to any device.
