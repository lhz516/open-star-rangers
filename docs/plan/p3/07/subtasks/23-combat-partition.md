---
type: plan
status: active
phase: P3
task: "07"
subtask: "23"
updated: 2026-10-10
---

# 23 — 战斗组 `flight.combat`

**契约来源：** [spec](../spec.md) 的 S-03（读数部分）、S-08（显示状态）、AC-04；[目标与传感](../spec.md#目标与传感)、[能量与显示状态](../spec.md#能量与显示状态)、技术决定 1、6；P3-02 spec 的 [CR-12](../../02/spec.md#cr-12-projection-与-render-stated-01)（`flight.combat`），以及 [P3-06 的契约修订](../../02/spec.md#p3-06-的契约修订检查点-a)的 D-05（`flight: { motion, combat }`）。
**依赖：** 13, 14, 15, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 CR-12 实现战斗组的就绪内容。战斗组是 P3-06 的 `flight: { motion, combat }` 中的 `flight.combat`，不是独立分区；运动组归 P3-06，两组互不覆盖。就绪时为 `{ readiness: 'ready'; player }`，没有玩家实体时 `player` 为 null，否则为 `CombatPlayer`：
  - `entityId`、`destroyed`、`targetMode`；
  - `target`（`CombatTarget`）：种类、名称引用、位置与姿态、距离（f32 坐标差的欧氏距离，T7）、速度（没有移动块时为 null）、护盾读数（机体为 {护盾, c5C}，其他为 null）；
  - `radar`：`status` 为子系统 12，接触点由 13 的雷达函数给出；
  - `resources`：能量 / c54、护盾 / c5C、充能 / c74、船体（原始值，可为负）/ c9C、剩余功率 E / T（D16）；`allocation` 为两个档位；
  - `weapons`：列表 0、1 的序号、当前挂点、武器记录引用（`craftInfo` 的 Asset ID 与 `family`、序号）、弹药（导弹项为从当前挂点起交替链上的弹药之和 `0x2dd04`，炮为 null）、当前挂点的损伤与列表状态（`0x2e438`、`0x2e264`）；
  - `lock`：等级、`losing` 与按 `0x2e080` 的进度；`subsystems`（19 项）；`leftPage`。
- **判别：** 战斗组未实现（`not-implemented`）、就绪而没有玩家（`player` 为 null）、就绪且玩家存活、就绪且玩家已被毁（`destroyed` 为 true）四种状态互不混淆。
- **纯度：** 输出冻结，与内部状态脱离；重复读取、改变读取频率或纯外观不消耗 Core RNG，也不改变玩法状态。
- **测试：** 用合成世界做消费者契约测试：覆盖每个判别；雷达的各边界与受损状态；目标信息的字段；资源、武器与锁定的读数（含导弹的弹药和与列表状态）；输出冻结且与内部状态脱离；重复读取前后的状态、事件与检查点哈希相同。

## 不包含

- 运动组（P3-06）；雷达的屏幕投影、噪点与 HUD 的绘制（P3-13）；Runtime 的读取频率（P3-04）。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)（11 已加入战斗组的类型，为 `not-implemented`）。
- 13 的 `src/core/rules/radar.ts`；14 的 `src/core/rules/mounts.ts`（列表状态与弹药）；16 的页面状态。
- 计划新增：`src/core/projections/combat.ts` 及相邻测试。

## 写入范围

- `src/core/projections/combat.ts`：战斗组的构造（新建）。
- `src/core/projections/combat.test.ts`：消费者契约测试（新建）。
- `src/core/projections/projection.ts`：把战斗组接入 `flight`。
- `src/core/projections/projection.test.ts`：判别测试。
- `src/core/world/world.test.ts`：`populatedState()` 的玩家实体补上 `targeting`（CR-04 的不变量），不改断言。

## 验收标准

- [x] AC-04：未实现、没有玩家、玩家存活、玩家已被毁四种状态不混淆；战斗组位于 `flight` 之内，不覆盖运动组。
- [x] AC-04：雷达的筛选、次序、上限、分类与受损状态满足 CR-12；目标信息只给 CR-12 列出的字段。
- [x] AC-04：资源、分配、武器、锁定、子系统与左页面符合 CR-12 的形状；输出冻结且与内部状态脱离；重复读取不消耗 Core RNG，也不改变状态。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 消费者契约测试。对同一输入，比较读取与不读取 projection 两种情况下的状态与事件；不需要浏览器。

## 完成证据

