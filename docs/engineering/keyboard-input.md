---
type: guide
status: active
phase: P3
updated: 2026-10-12
related: [ADR-0004, ADR-0018, U-011, U-012]
---

# 键盘输入与键位绑定

本文是当前构建的游戏输入与键位绑定权威说明。原版事实只在[原版键位冲突表](../original/input/key-map.md)维护；这里记录项目绑定、实现边界、浏览器能力、已知差异与验证状态。绑定契约见 [P3-05 spec](../plan/p3/05/spec.md)，源码落点见[源码结构指南](./source-structure.md)。

> **实现状态：** P3-05 已接通任务游戏输入区、生产绑定表、能力申请和地图输入。Core 仍按各任务逐步接入规则；键盘已到达命令消费者不等于所有动作已有玩法效果。P3-07 的目标、武器和能量实现尚未合入当前分支，相关原版事实保留对 `p3-07-weapons-damage-spec` 分支的交叉引用。

## 1. 适用范围

任务画面只有一个游戏输入区 `GameInputZone`（`data-testid="game-input-zone"`，在 `mission-screen` 内）。菜单、开始配置、任务菜单、诊断面板、导入页与资源查看器不接收游戏绑定；普通控件仍使用浏览器原生键盘操作。输入区失去焦点时显示非模态提示；F2–F10、`A`、F11 等 G-08/G-09/G-10 暂缺项显示约 3 秒的标注，不改变焦点或暂停。

```text
任务输入区的键盘源 → game-input 的绑定解析/按住状态 → 连续意图或命令反馈
                                            ↘ 能力与地图输入
任务所有者 input 阶段持有输入消费者 → 游戏会话/Runtime → Core
```

- 平台源只采集 `KeyboardEvent.code`、repeat、Shift/Ctrl/Alt/Meta、AltGraph、NumLock 与输入法状态；不以 `key` 或 `keyCode` 推断字符。游戏消费者按最新完整 projection 的会话状态与 `player.interactionContext` 解析输入，不读降频 UI store。
- 只有 running 接收游戏意图与命令；paused 时仅处理 `p` 等宿主控制。意图只在轴或主炮电平变化时写入；离散命令通过现有 `GameCommandFeedback.submit` 进入命令队列并显示拒绝/队列满反馈。
- 消费者是所有者级资源：同一任务所有者内跨重开复用一个键盘源，运行帧、状态与取消订阅按 run 注册并随运行结束清理。所有者释放先使回调失效，再撤销监听和能力。

## 2. 当前绑定表

生产数据在 [bindings.ts](../../src/ui/game-input/bindings.ts)，逐组合矩阵测试在 [bindings.test.ts](../../src/ui/game-input/bindings.test.ts)。表内 `code` 是物理位置，不是字符；未列组合不匹配、不拦截。原版证据和仍未确认的物理路径见[键位冲突表](../original/input/key-map.md)。

