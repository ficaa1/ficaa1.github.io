---
title: Resizing disk in Proxmox and guest VM
date: 2023-05-16 12:53:00 +200
categories: [homelab, server, proxmox]
tags: [proxmox, ubuntu, resize, lvm, pv]
---

# Resizing disk Proxmox+Ubuntu VM

After resizing disk in Proxmox GUI:

## Inside parted:
```command
root@plex:/mnt/media/docker-volumes/photoprism# parted
GNU Parted 3.4
Using /dev/sda
Welcome to GNU Parted! Type 'help' to view a list of commands.
(parted) print
Warning: Not all of the space available to /dev/sda appears to be used, you can fix the GPT to use all of the space (an extra 41943040 blocks) or continue with the current setting?
Fix/Ignore? Fix
Model: QEMU QEMU HARDDISK (scsi)
Disk /dev/sda: 90.2GB
Sector size (logical/physical): 512B/512B
Partition Table: gpt
Disk Flags:

Number  Start   End     Size    File system  Name  Flags
 1      1049kB  2097kB  1049kB                     bios_grub
 2      2097kB  2150MB  2147MB  ext4
 3      2150MB  68.7GB  66.6GB

(parted) resizepart 3 100%
(parted) print
Model: QEMU QEMU HARDDISK (scsi)
Disk /dev/sda: 90.2GB
Sector size (logical/physical): 512B/512B
Partition Table: gpt
Disk Flags:

Number  Start   End     Size    File system  Name  Flags
 1      1049kB  2097kB  1049kB                     bios_grub
 2      2097kB  2150MB  2147MB  ext4
 3      2150MB  90.2GB  88.0GB

(parted) ^C

Information: You may need to update /etc/fstab.


```

## After parted

Need to resize the Physical Volume and then the Logical Volume needs to extend to the max of the PV.

```command
root@plex:/mnt/media/docker-volumes/photoprism# pvresize /dev/sda3
  Physical volume "/dev/sda3" changed
  1 physical volume(s) resized or updated / 0 physical volume(s) not resized
```

```command
root@plex:/mnt/media/docker-volumes/photoprism# lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
  Size of logical volume ubuntu-vg/ubuntu-lv changed from <62.00 GiB (15871 extents) to <82.00 GiB (20991 extents).
  Logical volume ubuntu-vg/ubuntu-lv successfully resized.
resize2fs 1.46.5 (30-Dec-2021)
Filesystem at /dev/mapper/ubuntu--vg-ubuntu--lv is mounted on /; on-line resizing required
old_desc_blocks = 8, new_desc_blocks = 11
The filesystem on /dev/mapper/ubuntu--vg-ubuntu--lv is now 21494784 (4k) blocks long.
```