---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "04"
updated: "2026-10-30"
---

# 04 — 联合故障的 Core 修复

**契约来源：** [spec](../spec.md) 的 S-05、AC-08（实现部分）、AC-15（本修复），以及[技术决定](../spec.md#技术决定) 4 与 03 定稿的 MW-04、CB-07 修订。
**依赖：** 03。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **先复现：** 在当前候选上用正式 step 复现两种故障，保留故障码、阶段与根因：
  - 停靠倒计时到期与 `request-warp` 同 tick，下一 tick 以 `docking.view-switch` 故障；
  - 同批 `[launch, request-warp]` 以 `warp.start-check` 故障（能量只够停靠位置的消耗）。
- **实现冲突门禁：** 在 `judgeWarpRequest` 或其调用处，用 `RequestQueue.findLastPending` 查本 tick 待提交的玩家 `dock`/`depart`；有则返回 `wrong-context`。顺序为：玩家不可用 → 冲突 → 原门禁。修复留在纯 Core 内，不在 UI 丢键、不调整 Runtime、不改请求顺序、不捕获 `CoreFaultError`。
- **测试（正式 step，断言命令结果、事件顺序、状态与 RNG 状态）：**
  - 两种冲突各恰一次 `ignored`/`wrong-context`，没有 `warp-start`、Warp 状态、目的地、能量与 RNG 的变化；`dock`/`depart` 照常应用；
  - 能量充足与不足；停靠期限前、到期与到期后；
  - 重请求把子状态改回 3；自动离港（子状态 5 的无效对象）；
  - 无冲突的下一 tick 照常可 Warp；子状态 3–4 没有待提交转换时照常走原门禁；
  - 武器 `launch` 请求不触发冲突；玩家不可用仍优先。
- **Replay 与版本：**
  - 按 P3-02 规则把 `RULES_VERSION` 递增 1，快照与 replay 格式不变。
  - 加两种交互的 replay 回归：`compareReplayResults` 为 `{ match: true }`；旧版本录制仍被拒绝。
  - 受影响的既有测试按新版本更新，不改宽松断言。
- **文档：**
  - [Core 模块说明](../../../../engineering/modules/core.md)：从已知差异中移除“未决的 P3-09 × P3-10 联合故障”，写入新门禁与项目差异，并更新交接。
  - [源码结构](../../../../engineering/source-structure.md)：只在 API 变化时更新。
- **收尾：** 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 不包含

- 契约修订（03）；真实内容复跑（06）；受影响对照的补验（07）；全量工程与浏览器检查（08、09）。

## 关键文件与契约

- [warp.ts](../../../../../src/core/systems/warp.ts)（`judgeWarpRequest`、`judgeRequestWarp`、`applyWarpStart`）、[docking.ts](../../../../../src/core/systems/docking.ts)（`checkDockingWait`、`dock`、`depart`）、[commands.ts](../../../../../src/core/systems/commands.ts)（`judgeBaseKey`）、[pipeline.ts](../../../../../src/core/systems/pipeline.ts)（`RequestQueue`、`CommandView`）、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)。
- 测试：[warp.test.ts](../../../../../src/core/systems/warp.test.ts)、[docking.test.ts](../../../../../src/core/systems/docking.test.ts)、[commands.test.ts](../../../../../src/core/systems/commands.test.ts)、[flight-control.test.ts](../../../../../src/core/systems/flight-control.test.ts)、[map-warp-replay.test.ts](../../../../../src/core/replay/map-warp-replay.test.ts)。

## 写入范围

- `src/core/**`：门禁、版本常量与测试。
- `src/app/**/*.test.ts`、`tools/replay-check*.ts`：只在规则版本递增使断言需要同步时修改。
- `docs/engineering/modules/core.md`：已知差异与交接。
- `docs/engineering/source-structure.md`：只在 API 变化时修改。
- `docs/plan/p3/02/spec.md`：只在 MW-12“已批准的差异”中补第 1a 步的项目差异（2026-10-30 协调者按 worker 的范围请求扩大）。

## 验收标准

- [ ] 两种故障在修复前已复现，根因已记录。
- [ ] AC-08：两种冲突与全部相邻路径的正式 step 测试通过，没有 Core 故障；冲突恰一次 `ignored`/`wrong-context`，没有 Warp 副作用。
- [ ] AC-08：`RULES_VERSION` 递增 1，快照与 replay 格式不变；当前录制 replay 匹配，旧版本录制被拒绝。
- [ ] `pnpm typecheck`、`pnpm lint` 与受影响的 Vitest 文件通过；`pnpm check` 通过。
- [ ] Core 模块说明已更新；没有新依赖。

## 验证方法

- `pnpm test -- src/core/systems/warp.test.ts src/core/systems/docking.test.ts src/core/systems/commands.test.ts src/core/systems/flight-control.test.ts src/core/replay`，再运行 `pnpm check`。
- 浏览器与真实内容的复验由 06、09 进行。

## 完成证据
