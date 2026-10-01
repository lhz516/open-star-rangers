---
id: ADR-0003
type: adr
status: accepted
phase: P0
updated: 2026-09-30
related: [U-006]
---

# ADR-0003：光盘镜像为主要导入源

## 背景

文件盘点发现：安装目录只是光盘的子集，通讯头像（`COMMFACE*.NOB`，约 64 MB）和 37 段 Smacker 过场视频只在光盘上；光盘只有一条数据轨，没有 CD 音轨。见 [manifest](../original/manifest.md)。

## 决定

- 主要导入源为光盘镜像（CloneCD、BIN/CUE、ISO），在浏览器中用 TS 读取原始扇区与 ISO9660 目录，只提取所需文件。
- P2 只支持开发者现有的 CCD/IMG；其他镜像格式与 ZIP/文件集在 P5 补齐。
- 安装目录不能单独作为完整导入源。

## 考虑过的其他方案

- 只导入安装目录的 ZIP：缺少视频与通讯头像，且仍需玩家先用 DOSBox 安装。
