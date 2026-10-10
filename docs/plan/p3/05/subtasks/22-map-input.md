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

- [ ] 资格、未就绪与契约错误区分；锁定申请与无锁回退符合契约。
- [ ] hover 合并、select 位置冻结与顺序、hover 失败阻止 select、区域外与锁定用点击隔离均有测试。
- [ ] Escape 解锁后地图仍开且重锁不选目标；退出锁定时清键并在 running 时调用一次 `clearInput('pointer-lock-exit')`。
- [ ] 每次进入地图按策略重置起点（几何迟到时只取一次，同一次打开内保留位置）；左键新按下即先 hover 后 select，按住按策略间隔重复且入队时钟精确符合 AC-12，松开无命令，各取消条件后须新按下。
- [ ] 没有内置起点规则或重复间隔的默认值；`pnpm exec vitest run src/ui/game-input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 端口与队列测试；真实 Pointer Lock 与像素由 27 验证。

## 完成证据
