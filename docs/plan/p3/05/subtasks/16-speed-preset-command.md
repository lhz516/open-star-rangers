---
type: plan
status: active
phase: P3
task: "05"
subtask: "16"
updated: 2026-10-10
---

# 16 — `speed-preset` 命令迁移

**契约来源：** [spec](../spec.md) 的 S-06，[速度档位命令](../spec.md#速度档位命令)、[持久化与兼容](../spec.md#持久化与兼容)、[数据模型与契约](../spec.md#数据模型与契约)的 `Command` 行、技术决定 4；AC-07。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **前提：** goal 的 P3-06 集成已满足，且 10 的修订已获批准。实施前在本工作树读取并记录 `RULES_VERSION` 与 `GAME_REPLAY_VERSION` 的集成基线值。
- **契约：** [tick-input.ts](../../../../../src/core/contracts/tick-input.ts) 的命令联合新增 `{ type: 'speed-preset', level }`，`level` 为 1–9 的整数；0、10、小数、NaN、Infinity、缺字段与多字段经 `readTickInput` 拒绝，世界与录制不变；规范文本/序列化与命令类型清单同步。
- **规则：** P3-06 的速度处理中，`speed-preset` 在飞行上下文给出与原 Shift+数字路径等价的档位（`presetThrottle`，Shift+1 归零）；其他上下文为 `wrong-context`。`select-number` 的默认飞行处理不再改变速度，结果为 `ignored`/`wrong-context`；尚未实现的基地/地图处理仍为 `rejected`/`not-implemented`；不在 Core 中猜测通讯菜单状态。
- **版本：** `RULES_VERSION` 与 `GAME_REPLAY_VERSION` 相对集成基线各递增一次；snapshot 格式版本不变但绑定新 rulesVersion；错误版本在任何 tick 执行前拒绝，不迁移旧录制。
- **消费者：** [compare.ts](../../../../../src/core/replay/compare.ts) 的命令类型、开发命令编辑器 [command-draft.ts](../../../../../src/ui/dev/command-draft.ts) 的表单（`level` 为 1–9 整数）、合成输入与录制夹具、[replay-check](../../../../../tools/replay-check.ts) 的测试与 [browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts) 中依赖版本或命令清单的夹具。
- Node 测试：校验边界、档位等价（与 P3-06 原测试的期望一致）、`select-number` 的新结果、版本递增与旧版本拒绝、编辑器表单、replay 比较。

## 不包含

- 键盘到 `speed-preset` 的绑定（19）；浏览器导出与重放（29）；P3-10 的菜单优先级。
- 文档（core 模块说明等由 32 同步）。

## 关键文件与契约

- [tick-input.ts](../../../../../src/core/contracts/tick-input.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)。
- P3-06 集成后：`src/core/rules/flight-control.ts`（`presetThrottle`）、`src/core/systems/flight-control.ts`、`src/core/contracts/canonical-text.ts`。
- [command-draft.ts](../../../../../src/ui/dev/command-draft.ts)、[command-draft.test.ts](../../../../../src/ui/dev/command-draft.test.ts)。

## 写入范围

- `src/core/**`：契约、规则、版本、replay 与测试。
- `src/ui/dev/**`：命令编辑器与诊断测试。
- `src/app/runtime/**`：受命令清单或版本影响的 Runtime 测试与夹具。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`
- `e2e/browser-replay.spec.ts`

## 验收标准

- [x] AC-07 的 Node 部分：`speed-preset` 1/9 通过，非法值拒绝且世界/录制不变；档位与 P3-06 原规则等价；`select-number` 的默认飞行处理与未实现上下文的结果符合契约。
- [x] 两个版本常量相对集成基线各递增一次，旧版本录制在执行前拒绝；编辑器与比较器覆盖新变体。
- [x] `src/core` 仍保持纯净；`pnpm check` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动。

## 验证方法

- `pnpm exec vitest run src/core src/ui/dev src/app/runtime tools/replay-check.test.ts`，再运行 `pnpm check`；受影响的浏览器 replay 由 29 运行。

## 完成证据

- **集成基线：** 本工作树（基于认领提交 `9da62921`，P3-06 已于 `a98f89de` 合入）实施前读得 `RULES_VERSION` 2（[rules-version.ts](../../../../../src/core/replay/rules-version.ts)）、`GAME_REPLAY_VERSION` 1（[recording.ts](../../../../../src/core/replay/recording.ts)）、`GAME_SNAPSHOT_VERSION` 2；改为 3 与 2，快照格式版本仍为 2。
- **契约：** [tick-input.ts](../../../../../src/core/contracts/tick-input.ts) 的 `COMMAND_FIELDS` 在 `speed` 之后新增 `'speed-preset': { level: integerIn(1, 9) }`，`Command`、`COMMAND_TYPES`（17 个）、规范字段顺序与 [compare.ts](../../../../../src/core/replay/compare.ts) 的命令类型都由该表派生；`select-number` 的注释改为不在飞行中改变速度。[canonical-text.ts](../../../../../src/core/contracts/canonical-text.ts) 不列命令，无需改动。
- **规则：** [systems/flight-control.ts](../../../../../src/core/systems/flight-control.ts) 的 `flightAction` 在任何上下文把 `speed-preset` 映射为 `presetThrottle(level)`（[rules/flight-control.ts](../../../../../src/core/rules/flight-control.ts)，参数改名为 `level`），因此门禁与速度命令相同：先 `player-unavailable`，再 Warp/基地/地图的 `wrong-context`，飞行中投递带该油门的 `control` 请求并 `accepted`。`select-number` 在基地/地图外映射为无作用的 `'none'`，经同样的玩家与上下文门禁后为 `ignored`/`wrong-context`；基地/地图仍为 `rejected`/`not-implemented`。因此 `select-number` 只有“飞行且玩家可用”一种情况由 `accepted` 变为 `wrong-context`；玩家不可用时仍为 `player-unavailable`，Warp 结果不变。Core 不读取通讯状态。
- **等价性：** [flight-control.test.ts](../../../../../src/core/systems/flight-control.test.ts) 中 P3-06 原有的档位用例改用 `speed-preset`，期望值一字未改：档位 n 的指令速度 5.25 × (n − 1)、`[decrease, preset 3]` 投递 116/28、`[zero, decrease, preset 9, increase]` 投递 0/0/112/124 并得 46.5、全部 `accepted`；新增 `speed-preset 1` 与 `speed zero` 的请求、状态与结果（仅 `commandType` 不同）相同。[motion-replay.test.ts](../../../../../src/core/replay/motion-replay.test.ts) 第 20 tick 的档位改为 `speed-preset 4`，其事件期望不变。
- **结果：** 同一文件覆盖 Warp/基地/地图中 `speed-preset` 为 `wrong-context`、玩家不可用（五种状态）时为 `player-unavailable` 且先于上下文判定；`select-number` 1–9 在飞行中为 `wrong-context`、不投递请求、不改变指令速度与控制状态、不影响前后 `decrease` 的读回链（116、104），Warp 中 `wrong-context`，基地/地图 `not-implemented`。[world.test.ts](../../../../../src/core/world/world.test.ts) 与 [mission-diagnostics.test.ts](../../../../../src/ui/dev/mission-diagnostics.test.ts)（真实任务、玩家已激活）分别得到 `player-unavailable` 与 `speed-preset` `accepted`/`select-number` `ignored`/`wrong-context`。
- **校验：** [tick-input.test.ts](../../../../../src/core/contracts/tick-input.test.ts) 接受 1–9（规范文本 `{"type":"speed-preset","level":n}`），拒绝 0、10、−0、−1、1.5、9.000001、NaN、±Infinity、字符串、null、true、缺 `level`、改用 `value`、多余字段；[recording.test.ts](../../../../../src/core/replay/recording.test.ts) 对 0、10、2.5、NaN、Infinity、缺字段、多字段及“有效档位后跟无效档位”在录制会话中拒绝，录制导出与快照不变、之后仍可继续。
- **版本门禁：** [replay.test.ts](../../../../../src/core/replay/replay.test.ts)、[motion-replay.test.ts](../../../../../src/core/replay/motion-replay.test.ts)、[replay-check.test.ts](../../../../../tools/replay-check.test.ts) 与 [browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts) 都拒绝 speed-preset 之前的格式版本 1 与规则版本 2，以及下一版本（格式 3、规则 4），replay 与 motion-replay 另拒绝规则版本 1；均在验证整份记录时（任何 tick 之前）抛出；motion-replay 还以旧代码的形状（第 20 tick 为 `select-number 4`）构造旧版本记录。[recording.test.ts](../../../../../src/core/replay/recording.test.ts) 固定 `GAME_REPLAY_VERSION` 为 2，[snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts) 固定快照格式 2、规则版本 3。
- **消费者：** 开发命令编辑器 [command-draft.ts](../../../../../src/ui/dev/command-draft.ts) 的 `speed-preset` 表单为 `level` 1–9 整数（与 `select-number` 共用 `DIGIT`），[command-draft.test.ts](../../../../../src/ui/dev/command-draft.test.ts) 覆盖默认值、1/9、`1e0` 与 0/10/4.5/−1/空/Infinity 的拒绝；[compare.test.ts](../../../../../src/core/replay/compare.test.ts) 读取 `speed-preset` 命令结果，并把它与 `select-number` 结果报告为该 tick 的事件差异；[replay.test.ts](../../../../../src/core/replay/replay.test.ts) 的合成脚本（[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)）同时含档位与数字，交换二者在第 10 tick 报告事件差异；[replay-check.ts](../../../../../tools/replay-check.ts) 的最长命令表新增该变体（`RECORDING_MAX_BYTES` 不变，测试按推导复核），其测试脚本含被接受的 `speed-preset`；[game-runtime-recording.test.ts](../../../../../src/app/runtime/game-runtime-recording.test.ts) 经 Runtime 队列录制并重放该命令；[browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts) 的脚本档位改为 `speed-preset`。
- **检查：** `pnpm exec vitest run src/core src/ui/dev src/app tools/replay-check.test.ts` 通过（78 个文件 1980 项；含范围外的 `src/app/session` 与 `src/app/mission`，未受影响）；`pnpm check` 通过（229 个文件 6970 项测试，构建成功，本次无超时）；`OSR_E2E_DEV_PORT=5148 OSR_E2E_PREVIEW_PORT=5149 pnpm test:e2e e2e/browser-replay.spec.ts --project=development` 通过（1 项），服务已随测试结束关闭。`src/core` 的纯净规则由 `pnpm typecheck`/`pnpm lint` 检查通过，本项未引入新导入。simplify 后重跑焦点测试（55 个文件 1420 项）与 `pnpm check`（229 个文件 6970 项，构建成功），均通过。
- **Rubber-duck：** 一次审阅，没有发现问题；特别确认 `select-number` 在玩家不可用时保留 `player-unavailable`、只在飞行且玩家可用时为 `wrong-context` 符合契约（保持 Warp 结果不变）。
- **Simplify：** 四个角度审阅后采用：编辑器测试改用 `RECENT_RESULT_LIMIT`；合并 motion-replay 的重复导入并去掉每行重复的版本断言（版本已在 recording/snapshot 测试固定）；tick-input 测试共用 `DIGITS`；区分档位与数字的 replay 测试改用 10 tick 的短录制；脚本只在用到时计算数字。未采用：把 `'none'` 从 `FlightAction` 中拆为独立的“认领/处置”层（为单一无作用命令重构判定结构，P3-10 接入菜单优先级时会重新处理 `select-number`）；把 `presetThrottle` 推迟到门禁之后（与原 `select-number` 路径和速度命令的写法一致，开销可忽略）；把编辑器拒绝用例改为生成（保持与现有逐行表一致）。
- **文档影响：** [core 模块说明](../../../../engineering/modules/core.md)需同步：命令联合列出 17 个变体（`speed-preset`）、P3-06 命令判定中 `speed-preset` 的门禁与档位、`select-number` 在飞行中为 `wrong-context`、`RULES_VERSION` 3 与 replay 格式版本 2（快照仍为 2）及其递增原因、P3-06/P3-10 交接条目中“普通飞行的 `select-number` 是档位”“菜单打开时档位键失效是已知差异”的表述。这些在 32 的写入范围内，已在 worker 报告中交由协调者转 32，本项未改。[工具指南](../../../../guides/tools.md)的 replay 核对不写具体版本号，仍准确。
