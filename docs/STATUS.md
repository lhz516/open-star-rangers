---
type: status
status: active
phase: all
updated: 2026-10-02
---

# 项目进度

**当前阶段：P1 工程与运行骨架**（P0 可行性评审已通过；P0 其余项目并行收尾）

本文件是项目总进度入口，记录阶段验收、优先项与项目级阻塞；具体任务的 subtask 状态只记录在其 goal tracker，验收证据记录在 subtask 文档。勾选项对应总计划 §12 的退出条件，每一项都链接到证据。阶段结束时，在 [reviews/](./reviews/) 写评审记录，再把本文件切换到下一阶段。

## 阶段总览

| 阶段 | 状态 | 评审记录 |
|---|---|---|
| P0 基准与可行性 | 可行性评审已通过，其余项目并行收尾 | [P0-feasibility](./reviews/P0-feasibility.md) |
| [P1 工程与运行骨架](./plan/p1/tasks.md) | 进行中 | — |
| [P2 玩法所需资源管线](./plan/p2/tasks.md) | 未开始 | — |
| [P3 完整玩法切片](./plan/p3/tasks.md) | 未开始（可与 P2 重叠） | — |
| [P4 Classic 内容完成](./plan/p4/tasks.md) | 未开始 | — |
| [P5 Classic 1.0 发布](./plan/p5/tasks.md) | 未开始 | — |
| [P6 Enhanced 美化](./plan/p6/tasks.md) | 未开始 | — |

P1 已形成 [12 项本地任务拆分、依赖与退出条件覆盖](./plan/p1/tasks.md)。P1-01 已建立工程骨架的持久回归和本地应用壳证据；P1-02 已交付合成纯 Core（`step()` 返回事件，Node 测试覆盖）；P1-03 已交付快照、状态哈希、输入录制、replay 与结果比对（同一代码版本、同一运行时）。细粒度执行状态只见各自的 goal（[P1-01](./plan/p1/01/goal.md)、[P1-02](./plan/p1/02/goal.md)、[P1-03](./plan/p1/03/goal.md)）。按用户确认的 [ADR-0012](./decisions/ADR-0012-local-p1-defer-ci-deployment.md)，CI 与部署移出 P1、由 [P5](./plan/p5/tasks.md)承接；其余阶段尚未拆分任务。工作流入口见[Agent 任务工作流](./engineering/agent-workflow.md)，进度分工见 [ADR-0011](./decisions/ADR-0011-spec-goal-workflow.md)。工程骨架通过不代表运行骨架或整个 P1 验收完成。

