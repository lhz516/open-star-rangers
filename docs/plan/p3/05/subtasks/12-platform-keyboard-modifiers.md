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

- [ ] `KeyboardInput` 携带 `shiftKey`、`altGraph`、`numLock` 且冻结；没有读取 `key`/`keyCode`。
- [ ] 输入区元素可更换或解除而键盘源身份不变；旧元素监听全部移除，资格随之变化；注册失败不残留注册。
- [ ] 现有分类与按住轴的行为不变（回归测试通过）。
- [ ] `pnpm exec vitest run src/platform/input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 以最小宿主的 Node 测试覆盖字段、绑定更换、监听平衡与回滚。

## 完成证据