| 位置与组合 | 交互上下文 | 项目动作 | 来源 |
|---|---|---|---|
| `BracketRight` / `Semicolon`；Shift 与 Ctrl 可并用 | flight、warp | 俯仰 −1/+1 | 项目操纵键；ADR-0018 |
| `Backquote` / `Quote`；Shift 可并用 | flight、warp | 偏航 −1/+1 | 项目操纵键；ADR-0018 |
| Ctrl+`Backquote` / Ctrl+`Quote`；Ctrl+Shift 亦可 | flight、warp | 横滚 −1/+1 | 项目操纵键；ADR-0018 |
| `AltLeft` / `AltRight` | flight | 按住主炮电平；任一有效 Alt 仍按下即为真 | 原版绑定，AltGr 有专门归一化 |
| `Space` | flight | 发射副武器；重复按下可重复提交 | 原版绑定 |
| `Equal`、`NumpadAdd`（Shift 可并用）；`Minus`、`NumpadSubtract`（后者 Shift 可并用）；`Backslash`；`Backspace`；Shift+`Digit0` | flight | 速度增、减、归零、最大值 | 原版绑定 |
| Shift+`Digit1`–`Digit9`；Shift 可有可无的 `NumpadMultiply` | flight | `speed-preset` 1–9；小键盘乘号为档位 8 | 原版绑定 |
| 未修饰 `Digit1`–`Digit9`、数值态小键盘 `Numpad1`–`Numpad9` | flight | `select-number`，仅由通讯菜单按其实际菜单项捕获；普通飞行中不改速度 | 原版绑定 |
| `Enter` / `NumpadEnter`（无 Ctrl，可带 Shift）；Ctrl 或 Ctrl+Shift+Enter | flight；前一组亦可在 base | 确认/匹配选择；Ctrl+Enter 切换速度辅助 | 原版绑定 |
| `KeyT`、`KeyF`、`KeyR`、`KeyY`、`KeyU` | flight | 敌/友目标模式、下一个/上一个目标、前向目标 | 原版绑定；目标效果待 P3-07 合入 |
| 未修饰 `/`；`,` / `.`（Shift 可并用）；数字态 `NumpadDecimal`（Shift 与 NumLock 状态相异） | flight | 主武器循环、选择上一/下一导弹 | 原版绑定；武器效果待 P3-07 合入 |
| `KeyE`、`KeyS`、`KeyG`、`KeyD` | flight | 能量页、护盾/炮能量增减、损伤报告 | 原版绑定；规则效果待 P3-07 合入 |
| `KeyM` | flight、map、base | 开关地图（基地仅限战役的原版情形） | 原版绑定 |
| `KeyW`（无 Shift 或 Shift） | flight、map | 请求 Warp | 原版绑定；执行门禁归 P3-09 |
| `KeyC`、`KeyX` | flight | 打开/关闭通讯菜单 | 原版绑定；菜单行为归 P3-10 |
| `KeyL`；`ArrowUp` / `ArrowDown` | base | 离港；基地服务列表向上/向下导航（可重复） | 原版绑定；服务规则归 P3-10 |
| `F1`、`ArrowUp`、Shift/NumLock 状态相同的 `Numpad8` | flight；`Numpad8` 在 base 同状态下另作向上导航 | 前视驾驶舱 | 原版绑定 |
| `F2`–`F10`、`Home`、`PageUp`、`ArrowLeft`、`ArrowRight`、`ArrowDown`；Shift/NumLock 状态相同的 `Numpad7/9/4/5/6/2` | flight | G-08 标注，不提交命令 | 原版视角键；表现缺省项 |
| `KeyA`、`F11` | flight | G-09、G-10 标注，不提交命令 | 原版功能暂缺 |
| `KeyP`（可带 Shift；不带 Ctrl/Alt/Meta） | 所有游戏输入上下文，包括 paused | 任务所有者暂停/继续控制 | 项目宿主控制 |
| `Escape` | flight、warp、base；map 中未锁指针 | 打开任务菜单；地图中关闭地图 | 前者为项目适配，后者与原版 Q-02 一致 |
| 数值态小键盘 `Numpad1`–`Numpad9` / 状态相同态小键盘键 | flight/base | NumLock 与 Shift 状态不同表示数字；相同态下的 `Numpad8` 前视/基地上导航、`Numpad2` 地图 G-08/基地下导航，其余已列视角键为 G-08 | 原版扫描码语义 |
| 鼠标输入 | map | 地图 hover、select 与按住左键重复；见 §6 | 原版地图行为，项目换算与输入策略 |

表格是生产绑定的高层索引；精确 modifier 状态、重复标志、动作对象与上下文按 [bindings.ts](../../src/ui/game-input/bindings.ts) 及其矩阵测试为准。`KEYBOARD_LOCK_CODES` 从实际绑定 code 与 Ctrl 修饰码推导，去除浏览器不能锁定的 Escape、Tab、Meta 与 F12。

**小键盘与未绑定组合：** `Numpad1/3/0` 与小键盘导航/编辑扩展码按表处理，不根据键帽文字猜测。NumLock 与 Shift 不同才匹配通讯数字或 `NumpadDecimal` 导弹；状态相同匹配 `Numpad8` 前视/基地向上导航，以及 G-08 的 `Numpad7/9/4/5/6/2` 或基地向下导航。Ctrl+未绑定键、Shift+Slash（`?`）、作弊键和未列的小键盘组合没有游戏动作，保持浏览器行为。

**原版事实与项目选择：** 俯仰/偏航标点、Ctrl 横滚以及 Alt 可与其他项目动作并用，是项目方案，不是原版键位。检查点 K 排除 I/J/K/L，因为它们在原版处理或通讯菜单中有用途。Shift+Slash 不绑定；Slash 仅无修饰时循环主武器。键位冲突表保留 P3-07 交叉引用：目标 T3、武器 W3、能量 D10/D15 与 P3-02 CR-05 仍指向分支 `p3-07-weapons-damage-spec` 的提交 `589d780b`，未复制其事实，也未改成已合入链接。

## 3. 平台键盘源的通用规则

