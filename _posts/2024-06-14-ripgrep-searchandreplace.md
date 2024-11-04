---
title: RIPGREP Search and replace
date: 2024-06-14
categories: []
tags: []     # TAG names should always be lowercase
---

# RIPGREP Search and replace


`rg --passthru '/dev/mapper/vg_geosafe-sc-core' -r '/dev/mapper/vg_geosafe-sc--core' ansible/group_vars/node11 > tmp.txt && mv tmp.txt ansible/group_vars/node11`

changes /dev/mapper/vg_geosafe-sc-core to /dev/mapper/vg_geosafe-sc--core and replaces it in the file

