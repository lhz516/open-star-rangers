---
type: guide
status: active
phase: P1
updated: 2026-10-10
related: [ADR-0004, U-011, U-012]
---

# 键盘输入与键位绑定

本文是本项目键盘输入的权威说明。内容包括当前构建的按键及其功能、触发语义、活动界面与焦点、页面层拦截、清键与恢复，以及尚未实现的键盘能力。

- 原版键位事实只在[原版键位冲突表](../original/input/key-map.md)维护。
- 默认键位政策见[总计划 §1.2](../plan/master-plan.md#12-首版交付范围)与 [ADR-0004](../decisions/ADR-0004-keyboard-mouse-original-keys.md)。
- 模块落点见[源码结构指南](./source-structure.md)，测试约定见[工程约定](./README.md)。

> **状态：当前实现说明。** 当前构建**没有游戏键绑定**。P1-09 的合成五键（方向键、`N`、`X`、`P`）及其输入区已随合成演示于 P3-04 退役（[退役记录](./source-structure.md#r6-合成-ui-层)），P1-09 的规则与证据只作为历史记录保留在 [P1-09 spec](../plan/p1/09/spec.md) 与其子任务中。原版键位由 P3-05 按原版逐项加入本文。本文现记录项目界面的按键（§2）、保留的平台键盘源通用规则（§3）、P3-05 接入时的焦点、拦截与清键约定（§4–§6）和尚未实现的能力（§7）。修改按键或行为须修订相应任务的契约并重新批准。

## 1. 适用范围

- **没有游戏输入区：** P3-04 的任务画面是正式运行骨架，飞行中没有任何游戏键。开发构建诊断面板的命令编辑器只能提交单个 Core 命令（[工程约定](./README.md#开发诊断与录制导出)）；Runtime 的连续意图（轴与按住开火）目前没有任何界面或输入来源，保持中性，由 P3-05 接入。P3-05 在任务画面中建立唯一的游戏输入区，经任务所有者的 `input` 阶段登记输入源，按原版键位逐项加入绑定。
- **React 画面：** 菜单、导入页面、任务页面与查看器的控件只使用浏览器原生的键盘操作（Tab、Shift+Tab、Enter、Space，单选组内的方向键），不属于游戏键绑定，见 [P1-08 spec](../plan/p1/08/spec.md)。
- **项目界面按键：** 任务流程有一组页面按键（§2），P2-11 的资源查看器有一组诊断键（[§2 之后的小节](#资源查看器的诊断键p2-11)）。两者都是本项目的界面按键，不是原版键位。

## 2. 当前绑定表

当前构建没有游戏键绑定。下表是 P3-04 任务流程的项目页面按键，判定在 [page-keys.ts](../../src/ui/mission/page-keys.ts)，按 `KeyboardEvent.key` 匹配：

| 位置 | 按键（`key`） | 效果 | 说明 |
|---|---|---|---|
| G-02 占位页（介绍 G-02/1、出发 G-02/2） | `Enter`、` `（Space）、`Escape` 的新按下 | 提前结束本占位一次，与 Skip 按钮相同，并阻止默认行为 | 监听只在占位页的区域上，离开即失效；同时按住 Control、Alt 或 Meta，或输入法组合中的按下，留给浏览器。占位计时失败后不能跳过，新的 Enter、Space 保留原生激活（`Return to main menu`） |
| G-02 占位页 | 上述三键的 repeat | 只阻止默认行为，不结束占位 | 上一页按住的 Enter 或 Space 不会结束本页，也不会反复激活获焦的 Skip 按钮 |
| 主菜单的 `Start mission` 入口 | `Enter`、Space 的 repeat | 只阻止默认行为 | 从任务画面按住返回键回到菜单时，repeat 不会再次进入任务 |

- **焦点：** 占位页打开时焦点在 Skip；开始配置、任务壳与任务菜单进入时聚焦标题，所以上一页按住的键不会落到这些页的按钮上。
- **没有其他页面按键：** 任务菜单没有页面级的快捷键：焦点在标题或其他非控件内容上时，`Escape`、`p`、`P`、Enter 与 Space 都不会继续运行；Tab 到 `Continue` 按钮后，Enter 与 Space 照常以原生方式激活它，经任务所有者先 resume 成功才关闭菜单。飞行中 `n`、`x`、`p` 与方向键没有效果，也不被拦截（浏览器验证见 [P3-04/10](../plan/p3/04/subtasks/10-e2e-mission-flow.md#完成证据) 与 [P3-04/12](../plan/p3/04/subtasks/12-e2e-shell-production.md#完成证据)）。
- **原版的 `p` 与 Esc：** 原版的 `p` 暂停与 Esc 选项页（[键位表](../original/input/key-map.md)）由 P3-05 映射到任务所有者的同一组意图（暂停、继续、打开任务菜单），不旁路菜单状态；`p` 在原版不轮询按键的阶段是否同样受限，也由 P3-05 决定。

### 资源查看器的诊断键（P2-11）

[P2-11 查看器操作](../plan/p2/11/spec.md#查看器操作)是本项目的诊断界面，不是原版键位。映射在 [viewer-keys.ts](../../src/ui/viewer/viewer-keys.ts)，按 `KeyboardEvent.key` 匹配：

| 按键（`key`） | 效果 |
|---|---|
| `ArrowLeft` / `ArrowRight` | 模型或效果绕竖直轴转 −15° / +15° |
| `ArrowUp` / `ArrowDown` | 绕水平轴转 −15° / +15° |
| `+` 或 `=` / `-` | 放大或缩小 1.25 倍，限制在初始取景的 1/8 至 8 倍 |
| `0` | 复位旋转与缩放 |

- **只在画面区域获得焦点时生效：** 监听只注册在 `viewer-view` 元素上，离开查看器时撤销；焦点在列表、按钮或其他控件上时，按键保持浏览器原生行为。
- **修饰键：** 同时按住 Control、Meta 或 Alt 时不处理，留给浏览器；处理的按键调用 `preventDefault()`。
- 改变画面的按键恰好绘制一次；不改变画面的（例如已在初始视角时按 `0`，或二维项上的旋转）不绘制。同样的操作也有按钮。

## 3. 平台键盘源的通用规则

P1-09 的 [platform/input/](../../src/platform/input/) 保留下列通用规则（[keyboard-input.ts](../../src/platform/input/keyboard-input.ts)、[keyboard-source.ts](../../src/platform/input/keyboard-source.ts)、[browser-keyboard-source.ts](../../src/platform/input/browser-keyboard-source.ts)）。当前没有消费者；P3-05 接入原版键位时沿用，需要改变的（例如 Alt 作为开火，见 §7）经其契约修订。合成五键的动作、可用性与反馈规则已随其消费者退役。

- **识别：** 事件只携带 `code`、`repeat`、Ctrl/Alt/Meta 与 `isComposing`，不读取 `key` 或 `keyCode`；键盘布局、大小写与 Shift 产生的字符不影响匹配，Shift 不参与匹配。
- **修饰键与输入法：** 按下时 Ctrl、Alt 或 Meta 任一处于按下状态，或 `isComposing` 为 true，就不启动动作，也不阻止默认行为，以保留浏览器快捷键（例如 Ctrl/Cmd+R）。Windows 的 AltGr 同时报告 Ctrl 与 Alt，因此同样不匹配。
- **按下与重复：** 只有非重复的 keydown 启动动作；绑定键在资格成立且通过上一条检查时，keydown（含 repeat）与 keyup 都阻止默认行为，例如避免方向键滚动页面。
- **抬起：** keyup 按 `code` 解除按住，即使带 Ctrl/Alt/Meta 或 `isComposing` 为 true；这不意味着拦截该事件。没有按住记录的 keyup 不改变轴。
- **按住轴：** `HeldKeyboardAxis` 按 `code` 维护本地按住表，只取 −1、0、+1，两个方向同时按住为 0，与按下顺序无关；只在运行中登记新的按下，清表后不能靠 repeat 重建。它是本地意图，不是权威世界状态。
- **资格：** 源有效、页面 visible 且没有 pagehide 阻断、窗口有焦点、`document.activeElement` 恰为输入区容器。初始化及元素 focusin/focusout、window focus/blur、visibilitychange、pagehide/pageshow 时重新读取真实事实；窗口返回或 pageshow 不要求新的 focusin。
- **监听位置：** 容器拥有 keydown/keyup/focusin/focusout，window 只有 focus/blur/pagehide/pageshow，document 只有 visibilitychange；不在 window 或 document 上注册 keydown/keyup，输入区不设焦点陷阱。
- **登记与释放：** 一个源只连接一次，连接时的同步初始信号只更新资格。登记失败先撤销已取得的监听，撤销也失败时为 `RollbackError`。释放先逻辑失效（旧回调不能再触发动作或阻止默认行为），再逐项撤销；撤销失败保留全部原因，不能声称物理清理成功。

## 4. 活动界面与焦点

当前构建没有游戏输入区。P3-05 建立它时，以下 P3-04 已确定的约定适用：

- 唯一的游戏输入区在任务画面中（`data-testid="mission-screen"` 内），焦点在菜单、开始配置、任务菜单、诊断面板或页面其他控件上时，所有按键都保持浏览器原生行为。资源平衡探针已把任务画面内元素上的应用监听计为 `keyboard` 组（[工程约定](./README.md#资源平衡)）。
- 进入任务页面时焦点按 §2 落在标题或 Skip，不自动移入输入区。
- 输入源是任务所有者的所有者级资源（`input` 阶段），跨运行保留，在所有者释放时最先失效并撤销；同一所有者换运行不重新登记监听。

## 5. 页面层拦截

- 当前构建只在 §2 所列的占位页与入口阻止默认行为，不拦截任何游戏键。
- 自动化测试中的合成按键不经过浏览器和系统自身的快捷键处理，`preventDefault` 生效也不能证明系统快捷键已被拦截（[总计划 §1.2](../plan/master-plan.md#12-首版交付范围)）。当前构建不宣称拦截了任何浏览器或系统快捷键。

## 6. 清键与恢复

游戏会话（[工程约定](./README.md#会话端口与错误)）已提供 P3-05 所需的清键接口：

- **会话自行清除：** 任何暂停（用户、任务菜单、hidden）、运行结束或替换时，会话清除 Runtime 的连续意图、短按标记与未执行命令，并逐个通知取消；输入适配器在状态通知中只清本地按住表，不递归调用控制。
- **失焦与退出 Pointer Lock：** 运行中的输入适配器调用会话的 `clear-input`（原因 `focus-loss` 或 `pointer-lock-exit`），清除意图与未执行命令，但不暂停、不重新锚定时钟，也不改变 Core 已接受的持续动作。
- **恢复：** 继续、重新聚焦、visible/pageshow 与新运行只恢复可用的通道，不恢复按住状态或自动继续；必须有新的非重复 keydown 才重新产生意图，旧的 repeat 无效。

## 7. 尚未实现的键盘能力

下列能力的政策已由总计划确定，但当前构建没有实现，也不得写成已实现。

**已实现（P3-04）：** `beforeunload` 离页确认。任务所有者在有运行时（出发、飞行、暂停，以及停止或故障后仍保有诊断与录制时）登记一份，只请求浏览器原生的确认，不定制文字，也不在处理器中退出、清理或导出；返回主菜单、重开或释放时撤销，介绍、开始配置与主菜单不登记。本机 Chrome 的刷新与关闭路径有浏览器证据（[工程约定](./README.md#本地浏览器-runner)），这不是系统级防关闭保证，也不覆盖所有浏览器或 BFCache。

| 能力 | 政策来源 | 计划接入时机 |
|---|---|---|
| Alt/Option 开火；`AltRight`/`AltGraph` 视为开火并过滤合成的 `ControlLeft`；飞行中拦截 Alt 组合 | [总计划 §1.2](../plan/master-plan.md#12-首版交付范围) | 首个原版开火绑定（P3-05；Runtime 的按住开火电平 `primaryFire` 已由 P3-04 提供） |
| F1 驾驶舱前视；飞行中拦截 F1–F10，F2–F10 只显示 G-08 标注、不切换视角 | [总计划 §1.2](../plan/master-plan.md#12-首版交付范围)、[P3-01 视角范围](../plan/p3/01/spec.md#视角范围) | P3（绑定与拦截 P3-05，F1 画面 P3-12、P3-13） |
| F2–F10 视角（其他驾驶舱布局与视角选择，U-029） | [P3-01 视角范围](../plan/p3/01/spec.md#视角范围) | P4 |
| 闭环的自动相机：玩家被毁时的被毁视角，只为这一自动流程实现，不开放为可选视角 | [P3-01 视角范围](../plan/p3/01/spec.md#视角范围)；原版事实见 [B-005](../original/behavior/B-005-campaign-rescue.md#被毁与救援时的视角p3-0109) | P3-12（进入与结束的时机 P3-11） |
| 全屏 + Keyboard Lock | [总计划 §1.2](../plan/master-plan.md#12-首版交付范围) | 飞行画面接入时；跨系统实机验证在 P5 |
| Windows/Linux 的 Alt+F4 风险提示 | 同上 | P3-05（实机核对 P3-15） |
| 单独重映射开火键或视角键（默认值不变） | 同上 | 设置界面落地后 |
| Pointer Lock，以及退出锁定时清键（会话的 `clear-input` 接口已由 P3-04 提供） | 同上 | 战略地图等实际需要时 |
| 原版方向/横滚键与其余快捷键 | [U-011](../original/unknowns.md) | P0 试玩确认后，在 P3 加入 |
| 系统快捷键冲突的实机验证 | [键位表](../original/input/key-map.md) | P0/P5 |

- **G-08 的边界：** G-08 的处理只在正式飞行输入区有效，不占用 React 菜单或文本控件。页面层的 `preventDefault` 不能保证拦截系统组合键，G-08 不解决 Alt+F4 风险；该风险由已实现的离页确认与上表的风险提示处理。
- **自动相机的范围：** P3-01/09 从原版代码确认，闭环中只有被毁视角是非 F1 的自动相机；出发、停靠等待、基地内部、离港、Warp、能量耗尽、救援与任务结束都不需要另外的相机（[executable](../original/formats/executable.md#automatic-views-and-cameras-p3-0109)）。这只说明闭环的这些衔接，不推及原版的其他流程。
- **原版的其他视角键：** 原版飞行按键处理中 F10 也切换视角，已按 2026-10-09 的 spec 修订纳入 G-08（上表）。若干光标与小键盘键码也对应视角切换（这些键在飞行中是否送达、是否兼作操纵未追踪，U-011），不在 G-08 中，P3 中如何处理由 P3-05 核实后决定；Warp、地图与基地内部不处理视角键（[executable](../original/formats/executable.md#automatic-views-and-cameras-p3-0109)）。

不实现 Gamepad、鼠标飞行（原版不支持，见 [U-012](../original/input/key-map.md#鼠标飞行已确认u-012)）或触控输入。
