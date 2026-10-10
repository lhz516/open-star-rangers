---
type: plan
status: active
phase: P3
task: "07"
subtask: "28"
updated: 2026-10-10
---

# 28 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-12、AC-17；[与其他任务的接口](../spec.md#与其他任务的接口)；P3-02 spec 的 [P3-07 的契约修订](../../02/spec.md#p3-07-的契约修订d-01d-03)，尤其是 [CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)、[CR-11](../../02/spec.md#cr-11-表现层的归属与已批准的差异d-01)、[CR-13](../../02/spec.md#cr-13-其他任务在-p3-07-规则中的调用点d-03-之外的接口)、[CR-14](../../02/spec.md#cr-14-容量快照与版本d-01)。
**依赖：** 25, 27, 33。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Core 模块说明（[core.md](../../../../engineering/modules/core.md)）：** 记录以下内容：
  - 新 API：`createWorld`、录制入口与 `ReplayContent` 的六项顶层规则输入（与 P3-06 的 `craftInfo` 并列，含 34 的 `aiPrograms`）、静态规则数据中的 `homingPrograms`，以及 setupHash 的覆盖字段；
  - 阶段责任、玩家更新中的接入点与直接创建的例外（CR-07、CR-08）；
  - 实体的战斗状态、移动块的新变体、表现选择器、领域事件、`flight.combat` 与原因码的对应关系；
  - 上限及其依据（CR-14）；
  - CR-11 的已批准差异、高概率结论的标注，以及 27 与研究得出的已知差异。
- **交接：** 在 core.md 的交接节分别写明给以下任务的内容（CR-09、CR-11、CR-13）：
  - P3-04：规则输入的传入与碰撞可视化；
  - P3-05：开火采样、`u` 的键位，以及非飞行上下文中的开火屏蔽（CR-11 的差异 8）；
  - P3-06：`MovementBlock` 联合与 `linear`、`spinning` 的分派；P3-07 调用的模式 0 构造（按油门）、`0x21fd8`、`0x21d88` 与 `0x30e0c`；玩家更新中的两处接入点；`ai.objectTarget` 的收窄与运行时种类的缺省；`speedLimitStatus` 为 `'live'`；
  - P3-08：AI 的开火入口（CR-05）、共享转向模块 `steering.ts` 的扩展、`ai.objectTarget`、`proximity`、`lastVictim`、`lastAttacker`，以及 AI 范围伤害 `0x6313c` 调用的爆炸构造与 `0x2a5fc`；
  - P3-09：Warp 能量与 `inWarp`；Warp 开始时的目标清除；左页面 2–6；Warp 出口的最近对象搜索看不到表现层效果的差异（CR-11 的差异 1）；
  - P3-10：修理与补给的资源读写与挂点函数；`0x3c208`、`0x3c0f4` 的调用点；进入基地视角时的目标清除；左页面 2–6；
  - P3-11：CR-13 的调用点（`0x6977c`、`0x32d74`、`0x32dec`、`0x33464`、`0x32e14(1)`、`0x339cc`，以及救援 `0x67b98` 复用的 `0x2d400` 与 `0x3060c`）；进入被毁视角时的目标清除；击杀、射击统计与重伤记录的读取；
  - P3-12：会话级表现选择者（EXIC 子集与每个爆炸在 `explosion-started` 上的单次选择）、额外爆炸、判别值 1、2 碎片、闪光、受击闪烁（`hitShimmerStart`）、导弹相机（`missile-ended`），以及 R-10 中归表现层部分的原版对照（B 文档中的观察）；
  - P3-13：雷达的屏幕投影与噪点、左右显示屏与 HUD 的读数、`target-cleared` 的提示；
  - P3-14：从 P3-12 的同一选择取爆炸音效；`weapon-selected`、`shot-fired`、`hit`（`shieldWasEmpty`）、`energy-allocation-changed`、`left-page-changed` 的音效。
  同时替换 P3-02 写给 P3-07 的交接内容。
- **工程文档：**
  - [source-structure.md](../../../../engineering/source-structure.md) 列出新模块；
  - [content.md](../../../../engineering/modules/content.md) 记录 Core 消费的规则输入读取器；
  - [engineering README](../../../../engineering/README.md) 只在约定变化时修改。
- 所改文档的 `updated:` 与链接正确。

## 不包含

- 原版事实（`docs/original/`，已由 01 至 07、26 与 30 写入）。
- `docs/STATUS.md`、阶段索引与 goal（协调者维护）。
- 修改其他任务的 spec 或 goal。

## 关键文件与契约

- 现有：[core.md](../../../../engineering/modules/core.md)、[source-structure.md](../../../../engineering/source-structure.md)、[content.md](../../../../engineering/modules/content.md)、[engineering README](../../../../engineering/README.md)。
- 11 至 27 与 30 的完成证据。

## 写入范围

- `docs/engineering/modules/core.md`：API、阶段、状态、事件、`flight.combat`、上限、差异与交接。
- `docs/engineering/source-structure.md`：新模块。
- `docs/engineering/modules/content.md`：Core 消费的规则输入。
- `docs/engineering/README.md`：仅在约定变化时修改。

## 验收标准

- [ ] AC-17：Core 模块说明记录新的 API、阶段责任、实体战斗状态、事件、`flight.combat`、原因码的对应关系、上限依据与已知差异（含 CR-11 的已批准差异）。
- [ ] AC-17：向 P3-04、P3-05、P3-06、P3-08、P3-09、P3-10、P3-11、P3-12、P3-13、P3-14 的交接分别写明，覆盖 CR-11 与 CR-13 的分工与调用点。
- [ ] AC-17：工程文档同步，`updated:` 与链接正确；`pnpm check` 通过。

## 验证方法

- 文档审阅，对照 P3-02 的 CR-01 至 CR-14 与实际代码；链接与元数据检查；`pnpm check`。

## 完成证据
