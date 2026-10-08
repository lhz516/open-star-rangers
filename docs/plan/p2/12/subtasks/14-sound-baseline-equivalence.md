---
type: plan
status: active
phase: P2
task: "12"
subtask: "14"
updated: 2026-10-07
---

# 14 — 试听基准与候选采样的等价核验

**契约来源：** [spec](../spec.md) 的 S-09、[原版本地对照](../spec.md#原版本地对照)中 A-1 与“用户会话”段对旧 WAV 的要求；AC-18 的等价部分。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本（计划新增 `local/research/p2-12/audio/`）：
  - 对 12 个核心 Asset（开火 4、导弹 1、Warp 1、爆炸 6，见 [audio](../../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)），找到 `local/research/p2-08/` 中 P2-08/10 试听用的对应 WAV；
  - 逐项比较候选的规范采样（经 `content/` 的读取器解码）与 WAV：采样值（按 P2-08 记录的浮点映射）、采样率、声道数与长度；
  - 缺失、对应不明或不等价的 WAV 列出，供 21 改为直接对照原版。
- 输出给 21 的试听清单：Asset ID、角色、对应 WAV、等价结论；只在 `local/`。

## 不包含

- 试听本身（21，由用户完成）；非核心的 6 个音效。

## 关键文件与契约

- [sound-payload.ts](../../../../../src/content/sound-payload.ts) 的读取器；P2-08/10 的[试听记录](../../../../original/formats/audio.md#listening-comparison-p2-0810)与 `local/research/p2-08/listening-checklist.md`。

## 写入范围

- `local/research/p2-12/audio/**`：等价核验脚本与试听清单（被忽略）。

## 验收标准

- [ ] 12 个核心 Asset 各有等价结论：与对应 WAV 的采样、采样率、声道与长度逐项相同，或列为须直接对照原版的项。
- [ ] 证据只记 Asset ID、计数与判定，不含采样或声音。

## 验证方法

- 在本机运行脚本，记录命令与逐项结论；再临时改动一个采样值确认脚本报告不等价。
- 不涉及浏览器验证。

## 完成证据
