---
type: status
status: active
phase: all
updated: 2026-10-01
---

# 项目进度

**当前阶段：P0 基准与可行性**

本文件是唯一的进度入口。勾选项对应总计划 §12 的退出条件，每一项都链接到证据。阶段结束时，在 [reviews/](./reviews/) 写评审记录，再把本文件切换到下一阶段。

## 阶段总览

| 阶段 | 状态 | 评审记录 |
|---|---|---|
| P0 基准与可行性 | 进行中 | — |
| P1 工程与运行骨架 | 未开始（可行性评审通过后开始） | — |
| P2 玩法所需资源管线 | 未开始 | — |
| P3 完整玩法切片 | 未开始（可与 P2 重叠） | — |
| P4 Classic 内容完成 | 未开始 | — |
| P5 Classic 1.0 发布 | 未开始 | — |
| P6 Enhanced 美化 | 未开始 | — |

## P0 退出条件

### 基准环境

- [x] 确定基准版本：光盘原版，未打补丁 → [manifest](./original/manifest.md)、U-017
- [x] 原版能在隔离环境中重复运行 → [baseline-environment](./guides/baseline-environment.md)
- [ ] 校准并冻结 cycles → U-021
- [ ] 确定目标测试设备（Windows / macOS / Linux 实机）
- [ ] 关键记忆场景可复现（起飞、战斗、Warp、停靠各一个）

### 研究产出

- [x] 原版文件清单 → [manifest](./original/manifest.md)
- [ ] 行为规范：关键行为写明测量方法与容差 → [behavior/](./original/behavior/)
- [ ] 键位冲突表完成实机验证 → [key-map](./original/input/key-map.md)
- [ ] 待确认登记表每一项都已确认，或有研究计划与负责阶段 → [unknowns](./original/unknowns.md)

### 可行性评审

- [x] 列出全部 `.NOB` 封包条目 → [imfat](./original/formats/imfat.md)
- [ ] 还原一个舰船模型 → [mesh](./original/formats/mesh.md)、U-001
- [ ] 还原一个任务的结构：头部、7 个段与战役表已确认；132 字节记录等字段含义待研究 → [scenario](./original/formats/scenario.md)、U-022
- [x] 确认任务数据是否嵌在 EXE 中：任务内容在 `SCENARIO.NOB`，EXE 中没有任务文字 → [scenario](./original/formats/scenario.md)、U-002
- [ ] 写出评审记录 `reviews/P0-feasibility.md`

## 下一步

1. 解析 MESH 的面、法线和 UV，以及 MODL 如何组合 MESH，导出一个舰船模型与原版截图对照。
2. 在 Ghidra 中配置 Watcom 调用约定，定位 `SCEN` 的加载代码，确定 132 字节记录的字段含义（U-022）。
3. 试玩（用户）：回答 U-011、U-012、U-013、U-015，并反馈流畅度以校准 cycles（U-021）。U-006、U-007、U-024 已完成。

## 阻塞项

无。
