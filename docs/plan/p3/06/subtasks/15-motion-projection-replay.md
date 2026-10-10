---
type: plan
status: active
phase: P3
task: "06"
subtask: "15"
updated: 2026-10-10
---

# 15 — 运动 projection 与 replay 集成

**契约来源：** [spec](../spec.md) 的 S-08；AC-08；[数据模型与契约](../spec.md#数据模型与契约)的运动 projection 行；D-05、D-07、D-08。
**依赖：** 13, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **运动组就绪：** `flight.motion` 为 `{ readiness: 'ready', player }`；`player` 为 null（没有玩家实体），或按检查点 A 定稿的字段：实体 ID、位置、姿态、速度、指令速度、最高速度、`speedLimitStatus`（P3-06 中为 `'initial-only'`）与 `speedAssist: { enabled, engaged }`。没有“最新匹配时刻”。值来自世界、深度冻结且与世界脱离；读取不改哈希。玩家实体存在而缺少移动块或控制状态为 Core 故障。`combat` 保持 `not-implemented`（P3-07）。
- **replay 集成：** 带轴（含变化检测）、同 tick 多命令、目标失效（内部设置）、多次辅助匹配与失去目标的录制经 JSON 往返后 replay，事件与全部检查点相等；新事件通过比较；旧规则版本的记录被拒绝。
- **预算：** 按检查点 A 的核算测试每 tick 事件（≤ 3,201）与请求（≤ 3,138）的上界在 `eventsPerTick` 之内，以及实体上限下快照规范文本长度在 `canonicalTextLength` 之内；`CORE_LIMITS` 不变。
- **测试：** projection 的就绪、null 与故障分支、冻结与脱离；两组分区互不覆盖；持续辅助状态无需事件历史即可读取；replay 往返与拒绝；预算。

## 不包含

- 战斗组（P3-07）；HUD 绘制（P3-13）；Runtime 的录制下载（P3-04）。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[compare.ts](../../../../../src/core/replay/compare.ts) 及其测试。
- 10–14 的状态与事件；检查点 A 定稿。

## 写入范围

- `src/core/projections/**`：运动组的就绪与测试。
- `src/core/replay/**`：replay 集成与预算测试。
- `src/core/world/world*.ts`：读取 projection 所需的最小改动。

## 验收标准

- [ ] AC-08：运动组与战斗组各自表达就绪且不互相覆盖；无玩家为 null；初值速度上限有明确标识；辅助的开关与“已匹配”可从任一次 projection 读取；输出冻结、脱离世界，读取不改哈希。
- [ ] 录制经 JSON 往返后 replay 的事件与检查点一致；旧规则版本被拒绝；事件、请求与文本长度的预算测试通过。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 单元、消费者契约与 replay 测试。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器（没有消费者的分区在 Node 中做契约测试）。

## 完成证据
