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

- [x] 两种故障在修复前已复现，根因已记录。
- [x] AC-08：两种冲突与全部相邻路径的正式 step 测试通过，没有 Core 故障；冲突恰一次 `ignored`/`wrong-context`，没有 Warp 副作用。
- [x] AC-08：`RULES_VERSION` 递增 1，快照与 replay 格式不变；当前录制 replay 匹配，旧版本录制被拒绝。
- [x] `pnpm typecheck`、`pnpm lint` 与受影响的 Vitest 文件通过；`pnpm check` 通过。
- [x] Core 模块说明已更新；没有新依赖。

## 验证方法

- `pnpm test -- src/core/systems/warp.test.ts src/core/systems/docking.test.ts src/core/systems/commands.test.ts src/core/systems/flight-control.test.ts src/core/replay`，再运行 `pnpm check`。
- 浏览器与真实内容的复验由 06、09 进行。

## 完成证据

- **2026-10-30 修复前复现（候选 `d3f78b92`，正式 step，合成场景：玩家在 (1000, 2000, 300)，基地距 500、行 1 背向目的地，目的地距 50000、代价 10000）：**
  - 子状态 4 期限 0、tick 1 `[request-warp]`：tick 1 为 `accepted`，事件依次 `view-switched`、`docked`、`transition`、`view-switched`、`warp-started`、`left-page-changed`、`object-retired`；tick 2 以 `invariant-violated`/`docking.view-switch` 故障。
  - tick 1 停靠后 tick 2 `[launch, request-warp]`：能量 10000 时以 `invariant-violated`/`warp.start-check` 故障；能量 1e6 时两条都 `accepted`，Warp 从离港位置 (300, 2400, 300) 开始（未按该位置判定）。
  - **根因：** MW-04 原前提“`warp-start` 之前应用的请求不改变判定输入”漏了玩家的 `dock`/`depart`。（1）`request-warp` 按已提交的飞行视角通过，延后的 `warp-start` 在 `dock` 之后应用，玩家既停靠又进入视角 1（上一视角 6）；Warp 把活动区移到目的地使基地退役，下一 tick 子状态 5 自动离港，离开视角 1 的停靠视角切换恢复页面而故障。（2）能量按停靠位置判定，`warp-start` 在 `depart` 移动玩家后按离港位置重算（代价 10021 > 10000）而故障。
- **实现：** [warp.ts](../../../../../src/core/systems/warp.ts) 的 `judgeRequestWarp` 以 `RequestQueue.findLastPending(isPlayerTransition)` 查本 tick 待提交的 `dock`/`depart`，`judgeWarpRequest` 新增参数 `transitionPending`，次序为玩家不可用 → 冲突（`wrong-context`）→ 原门禁；[map.ts](../../../../../src/core/projections/map.ts) 的读者在 tick 外传 `false`。未改 UI、Runtime、请求次序，未捕获 `CoreFaultError`。`RULES_VERSION` 11 → 12，快照格式 9、replay 格式 3 不变。
- **测试：** [warp.test.ts](../../../../../src/core/systems/warp.test.ts) 的 “a Warp request against a pending dock or depart” 22 例，均经正式 step，冲突用例与不含该请求的孪生世界比较：恰一条 `ignored`/`wrong-context`、无 `warp-started`、其余事件逐条相同、`rngState` 与 `stateText` 相同。覆盖停靠到期同 tick（能量充足、不足、无目的地、冷却中，及其后 3 tick 照常）；期限到达、已过、两 tick 后到达；`dock` 执行门禁失败（下一 tick 照常接受）；同批码 9 重请求把子状态改回 3；玩家不可用优先；子状态 3、4 期限前无待提交转换时照原门禁（接受并 20 次抽取；`insufficient-energy`、`no-destination`）；`[launch, request-warp]`（能量只够停靠位置、能量充足；下一 tick 从离港位置以代价 10021 开始）；`[launch, request-warp, request-warp]`；请求在 `launch` 之前仍按基地上下文；子状态 5 自动离港（含从基地打开的地图）；飞行中被忽略的 `launch` 不构成冲突；武器发射不构成冲突。读者测试补 `judgeWarpRequest(…, true)` 为 `wrong-context`。
- **Replay：** 新增 [dock-warp-replay.test.ts](../../../../../src/core/replay/dock-warp-replay.test.ts)：合成内容经正式录制会话，地图选点 → 菜单请求停靠 → 停靠 tick 的 `request-warp`（tick 319，`ignored`/`wrong-context`，照常 `docked`）→ `[launch, request-warp]`（tick 324，`launch` 接受、Warp `ignored`，照常 `departed`）→ 下一 tick 从离港位置 `warp-started`。JSON 往返后 `replayRecord` 结果相等，`compareReplayResults` 为 `{ match: true }`；`rulesVersion` 为 11 与 13 的记录被拒绝（`record.rulesVersion`）。临时关闭门禁时该录制在 tick 320 以 `docking.view-switch` 故障（随即恢复）。版本断言更新：[snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts)（9、12 与快照文本前缀）、[map-warp-replay.test.ts](../../../../../src/core/replay/map-warp-replay.test.ts)（3、12）；其余版本相关测试相对 `RULES_VERSION` 断言，未改动，没有放宽断言。
- **检查：** `pnpm exec vitest run src/core/systems/warp.test.ts src/core/replay/dock-warp-replay.test.ts` 78 例通过；`pnpm check`（typecheck、lint、447 个测试文件 11930 例、build）通过。没有新依赖。
- **审查：** rubber-duck 审查完整 diff，无发现。simplify（复用、简化、效率、层级四方面）：拆分带分支的 `it.each`、`docked` 改为直接返回场景；未采纳：把 `open`/`digit`/`expectRejected` 提到共享 test-support（需改范围外的其他 replay 测试）、把冲突标志放入 `CommandView`（改变其“视角”语义）、放宽 replay 检查点间隔（全程 < 1 s，保留逐 tick 检查点）。
- **文档：** [Core 模块说明](../../../../engineering/modules/core.md)：已知差异中以“Warp 请求与待提交的停靠/离港冲突（项目差异，P3-16/04）”取代未决的 P3-09 × P3-10 联合故障（含复现、根因、原版差异与验证），交接中的未决条目改为已修复并要求新增转换请求时同步 `isPlayerTransition`，命令表、`applyWarpStart` 不变量、`findLastPending` 用途与 `RULES_VERSION` 历史同步。[源码结构](../../../../engineering/source-structure.md)不列函数签名或测试文件，无需修改。经协调者批准扩大写入范围（goal 分支 `67550ed4`），在 [P3-02 spec](../../02/spec.md#mw-12-随机数前置研究与已批准的差异) MW-12 的“已批准的差异”中补第 10 项（第 1a 步的项目差异，引用该 spec 审批的 2026-10-30 修订与 P3-16 spec 的批准；置信度与 MW-04 第 1a 步一致），其余条文与版本不变。变更文档的相对链接与锚点经脚本逐条核对，无失效。
