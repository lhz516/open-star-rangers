---
id: ADR-0005
type: adr
status: accepted
phase: all
updated: 2026-09-30
related: [U-004]
---

# ADR-0005：视频与音乐只冻结接口，实现由 spike 决定

## 背景

Smacker 解码涉及 Huffman 树、调色板增量、分块视频、压缩音频与音画同步；Miles 音乐需要 OPL 模拟或 MIDI 合成。两者都是独立的工程，过早选定实现会额外产生子项目。

## 决定

- 只冻结 `VideoPlayback` 与 `MusicPlayback` 接口和约束（本地解码、不分发原版内容、不要求跨源隔离、按需加载、符合依赖许可证政策）。
- 实现方案由 spike 比较后决定，结论另写 ADR。spike 不阻塞主线，在 P4 之前完成。

细节见总计划 §3.4。

## 考虑过的其他方案

- 冻结为纯 TS Smacker 解码器、禁用 ffmpeg.wasm：过早排除了只编译 Smacker 部分的精简 WASM 方案。