- **实现（基于认领提交 `3fd9c46`，提交前变基到 `144830f`，其中含本项获批的写入范围扩展）：**
  - [combat.ts](../../../../../src/core/projections/combat.ts)（新建）：`projectCombat` 给出 `flight.combat`，总是 `ready`。没有玩家实体时 `player` 为 null（共享的冻结常量）；否则为 `CombatPlayer`，玩家已被毁时照常给出全部读数并置 `destroyed`。玩家 ID 查不到或不是机体为 `combat.player` 故障，有玩家实体而没有 `targeting`（违反 CR-04）为 `combat.targeting` 故障（同 13 的 `targeting.player-targeting`）。
    - 目标（T7）：玩家目标的 ID 能解析时给出（被毁而仍在表中的目标照常给出），只含 CR-12 的八个字段。速度取移动块的 `speed`，没有移动块时为 null；护盾只对机体给出 {护盾, 目标机型的 c5C}。不按子系统 14 或视角屏蔽，右显示屏的噪点、标记的十字与文字归 P3-13；名称引用在分配时冻结、从不替换，直接共享（同 Render State 的 `presentation`）。距离按 `0x42d80` 的指令次序：f32(√((dy·f32(dy) + dz·f32(dz)) + dx·f32(dx)))，差值为双精度，53 位精度；f32 存储溢出为 `combat.distance` 故障（同 `targeting.distance`）。
    - 雷达：13 的 `readRadar(world.entities, player, world.player.target)`。
    - 资源（D16）：能量 / c54、护盾 / c5C、充能 / c74、船体（原始值）/ c9C、剩余功率 E / T；`allocation` 为两个档位。
    - 武器：列表 0、1 的 `index`（空列表可为 −1）、当前挂点、`{ asset: craftInfo 的 Asset ID, family, index: 挂点 +0x14 }`、导弹挂点的 `chainAmmunition`（`0x2dd04`，炮为 null）、当前挂点的损伤与 `listStatus`（`0x2e438`、`0x2e264`）；空列表的武器、弹药与损伤为 null。
    - 锁定：等级、`losing` 与 `0x2e080` 的进度（规则见下文的原版事实），时钟取世界时钟（同 tick 锁定更新所用）；`IMUL` 回绕、`IDIV` 截断，c34 为 0 时经 `quotient` 为 `combat.lock-progress` 故障。当前列表 1 挂点是炮且需要读 c34（等级 2、3，r ≥ 0）时为 `combat.lock-record` 故障：原版越过 48 字节的炮记录读取，切片中没有机型在列表 1 放炮（W2，已确认，数据），属项目选择。
    - 子系统为 19 项的冻结副本；`leftPage` 为玩家状态的页面。全部输出深度冻结，位置、姿态与子系统数组为副本。
  - [projection.ts](../../../../../src/core/projections/projection.ts)：`flight` 改为 `{ motion: not-implemented, combat: projectCombat(world) }`，去掉两组都未实现的常量；模块说明与 `FlightCombat` 的注释随之更新。运动组（P3-06 的子任务 15）不在本分支，未改动其类型与值。
  - [world.test.ts](../../../../../src/core/world/world.test.ts)（获批的范围扩展，`144830f`）：`populatedState()` 补上 `targeting = initialPlayerTargeting()`，不改断言。
- **原版事实（已确认，代码，P3-07/23；只读核对既有私有输出：被忽略的 `local/research/p3-07/targeting/out/rd.txt` 中 `0x43325`–`0x43369`，`local/research/p3-07/weapons/out/p2` 中 `0x2e080`–`0x2e14e`）。** `executable.md` 由 18 持有，协调者集成后写入，建议文本（英文）：
  - T7 中距离一项改为：“Euclidean distance from the player: the differences (player − target) are formed in double and each squared term is the unrounded difference times its own f32 store (`FST float` before `FMUL float`), summed as (dy² + dz²) + dx², then `FSQRT` and an f32 store (P3-07/23); shown as is or × 0.001 when ≥ 99999.0;”
  - W8 中 `0x2e080` 一句改为：“`0x2e080(handle)` = HUD lock progress (signed): −1 when the handle is invalid, the current list-1 state (+0x110) is null, the losing flag (+0x120) is 1 or the level is 0 or 1; 0 at level 4; otherwise r = stage deadline (+0x11C) − clock (`SUB`, signed test), and at level 2 it is 50 when r < 0, else (100 × r) ÷ c34 + 50, at level 3 0 when r < 0, else (100 × r) ÷ c34, where 100 × r is formed with shifts and adds (wrapping as i32), the divide is a signed `IDIV`, and c34 is +0x34 of the current list-1 state's own weapon record (state +0x10 → mount +0x14), read only when r ≥ 0; for a gun mount that read falls past the 48-byte gun record (P3-07/23).”
