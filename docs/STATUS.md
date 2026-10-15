---
type: status
status: active
phase: all
updated: 2026-10-14
---

# 项目进度

**当前阶段：P3 完整玩法切片**（任务拆分已于 2026-10-08 批准；P3-01 至 P3-07 与 P3-09 已完成。P2 退出评审与 P1 本地退出评审已通过，P0 其余项目并行收尾）

本文件是项目总进度入口，只记录当前阶段、阶段状态摘要、任务索引入口、下一步与项目级阻塞，不跟踪阶段退出条件或任务执行状态。阶段范围和退出条件由[总计划 §12](./plan/master-plan.md#12-开发阶段与验收条件)定义，任务状态见各 goal，验收证据见 subtask 文档，最终退出判定见[阶段评审](./reviews/)。

## 阶段总览

| 阶段 | 状态 | 任务 | 评审记录 |
|---|---|---|---|
| P0 基准与可行性 | 可行性评审已通过，其余项目并行收尾 | —（未设置任务索引） | [P0-feasibility](./reviews/P0-feasibility.md) |
| P1 工程与运行骨架 | 本地退出评审已通过 | [P1 tasks](./plan/p1/tasks.md) | [P1-exit](./reviews/P1-exit.md) |
| P2 玩法所需资源管线 | 退出评审已通过 | [P2 tasks](./plan/p2/tasks.md) | [P2-exit](./reviews/P2-exit.md) |
| P3 完整玩法切片 | 进行中：P3-01 至 P3-07 已完成 | [P3 tasks](./plan/p3/tasks.md) | — |
| P4 Classic 内容完成 | 未开始 | [P4 tasks](./plan/p4/tasks.md) | — |
| P5 Classic 1.0 发布 | 未开始 | [P5 tasks](./plan/p5/tasks.md) | — |
| P6 Enhanced 美化 | 未开始 | [P6 tasks](./plan/p6/tasks.md) | — |

## 下一步

1. P3：[任务拆分](./plan/p3/tasks.md)已于 2026-10-08 获用户批准（16 项任务及其依赖与验收覆盖）。
   - [P3-01](./plan/p3/01/spec.md)（玩法闭环边界与原版对照基线）的 spec 与 [goal](./plan/p3/01/goal.md) 已于 2026-10-08 获用户批准，goal 已于 2026-10-09 执行完成（结论与证据见 goal 与各 subtask）。G-08 已于 2026-10-09 经用户决定纳入 F10（spec 已修订）；[12 的交接](./plan/p3/01/subtasks/12-catalog-handoff.md#完成证据)中的阶段索引补充已经用户批准写入 [P3 tasks](./plan/p3/tasks.md)。它规定闭环步骤与运行组合、切片配置（难度 19、僚机可选）、规则与表现对照目录、缺省清单与标注规则、视角范围，并安排时基研究、成功与失败终态的可达性核实、运行时测量工具与数据闭包。其中按用户指示由 agent 采用推荐方案的取舍列在 spec 的技术决定中。执行需要基准环境（DOSBox-X 同一时间只有一个会话）、Computer Use 权限与只读 Ghidra 分析；失败终态在正常游玩中不可达或核心时基无法确认时会阻塞，由用户决定范围。
   - **计时对照前提（P3-01/07，[B-006](./original/behavior/B-006-simulation-timing.md)）：** 在所选任务中，原版游戏时钟相对模拟器时间的速率与帧率都依赖 DOSBox-X cycles。基准 `fixed 40000` 时时钟比无丢失预期慢 0.03%–3.2%，约 30 帧/秒；`fixed 20000` 时慢约 4.3%，约 13 帧/秒。以真实秒或帧计的原版计时对照须在 U-021 冻结后的配置下核对适用性，必要时重测；U-021 仍未关闭。本机 Computer Use 无法向 DOSBox-X 输入，需要游玩的原版运行由用户操作（[运行时测量](./guides/runtime-measurement.md)）。
   - 其余任务按[推荐执行顺序](./plan/p3/tasks.md#推荐执行顺序)在 P3-01 之后展开；P3-02 与 P3-03 依赖 P3-01 的时基事实与数据闭包。
   - [P3-02](./plan/p3/02/spec.md)（Core 正式契约与任务实例化）的 spec 与 [goal](./plan/p3/02/goal.md) 已于 2026-10-09 获用户批准，goal 已于 2026-10-09 执行完成（结论与证据见 goal 与各 subtask）。正式 Core 位于 `src/core/`（契约、世界与流水线、放置、实例化、快照与 replay），API、阶段表与对后续任务的交接见 [Core 模块说明](./engineering/modules/core.md)。原版运行时核对见 [B-007](./original/behavior/B-007-mission-instantiation.md)：所选任务的生成时刻、放置、缺省值与僚机门禁一致。放置的 f32 舍入在运行时为就近，与代码推断的向零矛盾，原因未查明（U-009）；Core 按用户批准采用就近舍入。种类名文字（CINF）的导入需求已交 P3-03。
   - [P3-03](./plan/p3/03/spec.md)（规则数据与补充内容导入）的 spec 与 [goal](./plan/p3/03/goal.md) 已于 2026-10-09 获用户批准；执行中 spec 经用户批准修订一次（HUD 直接绘制的 EXE 文字作为 `hud-text` 导入，sound payload 递增为 schema 2 以表示按次数重复），goal 已于 2026-10-09 执行完成（结论与证据见 goal 与各 subtask）。切片定义为版本 4（新增 15 个必需角色），生产 `ConverterVersion` 为 `osr-import.graphics-4.logic-2.audio-2.models-4`，导入协议仍为 5；旧缓存不再恢复，须重新导入（[本地导入指南](./guides/local-import.md)）。规则数据（机型与武器含种类名、碎片、AI、通讯菜单、修理项目、飞行消息）、任务事件触发、场景设置、爆炸与星云、HUD 文字与新增音效的读取器见[内容模块](./engineering/modules/content.md)；本机核对用 `tools/package-check.ts` 与扩展后的 `tools/nob-check.ts`（[工具用法](./guides/tools.md)）。
   - [P3-04](./plan/p3/04/spec.md)（正式 Runtime、游戏会话与应用流程）的 spec 与 [goal](./plan/p3/04/goal.md) 已于 2026-10-09 获用户批准，goal 已于 2026-10-10 执行完成（结论与证据见 goal 与各 subtask；执行中按用户的事先授权新增了两个测试就绪修复子任务）。正式 Runtime 与 Session、DOM-free 的任务流程与所有者、UI 桥接、开发诊断与录制导出见 [app](./engineering/modules/app.md) 与 [ui](./engineering/modules/ui.md) 分册；主菜单经介绍、开始配置与 G-02 占位进入飞行，当前构建的缺省见 [slice-gaps](./engineering/slice-gaps.md)。录制可用 `tools/replay-check.ts` 在 Node 中核对（[工具用法](./guides/tools.md)）。P1 合成演示已退役，删除的路径与替代模块见[退役记录](./engineering/source-structure.md#p3-04-合成演示退役记录)。运行中衔接、原版键位、规则、画面与音效归后续任务。
   - [P3-05](./plan/p3/05/spec.md)（正式键鼠输入、焦点与浏览器能力）的 [goal](./plan/p3/05/goal.md) 已于 2026-10-12 执行完成，逐项核对与实机/原版证据见 [33 最终对齐](./plan/p3/05/subtasks/33-final-alignment.md#完成证据)（按已批准的 P3-06 `42db4ec2` 基线收尾）。正式绑定、生命周期、能力失败与地图输入交接见[键盘输入指南](./engineering/keyboard-input.md)。2026-10-13 与 P3-07 一同合入 main：两者都曾把 `RULES_VERSION` 从 2 递增为 3，合入时按“相对实际集成基线各递增一次”取 4（replay 格式 2、快照格式 3，见 [P3-02 spec 的审批](./plan/p3/02/spec.md#审批)）；合入后的联合回归只覆盖自动化检查，P3-05 的实机/原版证据未在新树上重取。同 tick 地图门禁、生产地图几何与完整流程仍分别由 P3-09/P3-10/P3-13/P3-15 承接；跨平台发布矩阵与阶段退出另归 P5、P3-16。
   - [P3-06](./plan/p3/06/spec.md)（飞行运动与速度控制）的 goal 已于 2026-10-11 执行完成，结论与证据见 [goal](./plan/p3/06/goal.md) 与各 subtask；与原版的对照见[子任务 18](./plan/p3/06/subtasks/18-comparison-verdicts.md)（R-04、R-05 全部一致，fixed 40000 cycles，受 U-021 约束）。
   - [P3-07](./plan/p3/07/spec.md)（目标、武器、伤害与毁伤）的 goal 已于 2026-10-14 执行完成，结论与证据见 [goal](./plan/p3/07/goal.md) 与各 subtask。
     - 战斗规则位于 `src/core` 的 `flight.combat` 组，API、已知差异与交接见 [Core 模块说明](./engineering/modules/core.md)。
     - 与原版的对照见[子任务 27](./plan/p3/07/subtasks/27-comparison-conclusions.md)：36 次原版运行（fixed 40000 cycles，受 U-021 约束）；D-02 六类连续行为一致；单次转移没有不一致；未测分支已逐项列出。
     - AI 开火、基地自动挂点的连续节奏与 CR-13 的调用点接入归 P3-08 至 P3-11。
   - [P3-09](./plan/p3/09/spec.md)（战略地图、战争迷雾与 Warp）的 goal 已于 2026-10-14 在分支 `p3-09-strategic-map-spec` 上执行完成（尚未合入 main），结论与证据见 [goal](./plan/p3/09/goal.md) 与 [27 最终对齐](./plan/p3/09/subtasks/27-final-alignment.md#完成证据)。
     - 地图模式、光标与种类 25 标记、对象集合与可见性、Warp 的能量、开始、过程与到达都是 Core 规则，`map` 分区与 Warp 读数见 [Core 模块说明](./engineering/modules/core.md)；`RULES_VERSION` 为 5、快照格式 4，切片定义 5，`ConverterVersion` 为 `osr-import.graphics-5.logic-2.audio-2.models-4`（旧缓存须重新导入）。
     - D-01（[P3-02 spec](./plan/p3/02/spec.md#审批) 的 MW-01 至 MW-16、[P3-03 spec](./plan/p3/03/spec.md#审批) 修订 2）与 D-02 按用户的预先授权由 agent 定稿，待用户事后审阅。
     - 与原版的对照见 [B-010](./original/behavior/B-010-map-warp.md)：R-13 至 R-16 一致（fixed 40000 cycles，受 U-021 约束）；只由代码证据覆盖的分支已披露并交 P3-10、P3-11、P3-15 联合复验。地图画面、Warp 效果与音效归 P3-12 至 P3-14。
     - 合入 main 前须与同期的 P3-08、P3-10 分支核对共享契约（P3-02 spec、`object-sets` 阶段、方向表常数的更正）与规则版本。
2. P2 已完成：P2-01 至 P2-13 全部完成，[P2 退出评审](./reviews/P2-exit.md)于 2026-10-08 确认通过并冻结（高概率判定与范围例外已逐项披露）。生产 `ConverterVersion` 为 `osr-import.graphics-3.logic-1.audio-1.models-3`，导入协议版本 5；P3 可消费的内容、适配与遗留责任见评审的[对后续阶段的影响](./reviews/P2-exit.md#4-对后续阶段的影响)，各任务的交付见 [P2 tasks](./plan/p2/tasks.md)。
3. P0 收尾（用户）：试玩回答 U-013，反馈流畅度以校准 cycles（U-021）；确定目标测试设备。U-011 的飞行键位由 P3-05 自行取证，P3-01 测量时基对 cycles 的依赖，两者的负责阶段仍为 P0。U-015 的剩余部分见 [unknowns](./original/unknowns.md)；U-025 的负责阶段为 P3。
4. U-022 的剩余字段：规则语义归 P3，其余任务的字段归 P4（负责阶段见 [unknowns](./original/unknowns.md)）；模型槽位选择已确认，见 [executable](./original/formats/executable.md) §4。
5. U-031（战役被毁后的救援与真实失败条件，见 [B-005](./original/behavior/B-005-campaign-rescue.md)）：P3-01/05 已确认失败处理及其“同一次尝试中第三次损失”入口（代码），所选任务的正常玩法失败路径为高概率；未取得运行复现，已确认的规则证据与真实内容失败运行归 P3-11（P3-15 之前）。不复用练习模式被毁即失败。

## 阻塞项

- 无项目级阻塞。
