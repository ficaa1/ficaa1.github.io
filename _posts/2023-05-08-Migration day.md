---
title: Building and installing my server
date: 2023-05-08 18:00:00 +200
categories: [homelab, server, proxmox]
tags: [proxmox, nas, truenas]
---

- Created new dataset in TrueNas for docker-volumes only 
- Created volumes in Portainer that use NFS mounts
- Had write issues with qBittorrent, ended up just chmod -R 773 for the download folder. Not optimal, but I got lost with the different UIDs and GUIDs for the different folders
- Had to increase RAM on my Ubuntu VM
- Had to update config.xml on sonarr because it required authentication if coming from non local address
  
  This fucking shit 
  ```
  [v3.0.10.1567] System.UnauthorizedAccessException: Access to the path '/data/TV SHOWS' is denied. ---> System.IO.IOException: Permission denied
   --- End of inner exception stack trace ---
  at System.IO.Enumeration.FileSystemEnumerator`1[TResult].CreateDirectoryHandle (System.String path, System.Boolean ignoreNotFound) [0x00032] in <de882a77e7c14f8ba5d298093dde82b2>:0
  at System.IO.Enumeration.FileSystemEnumerator`1[TResult]..ctor (System.String directory, System.IO.EnumerationOptions options) [0x00048] in <de882a77e7c14f8ba5d298093dde82b2>:0
  at System.IO.Enumeration.FileSystemEnumerable`1+DelegateEnumerator[TResult]..ctor (System.IO.Enumeration.FileSystemEnumerable`1[TResult] enumerable) [0x00000] in <de882a77e7c14f8ba5d298093dde82b2>:0
  at System.IO.Enumeration.FileSystemEnumerable`1[TResult]..ctor (System.String directory, System.IO.Enumeration.FileSystemEnumerable`1+FindTransform[TResult] transform, System.IO.EnumerationOptions option) [0x00042] in <de882a77e7c14f8ba5d298093dde82b2>:0
  at System.IO.Enumeration.FileSystemEnumerableFactory.UserDirectories (System.String directory, System.String expression, System.IO.EnumerationOptions options) [0x00014] in <de882a77e7c14f8ba5d298093dde822>:0
  at System.IO.Directory.InternalEnumeratePaths (System.String path, System.String searchPattern, System.IO.SearchTarget searchTarget, System.IO.EnumerationOptions options) [0x00045] in <de882a77e7c14f8ba5298093dde82b2>:0
  at System.IO.Directory.GetDirectories (System.String path, System.String searchPattern, System.IO.EnumerationOptions enumerationOptions) [0x00000] in <de882a77e7c14f8ba5d298093dde82b2>:0
  at System.IO.Directory.GetDirectories (System.String path) [0x0000b] in <de882a77e7c14f8ba5d298093dde82b2>:0
  at NzbDrone.Common.Disk.DiskProviderBase.GetDirectories (System.String path) [0x00047] in C:\BuildAgent\work\63739567f01dbcc2\src\NzbDrone.Common\Disk\DiskProviderBase.cs:157
  at NzbDrone.Core.RootFolders.RootFolderService.GetUnmappedFolders (System.String path, System.Collections.Generic.List`1[T] seriesPaths) [0x00055] in C:\BuildAgent\work\63739567f01dbcc2\src\NzbDrone.CoreRootFolders\RootFolderService.cs:142
  at NzbDrone.Core.RootFolders.RootFolderService+<>c__DisplayClass13_0.<GetDetails>b__0 () [0x00075] in C:\BuildAgent\work\63739567f01dbcc2\src\NzbDrone.Core\RootFolders\RootFolderService.cs:191
  at System.Threading.Tasks.Task.InnerInvoke () [0x0000f] in <de882a77e7c14f8ba5d298093dde82b2>:0
  at System.Threading.Tasks.Task.Execute () [0x00000] in <de882a77e7c14f8ba5d298093dde82b2>:0
  ```
Fixed by giving read rights to other. Need to figure out how to make the container part of the group of the share.


- Hardware transcoding isn't working at all with my iGPU... Tried a lot of debugging and tinkering for which I won't go into detail. I've decided to buy a GTX 1050Ti for 50 euros instead which will give me much better transcoding performance anyway.
- Almost the entire stack was migrated but due to DB issues, Sonarr had to be reconfigured manually and also Nginx Proxy Manager gave me some issues when generating new certificates. Fixed NPM by actually portforwarding 80 and 443 ports to my server. Makes sense 

And with all that, I've finally migrated everything to the server. Although currently I'm still keeping Plex on my PC due to my PC having a dedicated GPU. But once I get my hands on a cheap GPU, I'll be finished with the migration.

Next on my todo:
- Creating a mirrored pool from 2 6TB hard disks which will be divided into one partition for only backups and another bigger partition for a Nextcloud installation for which my entire family will have access to
- Due to security concerns, Nextcloud won't be exposed to the outside. It will only be accessible via VPN.
- Will explore provisioning with Terraform
- Will try to write a Ansible playbook for at least one of my servers.
- Eventually will create a Windows VM for a remote desktop experience (accessible via VPN too)