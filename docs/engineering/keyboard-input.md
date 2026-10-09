---
type: guide
status: active
phase: P1
updated: 2026-10-09
related: [ADR-0004, U-011, U-012]
---

# 键盘输入与键位绑定

本文是本项目键盘输入的权威说明。内容包括当前构建的绑定，即每个按键对应的游戏动作及其功能，以及触发语义、活动界面与焦点、页面层拦截、清键与恢复。

- 原版键位事实只在[原版键位冲突表](../original/input/key-map.md)维护。
- 默认键位政策见[总计划 §1.2](../plan/master-plan.md#12-首版交付范围)与 [ADR-0004](../decisions/ADR-0004-keyboard-mouse-original-keys.md)。
- 模块落点见[源码结构指南](./source-structure.md)，测试约定见[工程约定](./README.md)。

> **状态：当前实现说明。** 五行绑定及以下规则按已批准的 [P1-09 spec](../plan/p1/09/spec.md) 对齐；实现、故障测试与实际开发/生产浏览器证据分别见 [03](../plan/p1/09/subtasks/03-session-keyboard-actions.md#完成证据)、[04](../plan/p1/09/subtasks/04-demo-keyboard-wiring.md#完成证据)、[05](../plan/p1/09/subtasks/05-browser-input-evidence.md#完成证据)。旧草案全文不是另一个获批合同；修改绑定或行为仍须修订契约、重新审阅与批准。

## 1. 适用范围

P1 只有合成演示这一个使用游戏键的画面。下表的动作全部作用于 [P1-02 合成场景](../plan/p1/02/spec.md)，**不是原版操控**。从 P3 起，正式玩法的绑定按原版键位逐项加入本文；合成演示的绑定随合成场景一起退役。

菜单、导入页面等 React 画面只使用浏览器原生的控件键盘操作（Tab、Enter、Space），不属于游戏键绑定，见 [P1-08 spec](../plan/p1/08/spec.md)。P2-11 的资源查看器另有一组诊断键，见 [§2 之后的小节](#资源查看器的诊断键p2-11)，也不是游戏键。

## 2. 当前绑定表

| 动作 ID | 类别 | 按键（`KeyboardEvent.code`） | 功能 | 来源与置信度 |
|---|---|---|---|---|
| `move-x`（−1） | 连续轴 | `ArrowLeft` | 按住期间，合成 mover 沿 −x 方向移动 | 合成演示自定，不是原版事实。原版的方向键尚未确认（[U-011](../original/unknowns.md)） |
| `move-x`（+1） | 连续轴 | `ArrowRight` | 按住期间，合成 mover 沿 +x 方向移动 | 同上 |
| `add-marker` | 离散命令 | `KeyN` | 提交一次 `add-marker` 命令，由 Core 接受或拒绝 | 合成演示自定，不声称与原版功能对应 |
| `remove-marker` | 离散命令 | `KeyX` | 提交一次 `remove-marker` 命令，由 Core 接受或拒绝 | 同上 |
| `toggle-pause` | Runtime 控制 | `KeyP` | 运行中按下则暂停；暂停中且 Session 允许继续（页面可见、离页阻断解除）时按下则继续 | `p` 是原版的暂停键（已确认，见[键位表](../original/input/key-map.md)）。再按一次 `p` 继续是本项目演示的选择，原版是否如此**未确认**（[U-011](../original/unknowns.md)） |

- **轴值：** `moveX = (ArrowRight 按住 ? 1 : 0) − (ArrowLeft 按住 ? 1 : 0)`，只取 −1、0、+1 三个值。两个方向键同时按住时为 0，与按下顺序无关。
- **选键约束：** `p` 保持原版的暂停含义。其余演示键都不在原版键位表已确认的按键中，不会把已确认的原版按键挪作他用。原版方向键确认后，若与演示键冲突，以原版为准并修订本表。
- **未绑定的键：** 包括 Tab、Esc、Space、Enter、Backspace、Alt/Option、F1–F12 和数字键，在当前构建中都没有游戏效果，也不被拦截。

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

## 3. 触发语义

- **识别：** 只按 `code` 识别，不读取 `key` 或 `keyCode`。键盘布局、大小写及 Shift 产生的字符不影响匹配；Option 作为 Alt 修饰键按下条放行，不触发动作。
- **修饰键：** 按下时只要 Ctrl、Alt 或 Meta 中任何一个处于按下状态，就不启动游戏动作，也不阻止默认行为，以保留浏览器快捷键（例如 Ctrl/Cmd+R）。Shift 不参与匹配，按住 Shift 不改变动作。Windows 的 AltGr 同时报告 Ctrl 与 Alt，因此同样不匹配。
- **输入法：** `isComposing` 为 true 的事件不启动动作、不阻止默认行为；既有轴的 keyup 清理独立处理。
- **按下与重复：**
  - 仅输入区有效且会话 running 时，非重复 keydown 登记轴键。重复只确认已登记键，不再发送相同轴值，清表后不能靠 repeat 重建。paused/idle/faulted 不预置按住状态。
  - 离散命令和 `toggle-pause` 只在非重复的 keydown 上触发一次。重复的 keydown 仍会阻止默认行为（见 §5），但不再触发。
- **抬起：** 轴键的 keyup 按 code 解除按住，即使有 Ctrl/Alt/Meta 或 isComposing=true；这不意味着拦截该事件。离散命令与 P 的 keyup 不触发动作，没有对应按住记录的 keyup 不改变轴。
- **动作不可用：** 键盘与开发面板按钮使用同一套可用性判断，即 [synthetic-game-controls.ts](../../src/ui/game/synthetic-game-controls.ts) 中的 `syntheticControlAvailability`：
  - 会话不在 running 时，`add-marker` 和 `remove-marker` 不提交。
  - `toggle-pause` 在 pause 可用时暂停，否则在 resume 可用时继续，两者都不可用时忽略。
  - 忽略时不显示错误，但按键仍按 §5 阻止默认行为。
  - 动作可用但提交或控制同步失败时，与面板一样写入 actionError，并保留原始原因。
- **反馈：** 键盘与面板走同一条 pending→accepted/rejected/cancelled/unconfirmed 反馈路径，实际可用性每次按键读取当前 Session，不依赖可能过期的 React/store。仅失焦不撤回已入队命令，Session 暂停/隐藏/结束按既有规则取消；键盘不重提或自行判定成功。
- **轴值同步：** 合法 running 输入回调中，数值实际变化才经当前运行绑定 setInput。成功时 Runtime 轴等于本地推导值；失败写 actionError=input 并保留 cause。成功实际轴变更只清旧 input 错误，无变化/忽略/重复不清错，不覆盖独立错误。start/resume/attach 不同步旧轴；状态、取消、错误和清理通知绝不提交输入、命令或控制，也不排微任务绕过限制。

## 4. 活动界面与焦点

- **唯一的游戏键输入区：** 演示画面中的合成画面区域，即现有的 `synthetic-view` 容器。它可以用 Tab 到达，点击即获得焦点，有可见的焦点样式、可读名称，并通过关联说明列出 §2 的绑定，同时注明这是合成演示键位、不是原版操控。
- **只在输入区获得焦点时生效：** 焦点在主菜单、导入页面、“Return to menu”、开发面板按钮或页面其他位置时，所有按键都保持浏览器原生行为，不产生游戏效果。
- **资格事实：** 当前 owner/source 有效，页面 visible 且没有 pagehide 阻断，窗口有焦点，document.activeElement 恰为容器（非交互/编辑子控件）。初始化及元素 focusin/focusout、window focus/blur、visibilitychange、pagehide/pageshow 重新读取真实事实；窗口返回或 pageshow 不要求新的元素 focusin。
- **监听位置：** 不在 window 或 document 上注册 keydown/keyup 监听。输入区不设焦点陷阱，Tab 与 Shift+Tab 照常把焦点移出。
- **进入演示时的焦点：** 仍按 P1-08 落在画面标题，不自动移入输入区。
- **与渲染器无关：** 渲染器 unavailable、failed 或 context-lost 时，只要会话存在，输入区照常工作。
- **键盘状态：** 输入区旁以文字显示键盘状态：
  - `active`：键盘通道有焦点，不等于会话 running；paused 中 P 仍可继续，轴/命令不可用；
  - `inactive`：提示点击画面或用 Tab 移入输入区；
  - `unavailable`：监听登记失败，同时显示原因；演示仍可用开发面板操作。

## 5. 页面层拦截

- 焦点在输入区、且通过 §3 修饰键与输入法检查的绑定键，在 keydown 与 keyup 时都调用 `preventDefault`。动作暂不可用时和重复事件也照此处理，例如避免方向键滚动页面。
- 未绑定键、带 Ctrl/Alt/Meta 的组合以及输入法事件，都不阻止默认行为。
- keyup 的本地释放与默认拦截分开：放行的修饰/输入法轴 keyup 仍清已有按住记录；失效源/非活动区域不 preventDefault。这里是无开火绑定的合成政策，不替代正式飞行的 Alt/AltGr 政策。
- 自动化测试中的合成按键不经过浏览器和系统自身的快捷键处理，`preventDefault` 生效也不能证明系统快捷键已被拦截（[总计划 §1.2](../plan/master-plan.md#12-首版交付范围)）。当前构建不宣称拦截了任何浏览器或系统快捷键。

## 6. 清键与恢复

以下任一情况都会清空按住表：

- 输入区失去焦点（focusout），包括焦点移到页面上的其他控件；
- 窗口 blur；
- 页面变为 hidden，或触发 pagehide；
- 任何暂停，包括用户 P/面板 pause 与 hidden 暂停；
- 当前运行结束或被替换（exit、restart、faulted、disposed）；
- 演示 owner 释放，此时也移除全部键盘监听。

**零轴出口：** 失焦等源回调在仍合法 running 时立即提交变化后的0；Session 暂停、运行收尾与受限通知只清本地，依赖 Session 已有 clearIntent 归零，不调用内部入口。owner 释放先失效输入、尝试撤销，再销毁 Session。

**恢复：** 继续、聚焦、visible/pageshow 和新 run 只恢复可用通道，不恢复按住状态或自动继续会话。必须新的非重复 keydown 才能移动；旧 repeat 无效，不查询或猜测物理状态。

**资源与失败：** 一个 owner 连接一组九项监听；同 owner Restart/Exit→Start 只换 run，不重新登记。登记失败、成功回滚时 unavailable 保留原因，面板仍可用；回滚失败保持 RollbackError、释放全部已取得资源并锁存，不开始运行。释放前先逻辑失效，任何撤销失败仍继续其他清理并保留所有原因；旧回调不能写 store、动作或 preventDefault。逻辑隔离不是物理监听回收成功，失败仍进入既有 owner/app-instance 清理锁存，重载前不建新 owner。

## 7. 尚未实现的键盘能力

下列能力的政策已由总计划确定，但当前构建没有实现，也不得写成已实现：

| 能力 | 政策来源 | 计划接入时机 |
|---|---|---|
| Alt/Option 开火；`AltRight`/`AltGraph` 视为开火并过滤合成的 `ControlLeft`；飞行中拦截 Alt 组合 | [总计划 §1.2](../plan/master-plan.md#12-首版交付范围) | 首个原版开火绑定（P3） |
| F1 驾驶舱前视；飞行中拦截 F1–F9，F2–F9 只显示 G-08 标注、不切换视角 | [总计划 §1.2](../plan/master-plan.md#12-首版交付范围)、[P3-01 视角范围](../plan/p3/01/spec.md#视角范围) | P3（绑定与拦截 P3-05，F1 画面 P3-12、P3-13） |
| F2–F9 视角（其他驾驶舱布局与视角选择，U-029） | [P3-01 视角范围](../plan/p3/01/spec.md#视角范围) | P4 |
| 闭环的自动相机：玩家被毁时的被毁视角，只为这一自动流程实现，不开放为可选视角 | [P3-01 视角范围](../plan/p3/01/spec.md#视角范围)；原版事实见 [B-005](../original/behavior/B-005-campaign-rescue.md#被毁与救援时的视角p3-0109) | P3-12（进入与结束的时机 P3-11） |
| 全屏 + Keyboard Lock | [总计划 §1.2](../plan/master-plan.md#12-首版交付范围) | 飞行画面接入时；跨系统实机验证在 P5 |
| `beforeunload` 关闭确认，以及 Windows/Linux 的 Alt+F4 风险提示 | 同上 | 有需要保护的任务进度时（P3 及以后） |
| 单独重映射开火键或视角键（默认值不变） | 同上 | 设置界面落地后 |
| Pointer Lock，以及退出锁定时清键 | 同上 | 战略地图等实际需要时 |
| 原版方向/横滚键与其余快捷键 | [U-011](../original/unknowns.md) | P0 试玩确认后，在 P3 加入 |
| 系统快捷键冲突的实机验证 | [键位表](../original/input/key-map.md) | P0/P5 |

- **G-08 的边界：** G-08 的处理只在正式飞行输入区有效，不占用 React 菜单或文本控件。页面层的 `preventDefault` 不能保证拦截系统组合键，G-08 不解决 Alt+F4 风险；该风险按上表的关闭确认与提示处理。
- **自动相机的范围：** P3-01/09 从原版代码确认，闭环中只有被毁视角是非 F1 的自动相机；出发、停靠等待、基地内部、离港、Warp、能量耗尽、救援与任务结束都不需要另外的相机（[executable](../original/formats/executable.md#automatic-views-and-cameras-p3-0109)）。这只说明闭环的这些衔接，不推及原版的其他流程。
- **原版的其他视角键：** 原版飞行按键处理中 F10 也切换视角，若干光标键的键码也对应视角切换（这些键在飞行中是否送达未追踪，U-011）；Warp、地图与基地内部不处理视角键（[executable](../original/formats/executable.md#automatic-views-and-cameras-p3-0109)）。它们不在总计划 §1.2 与 G-08 的列表中，P3 中是否拦截由 P3-05 决定。

不实现 Gamepad、鼠标飞行（原版不支持，见 [U-012](../original/input/key-map.md#鼠标飞行已确认u-012)）或触控输入。
