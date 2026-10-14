---
type: plan
status: active
phase: P3
task: "09"
subtask: "20"
updated: 2026-10-14
---

# 20 — 快照、replay、上限与重试

**契约来源：** [spec](../spec.md) 的 AC-11；[共享契约修订](../spec.md#共享契约修订p3-02)的事件最低要求与 `CORE_LIMITS`。
**依赖：** 15, 18, 19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 快照包含所有影响未来的地图、Warp、标记、可见性状态与图标/探索历史（若存在），不漏阶段计时、保存页与随机状态；不重复序列化纯派生副本。
- 同版本、运行时、内容、配置、种子与有序输入的录制 JSON 往返 replay：事件与检查点一致，与渲染有无和频率无关；坏版本、身份、setupHash 与输入拒绝。
- 新列表、请求/事件扇出、实体与录制预算的 limit 与 limit + 1，以及故障锁存。
- 一个 Runtime 帧内多 tick 后才消费事件、实体已移动或移除时，事件快照仍足够。
- 重试以新世界重建全部地图与 Warp 状态，旧运行事件与 ID 不穿越新运行。
- 端到端合成流程：开图 → select → 关图 → 友方选标记 → `request-warp` → 到达，正式 step 中的事件序列与状态断言。

## 不包含

- 快照恢复 API（不提供）。

## 关键文件与契约

- [replay.ts](../../../../../src/core/replay/replay.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)。

## 写入范围

- `src/core/replay/**`：测试与必要的写入器、比较器修正。
- `src/core/contracts/limits.ts`、`src/core/contracts/limits.test.ts`
- `src/core/systems/map-warp-chains.test.ts`：计划新增的端到端合成测试。

## 验收标准

- [x] AC-11 的每项（快照完整、JSON 往返 replay、坏输入拒绝、上限与故障锁存、重试隔离）都有通过的测试。
- [x] 端到端合成流程在正式 step 中通过，事件与状态断言独立推导。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 正式 step、replay、帧后事件消费者与容量测试；不是快照恢复测试。

## 完成证据

- **2026-10-14 — 执行（worker，exec-p3-09-20，基于 6e8412eb）。** 本子任务只加测试与一处注释更正，没有发现实现缺陷，没有改规则代码。
  - **共享合成场景：** [map-warp.test-support.ts](../../../../../src/core/replay/map-warp.test-support.ts)：玩家、正前方 112.5 处的 7 型敌机（与玩家同一像素，图标经 `0x4b3a8` 错开到 (203, 204)）、约 6000 外覆盖不到的 8 型敌机；玩家 Warp 对 (10, 100)、(1000, 200)，+0xA4 = 2，+0xA8 = 14，+0xB8 = 64，一枪击毁 7 型的固定炮。脚本：开图 → select 近敌图标并 hover → select 远敌像素 → 关图 → 开火 → 友方选标记 → `request-warp`。
  - **端到端（正式 `World.step`）：** [map-warp-chains.test.ts](../../../../../src/core/systems/map-warp-chains.test.ts)。断言按契约与 225 单位/像素的合成框架独立推导：事件序列与命令结果；开图的视角、光标起点、对象集合、只在覆盖内的可见标志与错开后的图标；select 取图标 z 112.5、建标记（一次抽取，姿态属于启动旋转表），远敌被迷雾隐藏，所以 z 为 +0 且标记移动；关图后图标与揭示清空，光标、目的地与标记保留；友方目标为标记；开始的门禁量（距离、c = 596、E）、L = 7、页 6、目标清空且不扣能量；Warp 中每 tick 按 u += speed × 1/32 ÷ 64 推导的 n、u，进度在完成前一 tick 达到 1（本运行为 tick 639，作回归锚点）；到达时对两种高度符号都吸附到玩家（600 之上）、扣费由完成前一 tick 的能量推导（并核实该 tick 没有能量更新到期）、`warpClock` = 时钟 + 640、`hostileNear` 为真；之后视角回飞行、页面恢复、过渡/目的地/标记保留、不再有 P3-09 事件。
  - **帧后消费：** 一个 Runtime 帧连跑 tick 5–13 后才读事件：被选图标的敌机已移除、标记已移动、玩家在 Warp 自身坐标中；事件仍等于逐 tick 取下的 JSON 副本、深冻结，并保留目的地、图标 kindBit、标记创建与出发点。
  - **重试：** 同一输入的新世界初始快照等于从未运行的世界（光标起点、无目的地、`savedLeftPage` 0、`warp` null、空集合与图标、无实体、下一 ID 1）；旧运行停在 Warp 中后与新运行交替推进，两者各自等于单独运行的事件与快照，新运行的标记 ID 与 `serial` 从头开始。
  - **Replay：** [map-warp-replay.test.ts](../../../../../src/core/replay/map-warp-replay.test.ts)：660 tick、每 tick 检查点并每 tick 读 projection、Render State 与快照的录制，经 JSON 往返后 replay 的事件与检查点逐一相等，检查点即所读快照的哈希；不读、每 7/21 tick 读与检查点间隔 16 的结果相同；只改 hover 落点时事件相同、检查点在该 tick 分歧，下一次 select 后重新一致（光标进快照）；快照不含派生副本（`startPixel`、`startupRotations`、`zoomBounds`、`contacts`、`warpRequest` 等键不出现）；拒绝未知格式版本、规则版本 4 与 6、越界/NaN/未知操作的 map-point、带字段的 `toggle-map`/`request-warp`、65 条命令的 tick、伪造 setupHash、其他身份，以及同身份下改动 Warp 对、+0xA4、+0xA8、+0xB8 或地图矩形的内容（setupHash）；64 条 map-point 的 tick 照常回放。
  - **上限：** [budget.test.ts](../../../../../src/core/replay/budget.test.ts)：64 条命令时 63 个 select + `request-warp`（L ≤ 1，同 tick 完成）的事件为 64 结果、63 `warp-destination-set`、`warp-started`、`warp-completed` 与 2 个 `left-page-changed`，请求 63 `map-point` + 1 `warp-start`；64 次开关为 64 `map-toggled`/`map-toggle`；65 条命令作输入拒绝且不改状态；延迟的 `warp-start` 计入 `requestsPerTick`，超出为 `pipeline.requests` 预算故障；2,047 个实体在地图中时标记作为第 2,048 个实体创建，图标与集合停在机体数；2,048 个机体时图标与友方集合各 2,048、全部可见；此时再 select 建标记为 `entities.count` 预算故障，录制会话与其世界锁存、导出也抛同一故障；快照文本在实体上限加上 2,048 个最长图标、2,048 个集合成员、最长目的地与过渡后仍在 `canonicalTextLength` 内。[limits.test.ts](../../../../../src/core/contracts/limits.test.ts) 加 MW-14 的项，合计 8,328 与 3,588。
  - **注释更正：** 最长数字时每个图标 200 字符（MW-14 的约 170 是典型值）、集合成员 17、过渡约 2 KiB，合计约 0.43 MiB；[limits.ts](../../../../../src/core/contracts/limits.ts) 的 `canonicalTextLength` 注释补上这些最长值，取值不变。
  - **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 95 个文件、2,763 项通过；`pnpm check` 通过（typecheck、lint、全部 Vitest、生产构建）。
  - **rubber-duck：** 采纳：完成 tick 原先只从事件读出，现改为由每 tick 的 n、u 递推，并加回归锚点；`energyBefore` 原先取自事件，现由前一 tick 的能量推导并核实没有能量更新到期；名称说 65 个请求的测试改为说明这是上界。旋转只核对属于启动旋转表（表本身由 startup-rotations.test.ts 负责），已在文件头注明。
  - **simplify：** 去掉一次重复的 660 tick 录制和一个重复的 2,048 实体世界；删去已被精确计数蕴含的上界循环；拒绝表改用行辅助函数；改名 `map` 辅助函数；`WARP_PAIRS` 不再导出。跳过：把 `expectRejected`、`recordWith`、`expectLatched` 提到共享 test-support（会改动本范围外或无关的文件）；把 P3-09 上限测试拆出 budget.test.ts（需要复制 `countedTick`）。
  - **文档影响：** 只改测试与 limits.ts 的注释，模块说明、指南与 STATUS 无须更新。`docs/guides/tools.md` 中录制上限的记录归 26。P3-02 spec MW-14 的估计（约 170 字符、0.35 MiB、过渡 1 KiB）低于最长数字的情况；它是注释性估计，不影响取值，已在报告中提出，由协调者决定是否更正。
