---
title: Changing Prometheus TSDB directory
date: 2024-10-04
categories: []
tags: []     # TAG names should always be lowercase
---


# Changing Prometheus data directory

1. Stop prometheus and take backup
```
systemctl stop prometheus
sudo cp -vr /var/lib/prometheus /opt/intersec/prometheus_backup
```
2. Create new data directory

```
chown -R prometheus:prometheus /data
sudo -u prometheus mkdir /data/prometheus
```
3. Change prometheus service to use new directory
```
vim /etc/systemd/system/prometheus.service

[Unit]
Description=Prometheus
After=network-online.target
Requires=local-fs.target
After=local-fs.target

[Service]
Type=simple
Environment="GOMAXPROCS=8"
User=prometheus
Group=prometheus
ExecReload=/bin/kill -HUP $MAINPID
ExecStart=/usr/local/bin/prometheus \
  --storage.tsdb.path=/data/prometheus \  <---------- CHANGE DIRECTORY HERE
  --storage.tsdb.retention.time=30d \
  --storage.tsdb.retention.size=0 \
  --web.config.file=/etc/prometheus/web.yml \
  --web.console.libraries=/etc/prometheus/console_libraries \
  --web.console.templates=/etc/prometheus/consoles \
  --web.listen-address=0.0.0.0:9090 \
  --web.external-url= \
  --config.file=/etc/prometheus/prometheus.yml

CapabilityBoundingSet=CAP_SET_UID
LimitNOFILE=65000
LockPersonality=true
NoNewPrivileges=true
MemoryDenyWriteExecute=true
PrivateDevices=true
PrivateTmp=true
ProtectHome=true
RemoveIPC=true
RestrictSUIDSGID=true
#SystemCallFilter=@signal @timer

ReadWritePaths=/data/prometheus   <--------------- CHANGE DIRECTORY HERE

PrivateUsers=true
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectSystem=strict


SyslogIdentifier=prometheus
Restart=always
TimeoutStopSec=600s

[Install]
WantedBy=multi-user.target

```
4. Verify permissions and owner


```
ls -al /data/
ls -al /data/prometheus/
root@dc2-monitoring-server-1:~# ls -al /data/prometheus/
total 120
drwxr-xr-x 25 prometheus prometheus  4096  4 oct.  09:54 .
drwxr-xr-x  4 prometheus prometheus  4096  4 oct.  09:53 ..
```
5. Move the TSDB to new location
`mv /var/lib/prometheus/* /data/prometheus/`
6. Reload service file and start prometheus, verify if all is ok with journalctl and df
```
systemctl daemon-reload
systemctl start prometheus
journalctl -xe
df -h
```

