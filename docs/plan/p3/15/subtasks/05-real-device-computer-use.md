---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "05"
updated: "2026-10-29"
---

# 05 — 本机 Chrome 实机核对（Computer Use）

**契约来源：** [spec](../spec.md) 的 S-04、[行为与边界](../spec.md#行为与边界)“本机真实浏览器的输入与能力操作”；AC-05（agent 可达部分）。逐项范围取自 [P3-05 AC-18](../../05/spec.md#验收标准) 与其全屏/Keyboard Lock、Pointer Lock、离页确认契约。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在当前集成基线（记录提交）上启动开发或生产预览服务，于本机 macOS 有头 Chrome 的隔离配置文件中，以合成任务包进入正式任务流程。
- 用 Computer Use 产生经原生快捷键处理的键鼠输入，逐项核对：F1–F11、Space、Backspace、Slash 与 Shift+Slash、Ctrl+Enter、`BracketRight`/`Semicolon`/`Backquote`/`Quote`（含 Ctrl 横滚、Shift 并用）、Option 开火与方向键并用；全屏与 Keyboard Lock 的实际状态及暂停/菜单/失焦后的解锁；非游戏 Cmd/Ctrl 快捷键在解锁后保持原生；战略地图的 Pointer Lock 与自绘光标、原生 Escape 退出锁定后地图保持且按住清除、未锁定时 Escape 关闭地图；离页确认仅在有运行时出现。
- 每项记录：浏览器版本、平台、输入产生路径、实际原生结果、全屏/锁定状态与应用动作（UI 与开发日志）。参考 [P3-05/30](../../../../../docs/plan/p3/05/subtasks/30-real-device-check.md) 与 [P3-05/37](../../../../../docs/plan/p3/05/subtasks/37-native-input-residuals.md) 的方法，但结论只对本次基线成立。
- Computer Use 无法产生的项（物理 Fn 途径、持续按住、系统级组合等）逐项列为交 06 的残余及原因。

## 不包含

- 物理键盘上的残余项（06）；跨系统/跨浏览器矩阵（P5）。
- 以 Playwright/CDP/`dispatchEvent`、背景定向事件或 `isTrusted` 作为本项证据。
- 修改产品代码或浏览器/系统设置；需授予系统权限时按 Computer Use 规则交用户处理。

## 关键文件与契约

- [P3-05 spec](../../../../../docs/plan/p3/05/spec.md)、[键盘输入指南](../../../../../docs/engineering/keyboard-input.md)、[键位表](../../../../../docs/original/input/key-map.md)、[ADR-0004](../../../../../docs/decisions/ADR-0004-keyboard-mouse-original-keys.md)。

## 写入范围

- `local/research/p3-15/real-device/**`：私有记录与截图（仅合成内容画面）。

## 验收标准

- [ ] AC-05（agent 部分）：上列每项都有实测结果与输入路径记录，或明确列为交 06 的残余项及原因。
- [ ] 每项结果与 P3-05 已批准契约一致；不一致项记录现象并作为差异交回 P3-05 的责任模块。
- [ ] 没有以合成事件作为通过证据；仓库未加入截图或私有记录。

## 验证方法

- Computer Use 操作本机 Chrome；每项先做正对照确认输入确实到达页面，再记录原生结果。锁屏、权限缺失或 Computer Use 不可用时 blocked，写明受影响项与恢复条件。

## 完成证据
