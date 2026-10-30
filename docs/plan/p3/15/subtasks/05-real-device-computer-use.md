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

- [x] AC-05（agent 部分）：上列每项都有实测结果与输入路径记录，或明确列为交 06 的残余项及原因。
- [x] 每项结果与 P3-05 已批准契约一致；不一致项记录现象并作为差异交回 P3-05 的责任模块。
- [x] 没有以合成事件作为通过证据；仓库未加入截图或私有记录。

## 验证方法

- Computer Use 操作本机 Chrome；每项先做正对照确认输入确实到达页面，再记录原生结果。锁屏、权限缺失或 Computer Use 不可用时 blocked，写明受影响项与恢复条件。

## 完成证据

**2026-10-29，协调者执行。** 被测代码为 main `2c393eec`（自 `8bebe9ad` 起只有 P3-15 文档变更）；macOS，Chrome 156.0.8078.74，隔离临时配置文件，开发服务器 `127.0.0.1:5115`，合成任务（`mission-startable` 场景的合成光盘，经正式导入页导入并保存，之后经 “Open saved resources” 恢复）。CDP 只用于准备（合成导入/恢复、程序化聚焦按钮）与只读观察（`Runtime.evaluate`，`userGesture: false`，读取事件日志、按键/全屏/锁定/可见性监听与 `data-tick`）；**所有被测输入都由 Computer Use 产生**。逐步读数与导出的录制只在 `local/research/p3-15/real-device/`（`steps.log`、`run-2026-10-29b.md`、`exports/`）。第一次尝试因用户正在使用桌面而停止（见 goal 执行记录），本次在用户告知桌面空闲后完成。

**输入路径正对照：** 主菜单上 Computer Use 的 Cmd+L 选中了地址栏（原生快捷键处理）。开始页上以 Computer Use 的 Return 按下 Start：同一手势进入文档全屏（`fullscreenchange` → true，Chrome 显示普通 “press esc” 提示），之后 `running`、焦点在 `game-input-zone`。

