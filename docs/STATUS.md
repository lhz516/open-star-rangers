---
type: status
status: active
phase: all
updated: 2026-10-01
---

# 项目进度

**当前阶段：P1 工程与运行骨架**（P0 可行性评审已通过；P0 其余项目并行收尾）

本文件是唯一的进度入口。勾选项对应总计划 §12 的退出条件，每一项都链接到证据。阶段结束时，在 [reviews/](./reviews/) 写评审记录，再把本文件切换到下一阶段。

## 阶段总览

| 阶段 | 状态 | 评审记录 |
|---|---|---|
| P0 基准与可行性 | 可行性评审已通过，其余项目并行收尾 | [P0-feasibility](./reviews/P0-feasibility.md) |
| P1 工程与运行骨架 | 进行中 | — |
| P2 玩法所需资源管线 | 未开始 | — |
| P3 完整玩法切片 | 未开始（可与 P2 重叠） | — |
| P4 Classic 内容完成 | 未开始 | — |
| P5 Classic 1.0 发布 | 未开始 | — |
| P6 Enhanced 美化 | 未开始 | — |

## P1 退出条件

对应总计划 §12 的 P1 行。

### 工程骨架

- [ ] Vite + React + TS（strict）项目，目录结构按总计划 §4.1；`src/original-data` 与 `tools/` 纳入构建与类型检查
- [ ] 目录边界与确定性 lint：`src/core` 等不得导入 React、Zustand、Three.js、DOM、IndexedDB，不得使用 `Math.random`、`Date.now`、`performance.now`
- [ ] Vitest 单元测试；原版格式解析器的测试使用代码生成的合成样本

### 运行骨架

- [ ] 独立 Core：`step(tickInput)` 返回 `DomainEvent[]`，可在 Node 中无浏览器运行
- [ ] GameRuntime：固定步长调度、命令队列、Event Bus、运行时控制通道（暂停/继续/退出）
- [ ] UI projection 与 Zustand 桥接；React 指令经 Core 反馈
- [ ] Three.js 合成场景在浏览器运行，按 Render State 插值
- [ ] 重启、暂停、返回菜单不产生重复游戏循环（含 React StrictMode 与热更新）
- [ ] 同一输入记录 replay 后事件流与状态哈希一致

### 交付与 CI

- [ ] React 导入/菜单原型（导入流程只需界面占位，P2 接入真实解析）
- [ ] GitHub Actions：lint、typecheck、test、build
- [ ] CI 原版文件哈希扫描（依据 [manifest](./original/manifest.md)）与依赖许可证检查
- [ ] SWA 预览环境可部署

## P0 退出条件（并行收尾）

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
- [x] 还原舰船模型：19 个 MODL、486 个 MESH 全部解析，带贴图渲染出可辨认的外形 → [mesh](./original/formats/mesh.md)
- [x] 渲染结果与原版 HI 模式截图对照：几何形状与无贴图部件颜色吻合；贴图颜色与机型对应关系转入 U-028（P2） → [mesh](./original/formats/mesh.md) §3
- [x] 还原一个任务的结构：头部、7 个段、战役表与加载流程已确认，主要字段为高概率；剩余字段转入 P2（U-022） → [scenario](./original/formats/scenario.md)
- [x] 确认任务数据是否嵌在 EXE 中：任务内容在 `SCENARIO.NOB`，EXE 中没有任务文字 → [scenario](./original/formats/scenario.md)、U-002
- [x] 写出评审记录，结论“通过” → [reviews/P0-feasibility.md](./reviews/P0-feasibility.md)

## 下一步

1. P1：初始化 Vite + React + TS 项目骨架，把现有解析器与工具纳入构建、类型检查与测试。
2. P1：目录边界与确定性 lint；Core 与 GameRuntime 的最小可运行版本。
3. P0 收尾（用户）：试玩回答 U-011、U-013，反馈流畅度以校准 cycles（U-021）；确定目标测试设备。U-025、U-015 的剩余部分见 [unknowns](./original/unknowns.md)。
4. U-022 剩余字段（决定机型、阵营的字段）在 P2 中继续，见 [executable](./original/formats/executable.md) §4。

## 阻塞项

无。
