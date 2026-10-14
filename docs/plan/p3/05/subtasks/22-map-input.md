---
type: plan
status: active
phase: P3
task: "05"
subtask: "22"
updated: 2026-10-10
---

# 22 — 战略地图输入

**契约来源：** [spec](../spec.md) 的[战略地图输入](../spec.md#战略地图输入)（资格与进入、位置与换算、命令顺序、退出与恢复、无锁回退）、[清键与恢复](../spec.md#清键与恢复)“退出 Pointer Lock”、[数据模型与契约](../spec.md#数据模型与契约)的“地图光标”行，技术决定 9；S-11 的输入部分；AC-12、AC-13 的 Node 部分。
**依赖：** 17、21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/ui/game-input/map-input.ts` 并接入输入消费者：
  - **资格：** 当前 owner/run、running、合格输入区、Core 已报告 `map`、几何（17 的 `MapInputGeometry`）与光标绘制就绪同时满足；只提交 `toggle-map` 不算已打开。帧后仍有用户激活时尝试申请锁定，否则在输入状态中显示“点击地图以锁定”；页面不可见、已失焦或离开地图时不申请；权限 pending 不暂停、不缓存待选目标。几何为 null 时显示“地图输入未就绪”，不锁定、不隐藏系统指针、不提交；几何契约错误显式报告。
  - **位置：** 本地 `{ right, down }` ∈ [0,1]；无锁时用绝对坐标经 17 的换算，锁定后按平台报告单位换算相对移动；resize/全屏/DPR 保留归一化位置；零尺寸停用并退出锁定，恢复须重新取得资格。光标位置以只读端口提供给 17 的绘制。
  - **命令顺序：** 普通移动只保留一个最新待提交 hover，每个 running 帧至多刷新一次；选取时冻结位置，先提交尚未发送的同位置 hover，再提交 select；hover 同步提交失败则本次 select 不发送并显示错误；之后的 hover 不越过先前的 select；多个合法选取按到达次序入队、不合并。无锁时区域外/黑边点击、右键以及用于锁定或聚焦的点击不产生 select，其释放事件同样隔离。
  - **退出与恢复：** 离开地图、失焦、暂停、结束或几何失效时撤销资格并退出本任务的锁定，按清键规则处理；Escape 解锁后地图仍开、处于等待重新锁定，下一次显式点击只重新锁定不选目标；不因指针仍在元素内、帧通知或按键 repeat 自动重锁；pause/解锁期间保留静止绘制用的位置，恢复不自动发送 hover/select。
  - **无锁回退：** 不支持或被拒绝/失败时显示原因类别，进入无锁状态：合法区域内用绝对坐标、自绘光标与相同命令路径，区域外恢复系统指针且不提交；拒绝后不在每帧/每次移动重复申请，重新申请须独立显式操作。
- **起点与左键（按 05 的检查点 K（地图）定稿，见 spec [战略地图输入](../spec.md#战略地图输入)）：**
  - 每次进入地图（交互上下文变为 `map`）重置本地位置为策略给出的起点，不沿用上次打开的位置；进入时几何为 null 的，在这次打开首次取得有效几何时取一次起点，先于绘制、锁定与接受输入，不提交 hover/select；同一次打开内的暂停、解锁/重锁、resize 与几何恢复保留位置。
  - 左键新按下即生效（先补同位置 hover，再 select）；按住时以新按下时 projection 的 `clock.clock` 为起点 c，按策略给出的间隔在既有 running `onFrame` 中观察到期并重复 select（每帧至多一次，到期帧先刷新待提交 hover，再以当前位置提交，下次到期为观察值 + 间隔；无 tick 帧不重复同一到期，不追赶）；松开不产生命令；松开、丧失资格（解锁、失焦、暂停、停止、换运行）、离开地图、几何失效、无锁时离开合法区域或提交失败都取消重复，须新按下。
- **策略参数：** 起点的计算规则与左键按住的重复间隔作为显式参数注入；本项不设生产默认值，生产值（起点公式、间隔 8 个时钟单位）由 26 依 05 的定稿接通。测试以显式合成值验证。
- Node 测试：资格组合、换算与钳制、每次进入地图的起点重置与几何迟到时只取一次、hover 合并与 select 顺序、hover 失败、左键按住重复的入队时钟（按 projection 时钟精确断言 c+间隔前无重复、每帧至多一次、0/1/多 tick 帧与超期不追赶）与各取消条件、松开不产生命令、无锁回退与区域外点击隔离、Escape 主动/被动解锁、重锁不选目标、零尺寸与几何失效、清键与 `clearInput('pointer-lock-exit')` 的次数。

## 不包含

- 地图状态与命令效果、同 tick 门禁（P3-09）；原版布局、生产几何与合成（P3-13）；K 地图定稿值的接通（26）；浏览器像素验证（27）。

## 关键文件与契约

- 17 的 `src/render/map/`；21 的 `capabilities.ts`；20 的 `input-consumer.ts`、`input-status.ts`；[tick-input.ts](../../../../../src/core/contracts/tick-input.ts) 的 `map-point`（`operation`、`right`、`down`）。
- 计划新增：`map-input.ts`、`map-input.test.ts`。

## 写入范围

- `src/ui/game-input/map-input.ts`、`src/ui/game-input/map-input.test.ts`
- `src/ui/game-input/input-consumer.ts`、`src/ui/game-input/input-consumer.test.ts`
- `src/ui/game-input/input-status.ts`、`src/ui/game-input/input-status.test.ts`

## 验收标准

- [x] 资格、未就绪与契约错误区分；锁定申请与无锁回退符合契约。
- [x] hover 合并、select 位置冻结与顺序、hover 失败阻止 select、区域外与锁定用点击隔离均有测试。
- [x] Escape 解锁后地图仍开且重锁不选目标；退出锁定时清键并在 running 时调用一次 `clearInput('pointer-lock-exit')`。
- [x] 每次进入地图按策略重置起点（几何迟到时只取一次，同一次打开内保留位置）；左键新按下即先 hover 后 select，按住按策略间隔重复且入队时钟精确符合 AC-12，松开无命令，各取消条件后须新按下。
- [x] 没有内置起点规则或重复间隔的默认值；`pnpm exec vitest run src/ui/game-input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 端口与队列测试；真实 Pointer Lock 与像素由 27 验证。

## 完成证据

- **实现：** [map-input.ts](../../../../../src/ui/game-input/map-input.ts) 的 `MapInput`（DOM-free）由输入消费者喂入每个会话帧、资格/状态变化与 Pointer Lock 端口转来的指针输入，经同一命令反馈提交 `map-point`，经 21 的能力申请/退出 Pointer Lock，并写输入状态。
  - **策略注入：** `MapInputPolicy { start(geometry), repeatInterval }` 无默认值（间隔须为正整数，否则 `RangeError`）；`policy: null` 时保持“未就绪”，供 25 先接线、26 接通 K 定稿值。另需注入 `geometry` 端口、`cursor`（读取时取得的 17 号绘制器，帧中调用其 `draw()`）、`movementScale`（锁定时每平台报告单位折合的 CSS px，每次移动读取，非有限正数时报告错误并忽略）与 `userActivation`。
  - **打开与起点：** 当前运行的 projection 显示 `map` 即一次打开，换上下文或换运行即结束（光标位置置 null）。每次打开在首次取得有效几何时取一次起点（几何迟到同样），先于绘制、资格与锁定，不提交 hover/select；同一次打开内暂停、解锁/重锁、resize、几何失效后恢复都保留位置。
  - **资格：** 打开 + running + 输入区合格 + 几何有效 + 有策略与起点 + 光标已就绪；新获得资格须先在帧中为当前几何画好光标（防止沿用旧的 `ready`），已有资格跨 resize 保持。获得资格时仅在宿主仍报告用户激活且锁未失败时申请一次 Pointer Lock，否则状态为 `click-to-lock`；失去资格（离开地图、失焦、暂停/停止、换运行、几何为 null/零尺寸/契约错误）丢弃待提交 hover 与按住状态，并退出本任务未结的申请或锁定；端口回报锁定结束时由 21 经 `GameInputConsumer.clear('pointer-lock-exit')` 清键（running 时恰一次 `clear-input`）。
  - **命令：** 移动只留一个待提交 hover，每个 running 帧至多提交一次；左键新按下冻结位置，若最近一次提交的 map-point 未携带此位置则先补 hover，再 select；hover 失败则不发 select。按住：以按下时 projection 的 `clock.clock` 为 c，c+间隔到期，只在 running 帧观察，到期帧先提交待提交 hover 再以当前位置 select，下次到期为观察值+间隔，每帧至多一次、不追赶。松开无命令；松开、失去资格、离开地图、几何失效、提交失败、无锁时离开主地图（或几何变化后位置未知）都取消重复，须新按下。
  - **锁定与回退：** `locked` 下按平台报告单位乘 `movementScale` 换成 CSS px，经 17 的 `moveMapPosition` 移动并钳制；`click-to-lock` 下左键只申请锁定，不选目标；`locking` 期间点击与移动都不生效；Pointer Lock 不支持或最近申请失败为 `unlocked`：主地图内用绝对坐标（减去目标元素客户区，假定 Pointer Lock 目标即几何所量容器）移动与选取，区域外/黑边/右键不提交并显示系统指针，不自动再申请。
- **接入与状态：** [input-consumer.ts](../../../../../src/ui/game-input/input-consumer.ts) 增加可选的 `map` 选项与 `mapCursor`（交给绘制器的只读位置端口）；在帧、会话状态通知、键盘事件与信号、运行解除接线时同步地图输入，经 `CapabilityContext.pointer` 转入指针输入；`clear(reason)` 与取消通知同时清地图的本地状态；地图提交与按键命令共用同一 `#send`（经命令反馈）；订阅自身状态中 `capabilities.pointerLock` 的变化以刷新地图模式。[input-status.ts](../../../../../src/ui/game-input/input-status.ts) 增加 `map { state, systemPointerHidden, error }`（`off`/`invalid`/`not-ready`/`suspended`/`click-to-lock`/`locking`/`locked`/`unlocked`；`invalid` 携带 `MapInputGeometryError` 或起点规则的异常）与 `InputOperation` 的 `map-input`（绘制失败每轮只报一次、移动换算比例无效）。
- **Node 测试：** `pnpm exec vitest run src/ui/game-input`：8 个文件、206 项通过（[map-input.test.ts](../../../../../src/ui/game-input/map-input.test.ts) 20 项、[input-consumer.test.ts](../../../../../src/ui/game-input/input-consumer.test.ts) 新增 4 项共 35 项、[input-status.test.ts](../../../../../src/ui/game-input/input-status.test.ts) 新增 1 项共 6 项）。全部用合成几何与显式合成策略：
  - 起点：以 `mapStartPosition` 作显式规则时每次打开为像素中心公式值，同一次打开内暂停、清键、几何 null 后恢复、resize 都保留，离开再进入或换运行重新取起点（各一次）；几何迟到时只取一次、`start` 先于 `request`，此前无绘制、无提交；无策略或无光标为 `not-ready`；NaN 几何为 `invalid` 并退出锁定、绘制器的同一错误不重复报告，恢复后保留位置；重复间隔 0/负数/小数/NaN/Infinity 拒绝。
  - 资格与锁定：不 running、未聚焦、无运行均不申请；无用户激活为 `click-to-lock`，之后的帧、移动与晚到的激活都不申请，失去后重得资格且有激活时恰一次申请；锁定用点击及其释放不选目标，申请未结期间点击无效；Esc 解锁后地图仍开、帧与移动不重锁，下一次点击只重锁、此前的按住不复活；离开地图、失焦、暂停、换运行、零尺寸各退出锁定；几何恢复须先绘制才重新获得资格，锁定中 resize 保持锁定且按新比例移动；不支持或失败时为无锁回退，失去/重得资格不再申请。
  - 命令：多次移动每帧合并为一个 hover，暂停帧丢弃待提交 hover；按下顺序 `hover, select`，已携带位置的再按只 `select`，多次选取按到达次序不合并，清键后再按先补 hover；hover 失败不发 select、下一次按下两者都发；锁定移动按比例换算并钳制，比例无效时报告且不移动、不选取。
  - 按住重复（AC-12）：c=10、间隔 8 时 12/14/16 无重复，18 恰一次（同时钟再帧无重复），到期帧先 hover 后 select，跨多期的 70 只一次、下次 78；间隔 5 时 15、20；松开、解锁、失焦、暂停帧、停止、换运行、离开地图、几何失效、重复失败、到期 hover 失败后均不再重复，右键松开不影响；无锁时离开主地图后回到区内不复活；无锁时几何变化后系统指针恢复可见且重复结束。
  - 接入（真实所有者/Session/Runtime、ControlledHost、开发录制、13 的真实 Pointer Lock 端口与假宿主、17 的真实绘制器）：打开地图即申请锁定，移动合并，c=4 按下立即 `hover, select`，按 projection 时钟在 12 与 22（跨 5 tick 的帧只一次）重复，0 tick 帧不重复，松开后无命令，各命令由帧后的下一 tick 消费（录制的 tick 输入中 clock 6/6/14/24）；Esc 被动解锁恰一次 `clear-input('pointer-lock-exit')`、地图仍开、帧与移动不重锁、下一次点击只重锁不选；离开地图主动解锁一次 `pointer-lock-exit`，暂停中解锁不调用控制、恢复后重新申请且不自动提交，失焦为 `focus-loss` 后再一次 `pointer-lock-exit`；不支持时区域内点击 `hover, select`、黑边与右键不提交；error 事件拒绝后为 `unlocked`（`rejected`），失焦往返不再申请。
  - 变异检查：去掉按住重复的间隔、获得资格前须为当前几何绘制、选取前补 hover、申请前的用户激活条件、松开取消重复、几何变化时清除无锁位置、失格退出锁定、无锁离开区域取消重复、几何 null 时清除已绘制记录，共 9 处，各至少一项测试失败；新打开时额外的本地清除未被杀死，经分析为冗余（获得资格时已清），已删除。
- **工程检查：** `pnpm typecheck`、`pnpm exec eslint src/ui/game-input` 通过；`pnpm check` 通过（review 前：241 个文件 7292 项、生产构建；review 与 simplify 后：241 个文件 7294 项、生产构建），未出现 5 秒超时。
- **rubber-duck：** 2 项发现均处理：(1) 资格沿用绘制器全局的 `ready`，几何 null→恢复经 `sync`/指针输入即可在重绘前重新获得资格——改为记录本次打开最后一次绘制就绪时的几何，获得资格须与当前几何相同，几何为 null/错误或换打开时清除；已有资格跨 resize 保持（否则帧间 resize 会退出锁定）；补测试。(2) 无锁回退中几何变化后 `inside` 与按住重复过期——几何变化时清除 `inside` 并取消重复，补测试。review 也确认 `map.sync → 能力发布 → map.refresh` 无递归控制。
- **simplify：** 采纳：去掉冗余的 `#live` 字段（由 `#observe` 返回）；`#flush`/`#select` 中重复的 hover 提交合并为 `#hover(select)`；热路径上去掉 `includes` 的临时数组。未采纳：几何比较复用 `map-cursor.ts` 的 `sameFrame`（未导出，且 `src/render/map/` 不在写入范围）；把 `PointerHost` 测试替身移到共享 test-support（`game-input.test-support.ts`、`capabilities.test.ts` 不在写入范围）；以能力的直接回调取代消费者订阅自身状态（需改 `capabilities.ts`，不在写入范围）；缓存几何与 projection 读数（几何端口没有变化通知，实时读取才能及时失格；读数成本低）；分离“呈现就绪”与绘制（涉及 `src/render/map/`）。
- **文档影响：** 本项写入范围不含文档；建议 32 在[键位文档](../../../../engineering/keyboard-input.md)的地图与 Pointer Lock 部分、[ui 模块说明](../../../../engineering/modules/ui.md)与[源码结构指南](../../../../engineering/source-structure.md)记录：`map-input.ts` 的职责、`MapInputPolicy` 无默认值（26 接通）、`InputStatus.map` 的状态集合与 `systemPointerHidden`、`movementScale`/`userActivation` 的注入（25 接线：浏览器可取 `navigator.userActivation.isActive`，`movementScale` 依引擎报告单位而定，须本机核对）、Pointer Lock 目标须为几何所量的无边框/内边距容器，以及无锁时目标外松开不可见（13 的限制）只能靠离开主地图取消重复。真实像素与 `pointerLockElement` 由 27 验证。
