---
type: plan
status: active
phase: P3
task: "05"
subtask: "30"
updated: 2026-10-11
---

# 30 — 本机 macOS Chrome 实机核对（Computer Use）

**契约来源：** [spec](../spec.md) 的[验证策略](../spec.md#验证策略)“实机/原版对照”、[页面层拦截](../spec.md#页面层拦截)、[全屏与 Keyboard Lock](../spec.md#全屏与-keyboard-lock)、[战略地图输入](../spec.md#战略地图输入)“退出与恢复”；S-08、S-11、S-12 的实机部分；AC-18，以及 AC-09、AC-14 的实机部分。
**依赖：** 25、27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在本机 macOS Chrome 中打开开发服务器的合成任务（及 27 的隔离地图入口），用 Computer Use 产生输入。先核实工具的输入路径：在未启用游戏拦截时，用一个安全的原生快捷键作正对照，确认该路径经过浏览器/系统的原生快捷键处理；只有经过核实的路径才算实机证据。工具名、`isTrusted` 或页面收到事件本身不足以证明。
- 逐项核对并记录：F1–F11（含 Fn 途径的可达性）、Space、Backspace、Slash 与 Shift+Slash、Ctrl+Enter、Ctrl+I/J/K/L（或 08 定稿的操纵键）、Option+方向键及开火并用；原生 Esc 解除 Pointer Lock 后地图仍开且按住被清除；实际解除 Keyboard Lock 后非游戏的 Cmd/Ctrl 快捷键保持原生行为。每项记录输入产生路径、实际快捷键结果、全屏/锁定事实与应用动作。
- 浏览器的全屏、Keyboard Lock 或 Pointer Lock 权限提示须按 Computer Use 的批准规则先取得用户确认后再接受；不改变操作系统快捷键设置来制造通过。
- 工具无法产生的物理 Fn、持续按住与系统级路径列为残余项交 31，不以合成或背景定向事件判为通过。跨系统矩阵归 P5。

## 不包含

- 物理键盘上的残余项（31）；Windows/Linux 与其他浏览器（P5）。

## 关键文件与契约

- 25 的装配、27 的隔离入口；[键位文档](../../../../engineering/keyboard-input.md)（结果由 31/32 写入）。

## 写入范围

- `local/research/p3-05/real-device/**`：截图与操作记录（只含本项目画面，不入库）。

## 验收标准

- [x] 输入路径已以正对照核实；每个 AC-18 条目均有实测结果，或明确列为交 31 的残余项及原因。
- [x] 原生 Esc 解锁与 Keyboard Lock 解除后的快捷键行为有实机结果。
- [x] 权限操作遵守 Computer Use 的批准规则，记录用户确认；本次未出现权限提示，未执行权限操作。

## 验证方法

- 逐项表格：条目、输入路径、快捷键结果、全屏/锁定状态、应用动作、结论。

## 完成证据

- `local/research/p3-05/real-device/worker-30-input-check.md` 记录 macOS Chrome 155 的合成任务输入表、浏览器正对照、锁状态事实与残余项。Computer Use 的 `Cmd+L` 正对照选中地址栏；暂停后 `Cmd+L` 与 `Cmd+T` 分别触发原生地址栏与新标签页行为。
- 合成任务在开始手势后进入全屏；Keyboard Lock API 可用，但活动锁状态不可读，因此不声称已实际锁定或已从活动锁解除。原生 Escape 解除了地图 Pointer Lock 且地图保持打开；暂停后的 Cmd+L/Cmd+T 实测为浏览器原生动作。活动 Keyboard Lock 的获得及其解除路径证明留给 31，按其可观察退出提示核对（全屏锁定活跃时应出现 “Press and hold Esc to exit”，未锁时为 “Press Esc”），不得把本次暂停快捷键结果当作活动锁已确认。
- 已用 Computer Use 实际获得 Pointer Lock 并按 Escape 解锁：地图保持打开、指针返回、仅记录一次 `clear-input pointer-lock-exit`；下一次点击才重新锁定且未选择目标。未锁定时地图 Escape 关闭路径尚未检查。
- Space、Backspace、Slash、Shift+Slash、Ctrl+Enter 与 F1–F11 的可观察结果及未确认项均列入本机记录。物理 Fn、持续按住、未完成的操纵/Option 组合、F10 独立结果、未锁地图 Escape 与 Keyboard Lock 实际获得/解除的证明交 31 继续核对；其中 F10 旧 G-08 提示未能区分新结果。逐项按键和观察步骤见本机记录中的“交 31 的可执行残余清单”。
- Chrome Computer Use 在聚焦游戏区后连续两次因检测到用户输入而中断 ArrowUp 操作；重新读取窗口状态后停止对 Chrome 输入，避免干扰正在进行的用户操作。该操作及所有未测项均未以 Playwright/CDP 输入替代实机证据。
- Rubber-duck：审查未发现需修改的实质问题；未测试项与活动 Keyboard Lock 状态的不确定性均明确保留为残余。
- 文档影响：仅补充本项实机证据；无代码、接口或操作规程变化，未发现需要同步其它维护文档。