- **测试：** `pnpm check` 通过（242 个文件、7,677 项，生产构建成功）；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（71 个文件、2,294 项）；`pnpm typecheck`、`pnpm lint` 通过（含于 `pnpm check`）。期望由 T6、T7、W1–W3、W8、D16 与下列合成记录手算，不由被测实现计算：
  - [combat.test.ts](../../../../../src/core/projections/combat.test.ts)（新建，22 项）：
    - 判别：没有玩家实体时为 `{ ready, player: null }`，运动组仍为 `not-implemented`；玩家实体经正式 `step` 移除后回到 null；被毁的玩家与存活时的读数只差 `destroyed`；三种故障点位。
    - 全部读数：一个含目标（候选名称、速度、护盾 120 / 450）、僚机与停放敌机的世界，`toEqual` 整个 `CombatPlayer`：雷达两个接触点（停放者不在其中，目标有框）、负船体与负 E、档位 3/0、列表 0 的炮与列表 1 的导弹（交替链 3 + 4 发、链上受损使状态为 1）、等级 3 的进度 50、子系统与页 1。
    - 冻结与脱离：深度冻结、子系统与位置不是世界中的对象；改写能量、选择、弹药、子系统、目标位置、页面并经一个 `step` 后，已返回的读数不变。
    - 目标：只有 CR-12 的键；无目标、已被毁目标、已移除目标；停放目标的速度为 null；导弹目标的护盾为 null。距离：玩家在 x = y = 2⁻²⁰ 时，(1000, 1000) 得 1414.2135009765625（f32(d)² 会得 1414.213623046875），(1006, 2000) 得 2238.7578125（双精度平方会得 2238.757568359375），由十进制高精度核对中点；两向对称；√ 与差值的 f32 溢出故障。
    - 雷达：字段 12 的 0/1/2/3 与接触点；125 个敌机为 120 项，目标居首时 119 项且只有它有框。
    - 武器：列表 1 的四个项（导弹链 7、单发 4、炮 null、导弹 1）与列表 0 中的导弹 2 发；空列表与 −1；损伤与状态 0/1/2 的遍历（含同时开火链接）。
    - 锁定进度：等级 0、1、`losing`、没有当前挂点为 −1，等级 4 为 0；c34 = 64 时 r = 32、1、0、−1、−1000 下等级 2 为 100、51、50、50、50，等级 3 为 50、1、0、0、0；c34 取当前挂点（弹药为 0 时锁定由链上的导弹 2 驱动，进度仍按导弹 1 为 15）；100 × 2²⁵ 回绕为 −14680064（等级 2 为 −14680014）；c34 = −8 时 −37；c34 = 0 与当前挂点为炮的故障只在需读 c34 时发生。
    - 纯度：同一世界读三次快照文本不变；用 `longInput` 录制 40 tick（目标、能量页与档位、主炮（充能不足）、导弹选择、损伤报告），每 tick 读 projection 与从不读两种运行的逐 tick 事件、导出的记录与结果（含检查点哈希）和最终快照文本完全相同，并确认读到了目标。开火未用于产生弹体：弹丸与导弹在 22 之前不能运动。
  - [projection.test.ts](../../../../../src/core/projections/projection.test.ts)：分区测试改为战斗组 `ready`、运动组与其他规则分区 `not-implemented`；新增四种状态的判别（以 `FlightCombat` 收窄：未实现、无玩家、存活、被毁）。
- **rubber-duck：** 一项阻断：`world.test.ts` 的 `populatedState()` 构造了没有 `targeting` 的玩家实体，验收命令有 7 项失败；按获批的范围扩展补上夹具，没有改弱 `combat.targeting` 故障（审阅者同意）。其余（距离算术、目标可见性与生命周期、雷达、资源、武器、锁定进度、冻结与分区组合）未发现问题。
- **simplify：** 采纳：内联只用一次的冻结辅助函数；纯度录制由 120 tick 缩为 40 tick（仍含 5 个命令周期与 5 个检查点）；常量注释。未采纳：`populatedState()` 改用 `addPlayerEntity`（获批的范围只补 `targeting`，且会改变夹具的移动块）；删除录制对照的纯度测试与 projection.test.ts 的判别测试（本项的测试要求与写入范围分别要求它们）；按 tick 缓存 projection（会在世界中加状态，超出范围；读取频率归 P3-04，开销与 Render State 同为 O(实体)）；合并 `listStatus` 与 `chainAmmunition` 的遍历、把列表 1 的记录传给进度函数（只有几次查找）；把 `0x2e080` 移到 rules/firing.ts、把距离移到 rules/targeting.ts（需扩大范围；目前只有 projection 使用。P3-08 的 AI 也调用 `0x2e080`，届时可移入规则模块）。
- **文档影响：** [core.md](../../../../engineering/modules/core.md) 的 projection 一节（`flight` 等分区都为 `not-implemented`、`FlightResourceName`/`WeaponRecordReference` 为 `never`）与 [source-structure.md](../../../../engineering/source-structure.md) 的模块清单已过时；按 goal 由 28 更新，应写明战斗组已就绪、`combat.ts` 的职责与上述三个故障点位。原版事实按上文由协调者写入 `executable.md`；U 项不变。STATUS 与阶段索引无需改动。
