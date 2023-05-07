---
title: Building and installing my server
date: 2023-05-06 18:00:00 +200
categories: [homelab, server, proxmox]
tags: [proxmox, nas, truenas]
---


- Couldn't post after setting it up, turns out issue was RAM placement. Switched the places and it finally booted.
- BIOS Config --> Enable virtualization
- Badly flashed the USB I guess, retried in Balena Etcher. Worked after disabling Secure boot :)

## Proxmox installation

Installed on 128gig SSD, IP Address : 192.168.1.160 because DHCP ends at .150

Seems to work splendidly, next step: disable SSH password authentication and setup public key authentication instead

Installed TrueNAS and passed through the two disks.

```console
root@pve:~# lsblk -o +MODEL,SERIAL
NAME                         MAJ:MIN RM   SIZE RO TYPE MOUNTPOINT MODEL                  SERIAL
sda                            8:0    0 111.8G  0 disk            WDC_WDS120G2G0A-00JH30 20451N458612
├─sda1                         8:1    0  1007K  0 part
├─sda2                         8:2    0     1G  0 part /boot/efi
└─sda3                         8:3    0 110.8G  0 part
  ├─pve-swap                 253:0    0     8G  0 lvm  [SWAP]
  ├─pve-root                 253:1    0  37.7G  0 lvm  /
  ├─pve-data_tmeta           253:2    0     1G  0 lvm
  │ └─pve-data-tpool         253:4    0  49.3G  0 lvm
  │   ├─pve-data             253:5    0  49.3G  1 lvm
  │   └─pve-vm--100--disk--0 253:6    0    16G  0 lvm
  └─pve-data_tdata           253:3    0  49.3G  0 lvm
    └─pve-data-tpool         253:4    0  49.3G  0 lvm
      ├─pve-data             253:5    0  49.3G  1 lvm
      └─pve-vm--100--disk--0 253:6    0    16G  0 lvm
sdb                            8:16   0   5.5T  0 disk            WDC_WD60EFPX-68C5ZN0   WD-WX62AC2DDET6
sdc                            8:32   0   5.5T  0 disk            WDC_WD60EFPX-68C5ZN0   WD-WX72AC23P6ST

root@pve:~# ls /dev/disk/by-id/ | grep WD-WX62AC2DDET6
ata-WDC_WD60EFPX-68C5ZN0_WD-WX62AC2DDET6
root@pve:~# ls /dev/disk/by-id/ | grep WD-WX72AC23P6ST
ata-WDC_WD60EFPX-68C5ZN0_WD-WX72AC23P6ST

root@pve:~# qm set 100 -scsi1 /dev/disk/by-id/ata-WDC_WD60EFPX-68C5ZN0_WD-WX62AC2DDET6
update VM 100: -scsi1 /dev/disk/by-id/ata-WDC_WD60EFPX-68C5ZN0_WD-WX62AC2DDET6
root@pve:~# qm set 100 -scsi2 /dev/disk/by-id/ata-WDC_WD60EFPX-68C5ZN0_WD-WX72AC23P6ST
update VM 100: -scsi2 /dev/disk/by-id/ata-WDC_WD60EFPX-68C5ZN0_WD-WX72AC23P6ST

```

Later on turned off all the extra fans because I want to be able to sleep at night :) In order to monitor this in the Proxmox summary tab, I had to edit some proxmox related files. Thanks to this reddit post for the great guide https://www.reddit.com/r/homelab/comments/rhq56e/displaying_cpu_temperature_in_proxmox_summery_in/
``` bash
vim /usr/share/perl5/PVE/API2/Nodes.pm
vim /usr/share/pve-manager/js/pvemanagerlib.js
```
Inside the first file, I added this line at line 407
```
$res->{thermalstate} = `sensors`;
```
Inside the second one, I had to change the padding in order to fit in the new information and then to print it out (my cpu has 6 cores so I had to add display info for the other 2)
```
Ext.define('PVE.node.StatusView', {
    extend: 'Proxmox.panel.StatusView',
    alias: 'widget.pveNodeStatus',

    height: 360,
    bodyPadding: '15 20 15 20',
```
```
        {
            itemId: 'thermal',
            colspan: 2,
            printBar: false,
            title: gettext('CPU Thermal State'),
            textField: 'thermalstate',
            renderer:function(value){
                const c0 = value.match(/Core 0.*?\+([\d\.]+)Â/)[1];
                const c1 = value.match(/Core 1.*?\+([\d\.]+)Â/)[1];
                const c2 = value.match(/Core 2.*?\+([\d\.]+)Â/)[1];
                const c3 = value.match(/Core 3.*?\+([\d\.]+)Â/)[1];
                const c4 = value.match(/Core 4.*?\+([\d\.]+)Â/)[1];
                const c5 = value.match(/Core 5.*?\+([\d\.]+)Â/)[1];
                return `Core 0: ${c0} c | Core 1: ${c1} c | Core 2: ${c2} c | Core 3: ${c3} c | Core 4: ${c4} c | Core 5: ${c5} c`
            }
        }
```

## Storage pool creation

Since I haven't yet received my third drive which I will use in conjuction with another drive to do mirroring (this will be my backup pool and important documents), I will create a pool with only one disk which I'll use to store media for Plex playback.

Obviously I'm getting a bunch of warnings because there is 0 replication of any data with this kind of setup. For now, I do not mind as media isn't something that's completely unrecoverable by other means ;)

I end up this config by adding a dataset which will server as a Samba share.



## Tried setting it up in LXC, but because of IOMMU, iGpu wasn't showing up. 
- Set up ubuntu server with IOMMU and iGPU passthrough. Configured Network through
  
   18  vim /etc/netplan/00-installer-config.yaml
   19  netplan apply
```
network:
  ethernets:
    ens18:
      addresses:
        - 192.168.1.162/24
      routes:
        - to: default
          via: 192.168.1.1
      dhcp4: false
      nameservers:
        addresses:
        - 192.168.1.1
        - 8.8.8.8
        - 1.1.1.1
        search:
        - google.com
  version: 2
```


- Installed Docker, and Plex natively (for hardware encoding)
- Set up ssh through public key authentication only (for both proxmox host and ubuntu vm)
- Mounted aforementioned pool as a NFS share (and mapped root user to root)
  
# To do

- Migrate volumes of all my docker containers running on WSL to my Share drive
- Deploy my various stacks as compose files, with properly mounted config volumes as nfs 
- Configure nginx proxy manager and port forwarding
- Decommission old Plex install in favor of this new one