P1-04 已交付宿主无关的合成 Runtime：固定步长与补跑上限、输入/命令队列、帧末类型化事件分发、两份 Render State、可选录制及故障导出。Node 契约与完整工程检查证据见 [P1-04 最终对齐](./plan/p1/04/subtasks/06-final-alignment.md#完成证据)，使用约定见 [engineering](./engineering/README.md#合成-runtime)。尚未接入浏览器时钟、控制通道或页面，不能据此宣称运行骨架整体完成。

## P1 退出条件

对应总计划 §12 的 P1 行。

### 工程骨架

- [x] Vite + React + TS（strict）项目、纯模块/浏览器/Node 检查环境；现有解析器/TS 工具纳入静态检查，JS 配置由 lint 覆盖；本地 build/dev/生产壳刷新通过 → [基线](./plan/p1/01/subtasks/01-toolchain-baseline.md#完成证据)、[本地壳验证](./plan/p1/01/subtasks/05-local-shell-evidence.md#完成证据)
- [x] 目录边界与确定性 lint：ts/tsx、包子路径、应用层目录入口和 async 缺口已修正，纯模块类型环境无 DOM/Node 声明；持久正负回归通过 → [回归源码](../tools/engineering-boundaries.test.ts)、[lint 验证](./plan/p1/01/subtasks/03-lint-boundary-regression.md#完成证据)。静态检测限制见[工程约定](./engineering/README.md#lint-规则eslintconfigjs)
- [x] Vitest 单元测试和合成格式样本；既有解析器用例保持原样，新工程回归及隔离预期失败验证进入现有检查链，Python XML 测试单独通过 → [检查链证据](./plan/p1/01/subtasks/04-check-chain-failure-contract.md#完成证据)、[工程测试](./engineering/README.md#测试)

### 运行骨架

- [x] 独立 Core：`step(tickInput)` 返回 `DomainEvent[]`，可在 Node 中无浏览器运行；当前为合成演示场景，不是原版规则 → [P1-02 最终对齐](./plan/p1/02/subtasks/05-final-alignment.md#完成证据)、[Core 源码](../src/core/synthetic-scene.ts)
- [ ] GameRuntime：固定步长调度、命令队列、Event Bus、运行时控制通道（暂停/继续/退出）——前半部分已由 [P1-04](./plan/p1/04/subtasks/06-final-alignment.md#完成证据)验证；控制通道与生命周期待 P1-05
- [ ] UI projection 与 Zustand 桥接；React 指令经 Core 反馈
- [ ] Three.js 合成场景在浏览器运行，按 Render State 插值
- [ ] 重启、暂停、返回菜单不产生重复游戏循环（含 React StrictMode 与热更新）
- [x] 同一输入记录 replay 后事件流与状态哈希一致：仅限同一代码版本、同一 JS 运行时，当前只覆盖合成 Core；浏览器中复用记录属于 P1-10 → [P1-03 最终对齐](./plan/p1/03/subtasks/07-final-alignment.md#完成证据)、[replay 源码](../src/core/synthetic-replay.ts)

### 本地交付与合规

- [ ] React 导入/菜单原型（导入流程只需界面占位，P2 接入真实解析）
- [ ] 最小键盘输入适配，区分连续输入、离散命令与 Runtime 控制；菜单/失焦不遗留瞬时输入
- [ ] 集成后的本地工程检查、构建与合成浏览器验证通过
- [ ] 本地原版文件哈希扫描（依据 [manifest](./original/manifest.md)）与依赖许可证检查通过，第三方声明进入本地构建

## P5 承接的 CI 与部署要求（未开始）

本节记录 [ADR-0012](./decisions/ADR-0012-local-p1-defer-ci-deployment.md) 从 P1 迁入的阶段级要求，不替代总计划中其余 P5 退出条件，也不维护 subtask 状态。

- [ ] GitHub Actions：lint、typecheck、test、build 与合成浏览器检查
- [ ] CI 原版文件哈希扫描与依赖许可门禁，基于本地检查入口
- [ ] 仓库检查保护、部署凭据隔离与 SWA 预览/正式发布实测

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

1. P1：[P1-01](./plan/p1/01/goal.md)、[P1-02](./plan/p1/02/goal.md)、[P1-03](./plan/p1/03/goal.md) 与 [P1-04](./plan/p1/04/goal.md) 已完成。下一步可为 [P1-05 会话与浏览器生命周期](./plan/p1/tasks.md#p1-05-会话与浏览器生命周期)生成 spec，接入浏览器时钟、暂停/继续/退出和清理；[P1-12 本地合规检查](./plan/p1/tasks.md#p1-12-本地原版隔离与许可检查)只依赖 P1-01，也可开始。
2. P1：按[依赖顺序](./plan/p1/tasks.md#5-实施顺序)规划后续本地任务；本地合规自检可并行推进。CI/部署由 P5 跟踪，不索取云凭据，也不作为 P1 阻塞；细粒度状态只放各任务 goal。
3. P0 收尾（用户）：试玩回答 U-011、U-013，反馈流畅度以校准 cycles（U-021）；确定目标测试设备。U-025、U-015 的剩余部分见 [unknowns](./original/unknowns.md)。
4. U-022 剩余字段（决定机型、阵营的字段）在 P2 中继续，见 [executable](./original/formats/executable.md) §4。

## 阻塞项

无。