实现由 [keyboard-input.ts](../../src/platform/input/keyboard-input.ts)、[keyboard-source.ts](../../src/platform/input/keyboard-source.ts) 与 [browser-keyboard-source.ts](../../src/platform/input/browser-keyboard-source.ts) 分工；通用约定与监听归属见[工程约定](./README.md#键盘源与输入区)。

- 只在源有效、页面可见且未被 pagehide 阻断、窗口有焦点、`document.activeElement` 正是输入区时合格。容器拥有 keydown/keyup/focusin/focusout；window 处理 focus/blur/pagehide/pageshow，document 只处理 visibilitychange；不设焦点陷阱，也不在 window/document 上监听按键。
- 新的非 repeat keydown 才启动动作。符合绑定资格的按键事件会按拦截规则阻止默认行为；repeat 不创建动作，但可被拦截。keyup 按 code 释放本地状态，即使当时带修饰键或处于输入法组合。
- 未修饰键以 `code` 匹配；Shift、有效 Ctrl 与 NumLock 按绑定表匹配。Ctrl、Alt、Meta 或输入法组合通常不产生绑定，保留原生快捷键；本项目明确绑定的 Ctrl 组合和 Ctrl 横滚除外。AltGraph 会抑制可能由它合成的 CtrlLeft；不确定左 Ctrl 来源时不执行横滚/快捷键。
- 同一轴的正反键同时按下为 0。失去资格、上下文切换与清键后，repeat 不能重建已释放状态；恢复必须有新的非重复按下。

只有绑定表中标为 repeatable 的离散命令重复：副武器、速度增减、目标下一个/上一个、导弹上一项/下一项、能量调整，以及基地列表导航。首次新按下立即提交；运行时钟到首次按下后 32 单位才重复，之后按观察到的重复时钟每 16 单位一次。只在 running 的帧观察、每个按键每帧最多一次，迟帧不补发；没有 timer、逐 tick 回调或第二条 rAF。速度档位、其他单次命令、G-08 标注与暂停控制不属于此重复器。该节奏是项目选择，不是 BIOS 延迟或 DOS 轮询周期。

## 4. 活动界面与焦点

输入区仅位于任务画面的游戏区域，浏览器控件和系统页面快捷键不属于游戏动作。焦点不合格时，running/paused 状态显示“点击游戏区域”提示；提示 DOM 常驻且仅视觉隐藏，避免出现/消失造成页面布局移动。G 项与能力、地图提示由 `InputNotices` 展示；Alt+F4 风险提示按平台显示，不声称能够拦截系统关闭快捷键。

`preventDefault()` 只说明网页默认行为被阻止，不等于浏览器进程或操作系统快捷键被拦截。合成按键、Playwright/CDP 事件与页面收到事件都不能证明原生快捷键行为；浏览器层验证与实机边界见 §7 和[本地浏览器 runner](./README.md#本地浏览器-runner)。

## 5. 输入清除与恢复

**运行的每次输入清除都必须通过 `GameInputConsumer.clear(reason)`。** 包括能力控制器退出全屏时的 `focus-loss`、Pointer Lock 结束时的 `pointer-lock-exit`，以及地图输入的退出清键；不得让 P3-05 消费者外的调用绕过该入口直接调用会话清键。这样既清本地按住/重复/地图手势，也在 running 时清 Runtime 意图、短按标记与未执行命令。

- 用户暂停、任务菜单、页面 hidden/pagehide、运行结束或替换时由会话自行清 Runtime；输入消费者收到这些状态/取消通知时只清本地状态，不递归调用会话控制。hidden 与 pagehide 仅本地清理。
- blur、focusout 或其他使输入资格变假的窗口事件会清本地状态；若仍 running，则经 `clear('focus-loss')` 一次清会话。Pointer Lock 从本任务锁定态退出时经 `clear('pointer-lock-exit')`。
- 清除后不恢复手动轴、Alt 开火、按住左键或重复命令。继续、重新聚焦、visible/pageshow、Pointer Lock 重锁和新运行仅重新开放通道；须新的非重复 keydown/鼠标按下才能产生输入。Core 已接受的速度或速度辅助状态不会由清键回滚。

## 6. 能力与战略地图输入

### 全屏、Keyboard Lock 与 Pointer Lock

`GameInputConsumer.capabilities` 由 [capabilities.ts](../../src/ui/game-input/capabilities.ts) 实现，三种能力状态是 `unsupported`、`idle`、`pending`、`active`、`failed`，并带 ownerId、runId、请求代次与稳定失败类别。状态基于真实文档/平台端口事实，不以 API 存在或 Promise 成功冒充活动状态。

- 开始按钮的用户手势可同步请求全屏；只有该次 start 成功后才将申请关联到新 run。能力控制器只退出本任务自己进入且仍拥有的全屏。Keyboard Lock 只在 API 全屏、running、输入区合格且无未结全屏变更时锁绑定表中的 code；暂停、失焦、菜单、停止、离页或离开全屏时立即解锁。失败不自动重试，须新的明确手势。
- 全屏或 Pointer Lock 退出造成的运行清键必须走 §5 的 `GameInputConsumer.clear(reason)`。Pointer Lock 的目标是被测量地图 frame 的同一无边框、无内边距输入容器；所有权、申请代次、迟到结果与异步释放屏障由能力控制器管理。
- `Escape` 不在 Keyboard Lock 清单中。锁指针时 Escape 仅交浏览器解锁；接收到 Pointer Lock 结束通知后，地图仍开，须再点击显式重锁，不选目标。

### 地图鼠标与光标

[map-input.ts](../../src/ui/game-input/map-input.ts) 将地图上下文的指针输入转成 `map-point`，不把地图规则放进 React 或 Core 外部。地图状态在 `InputStatus.map`：`off`、`invalid`、`not-ready`、`suspended`、`click-to-lock`、`locking`、`locked`、`unlocked`；同时提供 `systemPointerHidden` 与几何错误。策略是注入项，生产选择见 [map-input-policy.ts](../../src/ui/game-input/map-input-policy.ts)：每次打开按原版起点公式初始化，左键按住重复间隔为 8 个 projection clock 单位；策略无默认回退值。

- 输入位置为主地图内归一化的 `{ right, down }`，几何由呈现所有者经 [map-input-geometry.ts](../../src/render/map/map-input-geometry.ts) 提供；屏幕像素、主地图边界与逻辑画面在容器 content-box 中的 CSS 像素 frame 共用同一只读几何。零尺寸/缺几何为未就绪，非法几何显式报错。
- 锁定态用平台相对移动，乘注入的 `movementScale` 转成 CSS 像素后钳制到主地图；非锁定态在支持或申请失败时用地图内的绝对位置回退，区域外/黑边不选取并显示系统指针。`movementScale` 依据引擎报告单位选择（CSS px 时为 1，device px 时为 1/devicePixelRatio）。
- 合格时如仍有用户激活则申请 Pointer Lock，否则提示点击锁定。普通移动只保留最新 hover，每个 running 帧至多提交一次；左键新按下先补同点 hover 再 select，按住按策略间隔重复，每帧至多一次且不追赶。锁定/聚焦点击只建立锁，不选目标；右键无项目动作。
- [map-cursor.ts](../../src/render/map/map-cursor.ts) 绘制本项目的十字光标，只绘制、不持有规则或调度；这不是原版选取框外观。几何测量容器必须与 Pointer Lock 目标一致。

### 对照差异与下游责任

项目明确不仿真 DOS 单键轮询/丢键与 BIOS 按键重复：采用逐 tick FIFO 命令队列和帧后有界 32/16 时钟单位重复。上下文切换不保留手动输入；Alt 是可与其他绑定并行的主炮电平；`p`/Shift+`P` 是项目暂停控制，不复现原版屏幕闪光差异；被毁序列仍可用宿主暂停；Esc 遵从 Pointer Lock 浏览器解锁语义；地图 select 在新按下时立即入队、不丢轮询间短按，hover 按帧刷新，地图关闭/暂停/解锁时的指针移动不累计，重锁不延续左键按住。项目操纵轴在地图与基地为 0。Q-06 的重复数值只属于配置/模拟器源码推导，不是真实持续按住样本。完整逐项证据与置信度见[原版键位表](../original/input/key-map.md)及 [P3-05 R-23](../plan/p3/05/spec.md#对照r-23)。

下游交接：

- **P3-09：** 同 tick 打开地图时飞行命令门禁；地图状态与 `map-point` 的效果；飞行命令地图门禁、地图初始 Core 光标点、位置像素量化、按住 select 效果与音效。
- **P3-10：** 通讯菜单对数字/命令的捕获优先级、菜单行为与基地服务队列/离港规则，并处理规则 5 的阻塞项；目前绑定只负责按码提交，不宣称该规则已实现。
- **P3-13：** 生产地图几何、地图指针与原版外观；接通完整画面时核对与输入共同使用的 geometry/container。
- **P3-15：** 真实任务完整地图路径及输入层/Core 联合复验，包括地图上下文、同 tick 门禁、指针合成和清键。

<a id="7-尚未实现的键盘能力"></a>

## 7. 验证范围与未完成项

**页面与自动化：** P3-05/28 在 macOS Chrome 的 development 与 production 使用合成内容验证焦点、动作、页面拦截、资源平衡、全屏/Keyboard Lock 提示与录制；P3-05/29 验证键盘驱动录制与 replay。合成输入只证明网页逻辑，不代表系统级快捷键通过。

**隔离地图入口：** P3-05/27 的 `/e2e/entries/map-input.html` 只在开发服务器提供，不是正式任务地图路径；现使用唯一生产绑定表，几何及地图上下文仍为合成。加 `?manual=1` 后可点击 **Open unlocked map**：输入区自动聚焦，等待光标后按 Escape，再点击 **Refresh observations** 读取快照；**Close test session** 回收本次会话。按钮和观察快照只存在于该开发入口，不改 Core 或正式地图。页面收到的 Escape 按生产绑定关闭地图；Playwright 合成键不证明浏览器原生解锁或系统快捷键行为，原生证据见 [37](../plan/p3/05/subtasks/37-native-input-residuals.md)。Chrome headless 下，HTTP origin 上隔离 context 支持真实 Pointer Lock；`about:blank`/`setContent` 会遇到 `WrongDocumentError`。入口用 CDP `Runtime.evaluate` 并显式 `userGesture: false` 驱动观察钩子，避免 Playwright 的 evaluate、locator 或截图留下用户激活，误改变自动锁定路径。`pointer-lock` 监听独立计组；预热使用 `./e2e/entries/*.html`。具体像素、锁定、回退和资源平衡证据见 [27 完成证据](../plan/p3/05/subtasks/27-map-input-entry.md#完成证据) 与 [36 完成证据](../plan/p3/05/subtasks/36-production-map-input-entry.md#完成证据)。

**本机实机核对状态（P3-05/30、31、37）：**

| 项目 | 证据与当前结论 |
|---|---|
| 30：macOS Chrome Computer Use | 原生 Cmd+L 正对照进入地址栏；暂停后 Cmd+L/Cmd+T 分别执行浏览器原生行为。Escape 实际退出 Pointer Lock，地图保持打开且只触发一次 `clear-input(pointer-lock-exit)`。本次未能观察活动 Keyboard Lock 状态，不宣称已验证其解除。 |
| 地图移动单位 | 27 的 CDP 注入鼠标输入在 Chrome 155、DPR 1/2 报告 CSS 像素位移；这不是物理鼠标单位证据。 |
| 31：物理设备结果 | **待用户执行，subtask 31 blocked。** 物理 Fn、持续按住、操纵标点/Option 组合、活动 Keyboard Lock 获得与解除、未锁定地图 Escape 等残余项尚无用户实机结果；AC-18 不得据此标为完成。 |
| 37：残余项补证 | [37 的原生/物理证据](../plan/p3/05/subtasks/37-native-input-residuals.md#完成证据)补齐 31 当时的三项缺口：生产绑定的未锁地图 Escape 关闭合成地图；全屏 Running 的原生 Cmd+L 被拦截，`p` 暂停后仍在全屏时同码恢复地址栏，再以 Cmd+T 打开原生标签；用户逐组 Option+↑/↓/←/→ 并轻点 Space，合格 replay 各有持续 primary 与一次重叠 secondary，轴为 0、释放后无开火。↑/← 的不合格初次尝试保留，原因未确认；单独复测通过。30/31/37 合并覆盖本机 AC-18，不外推其他平台或下游 Core 地图规则。 |
| Q-05 原版运行样本 | 06 样本全部只证明给定 BIOS 码到游戏动作；没有证明宿主物理键到扫描码。基地样本另由 34 阻塞，尚未达到门槛；Q-05 未整体完成。 |

残余项不得以合成按键、CDP 注入、页面 `isTrusted`、DOS 输入码注入或配置推导替代。跨操作系统与浏览器矩阵归 P5。

## 8. 项目界面按键

游戏输入区外的页面控件继续遵循原生键盘操作。G-02 占位的 Enter、Space、Escape 新按下跳过当前占位，repeat 只抑制重复激活；主菜单 Start mission 入口抑制 Enter/Space repeat。实现见 [page-keys.ts](../../src/ui/mission/page-keys.ts)。资源查看器的方向键旋转、`+`/`=`/`-` 缩放和 `0` 复位是独立诊断按键，见 [viewer-keys.ts](../../src/ui/viewer/viewer-keys.ts)；均不属于游戏绑定表。

<a id="资源查看器的诊断键p2-11"></a>
