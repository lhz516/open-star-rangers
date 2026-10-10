---
type: plan
status: active
phase: P3
task: "07"
subtask: "13"
updated: 2026-10-10
---

# 13 — 目标与传感

**契约来源：** [spec](../spec.md) 的 S-03、AC-03，以及 AC-04 的雷达部分；[目标与传感](../spec.md#目标与传感)；P3-02 spec 的 [CR-05](../../02/spec.md#cr-05-命令原因码与内部请求d-01)（`target` 命令、参照目标与 `select-target`）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`target-changed`、`target-cleared`）、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（自动选敌）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（玩家目标的分工）、[CR-10](../../02/spec.md#cr-10-帧尾的驾驶舱显示步d-01)（右显示屏的目标清除）、[CR-12](../../02/spec.md#cr-12-projection-与-render-stated-01)（雷达）。
**依赖：** 01, 12, 30。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **`target` 命令（CR-05，T2–T4）：** 共同前置判定（`player-unavailable`、`wrong-context`）之后：
  - `enemy`、`friendly` 取该模式掩码中最近的候选（`0x2799c`）；`forward` 取前方候选（`0x27a04`/`0x63a4c`，固定的逻辑视野，不读渲染），并按所选对象的种类写模式；`next` 取更近一项，没有时回绕到最远；`previous` 取更远一项，没有时回绕到最近。
  - 没有候选 → `no-candidate`；结果等于参照目标 → `no-change`；两种情形都不写任何状态。
  - 否则 `accepted`：`enemy`、`friendly`、`forward` 在判定时立即写入模式（`next`、`previous` 不写模式），目标经 `select-target` 请求在本 tick 的请求处理中写入。
- **参照目标：** 使用 11 的只读查询：本 tick 由先前命令投递而尚未应用的最后一个 `select-target` 的目标，没有时为玩家目标（`next`、`previous` 只在它可解析时用作参照）。同 tick 的连续命令因此与原版相继几帧的按键一致。
- **`select-target` 请求（CR-05、CR-06）：** 应用时不再校验，写玩家目标；每应用一个请求发出一次 `target-changed`（前后目标、模式、`origin` 与 `commandIndex`）。
- **自动选敌（CR-07，T3）：** 在玩家更新末尾（11 的接入点）：时钟严格大于 `autoTargetDueClock` 时重设到期为时钟 + 0x40；视角不在 0、1、6 与 0x11/8，且实际的玩家目标为空（不看同 tick 尚未应用的请求）时，取最近的敌方并投递 `select-target`（`automatic`），成功时模式写为 `enemy`。
- **右显示屏的目标清除（CR-10，T7）：** 作为函数交付，由 16 的帧尾显示步按视角门禁与仪表次序调用。玩家实体存在、玩家目标非空时：目标不可解析 → `invalid`；视角模式为 6 → `base-view`；目标的 `inWarp` 为真 → `warp`。三者都把目标清为 null 并发出 `target-cleared`。
- **雷达（CR-12，T6）：** 纯函数，供 23 组装：
  - 接触点取种类 `0x21fffff` 中不处于停放、状态为 4 或 ≥ 7、有移动块、不是玩家的对象，按遍历次序；每加入一个真实接触点后计数，接触点是玩家目标且计数 < 120 时再计入一个目标框，计数达到 120 时停止；
  - 每个接触点给出偏移（接触点位置减玩家位置，f32）、分类（`friendly`、`hostile` 或 `marker`；导弹按可解析的发射者分类，否则为 `hostile`）、`missile`、`near`（曼哈顿距离截断为 i32 后 < 600）与 `target`；
  - `status` 为子系统 12，为 2 时没有真实接触点；
  - 读取不改变状态、不抽取随机数；随机噪点、屏幕投影与重建节奏归 P3-13。
- **测试：**
  - 每个筛选条件、距离并列、模式的写入时机、前方判定的边界、`next`/`previous` 的回绕；同 tick 连续命令的参照目标。
  - 命令结果与原因码；`target-changed` 在请求处理中按应用次序发出，内容正确；目标的清除不发 `target-changed`。
  - 自动选敌的严格比较、视角条件与“实际目标为空”。
  - 右显示屏的三种清除与 `target-cleared`。
  - 雷达的筛选、次序、目标框、上限 120、分类、`near` 与受损状态。
  - 期望独立推导。

## 不包含

- 其他目标清除：失效与停放归 P3-06（不发事件），Warp 开始归 P3-09，进入基地视角归 P3-10，进入被毁视角归 P3-11（CR-09）；右显示屏清除的视角门禁与调用时机（16）。
- 战斗组的组装（23）；雷达投影、噪点与显示屏绘制（P3-13）；键位（P3-05）；AI 选目标（P3-08）。

## 关键文件与契约

- `src/core/systems/targeting.ts`（11 新建）：命令判定、`select-target` 请求、自动选敌与右显示屏清除的接入。
- 11 的参照目标查询；30 写入 [cockpit](../../../../original/formats/cockpit.md) 的仪表类型（右显示屏所在的布局，CR-10 的依据）。
- 计划新增：`src/core/rules/targeting.ts`、`src/core/rules/radar.ts` 及相邻测试。

## 写入范围

- `src/core/systems/targeting.ts`：目标命令、`select-target` 请求、自动选敌与右显示屏清除。
- `src/core/systems/targeting.test.ts`：目标系统测试（新建）。
- `src/core/rules/targeting.ts`：候选与前方判定（新建）。
- `src/core/rules/targeting.test.ts`：候选测试（新建）。
- `src/core/rules/radar.ts`：雷达接触点（新建）。
- `src/core/rules/radar.test.ts`：雷达测试（新建）。
- `src/core/systems/commands.test.ts`：`target` 不再是未实现命令、自动选敌入口不再“不改变状态”对应的断言更新。
- `src/core/systems/flight-control.test.ts`：作为未实现命令示例的 `target` 换成其他未实现命令。
- `src/core/world/world.test.ts`：`target` 命令结果的断言更新。

## 验收标准

- [x] AC-03：五种目标操作按 T2–T4 选择，覆盖每个筛选条件、距离并列、模式写入时机、前方判定的边界与回绕；参照目标使同 tick 的连续命令与原版一致；期望独立推导。
- [x] AC-03：每个命令恰有一个结果与正确的原因码；`target-changed` 只在请求处理中应用 `select-target` 时发出，内容与次序正确；目标的清除不发 `target-changed`。
- [x] 自动选敌按 CR-07 的到期、视角与目标条件投递请求；右显示屏清除按 CR-10 的三种原因清除目标并发出 `target-cleared`。
- [x] AC-04（雷达部分）：接触点的筛选、次序、目标框、上限 120、分类、`near` 与受损状态符合 CR-12；选取不改变状态、不消耗 RNG。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：在合成世界中放置已知位置与种类的实体，断言候选次序与选择；经正式 `step` 断言命令结果、请求处理中的事件与自动选敌。
- 不涉及浏览器；原版对照见 26、27。

## 完成证据

- **实现（基于认领提交 `d6bb9d7`）：**
  - [rules/targeting.ts](../../../../../src/core/rules/targeting.ts)：两种模式的种类掩码、`forwardMode` 与友方分类 `isFriendlyKind`（`0x6c87f`）、候选筛选（活动 1、状态 ≥ 7、不在 Warp）、`0x637e4` 的平方距离（x 两个因子都取 f32，y、z 一个，未舍入）、`0x63858`（未舍入的 d 与 f32 参照比较，再比 f32，严格取小、并列取先）、`0x63954`（全程 f32，两边严格，起点 +0.0）与 `0x63a4c`（复用 collision-shapes.ts 的 `0x56dc0`，深度 f32 严格大于 5，横向 x² + y² 不严格对比候选机型的 r²，取最小深度，没有距离上限）。存储 d32 溢出 f32 为 Core 故障。
  - [rules/radar.ts](../../../../../src/core/rules/radar.ts)：`readRadar` 按遍历次序取种类 `0x21fffff` 中非停放、状态 4 或 ≥ 7、有移动块、不是玩家的对象；每个接触点计 1，是玩家目标且计数 < 120 时目标框再计 1，计数到 120 停止（CR-11 差异 7）；偏移为 f32 差；分类按 `0x6c87f`，导弹按可解析的发射者，否则敌对，种类 25 为 `marker`；`near` 为 (|dx| + |dy|) + |dz| 截断为 i32 后 < 600，超出 i32 为故障；`target` 表示计入了目标框；状态取子系统 12，为 2 时没有真实接触点。结果深度冻结，不改状态、不抽随机数。
  - [systems/targeting.ts](../../../../../src/core/systems/targeting.ts)：`judgeTargetCommand`（共同前置判定 → 参照目标 → 选择；`no-candidate`/`no-change` 什么都不写；`enemy`、`friendly`、`forward` 立即写模式；投递 `select-target` 后 `accepted`）；`applySelectTarget`（不再校验，写目标并发出 `target-changed`，`mode` 为应用时的模式，主体不是玩家实体为故障）；`selectAutomaticTarget`（时钟严格大于到期时重设为时钟 + 0x40，视角不在 0、1、6 与 0x11/8 且实际目标为空时投递最近敌方并写 `enemy`；到期超出安全整数为预算故障）；`clearRightDisplayTarget`（玩家实体存在且有目标时，按 `invalid` → `base-view` → `warp` 的优先次序清除并发出 `target-cleared`）。`selectAutomaticTarget` 的调用点归 22，`clearRightDisplayTarget` 的视角门禁与调用归 16。
  - 获批的范围外改动（协调者 `39e7add`，只改期望）：commands.test.ts 的未实现命令列表去掉 `target`、次序测试中 `target` 为 `no-candidate`、入口测试只留导弹锁定，`flightState` 补写 `targeting`；flight-control.test.ts 的 `OTHERS` 以 `toggle-map` 代替 `target`；world.test.ts 中 `target` 与 P3-06 的命令一起为 `player-unavailable`。
- **测试：** `pnpm check` 通过（224 个文件，7,247 项，生产构建成功）；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（53 个文件，1,864 项）；`pnpm typecheck`、`pnpm lint` 通过。期望由 T2、T6、T10 的算术与测试放置的位置手算：
  - [rules/targeting.test.ts](../../../../../src/core/rules/targeting.test.ts)：掩码与 M2ID 表、20 种机型的前方模式；筛选的每个条件（Warp、停靠、停放、各状态，被毁标志不影响）；`0x637e4` 的 x 与 y/z 不同舍入（1 + 2⁻²² + 2⁻⁴⁶ 对 1 + 2⁻²² + 2⁻³⁰ + 2⁻⁴⁶）；a = 1 + 2049·2⁻²³ 使 d32(a²) 向上舍入，从而 `previous` 排除与参照几何等距的候选而接纳 f32 相等、未舍入不小于参照的候选，`next` 跳过 f32 相等的候选；种类位优先于分配次序的并列；参照自身的排除；距离 0；前方的 5 边界（5 与 5 + 2⁻²⁰）、横向 r² 的等号与 25 − 2⁻¹⁹、姿态与位置、并列取先与无距离上限；f32 溢出故障。
  - [rules/radar.test.ts](../../../../../src/core/rules/radar.test.ts)：筛选与次序（被毁源、命中弹丸状态、停靠、Warp 中的保留，停放、其他状态与种类 21、22、24 的排除）；f32 偏移；全部 20 种机型、导弹按发射者（含失效与空）与标记的分类；`near` 的 599.5、599.99997、600 与 i32 故障；目标框；容量 125 → 120、目标居首 119、第 119 个的目标框占满、第 120 个无框；子系统 0–3 的状态与接触点；读取不改快照文本与 RNG、结果深度冻结。
  - [systems/targeting.test.ts](../../../../../src/core/systems/targeting.test.ts)：经正式 `step`：`f`/`t` 的结果、请求处理中的 `target-changed` 内容与次序、模式；七种 `no-change`/`no-candidate` 情形与空闲世界的快照文本相同（模式也不写）；`next`/`previous` 的回绕与不写模式；同 tick 的 `[t, r, r, t, t]` 与 `[f, r, t]`（参照目标与立即写模式）；`forward` 对敌方、友方与僚机写模式；前置判定的五种操作；不抽随机数；缺少 `targeting` 或候选机型的规则数据为故障。请求处理：不再校验（先离开再被选中）、按投递次序、末者生效、主体不是玩家为故障；移除的目标被 P3-06 丢弃而不发事件。自动选敌：到期严格比较与重设、七种视角/子模式、实际目标与同 tick 待处理的命令选择、无敌方、到期溢出。右显示屏：三种原因、两种优先次序、被毁目标与正常目标不清除、无玩家实体。
- **rubber-duck：** 未发现阻断问题。采纳两项非阻断：为 `targeting.player-targeting`、`targeting.craft-shape` 两个故障补测试；雷达分类改为覆盖全部 20 种机型与导弹发射者。
- **simplify：** 采纳：`0x6c87f` 只在 rules/targeting.ts 定义一次（`isFriendlyKind`，雷达复用）；`RADAR_SUBSYSTEM`、`radarStatus`、`FORWARD_MINIMUM_DEPTH` 改为模块私有；最小值搜索去掉元组赋值，`0x63858` 以 Infinity 为起点；测试的 `cycle` 返回标量。未采纳：复用 name-assignment.ts 的 `inMask` 与 flight-motion.ts 的 `store`（均为范围外的私有函数）；`next`/`previous` 回绕时的第二次遍历（与原版的两次调用一致，开销可忽略）；`pointInFrame` 的分配与雷达重复的差值（可忽略）；把 `RadarContact` 类型移入 rules（projection.ts 归 23，现为仅类型导入，无运行时循环）；把 `chooseTarget` 与视角门禁移入 rules（本项的关键文件把命令判定放在 systems/targeting.ts）。
- **文档影响：** 雷达对子系统 12 的值 3 按 0 构建（原生指令只在 `0x40399` 判 2、在 `0x4078a`/`0x408d1` 判 1 与 2；已确认，代码，私有反汇编），这一事实应写入 executable.md 的 T6，该文件不在本项写入范围，已在交接中提请协调者。`target-changed.mode` 取应用时的模式（请求不带模式，同 tick `[f, t]` 两个事件都为 `enemy`）。[core.md](../../../../engineering/modules/core.md) 与 [source-structure.md](../../../../engineering/source-structure.md) 的新模块说明按 goal 归 28。U 项不变。
