---
type: plan
status: accepted
phase: P1
task: "09"
updated: 2026-10-10
related: [ADR-0004, ADR-0012, ADR-0015, U-011, U-012]
---

# P1-09：最小键盘适配与输入隔离 — Spec

## 问题与目标

P1-05 至 P1-08 已交付会话生命周期、React 指令闭环、合成画面和菜单，但合成演示目前完全不能用键盘控制：

- Core 的连续轴 `moveX` 在浏览器里**没有任何来源**。没有代码调用 `setInput`，合成 mover 在演示中从不移动。
- 离散命令和暂停只能通过开发面板的按钮触发，没有“输入源适配器 → 游戏动作”的键盘路径（[总计划 §1.2](../../master-plan.md#12-首版交付范围)）。
- Runtime 只保存最新的输入快照，不推测按键是否按住；暂停或隐藏时它会把输入清零（[P1-04](../04/spec.md)、[P1-05](../05/spec.md)）。按住状态、失焦后的清键以及活动界面的判断，都明确留给了本任务。
- 原版键位与浏览器的冲突政策已经确定（[ADR-0004](../../../decisions/ADR-0004-keyboard-mouse-original-keys.md)），但项目里还没有游戏键盘监听；本任务已有独立键位文档草案，尚未与实现对齐。

本任务交付**最小键盘适配**：

- 在合成演示中，焦点位于合成画面区域时：
  - 方向键产生连续的 `moveX` 轴；
  - 少量字母键提交离散命令，与面板按钮使用同一条反馈路径；
  - `p` 走 Runtime 控制通道暂停或继续。
- 焦点在菜单、表单、按钮或页面其他位置时不拦截任何按键。
- 用户暂停、输入区失焦、窗口 blur、页面隐藏、页面卸载以及运行结束时，清空所有按住状态；恢复后必须重新按下方向键，旧键的自动重复不能恢复移动。
- 键盘监听与演示 owner 同生同灭：返回菜单、StrictMode 与 HMR 都不留下重复的监听。
- 每个按键的功能、触发语义、焦点、拦截与清键规则单独写在[键盘输入与键位绑定](../../../engineering/keyboard-input.md)（下称“键位文档”）中，作为长期维护的绑定说明。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p1-09-最小键盘适配与输入隔离)。本任务对应 P1 覆盖项“最小输入适配与活动界面/失焦隔离”，并为 [P1-10](../tasks.md#p1-10-浏览器集成与回归冒烟) 提供“键盘指令 → Core → UI/渲染”的输入端。它不单独完成 P1 退出评审。

依赖关系：

- 阶段索引列出的基础前提是 [P1-05](../05/spec.md)（[goal](../05/goal.md#子任务跟踪)已完成）。
- 本契约的实际装配还依赖 [P1-06](../06/spec.md) 的桥接与命令反馈和 [P1-08](../08/spec.md) 的演示 owner 与页面（[P1-06 goal](../06/goal.md#子任务跟踪)、[P1-08 goal](../08/goal.md#子任务跟踪)均已完成）。goal 必须记录这些真实前提，而不是把它们当作可选接线。

## 范围

### 包含

- **S-01 键位文档：** 保留[键位文档](../../../engineering/keyboard-input.md)独立说明每个按键的功能。其 §2 五行绑定表属于本契约；跨模块行为及审阅修订以本 Spec 为准。键位文档其余部分仍是待对齐草案，不因本 Spec 的审阅标记而成为已核实的实现说明；实现完成前必须同步并改为 `active`，见 AC-15。
- **S-02 规范化与按住表：** 定义一个不依赖 DOM 的键盘事件记录，以及纯逻辑的按键分类与按住表，在 Node 中可测。具体包括：只按 `code` 识别；修饰键、输入法和重复事件规则；按住集合；从按住集合推导 `moveX`。
- **S-03 动作分流：**
  - 连续轴经当前运行绑定设置 `moveX`。
  - 离散命令经现有的命令反馈提交。
  - `toggle-pause` 经现有的会话控制执行。
  - 命令与控制的可用性与开发面板相同；轴仅在当前运行为 running 且输入区有效时接受。成功处理轴变化后，Runtime 的 `moveX` 等于按住表推导出的值。
- **S-04 活动界面与页面层拦截：**
  - 演示画面的合成画面容器成为唯一的游戏键输入区：可聚焦，有可见焦点、名称、按键说明和键盘状态文字。
  - 只有该区域内被处理的绑定键才调用 `preventDefault`。
  - 不注册 window/document 级的键盘监听，不设焦点陷阱。
- **S-05 清键：** 用户暂停、输入区 focusout、窗口 blur、页面 hidden、pagehide、运行结束或被替换、owner 释放时清空按住表。仍在合法 running 输入边界内的失焦信号立即把轴设为 0；暂停及运行收尾由 Session 归零。非 running 时不建立按住状态；继续、重新聚焦或新运行都不恢复旧状态，须新的非重复 keydown 才能开始移动。
- **S-06 生命周期与释放：**
  - 每个演示 owner 拥有一个浏览器键盘源，所有权的交接方式与 WebGL 表面相同。正常释放时键盘监听先于会话销毁移除；移除失败也先使源失效并继续会话收尾。
  - 登记或释放失败沿用 P1-08 的清理失败信号与锁存。
  - 返回菜单、StrictMode、Fast Refresh 之后只存在一组监听，一次按键只产生一次效果。
- **S-07 验证与文档：** Node 契约测试、真实 Chromium 的开发服务器与生产预览证据，并同步工程文档与源码结构指南。

### 不包含

- **原版战斗与视角键（P3）：** Alt/Option 开火、AltGr 处理、F1–F9 视角、飞行中的 Alt 组合拦截。演示没有开火意图，因此本任务不绑定 Alt。
- **全屏、Keyboard Lock、Pointer Lock：** 演示不使用指针锁定，不必验证退出锁定后的清键。
- **`beforeunload` 关闭确认与 Alt+F4 风险提示：** 合成演示没有需要保护的进度。
- **其余输入方式与设置：** 重映射、键位设置界面、键位持久化、Gamepad、鼠标飞行、触控。
- **全局快捷键：** 例如用 Esc 返回菜单。菜单与导入页的键盘操作仍只是原生按钮。
- **原版键位研究：** 原版方向键、横滚键与其余快捷键（[U-011](../../../original/unknowns.md)），以及系统或浏览器快捷键拦截的实机验证（[键位表](../../../original/input/key-map.md)、P0/P5）。
- **Playwright 与联合验证（P1-10）：** 不建立 Playwright 入口，不做跨浏览器矩阵。本任务仍须验证实际页面中的键盘、投影、焦点和监听生命周期；跨 UI、输入、渲染、replay 的完整回归入口与联合资源证据由 P1-10 负责。
- **上游契约：** Core、Runtime、Session 的输入、命令、调度与状态契约不变，不新增 Core 动作、命令或控制类型。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/platform/input/`（计划新增） | 不依赖 DOM 的键盘事件记录、输入源端口、按键分类与按住表；以及浏览器键盘源 `browser-*.ts`，负责元素键盘监听和浏览器焦点/生命周期通知、默认行为处理与登记/撤销。具体文件名由 goal 确定 |
| `src/ui/game/`（扩展） | 合成演示的绑定表与动作分流（计划新增模块）。[synthetic-session-bridge.ts](../../../engineering/source-structure.md#r6-合成-ui-层) 的运行绑定窄扩展出 `setInput`；[synthetic-game-store.ts](../../../engineering/source-structure.md#r6-合成-ui-层) 的 actionError 增加 `input` 操作 |
| [src/app/composition/](../../../../src/app/composition/) | owner 接收键盘源并接线，规定释放顺序和失败处理；hook 为容器创建浏览器键盘源并交给 owner |
| [src/ui/render/SyntheticRenderView.tsx](../../../engineering/source-structure.md#r7-演示页面开发面板与画面)、[src/ui/pages/SyntheticDemoPage.tsx](../../../engineering/source-structure.md#r7-演示页面开发面板与画面)、[src/app/app.css](../../../../src/app/app.css) | 输入区的可聚焦性、可见焦点样式、名称、按键说明与键盘状态文字；不新增 window/document 键盘监听 |
| `src/core/`、[src/app/runtime/](../../../../src/app/runtime/)、[src/app/session/](../../../../src/app/session/) | 不修改 |
| [docs/engineering/](../../../engineering/) | 键位文档定稿；工程约定与源码结构指南同步 |

## 当前实现与依据

- **Core 输入：** [synthetic-scene.ts](../../../engineering/source-structure.md#r1-合成-core) 的 `MoveInput { moveX }` 取值在 [−1, 1]，按 `SYNTHETIC_MOVE_SPEED`（1 单位/秒）乘以 tick 时长沿 x 移动 mover。`Command` 只有 `add-marker` 与 `remove-marker`。这些都是合成规则，不是原版数值。
- **Runtime：** [synthetic-runtime.ts](../../../engineering/source-structure.md#r3-合成-runtime) 的 `setInput` 保存最新快照，不自动归零；`submitCommand` 返回 commandId；`clearIntent()` 清空队列并把 `moveX` 归零。
- **Session：** [synthetic-session.ts](../../../engineering/source-structure.md#r4-合成会话)
  - 运行句柄 `SessionRun.setInput/submitCommand` 只在 running 时接受，否则抛出 `invalid-state`。
  - 用户暂停、页面隐藏和运行结束时调用 `clearIntent`。
  - 控制只有 `start/pause/resume/restart/exit/dispose`；resume 要求页面可见。
  - 状态通知使用 `status` 回调模式；`SessionRun.setInput/submitCommand` 要求 `open` 模式，所以不能在状态通知或桥接的新运行 `attach` 中提交输入。取消、错误与清理通知同样不能提交输入或控制。
  - [P1-05 spec](../05/spec.md) 把“窗口 blur 与原始按键状态的清理”留给了本任务。
- **UI 反馈：**
  - [synthetic-command-feedback.ts](../../../engineering/source-structure.md#r6-合成-ui-层) 的 `submit(type)` 把命令记为 pending，再按 Core 的域事件结算。
  - [synthetic-game-controls.ts](../../../engineering/source-structure.md#r6-合成-ui-层) 提供 `syntheticControlAvailability(status)`、`control(type)` 和面板分发器。
  - [synthetic-session-bridge.ts](../../../engineering/source-structure.md#r6-合成-ui-层) 的 `SyntheticRunBinding` 目前只有 `submitCommand`，没有 `setInput`。
- **装配：**
  - [synthetic-demo-owner.ts](../../../engineering/source-structure.md#r5-演示所有者与槽位) 在接收 WebGL 表面后创建会话。表面释放失败时抛 `RollbackError`，按初始化失败处理；dispose 依次停止状态订阅、销毁会话、解绑桥接、释放渲染器；`cleanupFailure()` 锁存首个清理失败。
  - [use-synthetic-demo-owner.ts](../../../engineering/source-structure.md#r5-演示所有者与槽位) 按容器元素创建表面与 owner，并经[演示生命周期](../../../engineering/source-structure.md#r5-演示所有者与槽位)保证先释放旧 owner、再创建新 owner。
- **页面与焦点：**
  - [SyntheticRenderView.tsx](../../../engineering/source-structure.md#r7-演示页面开发面板与画面) 的 `synthetic-view` 容器目前不可聚焦。
  - [SyntheticDemoPage.tsx](../../../engineering/source-structure.md#r7-演示页面开发面板与画面) 打开时，焦点落在画面标题。
  - P1-08 规定页面不注册全局键盘监听（[工程约定](../../../engineering/source-structure.md#r10-菜单入口键位与工程文档)）。
- **浏览器宿主：** [browser-session-host.ts](../../../../src/platform/browser/browser-session-host.ts) 只登记 visibilitychange、pagehide、pageshow 三种监听，不处理窗口 blur。
- **测试约束：** `.test.ts` 只在 Node 中运行；`tsconfig.node.json` 不含 DOM lib，因此被测试导入的模块不能使用 DOM 类型。项目不使用 jsdom 或 React Testing Library。可复用 [ControlledHost](../../../engineering/source-structure.md#r4-合成会话)、[RecordingSurface](../../../../src/render/scene/render-surface.test-support.ts) 与 [synthetic-ui.test-support.ts](../../../engineering/source-structure.md#r6-合成-ui-层)。
- **政策与原版依据（事实只在链接的记录中维护）：**
  - [总计划 §1.2](../../master-plan.md#12-首版交付范围)：默认键位即原版键位，按 `code` 识别，非飞行界面不拦截，失焦/隐藏/退出锁定时清空按住状态，合成按键不能证明拦截有效。
  - [总计划 §5](../../master-plan.md#5-状态管理与通信约定)：`p` 走 Runtime 控制通道。
  - 暂停键的已确认记录及证据、鼠标飞行的 [U-012](../../../original/unknowns.md) 结论见[键位表](../../../original/input/key-map.md)；方向键与横滚键的未确认部分见 [U-011](../../../original/unknowns.md)。本任务不补充原版事实。

## 行为与边界

按键与功能的五行映射引用[键位文档 §2](../../../engineering/keyboard-input.md#2-当前绑定表)。以下行为与技术决定是审阅后的契约；键位文档 §3–6 必须按 AC-15 对齐，不能用尚未修订的草案覆盖本节。

### 输入资格与按键规则

- **有效输入区：** 当前 owner 的输入源仍有效、页面 visible 且未处于 pagehide 阻断、窗口有焦点、`document.activeElement` 是输入区容器。点击容器内的画布须使容器获得焦点；不把整个演示页面或任意可编辑/可交互子控件当作输入区。
- **资格恢复：** 初始化、元素 focusin/focusout、window focus/blur、visibilitychange、pagehide/pageshow 后重新核对上述事实。窗口恢复焦点时，元素可能没有新的 focusin；仍须正确从 inactive 恢复到 active。active 只表示键盘通道获得焦点，不表示会话 running；暂停中 P 仍可继续，方向键与命令不可用。
- **识别与放行：** 只按 `code` 识别。未绑定键、带 Ctrl/Alt/Meta 的事件、`isComposing` 事件均不触发动作也不阻止默认行为，Shift 不改变映射。这是无开火绑定的合成输入区政策，不替代正式飞行的 Alt/Option 政策。
- **keyup 的两个决定分离：** 轴键 keyup 先按 `code` 解除已登记的按住状态，即使该事件带修饰键或处于 composition；是否 `preventDefault` 仍按当前输入资格、绑定与上一条规则判断。内部清理不等于拦截带修饰键或输入法的事件。
- **连续轴：** 仅 running 时，新的非重复 keydown 登记方向键；重复 keydown 只确认已经登记的同一键，不能从空表重新建立它。两键同时按住的轴为 0，与先后顺序无关；轴值未变化不重复发送。paused、idle、faulted 中的方向键不登记，也不延迟到下一次运行。
- **命令与 P：** 只处理非重复 keydown，keyup 不触发，按现有可用性决定是否提交。重复事件或暂不可用的合格绑定键仍 `preventDefault`，但不是操作失败，不产生虚假错误。
- **清键与既有命令：** 失焦等浏览器输入信号只撤销连续按住状态；已经成功入队的离散命令不因焦点变化被自动撤回。Session 暂停/隐藏/结束仍按既有规则取消未消费命令，并显示 cancelled 或故障时的 unconfirmed，不重提。

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 演示 owner 初始化成功 | 为当前容器登记一组键盘监听；先核对实际焦点资格，通常为 inactive。容器已聚焦的 HMR/StrictMode 替换也不得错误固定为 inactive；按住表始终从空表开始 | 登记失败且回滚成功：键盘状态为 unavailable 并显示原因，演示照常运行。回滚也失败：保留 `RollbackError`，owner 初始化失败，不开始运行，已取得资源全部尝试释放，并触发 P1-08 的清理失败锁存 |
| 输入区获得焦点，会话 running | 状态为 active。方向键改变 mover 的 x 投影；N/X 产生 pending 并由 Core 结算；P 暂停 | 同步失败（例如运行刚好故障）写入 actionError（`input`、命令类型或 `pause`/`resume`），保留原始原因 |
| 输入区有效，会话不在 running（idle、paused、faulted） | 不建立按住状态，不发送轴；不可用命令被忽略，P 按 pause/resume 的可用性执行或忽略；合格绑定键仍阻止默认行为 | 被忽略时不显示错误 |
| 用户暂停后再继续（键盘 P 或面板按钮） | 暂停时按住表与 Runtime 轴均归零；继续不补发旧轴，状态通知只读与接线，不提交输入。旧方向键的重复事件仍不能恢复移动，必须重新按下 | — |
| 输入区失焦、窗口 blur、页面 hidden、pagehide | 按住表清空并变为 inactive；仍能合法接受输入时立即把 `moveX` 设为 0，否则依赖 Session 的暂停/收尾归零，不调用旧运行 | 真正的 setInput 同步失败写入 actionError（`input`），保留 cause；不得把失败标为成功或无变化 |
| 输入区/窗口焦点或页面可见性恢复、pageshow | 重新核对输入资格并呈现 active/inactive；不恢复按住状态，不自动继续或启动会话，不解除 Session 的离页约束 | — |
| 运行结束或被替换（exit、restart、faulted、disposed） | 按住表清空，不向已结束的运行发送任何输入 | — |
| 焦点在菜单、导入页、按钮或页面其他位置 | 按键保持原生行为：没有游戏效果，不阻止默认行为 | — |
| 返回菜单、StrictMode 重跑、Fast Refresh、容器替换 | 旧监听在旧会话销毁之前撤销；新 owner 恰好登记一组；一次按键只产生一次效果 | 撤销失败：计入 owner 的清理失败，沿用 P1-08 的锁存与反馈 |
| 渲染器 unavailable、failed、context-lost | 键盘照常驱动会话 | — |
| 输入源撤销或初始化回滚，即使 removeEventListener 抛错 | 撤销先使旧源回调失效，再逐项尝试移除；旧/晚到回调不能更新 store、清除新源状态、调用旧运行或对事件 preventDefault | 撤销失败保留原始原因并锁存，不能因回调已无效而宣称监听已释放 |
| 清理失败锁存后没有 owner | 不登记新键盘监听。若旧监听移除失败，仍可能残留但已失效；不能宣称物理监听数为零 | 沿用 P1-08 的阻断提示 |

## 数据模型与契约

Core、Runtime、Session 的类型不变。

### 已有权威类型

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| `MoveInput.moveX` | 数值，范围 [−1, 1]；键盘只产生 −1、0、+1 | Core（[synthetic-scene.ts](../../../engineering/source-structure.md#r1-合成-core)） | 经 `SessionRun.setInput` 进入 Runtime 快照，按 tick 进入 `TickInput` |
| `Command['type']` | `add-marker` 或 `remove-marker` | Core | 经命令反馈的 `submit` 进入队列，返回 commandId |
| `SessionControl['type']` | 键盘只使用 `pause` 与 `resume` | Session | 经 `SyntheticGameControls.control` 执行 |
| `SessionStatus` | `phase`、`environmentVisible` 等 | Session | 决定可用性与 running 不变式 |

### 计划新增或扩展的契约

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| 键盘事件记录（计划新增） | 冻结的纯数据：`type: 'keydown' \| 'keyup'`、`code: string`、`repeat`、`ctrlKey`、`altKey`、`metaKey`、`isComposing`（均为 boolean）。不含 DOM 对象和 `key` | `platform/input` | 浏览器源把 `KeyboardEvent` 转换成该记录；Node 测试直接构造 |
| 按键分类结果（计划新增） | 同步区分状态释放/动作与是否阻止默认行为；带修饰键或 composition 的轴键 keyup 可仅释放状态而不 preventDefault，不用一个“是否处理”值混淆二者 | `platform/input` | 规则见“输入资格与按键规则”；浏览器源负责实际 preventDefault |
| 焦点/生命周期信号（计划新增） | 输入区获得/失去焦点、窗口 focus/blur、页面 visible/hidden、pagehide/pageshow；初始化时也提供当前资格事实。信号是输入源通知，不是新的 Session 控制或暂停原因 | `platform/input` 浏览器源 | 消费者清键与更新 active/inactive；恢复信号不启动运行或恢复旧按住表 |
| 合成绑定表（计划新增） | 只读映射，`code` → 动作：轴 `{axis: 'moveX', value: −1 \| 1}`、命令 `{command: Command['type']}` 或控制 `{control: 'toggle-pause'}`。内容必须与键位文档 §2 完全一致 | `ui/game` | 只在合成演示中使用；不持久化，不可重映射 |
| 按住集合（计划新增） | 当前 running 输入期内通过非重复 keydown 登记的轴键 `code` 集合，推导出 `moveX ∈ {−1, 0, 1}`；失效后不接受仅有重复事件的重建 | 键盘消费者 | 按本 Spec 清键；不进入 Core、store 或录制格式 |
| `SyntheticRunBinding.setInput(input)`（扩展） | 与 `submitCommand` 同样受注销保护：桥接回滚或 unbind 后抛出，且不触及运行；运行本身的状态错误由 Session 抛出 | `ui/game` 桥接 | 键盘轴值的唯一出口 |
| `UiActionError.operation`（扩展） | 在原有值之外增加 `'input'` | `ui/game` store | 轴值同步失败时写入，保留原始原因 |
| 键盘状态读取（计划新增） | 冻结的判别联合：`{state: 'active' \| 'inactive'}` 或 `{state: 'unavailable', error: unknown}`；unavailable 必须带原始原因，可订阅且快照未变化时不通知。释放后为 inactive，不再被旧源通知改变 | 演示 owner | 供 React 显示文字；不是游戏事实，不按 tick 更新 |
| owner 输入依赖（扩展） | 接收 DOM-free 键盘源端口或创建不可用的原因；绑定后恰好一组监听，不使用模块级单例。键盘源与已取得的渲染表面各有明确所有者，任何后续创建失败都不能漏掉先取得资源的收尾 | `app/composition` | owner 释放先使输入源失效并撤销监听，再销毁会话；其余桥接/渲染资源继续尝试释放，失败汇总。运行 restart/exit 只清键/解除旧运行绑定，不移除 owner 级输入源，新的 Start 仍可使用它 |

### 持久化与兼容

不适用。本任务不读写 localStorage 或 IndexedDB，不保存键位或偏好，不改变快照、录制或 replay 格式。

## 技术决定

1. **焦点限定的输入区：** 游戏键只在合成画面容器获得焦点时生效，监听登记在该元素上，不在 window/document 登记键盘监听。理由：
   - 总计划规定非飞行界面不拦截；
   - P1-08 禁止全局键盘监听；
   - 开发面板的原生按钮必须保留 Enter/Space 的默认行为。

   元素焦点、window focus/blur、document visibilitychange 与 pagehide/pageshow 只报告资格与清键信号，不是全局键盘绑定。焦点有效性在初次绑定及这些事件后重新核对，不依赖“曾经收到 focusin”的缓存。
2. **演示绑定（详见键位文档 §2）：** 方向键对应 `moveX`，N/X 对应合成命令，P 对应暂停。P 保持原版的暂停含义；P 再按一次继续，以及方向键在演示中的用途，都是标明为合成或未确认的演示选择，不写成原版事实。原版方向键确认后，若与演示键冲突，以原版为准。
3. **只按 `code` 识别**（[ADR-0004](../../../decisions/ADR-0004-keyboard-mouse-original-keys.md)），不读取 `key` 或 `keyCode`。
4. **修饰键与输入法：** 带 Ctrl/Alt/Meta 的组合和输入法事件放行，Shift 不参与匹配；轴键 keyup 仍释放已经登记的状态，但不因此拦截放行事件。因为演示没有 Alt 绑定，本任务不处理开火所需的 AltGr，也不过滤合成的 Ctrl。
5. **重复与恢复：** 轴键重复 keydown 只确认当前运行中已登记的按住状态；清键后，即使该键仍物理按住也不能靠重复事件重新激活。离散动作与 P 只在非重复 keydown 上触发。用户松开并重新按下后才能建立新的轴状态，不查询或猜测物理按键。
6. **暂停清键与通知边界：** 所有暂停均丢弃轴意图，与 [P1-05 输入策略](../05/spec.md#输入取消反馈与帧内控制)一致。paused 时不登记方向键；start/resume 的 Runtime 轴原本为 0，不补发暂停前的按住值。Session 的状态/取消/错误/清理通知只做本地清键、读取与允许的接线，绝不在其中调用 setInput、submitCommand 或 control，也不添加定时器/微任务来绕过限制。

   running 时，合法键盘回调成功处理轴变化后 Runtime 快照与推导值相同；失焦回调在仍可接受输入时立即归零。真正的输入同步失败保留原始错误，不用“始终相等”掩盖失败。
7. **可用性与反馈复用：**
   - 键盘与面板共用 `syntheticControlAvailability`；不可用的动作静默忽略，与禁用的按钮一致。
   - 每次按键按当前 Session 身份与状态重新核对可用性，不只依赖可能过期的 React/store 快照。命令走现有反馈（pending → accepted/rejected/cancelled/unconfirmed），P 走现有控制，键盘层不自行判定结果或重提。
   - setInput 失败写入 `actionError.operation='input'` 并保留 cause；成功的实际轴变更仅清除旧 input 操作错误，无变化/忽略/重复事件不清错，不覆盖独立命令、控制或 Session 错误。
8. **最小的上游扩展：**
   - 只给运行绑定增加 `setInput`，给 actionError 增加 `input` 操作。
   - 不修改 Core、Runtime、Session。
   - 不新增 Core 命令、控制类型或暂停原因。
9. **端口与适配分层：** 分类与按住表放在不依赖 DOM 的 `platform/input` 模块，可在 Node 中测试；浏览器源是 `browser-*.ts`，只做事件转换、`preventDefault` 和登记/撤销。

   输入源端口、纯键状态逻辑与真正使用的监听登记/撤销逻辑可在 Node 中用最小宿主替身测试；`browser-*.ts` 只负责 DOM 连接，不引入 jsdom。不能仅凭一个会抛错的假源声称真实生产回滚已经验证。

   键盘源与 WebGL 表面的所有权必须覆盖全部获取及回滚路径：
   - 登记失败且回滚成功时，键盘为 unavailable，演示照常运行；
   - 登记或其他初始化步骤失败时，逐项释放此前取得的资源；回滚失败保留 `RollbackError`、首个清理失败与所有后续独立原因，不开始运行；
   - 撤销失败计入 owner 的清理失败。
10. **释放顺序与失效：** owner 释放时，先使输入源失效、清空本地状态并尝试移除监听，再销毁会话；所有独立清理继续尝试，正常释放幂等。即使移除失败，旧源或晚到回调也不能再提交动作、清除新 owner 状态、写 store 或 preventDefault，但不能把逻辑失效当作物理释放成功。输入源属 owner，run restart/exit 只重置运行状态，不为每个新 run 再注册一组 DOM 监听。
11. **焦点流转不变：** 进入演示时，焦点仍按 P1-08 落在画面标题，不自动聚焦输入区，也不设焦点陷阱。
12. **键位文档独立与审批边界：** 按键功能的五行映射保留在[键位文档 §2](../../../engineering/keyboard-input.md#2-当前绑定表)，跨模块行为由本 Spec 审批。审阅时读取的文档全文 SHA-256 为 `4520c1053570e0cda9aa94ca02d9f060df5064e4ec04197fbf1c7722d329e708`，仅标识本次草案基线；其中 §3 的轴同步、§4 的活动资格、§5 的 keyup 拦截、§6 的暂停/重复恢复必须按本 Spec 修订，不能声称旧全文已经获准。

   本轮只修改 Spec，键位文档的同步属于 S-01/AC-15 交付；按已批准行为同步说明不是新增行为。以后若改变五行映射或本 Spec 行为，必须先修改本 Spec 并重新审阅/批准；`reviewed` 只哈希 Spec，不自动覆盖外链文件。原版事实只在[键位表](../../../original/input/key-map.md)维护，文档不得把“合成功能没有声称与原版对应”写成已证实原版不存在该功能。
13. **不引入新依赖：** 不使用 Pointer Lock、Keyboard Lock、全屏或 `beforeunload`。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | 合成绑定表恰好包含键位文档 §2 的五个映射（ArrowLeft、ArrowRight、KeyN、KeyX、KeyP），动作与轴值一致。规范化与分类只读取约定的 code/布尔字段，不读取 key/keyCode；未绑定的 code（Tab、Escape、Space、Enter、AltLeft、F5 等）不触发动作也不阻止默认行为 | Node 测试：测试内的期望表与文档逐项对照；生产规范化/分类逻辑的表驱动测试与 DOM 接线审阅，不能把只测假源称为已覆盖浏览器转换 |
| AC-02 | 按住推导：分别按住左、右、同时按住、按任意顺序释放时，`moveX` 依次为 −1、+1、0，并在释放后得到相应值。重复 keydown 不改变结果，也不触发额外的 `setInput`；值未变化时不发送。用 ControlledHost 推进 N 个 tick 后，mover 的 x 投影与用相同 TickInput 序列逐 tick 推进的参考 Core 场景逐位相等 | Node 测试：记录 `setInput` 调用序列，并比对投影与参考场景 |
| AC-03 | 有效输入区内 running 时，KeyN/KeyX 的非重复 keydown 各提交恰好一次命令：store 先出现 pending，再由 Core 事件结算为 accepted 或 rejected（例如无 marker 时 remove 得到 rejected）。重复 keydown 和 keyup 不提交。idle/paused/faulted 中不提交、不产生错误，但合格绑定键仍阻止默认行为。失焦只清轴不取消已入队命令；暂停/隐藏取消待处理命令，故障允许 cancelled/unconfirmed，均不重提 | 真实 Session/store 的 Node 测试：接受、拒绝、取消及故障反馈、各非 running 阶段和清键前已入队命令；disposed owner 的旧回调按 AC-12 验证 |
| AC-04 | 有效输入区内 KeyP：running 时暂停（pauseReason=user）；paused 且 Session 允许 resume 时继续（包括 hidden → visible 后显式继续）；页面不可见或 pagehide 尚未解除时不继续，idle/faulted/disposed 时忽略。重复事件不切换；可用性检查后发生的真实同步失败写入 actionError（pause/resume）并保留原因 | Node 测试：ControlledHost 的 visibility/pagehide/pageshow 序列、实时状态检查与同步失败；忽略不清掉既有错误 |
| AC-05 | 带 Ctrl/Alt/Meta 的 keydown 与 composition 事件不触发动作、不 preventDefault；Shift 不改变映射。已经登记的轴键 keyup 即使带修饰键或 isComposing=true 仍解除状态，但该事件不 preventDefault；普通合格 keyup 则释放并 preventDefault。源失效或区域不活跃时不拦截事件 | Node 表驱动测试区分“释放状态”和“拦截默认行为”，覆盖按下后修饰键/输入法状态改变再抬起 |
| AC-06 | 用户暂停与隐藏暂停均清空按住表；paused 中方向键不登记。start/resume 后轴为 0，旧键自动重复不能恢复移动，新非重复 keydown 才生效。轴值提交/控制从合法输入回调进行，Session 状态/取消/错误/清理通知及 attach 不调用输入或控制；正常序列没有 invalid-state 错误 | 真实 Session 的 Node 测试，含按住 → P 暂停 → 抬起或重复 → P 继续、暂停中按方向键、面板 pause/resume、start/restart；读取逐 tick 投影/录制并记录 setInput 调用所在通知边界 |
| AC-07 | 输入区失焦、window blur、hidden、pagehide 清空按住表；running 且仍合法时立即发送 0，否则不在 Session 的受限通知中补发。测试两种顺序：输入源先清键/Session 后暂停，以及 Session 先暂停/输入源后清键。恢复仅有重复事件时轴仍为 0；exit/restart/fault/dispose 不向旧运行提交。窗口 focus 或 pageshow 时即使无新 focusin，也按真实资格恢复 active/inactive 而不恢复移动 | Node 测试使用实际生产资格/信号处理逻辑和 Session；模拟信号只证明边界逻辑，不冒充浏览器原生事件 |
| AC-08 | 开发服务器与生产预览中，Tab 或点击画布/黑边使输入区 active。按住 ArrowRight ≥1 s，投影 x 单调增加且增量大于 0；ArrowLeft 相反。松开后先等待一次新 tick 的投影发布，再跨 ≥300 ms 读取至少三次样本：tick 继续增加而 x 完全相同。新运行中 N accepted、X accepted、再 X rejected；P 暂停/继续；按住方向键 → P 暂停/继续后不重新按方向键，x 保持不变 | 隔离 Chrome 的可信浏览器按键与 DOM 读数；300 ms 覆盖现有 100 ms 采样窗，记录投影 tick 与 x，不能比较松键前的旧采样 |
| AC-09 | 有效输入区内普通绑定键 keydown/keyup 都 defaultPrevented，方向键不滚动页面（聚焦后的 scrollY 不变）。未绑定键、修饰键/输入法放行符合 AC-05。焦点在开发面板按钮或 Return to menu 时，方向键、N/X/P 无游戏效果且不被游戏适配器 preventDefault；按钮 Enter/Space 仍正常，Tab/Shift+Tab 可离开输入区。菜单与导入页同样无游戏键效果 | 开发服务器和生产预览；在 window 冒泡阶段只观察 defaultPrevented，记录焦点、scrollY、命令结果、phase 与 x。输入法/修饰键组合的完整释放矩阵以 AC-05 Node 测试及 DOM 接线审阅为证，不冒充实机快捷键拦截 |
| AC-10 | 按住 ArrowRight 后聚焦面板按钮，等待松键后发布条件同 AC-08，再跨 ≥300 ms 样本证明 x 不变且 tick 增加，Session 仍 running。实际切到另一标签页使页面 hidden，再返回：仍 paused，重核输入资格后按 P 继续，无新方向键按下时 x 不变，即使发送旧键的自动重复也不移动；重新按下才能移动 | 开发环境必需真实 hidden → visible，按[已验证 CDP 路线](../../../engineering/README.md#已验证的-cdp-自动化路线)记录原生事件与 Session 状态；生产预览必需元素失焦用例。仅窗口 blur/focus 而仍 visible 的原生路径在浏览器中尝试，不能取得时记录精确限制，以 AC-07 生产信号逻辑的 Node 测试和 DOM 接线审阅为该路径证据，不改写为浏览器 passed |
| AC-11 | 开发环境 StrictMode 中往返菜单 ≥3 次并触发一次新 owner 的 Fast Refresh（临时编辑后还原）。当前输入区恰好一对游戏 keydown/keyup 监听；全部旧输入源监听（含元素焦点、窗口 focus/blur、visibilitychange、pagehide/pageshow）撤销平衡，返回菜单无应用输入源监听。每个新运行按一次 N 只产生一个新 runId/commandId 的结果。同 owner 的 Restart 及 Exit → Start 不增加 DOM 监听，轴从 0 开始。生产预览往返一次结论相同 | 探针按目标/回调身份统计登记与撤销，区分输入源、Session 生命周期监听、React 根委托及探针自身；Node 覆盖 release-before-session、重复 dispose、run 替换与旧回调隔离 |
| AC-12 | 真正的生产监听管理逻辑部分登记失败时，逐项撤销已登记监听；回滚成功呈现 unavailable+原始原因，演示/面板可用；回滚也失败保留 RollbackError 并锁存 cleanupFailure，不开始运行，已取得表面及其他资源仍尝试释放。正常撤销逐项继续，失败进入 dispose 的 AggregateError 并锁存；旧源先失效，故意调用保留的旧回调不能写 store、输入或 preventDefault。渲染 unavailable 不影响键盘驱动 | Node 用最小登记/撤销宿主替身驱动实际生产逻辑，分别在每个登记位置和多项撤销注入失败；owner 假源测试另覆盖所有权交接、输入失败 actionError=input 保留 cause、成功轴变更仅清旧 input 错误而 no-op 不清错、失效后回调及 unavailable renderer。稀有失败 React 文案/焦点以审阅为证，不伪造浏览器 passed |
| AC-13 | 输入区的可访问性：容器可用 Tab 聚焦，点击后获得焦点，有可见的焦点样式；可读名称表明这是合成画面与游戏键输入区；说明经 aria-describedby 关联，列出键位文档 §2 的按键，并注明“合成演示键位，不是原版操控”。键盘状态文字随 active/inactive 变化；unavailable 必须展示具体原因而非激活提示 | 开发与生产预览的 DOM、可访问性快照与焦点截图；unavailable 数据及文案接线采用 AC-12 Node+审阅证据，不把无法正常触发的稀有失败列为浏览器 passed |
| AC-14 | 生产输入源不在 window/document 登记游戏 keydown/keyup/keypress，不新建 rAF、定时器或微任务，不调用 Core.step、Runtime.frame/clearIntent 等内部入口；未使用 Pointer Lock、Keyboard Lock、全屏、beforeunload 或 Gamepad。Core、Runtime、Session 契约与源码不变，没有新依赖 | 源码检索和相对任务执行起点（不是仅工作树未提交差异）的完整变更检查，区分 React 委托/测试探针与游戏源 |
| AC-15 | 键位文档改为 active，与绑定表测试及本 Spec 一致：纠正暂停清键、重复不能重建、keyup 放行与内部释放分离、资格恢复、通知边界及失败处理；不声称原版不存在合成对应功能或模拟操作已验证系统拦截。工程约定链接独立文档，结构指南登记 platform/input；无新原版事实则不改原版记录；不存在原版内容 | 完整文档/元数据/链接检查并逐项对照 S-01 与技术决定 12；此前独立草案全文不被当作已批准合同 |
| AC-16 | `pnpm check` 通过（TypeScript、ESLint、Vitest、生产构建） | 命令输出 |

## 验证策略

- **单元/契约测试（计划新增，与源码同目录）：**
  - `platform/input`：分类、修饰键、输入法、重复事件、按住推导，覆盖 AC-01/02/05。
  - `platform/input` 中实际生产的监听管理与资格逻辑：用不含 DOM 类型的最小宿主替身注入登记/撤销失败、保留回调；覆盖 AC-07/12，而不是只测手写的假输入源。
  - `ui/game`：键盘消费者与绑定表，结合真实 Session、store 与 ControlledHost，覆盖 AC-02/03/04/06/07；扩展运行绑定的邻接测试，验证 setInput 在 retired/unbind/旧 run 后不触及运行，并保持 paused 状态错误来自 Session。
  - `app/composition`：扩展 [synthetic-demo-owner.test.ts](../../../engineering/source-structure.md#r5-演示所有者与槽位)，覆盖键盘源的所有权、释放顺序、失败与锁存，以及 unavailable 渲染器（AC-11/12）。
  - 已有的 P1-05 至 P1-08 测试保持通过。不引入 jsdom 或 DOM lib 到 Node/Core；DOM-free 生产逻辑与浏览器连接分开验证，实际 DOM 接线仍须浏览器证据。
- **Replay/一致性：** 键盘只通过既有的 `setInput`/`submitCommand` 进入 Runtime，不改变 TickInput、录制或哈希格式。AC-02 要求键盘驱动的投影与参考 Core 逐位一致；P1-03 的 replay 契约不变。
- **浏览器验证：**
  - 环境：本机已有兼容 Chromium 的隔离临时 profile/context。先核对可复用服务器的项目/origin，否则启动自有 `pnpm dev`；生产预览使用本工作树构建。普通交互可 connectOverCDP；真实 hidden 使用工程指南中已验证的 headed CDP 路线，不能假定普通连接的标签切换一定 hidden。
  - AC-08/09/13 在开发与生产预览均验证；AC-10 的真实 hidden 和 AC-11 的 StrictMode/HMR 用开发环境，其生产要求按各 AC 指定。按键用 CDP/Playwright 可信输入，重复事件显式确认实际 repeat=true；dispatchEvent 的事件只能记录为模拟路径，不能代替真实焦点/可见性。
  - init script 探针只观察监听登记/撤销及 defaultPrevented，不阻止传播或修改应用状态。不因 console 无错误或“只有一个 Canvas”宣称输入接线正确。
  - 页面隐藏按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 的真实可见性回退路线执行，不覆写 `visibilityState`，也不派发合成的 `visibilitychange`。
  - 只使用种子 0 的合成演示；截图只用于说明焦点样式，不入库原版内容。
  - Fast Refresh 证据需要做临时编辑并还原，`git status` 不得留下残留。
  - 结束后只清理自建的浏览器、服务器和临时文件。
- **实机/原版对照：** 不适用。合成按键和 `preventDefault` 都不能证明系统或浏览器快捷键已被拦截，本任务不做此声明；跨系统实机冲突验证归 P0/P5，跨浏览器归 P1-10/P5。
- **工程检查：** 迭代时运行目标 Vitest，例如 `pnpm exec vitest run src/platform/input src/ui/game src/app/composition`；完成前运行 `pnpm check`。不新增 lint 规则，AC-14 以源码检索为证。

## 风险与恢复

风险等级：低到中。改动集中在新的输入适配层、桥接与 owner 的窄扩展以及页面组件，不改变 Core、Runtime、Session，也不涉及持久化；风险主要在于监听泄漏和焦点或拦截的误判。

- **按键卡住或旧重复恢复：** keyup 丢失、恢复焦点或新 run 收到旧键重复可能让 mover 意外移动。缓解：本 Spec 的清键、仅新按下建表与通知边界规则，以及 AC-05/06/07/10。
- **误拦截浏览器或无障碍操作：** 缓解：
  - 只在输入区内、只对绑定键调用 `preventDefault`；
  - 带 Ctrl/Alt/Meta 的组合放行；
  - 不设焦点陷阱（AC-05/09）。
- **监听泄漏或重复：** 往返、StrictMode、HMR 可能让一次按键产生两次效果。缓解：先逻辑失效再逐项撤销、所有获取路径的所有权与回滚，以及 AC-11/12；移除失败即使回调无效仍锁存失败，刷新才能恢复。
- **焦点状态滞留：** window blur 后容器仍是 activeElement，返回未必收到元素 focusin。缓解：重核窗口焦点、页面可见性与输入区资格，恢复只恢复输入通道，不恢复按住/运行（AC-07/10/13）。
- **把演示键位误认为原版：** 缓解：键位文档与输入区说明都标注合成；P 再按继续标为未确认；原版方向键确认后以原版为准。
- **与面板反馈分叉：** 缓解：复用命令反馈与会话控制，不新增判定逻辑（AC-03/04）。
- **恢复：** 按提交回退即可恢复到 P1-08 的状态，没有存档或缓存迁移。修订本契约或键位文档的绑定与规则，都须重新审阅和批准。

## 未决事项

无。用户于 2026-10-02 在本次 review-spec 中再次授权有问题时采用推荐答案。本轮据此修订以下行为；选择已写入本 Spec，但不等于批准完整契约，也不表示旧键位文档已经同步：

- 焦点限定的输入区；
- 演示键位：方向键、N/X、P；
- 修饰键/输入法放行与 keyup 内部释放分离；
- 所有暂停均清键，paused 不登记轴，恢复必须新的非重复 keydown；
- 不在受限通知中同步输入，不修改 Session 来绕过边界；
- 窗口 focus/可见性/pageshow 时重核资格，不自动继续或恢复旧输入；
- 输入源先失效再逐项撤销，所有资源获取与失败路径保留清理原因；
- 实际生产登记/回滚逻辑的故障测试，以及投影发布后的稳定样本；
- 键位文档的位置（`docs/engineering/keyboard-input.md`）。

## 审批

**2026-10-02 用户批准完整 Spec。** 用户调用 generate-goal 并明确写明“approve the spec and generate goal”，批准本轮审阅文本（审阅基线 `sha256:3b610cac805b`）的 S-01 至 S-07、AC-01 至 AC-16、技术决定 1–13 及其引用的键位文档 §2 五行按键与功能映射。独立文档的其余旧草案按 AC-15 同步，不作为另一套行为合同。status 为 accepted，仅表示契约获批，不表示实现完成，也不批准尚未生成的 goal 或授权执行/提交。