| 项 | 输入与状态 | 观察结果 | 结论 |
|---|---|---|---|
| Keyboard Lock 获得 | 全屏、running、焦点在输入区；Cmd+L | 页面收到 `KeyL`+Meta 的 keydown，焦点仍在 Game controls，地址栏未显示/未选中（全屏工具栏仍在屏外） | 只证明活动锁截获了 `KeyL`（不读内部锁状态）；绑定码的完整范围与排除项见残余 |
| F1 | 同上 | keydown/keyup 被阻止；`cockpit-front` → `rejected`/`not-implemented`（tick 1224） | 符合 P3-05；F1 的 Core 效果缺口为既有已知项，见 09 |
| F2–F10 | 逐个按，读数间隔 > 3 s（`GAP_NOTICE_MS`） | 每个都被阻止、各自出现新的 G-08 提示、无命令；F6 未触发 Chrome 的焦点切换，F10 的新提示已区分 | 符合 |
| F11 | 同上 | 被阻止，G-10 提示，无命令 | 符合 |
| Space | 同上 | 被阻止；录制中为 `fire`/`secondary`，accepted，`shot-fired`（导弹） | 符合 |
| Backspace | 同上 | 被阻止（未触发后退导航）；录制中为 `speed`/`maximum`，accepted | 符合 |
| Slash | 同上 | 被阻止；`cycle-main-weapon` accepted，`weapon-selected` | 符合 |
| Shift+Slash | 同上 | 未阻止、无命令（不切武器） | 符合 |
| Ctrl+Enter | 同上 | 被阻止；录制中为 `speed`/`toggle-auto-match`，accepted，`speed-assist-toggled enabled=false` | 符合 |
| `BracketRight`/`Semicolon`/`Backquote`/`Quote` × {无, Shift, Ctrl, Ctrl+Shift} | 16 次单击（Computer Use 每次按下与松开在数毫秒内） | 16 次全部被页面阻止；导出录制中落在 tick 采样上的三次：BracketRight 族 → pitch −1（tick 6173），Ctrl+Shift+Backquote → roll −1（tick 7020），Ctrl+Quote → roll +1（tick 7300），其余轴为 0，Shift 未改变轴。其余单击短于一个 tick，未进入任何 tick 的电平 | 已观察部分符合；持续按住的逐 tick 轴与 Shift 并用的完整归因交 06 |
| Option+方向键与开火 | Computer Use 的 `alt+Up`、`alt+Left`、`alt+space` | 页面只收到带 `altKey` 的方向键/Space，没有独立的 Alt keydown；ArrowUp → `cockpit-front` rejected/not-implemented，ArrowLeft → G-08，Space → `fire` ignored/`no-target`；录制中没有主炮电平 | Computer Use 不能产生独立的 Option 电平；Option 开火电平及与方向键并用交 06 |
| 暂停后解锁与原生快捷键 | `p` 暂停（tick 9552）；Cmd+L、Cmd+T、Cmd+W | Cmd+L 选中地址栏（页面 keydown 未被阻止）；Cmd+T 打开新标签页（失焦、退出全屏、hidden）；Cmd+W 关闭后 visible、focus；运行保持 paused 于 tick 9552 | 符合：暂停后锁释放，非游戏快捷键保持原生 |
| 离页确认 | 有运行（paused）时 Cmd+R | 出现模态的离页确认；Escape 取消后页面未重载、运行仍在 tick 9552 | 符合 |
| 离页确认（无运行） | 经任务菜单返回主菜单后 Cmd+R | 立即重载，无对话框 | 符合 |
| 地图与 Pointer Lock | `p` 继续，`m` | `toggle-map` accepted、`map-toggled open=true`（tick 9646）；按键手势即获得 Pointer Lock（Chrome “To show your cursor, press esc”） | 符合 |
| 锁定时 Escape | 地图、已锁定 | 浏览器解除锁定（`pointerlock:false`），页面未收到 keydown，无 `map-toggled`，地图保持 | 符合；“按住的输入被清除”需持续按住，交 06 |
| 未锁定时 Escape | 地图、未锁定 | `toggle-map` → `map-toggled open=false`（tick 10128） | 符合 |
| 锁定下的真实点击 | 再按 `m`（重新锁定），Computer Use 在地图区内单击 | 两条 `map-point`（hover、select）accepted，`warp-destination-set`（tick 10766） | 符合 |
| 飞行中 Escape | 关闭地图后的飞行中 | 打开 Mission menu（Paused by you） | 符合 |

**交 06 的残余：** 物理 Fn+F1–F11 途径；持续按住项目操纵键（含 Ctrl 横滚、Shift 并用）直到逐 tick 读出并松开归零；按住左/右 Option 的主炮电平与方向键、Space 的并行；锁定地图中按住某键时原生 Escape 解锁后输入被清除；Keyboard Lock 对其余绑定码（含 Ctrl/Alt 组合）的截获，以及 Escape/Tab/Meta/F12 不被锁定的观察；打开任务菜单与运行中失焦时的解锁（本次只观察了暂停后的解锁）；地图自绘光标的可见、随锁定移动与四边钳制（本次只观察到锁定下单击产生 `map-point`，未单独观察光标）。前四项因 Computer Use 只能产生瞬时按键、不能产生独立修饰键电平或物理 Fn；后三项需要人在场观察画面与原生行为。

**已测各项未发现与 P3-05 契约不一致的结果**（结论只覆盖上表已测项，不含残余）。 没有使用 Playwright/CDP/`dispatchEvent` 产生被测输入；仓库未加入截图或私有记录（`local/` 被忽略）。私有原始记录 `steps.log` 已补入开始手势、活动锁 Cmd+L、F1–F3、飞行中 Escape 与无运行时重载的读数。

**Rubber-duck：** 一次审查提出 4 个阻断与 1 个非阻断问题，均已处理：补齐私有原始记录；将 Keyboard Lock 结论收窄为 `KeyL` 截获，并把绑定码范围/排除项、菜单与失焦解锁、地图自绘光标加入交 06 的残余；Backspace/Ctrl+Enter/Space 以录制中的命令参数（`maximum`、`toggle-auto-match`、`secondary`）佐证。

**文档影响：** 只新增本项实机证据；键位指南与模块说明的描述与观察一致，无需修改。
