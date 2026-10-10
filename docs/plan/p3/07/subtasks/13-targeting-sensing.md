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

- [ ] AC-03：五种目标操作按 T2–T4 选择，覆盖每个筛选条件、距离并列、模式写入时机、前方判定的边界与回绕；参照目标使同 tick 的连续命令与原版一致；期望独立推导。
- [ ] AC-03：每个命令恰有一个结果与正确的原因码；`target-changed` 只在请求处理中应用 `select-target` 时发出，内容与次序正确；目标的清除不发 `target-changed`。
- [ ] 自动选敌按 CR-07 的到期、视角与目标条件投递请求；右显示屏清除按 CR-10 的三种原因清除目标并发出 `target-cleared`。
- [ ] AC-04（雷达部分）：接触点的筛选、次序、目标框、上限 120、分类、`near` 与受损状态符合 CR-12；选取不改变状态、不消耗 RNG。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：在合成世界中放置已知位置与种类的实体，断言候选次序与选择；经正式 `step` 断言命令结果、请求处理中的事件与自动选敌。
- 不涉及浏览器；原版对照见 26、27。

## 完成证据
