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

- [ ] AC-07 的 Node 部分：`speed-preset` 1/9 通过，非法值拒绝且世界/录制不变；档位与 P3-06 原规则等价；`select-number` 的默认飞行处理与未实现上下文的结果符合契约。
- [ ] 两个版本常量相对集成基线各递增一次，旧版本录制在执行前拒绝；编辑器与比较器覆盖新变体。
- [ ] `src/core` 仍保持纯净；`pnpm check` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动。

## 验证方法

- `pnpm exec vitest run src/core src/ui/dev src/app/runtime tools/replay-check.test.ts`，再运行 `pnpm check`；受影响的浏览器 replay 由 29 运行。

## 完成证据
