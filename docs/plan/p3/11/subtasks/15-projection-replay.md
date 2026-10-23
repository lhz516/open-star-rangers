---
type: plan
status: active
phase: P3
task: "11"
subtask: "15"
updated: 2026-10-23
---

# 15 — 读模型、录制与 replay

**契约来源：** [spec](../spec.md) 的 S-08、AC-09（Core 部分）、AC-10；[结果读模型、事件与门禁](../spec.md#结果读模型事件与门禁)、[运行中与终局衔接](../spec.md#运行中与终局衔接)的录制与 replay。
**依赖：** 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [projection.ts](../../../../../src/core/projections/projection.ts)：`mission` 分区的流程阶段（正常、被毁序列、信标等待、停靠、结算等待、结果延时、退场、完成）；`result` 在退场完成前为进行中，完成后公开冻结的终态（原因、绑定任务 Asset ID 的总结引用或 null、`rescuesUsed`、终局 G-02 序列、击杀合计）；不公开救援计数、触发计数或期限。读取冻结、无副作用。
- 录制与 replay（[recording.ts](../../../../../src/core/replay/recording.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)）：录制包含锁存与全部退场 tick，在完成提交处结束，最终检查点不丢失不重复；健康完成可导出；replay 拒绝完成后多余的 tick；容量停止与故障不冒充完成。
- [replay-check.ts](../../../../../tools/replay-check.ts) 支持以完成结束的录制，并有合成测试。
- 测试：分区的各阶段与终态、后挂消费者恢复持续状态；成功与两次救援后失败的录制 JSON 往返，事件与检查点哈希一致，与帧分组无关；版本、身份与 setupHash 错误。

## 不包含

- 会话与 UI 消费（16、17）；真实内容运行（19）。

## 关键文件与契约

- [snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)。

## 写入范围

- `src/core/projections/**`：分区实现与测试。
- `src/core/replay/**`：录制、replay 与测试。
- `tools/replay-check.ts`：完成结束的录制核对。
- `tools/replay-check.test.ts`：合成测试。

## 验收标准

- [x] 分区区分各阶段，终态只在完成后公开；读取冻结无副作用；不公开内部计数。（AC-09）
- [x] 两种终局的录制往返一致；完成后多余 tick 被拒绝；健康完成可导出。（AC-10）
- [x] `node tools/replay-check.ts` 的合成测试通过；受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node projection 与 replay 测试；`pnpm exec vitest run src/core tools/replay-check.test.ts`。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

**2026-10-23（worker 15，基于认领提交 `8712db74`）：**

- **实现：**
  - [recording.ts](../../../../../src/core/replay/recording.ts)：录制会话在完成的 tick 之后的 `step` 中先于读取输入与容量检查抛出不锁存的 `CoreInputError('step', 'mission-completed')`（ME-12“录制会话同理”）。完成状态取自每个 tick 的 `mission-completed`，以已完成的世界开始录制时取自 `flow.completedTick`。世界、录制与读取都不变，健康完成照常导出。新增 `isCompletionTick(events)` 与 `completedRun(result)`（最后一个 tick 含 `mission-completed`）。
  - [replay.ts](../../../../../src/core/replay/replay.ts)：`replayRecord` 在完成之后仍有 tick 时，在执行该 tick 之前以 `CoreInputError('record.ticks[k]', 'after-completion')` 拒绝，不丢弃后缀。路径沿用本模块 tick 错误的 `record.ticks[k]` 约定；ME-12 写作 `ticks[k]`，为同一位置的简写。
  - [replay-check.ts](../../../../../tools/replay-check.ts)：报告版本 1→2，末尾增加 `completed: boolean | null`（P3-04“终局与救援衔接”，ME-17 决定 10）。重放返回后为 `completedRun(重放结果)`，不一致时也给出；更早停止时为 null。`passed` 的含义不变。
  - [projection.ts](../../../../../src/core/projections/projection.ts)：分区的实现与单元测试已在 08 完成，本项未改动，只补全程运行级的测试（下）。
- **合成运行**（[mission-end.test-support.ts](../../../../../src/core/replay/mission-end.test-support.ts)）：只由 `TickInput` 驱动，所以 replay 能独立复现。
  - **成功：** 只有玩家的任务，加一个与玩家同一存储位置的种类位 7 机体。碰撞在第 3 tick 毁掉它，即全清；4 进入结算等待，165 完成消息，646 锁存并开始退场，647 完成。
  - **两次救援后失败：** 玩家能量百分比为 1，64 单位/tick，每 8 tick 一次全速。能量在 83、185、289 耗尽，99、201 两次能量救援，305 第三次损失锁存 `third-loss`/`energy`，306 完成。
  - 合成 craft-info 的玩家 +0xC0 为 −2（减速为负），被锁定的机体会越过 +0xB8 加速，救援时油门越出油门表，报 `rescue.throttle` 故障。两条运行因此把玩家 +0xC0 设为 2。这是合成数据的性质，不是规则缺陷。
- **测试**（[mission-end-replay.test.ts](../../../../../src/core/replay/mission-end-replay.test.ts)，两种终局各一组）：
  - 录制含锁存与退场 tick，以 `mission-completed` 为最后事件结束；锁存 tick 的命令为 `ignored`/`mission-ended`。锁存结果与规则一致（成功 `G-02/8 solo`、`rescuesUsed` 0；失败 `G-02/7 energy`、`rescuesUsed` 2）。
  - 记录经 JSON 往返后，replay 的事件与检查点哈希一致（`compareReplayResults` 为 match，结构相等）。
  - 间隔为 1、finalTick、finalTick − 1 与 50 时，最终检查点恰好一次，同一 tick 的哈希相同。
  - 按 1、2、3…个 tick 分帧并在帧间读取 projection、renderState、snapshot，录制不变。
  - 逐 tick 的 projection 只按阶段顺序变化（成功：normal → settlement-wait → result-delay → teardown → completed；失败：三次 beacon-wait 之后经 teardown 到 completed）。完成前的每个 tick（含锁存与退场）都是 in-progress。完成时玩家实体已移除，终态仍等于冻结的锁存结果加 `completedTick`，且深度冻结。完成后的读取不改变快照。
  - 完成后以 `null` 与坏输入调用 `step` 仍得到 `step`/`mission-completed`，即先于读取输入；快照、导出与读取不变。录制已完成世界的会话同样拒绝。
  - 追加 1 或 3 个 tick 的记录在 `record.ticks[finalTick]` 以 `after-completion` 拒绝。去掉最后一个 tick 的前缀可以重放，但 `completedRun` 为 false，与完整结果比较为 `length` 不一致。
  - 旧/新 `rulesVersion`、新 replay 格式版本、另一 setupHash 与另一内容身份都在任何 tick 之前拒绝。
  - 完成 tick 中残留脚本使用导致的 `mission-teardown` 故障：不设置 `completedTick`，导出与读取都抛出该故障。提前停止的录制导出前缀，没有完成事件，读作 in-progress。
- **replay-check**（[replay-check.test.ts](../../../../../tools/replay-check.test.ts)）：
  - 既有报告断言改为版本 2 与 `completed`：40 tick 的合成录制通过但 `completed: false`，不一致时为 false，记录拒绝与提前停止时为 null。
  - 合成光盘场景的任务无法由输入到达结束（探查：只有全速命令时 131,072 tick 内玩家不耗尽、不遇敌，达到录制容量），因此新增三项检查在核对的重放一步（不影响记录校验）以 Core 的 `replayRecord` 重放上述成功运行：
    - 完成录制 `passed: true`、`completed: true`、退出码 0；
    - 重放在 `after-completion` 处停止时为 `replay-failed`、`record.ticks[39]`、`completed: null`；
    - 期望完成而重放停在前缀时为 `replay-mismatch`、`completed: false`。
- **命令：** 均在 worker worktree 上运行，未遇超时，没有重跑 `--no-file-parallelism`。
  - `pnpm exec vitest run src/core tools/replay-check.test.ts`：138 个文件、3,873 项通过。
  - 简化后 `pnpm exec vitest run src/core/replay tools/replay-check.test.ts`：12 个文件、655 项通过。
  - `pnpm typecheck`、`pnpm lint` 通过。
  - `pnpm check` 通过：349 个文件、10,255 项测试，并完成生产构建。
- **rubber-duck：** 没有阻塞或非阻塞问题。
- **simplify：** 已采纳：
  - 测试的步进循环复用 `stepToCompletion`（加每 tick 回调）；
  - 两种终局的期望结果移入表；
  - 工具测试的重放替换改为按内容区分并只作用于一次核对，不依赖调用次数；
  - 成功录制移入 `beforeAll`；
  - `completesRun` 更名为 `isCompletionTick`，与 `completedRun` 区分。

  未采纳：replay 的独立完成标志（ME-12 要求原因 `after-completion`）；每 tick 的事件扫描与短运行的重复（可忽略）；报告字面量的重复（沿用既有写法）。
- **11 的交接（Warp 中被毁时 `left-page-changed` 在 `player-loss-started` 之后）：** 未改。ME-13 未规定这个页事件的位置；改动须同时改 `src/core/systems` 的发出次序（不在本项写入范围），现行次序有 MW-05 的先例。
- **文档影响：** 写入范围内没有文档。范围外须更新的建议见 worker 报告，交 22：
  - `docs/engineering/modules/core.md` 的“录制”“replay”两段：完成后的拒绝、`after-completion`、`isCompletionTick`/`completedRun`；
  - `docs/guides/tools.md` 第 20、153 行：报告版本 2 与 `completed`；
  - P3-04 spec 第 454 行的持久化表仍写 `version: 1`，已被“终局与救援衔接”取代。

