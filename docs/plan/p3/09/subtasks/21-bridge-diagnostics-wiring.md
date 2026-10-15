---
type: plan
status: active
phase: P3
task: "09"
subtask: "21"
updated: 2026-10-14
---

# 21 — UI 桥接与开发诊断接线

**契约来源：** [spec](../spec.md) 的 S-12、AC-06（桥接部分）、AC-12 的前提；[地图 projection](../spec.md#地图-projection) 的读取与消费者。
**依赖：** 19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts) 的关键状态：地图开关、就绪/无玩家、目的地提交、可执行性原因与 Warp 生命周期变化在帧末立即发布；普通 hover 不作为关键变化；不新增计时器，普通采样仍为 100 ms。
- 开发诊断：事件日志的封闭字段表覆盖新增事件；[command-draft.ts](../../../../../src/ui/dev/command-draft.ts) 的 `map-point`、`request-warp` 表单可用；生产构建不含开发面板。
- 命令反馈对新原因码的显示；地图几何仍为 null 时保持 P3-05 的 not-ready 提示，不锁定、不隐藏系统指针、不提交鼠标命令，`m`/未锁 Esc 可退出地图。
- 测试：桥接的普通采样与关键变化立即发布分别有测试；日志与表单覆盖新字段。

## 不包含

- 生产地图几何与画面（P3-13）；浏览器验证（22）。

## 关键文件与契约

- [game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts)、[MissionDevPanel.tsx](../../../../../src/ui/dev/MissionDevPanel.tsx)、[command-draft.ts](../../../../../src/ui/dev/command-draft.ts)、[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts)、[MissionScreen.tsx](../../../../../src/app/MissionScreen.tsx)。

## 写入范围

- `src/ui/game/**`：桥接关键状态、命令反馈与测试。
- `src/ui/dev/**`：事件日志字段与命令表单。
- `src/app/mission/**`、`src/app/composition/**`、`src/app/MissionScreen.tsx`：接线（如需）。

## 验收标准

- [x] AC-06 的桥接部分：普通采样与关键变化立即发布分别有测试。
- [x] 新增事件在开发日志中有完整字段；命令编辑器可提交 `map-point` 与 `request-warp`；生产构建不含开发面板。
- [x] `pnpm exec vitest run src/ui src/app` 与 `pnpm check` 通过。

## 验证方法

- Node/Vitest 消费者测试；生产构建产物不含 `ui/dev`（沿用既有回归）。

## 完成证据

- **桥接关键状态**（[game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts)）：`KeyFacts` 增加地图开/关/无玩家（`mapState`，与既有 `map` 就绪合起来区分未实现、无玩家、关闭与打开）、已提交目的地的坐标（按 x/y/z 比较，同值新对象不算变化）、标记实体、`warpRequest` 的结果与原因、视角 1（`warpView`，取 Core 的 `WARP_VIEW_MODE`）与该帧 Render State 的 Warp 序号（P3-02 MW-15 “视角 1 与 `serial`”；projection 不含序号）。光标、放大窗口、费用读数与接触点不在其中，hover 按 100 ms 采样；未新增计时器。不经帧的写入（命令反馈的 `commit`、故障）沿用上次发布的序号，序号若变则由下一帧立即发布。
- **测试**（`pnpm exec vitest run src/ui src/app`：57 个文件，1124 个通过）：
  - [game-session-bridge.test.ts](../../../../../src/ui/game/game-session-bridge.test.ts)：真实 Core 链上开图、select 与 Warp 开始在其帧末立即发布，hover 不发布，Warp 完成在完成帧立即发布；替身逐项验证关图、失去玩家、新/清除目的地、标记、`warpRequest` 结果与原因、Warp 视图的序号、仅视角 1 变化、视图内序号变化各自立即发布后按 100 ms 再采样；打开地图的光标、费用、接触点与同值目的地新对象只按采样发布。用原桥接实现运行时，新增用例中 10 个失败（反证）。
  - 合成世界的玩家在 tick 1 出现、tick 2 起 `warpRequest` 由 `player-unavailable` 变为 `no-destination`，两者都是规定的关键变化；既有 4 个采样用例（含 [game-command-feedback.test.ts](../../../../../src/ui/game/game-command-feedback.test.ts) 1 个）改为越过这两个 tick 后再量采样窗口，断言的采样规则不变。
  - [event-log.ts](../../../../../src/ui/dev/event-log.ts)：`warp-destination-set`、`warp-started`、`warp-completed` 原先缺 `playerEntityId`、图标种类位、标记实体、出发点/目的地、到达的朝向、扣费距离、扣费前能量与 `warpClock` 等字段，现四个新事件逐字段列出（主位置为 x/y/z，其余位置加名前缀，朝向为 9 个数的串）；[event-log.test.ts](../../../../../src/ui/dev/event-log.test.ts) 核对完整有序字段表与 missing 标记/无图标分支。
  - [mission-diagnostics.test.ts](../../../../../src/ui/dev/mission-diagnostics.test.ts)：真实任务所有者上，命令编辑器草稿依次提交 `request-warp`（ignored `no-destination`）、`toggle-map`、玩家像素中心的 `map-point select`（accepted，日志的 `warp-destination-set` 带 11 个字段）与 `request-warp`（ignored `insufficient-energy`），命令反馈的最近结果显示这些新原因码。
  - [mission-owner-map.test.ts](../../../../../src/app/mission/mission-owner-map.test.ts)：按 use-mission-owner.ts 装配生产输入消费者（`GAME_INPUT_BINDINGS`、`MAP_INPUT_POLICY`、null 几何）与 `ui` 消费者，在真实所有者与 Core 上：`m` 打开 Core 地图，桥接在采样时钟不到期时仍发布 `map`/`open`；地图输入为 `not-ready`、系统指针不隐藏、Pointer Lock 请求 0 次，鼠标移动与按键不产生 `map-point`；再按 `m` 与未锁 Esc 都关闭地图，命令只有 4 个 accepted 的 `toggle-map`。
- **检查：** `pnpm check` 通过（typecheck、lint、Vitest 297 个文件 8856 个、生产构建）；连续 5 次全量 Vitest 中有 1 次报 1 个失败、未保留其名称，其余 4 次（含最终 `pnpm check`）全部通过，新增用例均为确定性的毫秒级 Node 用例。`OSR_E2E_PREVIEW_PORT=5164 pnpm exec playwright test e2e/production-preview.spec.ts` 6 个通过，含生产产物与 DOM 不含开发诊断的回归。全量 `pnpm test:e2e` 222 个通过、1 个失败（F-13 真实配额，存储用例），单独重跑通过，与本子任务无关的负载敏感用例。
- **rubber-duck：** 无阻塞问题；指出 MW-15 要求的“视角 1”需独立于序号，已增加 `warpView` 与只改视角的用例。`-0`/`NaN` 比较、构造时读取 `renderFrame()` 与序号沿用均确认无误。
- **simplify：** 改为导入 Core 的 `WARP_VIEW_MODE`，去掉测试中的单用 helper、未用参数与重复断言。未采纳：把测试用键盘/指针替身导出共享（导出点在写入范围外的 `src/ui/game-input/`）；把 Warp 序号放进 Core projection（`src/core` 不在写入范围，记为交接建议）。
- **文档影响：** [UI 模块说明](../../../../engineering/modules/ui.md)的“桥接”条与[工程约定](../../../../engineering/README.md)的“UI 桥接”条列出的关键事实需补充地图与 Warp 的关键状态；两者不在本子任务写入范围，交 26。其余文档无需改动。
