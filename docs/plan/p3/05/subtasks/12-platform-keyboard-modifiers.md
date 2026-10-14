---
type: plan
status: active
phase: P3
task: "05"
subtask: "12"
updated: 2026-10-10
---

# 12 — 平台键盘事件：修饰状态与输入区绑定

**契约来源：** [spec](../spec.md) 的[修饰键与布局](../spec.md#修饰键与布局)、[输入区与焦点](../spec.md#输入区与焦点)（输入源保持同一身份）、[数据模型与契约](../spec.md#数据模型与契约)的 `KeyboardInput` 行，[涉及模块](../spec.md#涉及模块)的 platform/input；S-02、S-04、S-07、S-14 的平台部分；AC-02、AC-10 的平台部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `KeyboardInput` 增加 `shiftKey: boolean`、`altGraph: boolean`、`numLock: boolean`；后两者取浏览器事件 `getModifierState('AltGraph')` 与 `getModifierState('NumLock')` 的报告值。仍不含 `key`/`keyCode`。`normalizeKeyboardInput` 规范化并冻结全部字段。
- 浏览器连接（[browser-keyboard-source.ts](../../../../../src/platform/input/browser-keyboard-source.ts)）读取新字段；DOM-free 的 [keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts) 保持资格规则（窗口有焦点、页面可见、焦点恰在输入区）。
- **输入区绑定：** 一个键盘源在其连接生命期内可以更换或解除所绑定的输入区元素（容器挂载/卸载），保持同一身份与同一 sink；解除后资格为假并发出资格变化信号，旧元素上不残留监听；注册失败原子回滚。具体 API 形状由实现决定，满足这些不变量即可。
- `classifyKeyboardInput` 与 `HeldKeyboardAxis` 对现有调用者行为不变（回归测试）；平台层仍不识别游戏动作。
- Node 测试：新字段的规范化与冻结、AltGraph/NumLock 报告值的传递、元素更换与解除的监听平衡与资格信号、注册失败回滚。

## 不包含

- 游戏动作、Ctrl/AltGr 语义与拦截决定（18）；Pointer Lock（13）；全屏与锁键（14）。

## 关键文件与契约

- [keyboard-input.ts](../../../../../src/platform/input/keyboard-input.ts)、[keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts)、[browser-keyboard-source.ts](../../../../../src/platform/input/browser-keyboard-source.ts) 及其测试。
- 通用规则：[键位文档 §3](../../../../engineering/keyboard-input.md#3-平台键盘源的通用规则)。

## 写入范围

- `src/platform/input/keyboard-input.ts`、`src/platform/input/keyboard-input.test.ts`
- `src/platform/input/keyboard-source.ts`、`src/platform/input/keyboard-source.test.ts`
- `src/platform/input/browser-keyboard-source.ts`

## 验收标准

- [x] `KeyboardInput` 携带 `shiftKey`、`altGraph`、`numLock` 且冻结；没有读取 `key`/`keyCode`。
- [x] 输入区元素可更换或解除而键盘源身份不变；旧元素监听全部移除，资格随之变化；注册失败不残留注册。
- [x] 现有分类与按住轴的行为不变（回归测试通过）。
- [x] `pnpm exec vitest run src/platform/input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 以最小宿主的 Node 测试覆盖字段、绑定更换、监听平衡与回滚。

## 完成证据

- **契约（[keyboard-input.ts](../../../../../src/platform/input/keyboard-input.ts)）：** `KeyboardInput` 增加 `shiftKey`、`altGraph`、`numLock`，`normalizeKeyboardInput` 复制并冻结全部十个字段。浏览器事件的读取放在 DOM-free 的 `readKeyboardEvent(type, event)`：显式读取各字段（DOM 事件的字段是原型 getter，不能展开），`altGraph`/`numLock` 取 `getModifierState('AltGraph')`/`('NumLock')` 的报告值，不读 `key`/`keyCode`；浏览器连接调用它，Node 测试因此无需导入 `browser-*`。`classifyKeyboardInput` 与 `HeldKeyboardAxis` 未改动，平台层仍不识别游戏动作。
- **输入区绑定：** `KeyboardSource` 保持只有 `connect`；新增 `KeyboardZoneBinding<Zone>` 的 `bind(zone | null)`，`createKeyboardSource` 与 `createBrowserKeyboardSource()`（不再接收元素）返回两者的交集，`Zone` 在浏览器为 `HTMLElement`。`bind` 是绑定到源的函数属性，可直接作为 React 回调 ref。连接前可先绑定，连接时登记；连接期间更换先在新输入区原子登记（失败回滚，仍为旧绑定、不发信号；回滚失败为 `RollbackError`），再使旧绑定失效、撤销旧监听，并向同一 sink 发 `bind`/`unbind` 信号（新增的 `KeyboardSignalType` 成员），解除后资格为假；旧监听撤销失败在信号送达后以 `AggregateError` 报告，sink 的异常一并保留。每次绑定一个新令牌，同一元素解除后再绑定时，旧回调（含撤销失败而残留的）仍无效；分派中被更换的输入区不再 `preventDefault`。释放与连接失败后 `bind` 无作用。宿主端口（[keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts)）分为 `readFacts(zone)`、`listenKey(zone, …)`、`listenZone(zone, 'focusin'|'focusout', …)` 与 `listenPage(…)`；资格规则不变，未绑定时为假且不读事实。
- **测试：** `pnpm exec vitest run src/platform/input`：2 个文件 58 个用例通过。[keyboard-input.test.ts](../../../../../src/platform/input/keyboard-input.test.ts) 覆盖十个字段的复制与冻结（`key`/`keyCode` getter 抛错）、原型 getter 形式事件的 AltGraph/NumLock 四种报告值与 Shift 的读取（只查询这两个修饰状态），以及 Shift/AltGraph/NumLock 对分类（keydown/keyup × repeat × bound × eligible 全组合）与按住轴无影响；原有分类与按住轴用例不变并通过。[keyboard-source.test.ts](../../../../../src/platform/input/keyboard-source.test.ts) 的宿主保留并投递每个登记过的回调，覆盖：绑定时恰 9 项登记与释放顺序、修饰状态冻结传递、未绑定时资格为假、A→B→null 的监听平衡（各输入区 4 项、页面 5 项）与信号、重复绑定当前输入区无作用、脱离对象调用 `bind`、同一输入区再绑定的旧回调无效、新输入区登记在 4 个位置失败的回滚与旧绑定保留、回滚失败的 `RollbackError`、旧监听撤销失败的 `AggregateError` 与信号先后、sink 异常、分派中更换、释放与连接失败后的 `bind`，以及原有的连接回滚、释放失败与资格用例。变异检查：去掉分派后的绑定检查、跳过旧输入区撤销、以元素身份代替绑定令牌、去掉源中的规范化，各自使相应用例失败。
- **工程检查：** `pnpm typecheck`、`pnpm exec eslint src/platform/input` 通过；`pnpm check`（typecheck、lint、6290 个用例、build）通过。机器负载约 40–75 时另有两次 `pnpm check` 各出现无关用例的超时（第一次 `tools/package-check.test.ts`、`tools/e2e-configuration.test.ts`、`image-payload.test.ts`，第二次 `tools/engineering-boundaries.test.ts`），这些文件单独重跑全部通过。
- **Rubber-duck：** 无阻塞问题；唯一建议是 `bind` 依赖 `this`，不能直接作为回调 ref。已改为绑定的函数属性，并加脱离对象调用的用例。
- **Simplify：** 采纳：`KeyboardSource` 恢复为非泛型、绑定拆为 `KeyboardZoneBinding<Zone>`；`bind` 的信号送达合为一个 try/catch；`readKeyboardEvent` 不再冻结，由源统一规范化（测试宿主改为投递未冻结输入）；删去测试中多余的 getter 与过细的读取轨迹断言。未采纳：复用 `render/scene/cleanup.ts` 的 `attemptAll`（platform 依赖 render 会倒置层次）；以三态 sink 代替 `#connected`（沿用已有状态结构）；把 `readKeyboardEvent` 移入 `browser-*`（Node 测试不导入浏览器连接）；把 `bind`/`unbind` 合为一个信号类型（两者对诊断有用，sink 只看 `eligible`）；缩减全组合回归用例（成本低，直接覆盖“行为不变”）。
- **文档影响：** 需更新、归[子任务 32](./32-comparison-docs.md)：[键位文档 §3](../../../../engineering/keyboard-input.md#3-平台键盘源的通用规则)的“识别”（事件现携带 Shift、AltGraph、NumLock；通用分类仍不使用它们）、“资格”（须已绑定输入区）、“登记与释放”（输入区绑定的更换、解除、原子登记与信号）；[工程约定的键盘源与输入区](../../../../engineering/README.md#键盘源与输入区)与 [platform 模块说明](../../../../engineering/modules/platform.md#键盘源)中浏览器连接不再接收元素、改为 `bind`。本子任务的写入范围不含这些文档，未编辑。
