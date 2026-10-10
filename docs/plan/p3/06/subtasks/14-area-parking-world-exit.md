---
type: plan
status: active
phase: P3
task: "06"
subtask: "14"
updated: 2026-10-10
---

# 14 — 活动区域、停放与离开世界

**契约来源：** [spec](../spec.md) 的 S-06；AC-06；[活动区域、停放与世界边界](../spec.md#活动区域停放与世界边界)；D-02（停放切换、编队）、D-03（停放时清除目标）、D-06（`object-left-world`）、D-08；检查点 A 定稿的 `warpClock`/`inWarp`、AI 初态与停放中的 Warp 跳跃。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **活动区域（`area-check`，第 17 阶段）：** 遍历种类 `0x1fffffe`、状态为活动及以上；与实例化共用同一判定函数（重构 [spawn.ts](../../../../../src/core/systems/spawn.ts) 的 `startsActive`，结果不变；没有玩家实体时一律在区外）。区外且活动 → 区域切换（种类位 `0x1f00000` 改为待移除，不发事件）；区内、停放且不在 Warp 中 → 区域切换；其余不变。直接写状态，不释放任何东西。Warp 期间的中心归 P3-09。
- **停放切换（扩展 `leave`）：** 活动或停靠 → 停放：释放移动块，只在玩家目标恰为该实体时清除玩家目标；停放 → 活动：用 10 的初始移动块函数新建移动块。都不改计时字段。
- **Warp 过境（`0x2f298`）：** `inWarp` 且 `warpClock` 非零时，过境持续机型 +0xA8 秒（有效编队领队时取领队的机型）；未结束返回“过境中”，结束时清 `inWarp`。实体自身更新的通用部分（状态新建、表现就绪）在过境中不推进状态；停放更新在过境中跳过本实体的其余步骤。
- **停放更新（`parked-update`，第 13 阶段）：** 遍历种类 `0xfffff`，选停放、状态为活动及以上、未被毁的实体；每个每 tick 抽一次世界随机数得到随机阈值，时钟不早于 `lastParkedUpdateClock` + 阈值时到期；到期时先算经过时间并写 `lastParkedUpdateClock`，再做过境检查与停放行进。停放战斗归 P3-07/P3-08，不做。
- **停放行进（`0x2f314`）：** 已失效的编队领队清为 null 并结束本次；主体为有效领队或自身；按主体的 AI 模式取目标（模式 2 时有效的对象目标优先，否则取 AI 目标；对象目标由 P3-08 写入，本项经内部状态测试；模式 1、5 不运动；目标失效或在 Warp 中不运动）；目标点与零偏移的随机替换（用 10 的随机方向）。依次实现：到达（清偏移、模式 4 无领队时经来源记录的放置路线取新目标点、清 `inWarp`、离开世界测试）、停放中的 Warp 跳跃（条件、长度、6 次抖动、`warpClock`/`inWarp` 的写入；有领队时取领队的 `warpClock` 后编队跟随）、正常行进（姿态重建、步长按机型 +0xB8、6 次抖动）、编队跟随与姿态重建。每次写位置使放置序号加 1。基地相关的报告归 P3-10，不做。
- **离开世界：** 到达分支中，主体本次更新前的位置（忽略 z）在内缩 100 的世界矩形之外（严格比较）且种类不是僚机时，直接写待移除并发出一次 `object-left-world`（带来源快照）；下一 tick 由自身更新提出移除。重新放置与其他情形不发事件；域外错误不是规则退场。
- **活动对象的世界边界：** 不处理（M-07）；测试活动对象越出世界矩形时状态不变。
- **测试：** 区域内、等号、外与无玩家；离区停放（含停靠）与入区恢复，过境中不恢复；`0x1f00000` 分支（内部状态构造）；移动块释放与重建；只清除恰为该对象的玩家目标；停放更新的筛选、每实体每 tick 一次抽取、到期等号与经过时间；过境的持续、结束与生命周期门禁；停放行进各分支、编队跟随、领队失效、零偏移替换；离开世界的条件、僚机例外与一次事件；重新放置不误算退场；放置序号与 Render State 消费者。

## 不包含

- 玩家 Warp、Warp 完成与玩家 Warp 期间的区域中心（P3-09）；AI 程序对 AI 状态的改变、Warp 离场请求与停放战斗（P3-07、P3-08）；基地报告（P3-10）；事件 2 的计数（P3-11）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `leave`、`PIPELINE`；[spawn.ts](../../../../../src/core/systems/spawn.ts)；[render-state.ts](../../../../../src/core/projections/render-state.ts)。
- 计划新增：`src/core/systems/area.ts`（区域、停放更新、离开世界）、`src/core/rules/active-area.ts` 等纯函数及相邻测试。
- 04 的完成证据与检查点 A 定稿。

## 写入范围

- `src/core/systems/pipeline*.ts`：`area-check`、`parked-update` 的接入与 `leave` 的扩展及测试。
- `src/core/systems/area*.ts`：区域与停放（新建）及测试。
- `src/core/systems/spawn*.ts`：共用区域判定。
- `src/core/rules/**`：区域、停放与世界边界纯函数（新建）及测试。
- `src/core/world/**`、`src/core/projections/render-state*.ts`：状态读写与放置序号测试所需的最小改动。
- `src/core/systems/movement.test.ts`、`src/core/systems/flight-control.test.ts`：区域检查与停放切换接入后，修正假定它们不存在的既有测试（只改测试；2026-10-10 协调者按 scope-request 加入）。

## 验收标准

- [x] AC-06：区域判定的严格边界与共用；区域切换各分支与 `0x1f00000` 分支；停放切换时机符合 Q-08；移动块释放与重建；停放更新的节奏、抽取与经过时间；Warp 过境与停放中的 Warp 跳跃；停放行进与编队跟随；真正退场一次事件并在下一适用阶段移除；重新放置不误算退场；停放中的位置写入增加放置序号；活动对象越出世界矩形状态不变。
- [x] 只清除恰为停放对象的玩家目标；实例化时的活动判定结果不变（P3-02 测试仍通过）。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 边界、生命周期与 Render State 消费者测试；期望独立推导。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据

- **实现：**
  - [rules/active-area.ts](../../../../../src/core/rules/active-area.ts)（新建）：`0x3a540` 的 `activeAreaCentre`（玩家实体位置，没有玩家实体时为 null；玩家 Warp 期间的中心留给 P3-09）与 `isWithinActiveArea`（x/y 距离平方严格小于 56,250,000，双精度）；种类位 20–24（`0x1f00000`）的 `isRemovedOnLeaving`；停放退场测试 `isOutsideExitBounds`（`0x3a41c` 的 ±7500 × n 内缩 100，严格比较，边界算在内，忽略 z）。[coordinates.ts](../../../../../src/core/rules/coordinates.ts) 新增 `worldHalfExtent`，放置的世界检查改用它。
  - [rules/parked-travel.ts](../../../../../src/core/rules/parked-travel.ts)（新建，纯函数，按原版的存储点逐步 `Math.fround`，非有限的 f32 存储为故障）：到期判定（时钟 ≥ 上次 + 64 + rand % 64）；`0x2f298` 的过境（Warp 计时 + +0xA8 × 64 之前）与 `0x2ff98` 的许可（+0xA4 > 0，且计时为 0 或时钟晚于计时 + (+0xA8 + +0xA4) × 64）；目标距离（f32 差值，双精度和 dx·F(dx) + (dy·F(dy) + dz·F(dz))，到达为严格小于 10000）；跳跃距离（(+0x0C)² × 4 < f32 距离平方）；零偏移的随机替换（长度 rand % 500 + 800，或模式 2 无有效对象目标时 max(rand % trunc(目标机型 +0x0C), 800)，再取随机方向，共 3 次抽取；模数小于 1 或超出 i32 为故障）；`0x56aa8` 归一化；朝向目标的姿态重建（第三行为差值乘 1 ÷ f32 距离，未舍入的 |z| 大于 0.5 时参考向上取 x 轴，第一行为归一化的 up × forward，第二行为 forward × 第一行）；跳跃长度（+0xA0 严格介于 1 与距离之间时取它）；行进长度（经过时间 ÷ 64 × 机型 +0xB8，未舍入地与距离比较）；沿第三行前进；抖动（每轴先符号后大小，奇数加、偶数减，跨度 1000 或 20，6 次抽取）；`0x56e34` 的编队位置（偏移和先存 f32 再加领队位置）。
  - [systems/area.ts](../../../../../src/core/systems/area.ts)（新建）：第 17 阶段 `checkActiveArea`（遍历 `0x1fffffe`、状态 7、8；区外的活动对象写区域切换，`0x1f00000` 写待移除；区内、停放且不在 Warp 中写区域切换；其余不变，不释放、不抽取）；停放切换 `switchParking`（只对区域切换且种类会停放的实体：停放时 `setActivity` 释放移动块，只在玩家目标恰为该实体时清除它；恢复时用 `initialMovementBlock`；不改计时字段；否则返回 false，由移除处理）；`checkWarpTransit`（有效领队时用领队的机型，结束时清 `inWarp`）与 `isHeldInWarpTransit`（状态 0–3，玩家种类除外：只有通用回调 `0x20c18` 调用 `0x2f298`）；第 13 阶段 `updateParked`（遍历 `0xfffff`，停放、状态 7 及以上、未被毁的实体每 tick 抽一次，到期时先写经过时间与 `lastParkedUpdateClock`，过境中跳过）与停放行进（失效领队清为 null 且不动；主体为有效领队或自身；目标、偏移、到达、跳跃、行进、编队跟随按原版次序；每次写位置使放置序号加 1；到达时有目标则清本实体的偏移，无领队且模式 4 时经来源记录（成员取其编组模板，`memberOf`）的 `0x68598` 取新目标点，清 `inWarp`，主体在内缩矩形外且种类不是僚机时写待移除并发出 `object-left-world`）。停放战斗、基地报告与玩家 Warp 期间的中心在代码中标出插入点。
  - [placement.ts](../../../../../src/core/rules/placement.ts)：把 `0x68398` 末尾的矩形与全世界缺省路线提取为 `areaPoint`（`0x68598`），放置行为不变。[spawn.ts](../../../../../src/core/systems/spawn.ts)：`startsActive` 改为调用共用的 `activeAreaCentre` 与 `isWithinActiveArea`。[pipeline.ts](../../../../../src/core/systems/pipeline.ts)：接入 `parked-update` 与 `area-check`；`leave` 先试 `switchParking`，其余移除（含区域切换中的 `0x1f00000` 种类）；通用生命周期更新先问 `isHeldInWarpTransit`；`object-sets` 的注释按 P3-02 的修订更新，阶段仍为空。[entity-table.ts](../../../../../src/core/world/entity-table.ts) 导出 `ZERO_VECTOR`。
  - **项目规则（09 交接的负持续时间）：** 原版对绝对计数器的 u32 样本相加并按无符号比较，负的 +0xA8 或 +0xA8 + +0xA4 只在计数器小于其绝对值时回绕；Core 的时钟从世界创建开始且不回绕，因此按精确整数计算：负持续时间使过境在首次检查时结束，也不推迟 Warp。原版计数器大于该绝对值时两者一致（记于 parked-travel.ts 的模块注释，交 19 写入 Core 分册）。
- **测试（期望由文档中的常数与公式独立写出，随机值直接从世界 RNG 状态预测，不调用被测模块）：**
  - [rules/active-area.test.ts](../../../../../src/core/rules/active-area.test.ts)（5 例）：半径 7500 的严格边界（7499.5 在内、7500 与 (4500, 6000) 在外）、z 忽略、无中心全在外；种类位恰为 20–24；内缩矩形 ±44900 的边界在内、略外在外。
  - [rules/parked-travel.test.ts](../../../../../src/core/rules/parked-travel.test.ts)（20 例）：到期等号与 rand % 64；过境与许可的等号、+0xA4 ≤ 0、负持续时间的项目规则；到达的严格边界与 f32 差值；跳跃距离的严格比较；偏移长度的两种取法与故障；`0x56aa8`（(1, 1, 0) 得 0.70710677）；平面与陡峭朝向、|z| = 0.5 取 z 轴；跳跃与行进长度的边界；f32 前进；抖动的符号、次序与 −0；编队位置及偏移和先存 f32（2⁻²⁴ + 1 先舍入为 1）。
  - [systems/area.test.ts](../../../../../src/core/systems/area.test.ts)（30 例）：区域检查各分支（区内、圆上、区外、命中弹丸、`0x1f00000`、恢复、Warp 中、区外停放与停靠、状态未到 7、玩家种类不遍历）、只写状态且不抽取、无玩家全在外、以玩家为中心；停放切换（活动与停靠释放移动块、计时不变、只清除恰为该实体的玩家目标，其他实体的 AI 目标、对象目标、编队领队与辅助状态保留；恢复的移动块逐字段；不在区域切换或 `0x1f00000` 种类时不切换），运行中的 Q-08 时机（N 标记、N+1 切换且不抽取、N+2 活动并抽取一次、恢复后下一次更新运动），`0x1f00000` 区域切换时被移除且无事件；过境保持新建直到结束、结束时清标志、领队的机型、玩家不受阻、只在状态 0–3；停放更新的筛选与每实体每 tick 一次抽取、到期等号与经过时间、过境中跳过；行进（长度、朝向、抖动、放置序号）、模式 1 与 5 不动、跳跃（+0xA0 上限与距离、抖动 999）、计时禁止时行进、Warp 离场请求时跳跃、编队跟随与领队 Warp 中的跟随跳跃、失效领队、目标加偏移与随机偏移存入主体、模式 2 的对象目标优先与机型长度、目标在 Warp 中或失效时不动；到达时成员取模板矩形、记录取自身矩形、僚机取全世界缺省、不写位置并清 `inWarp`，只清本实体的偏移；退场按主体位置一次事件（含来源快照），僚机与边界上的不退场，待移除后不再选中，下一 tick 移除；跳到世界外不算退场；活动对象越出世界矩形状态不变、照常运动、无事件。
  - [render-state.test.ts](../../../../../src/core/projections/render-state.test.ts)：新增停放行进的 Render State 消费者用例（停放中行进使放置序号变为 1，恢复后两帧消费者不跨停放插值）。
  - 既有测试的修正（区域检查在没有玩家实体时把实体停放，切换会释放移动块）：[pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts) 的阶段表断言加入两个阶段，三个用例加入玩家实体，切换用例断言移动块的释放与重建；[spawn.test.ts](../../../../../src/core/systems/spawn.test.ts) 的“无玩家时停放”用例改为断言玩家出现后由区域检查恢复（实例化时的判定不变，其余 P3-02 用例未改）；[render-state.test.ts](../../../../../src/core/projections/render-state.test.ts) 两个用例加入玩家实体或把停放实体放到区外；[movement.test.ts](../../../../../src/core/systems/movement.test.ts) 一个用例改用区域检查不遍历的种类位 0；[flight-control.test.ts](../../../../../src/core/systems/flight-control.test.ts) 区域切换中的玩家停放后移动块为 null。共用的测试支持：`addPlayerEntity`（[world.test-support.ts](../../../../../src/core/world/world.test-support.ts)）与 `randValues`、`rngStateAfter`（[rand.test-support.ts](../../../../../src/core/rules/rand.test-support.ts)，由 spawn.test.ts 移入）。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（48 个文件，1,574 例）；`pnpm check` 通过（typecheck、lint、219 个测试文件 6,957 例、build）。
- **审查：** rubber-duck 审查完整差异（对照本 subtask、spec 与 `0x2f314`、`0x2f1b0`、`0x2f298`、`0x2ff98`、`0x56aa8`、`0x56e34` 的原生指令），没有发现问题。simplify：共用测试支持（玩家实体、RNG 预测）、合并重复的 `due` 辅助；把 `activeAreaCentre` 移到 rules（spawn 不再依赖区域系统）、`PARKED_UPDATE_KINDS` 移到系统模块、过境门禁与停放切换的判定移入 area.ts（流水线不再了解种类与状态集合）；合并跳跃与行进的前进与抖动；复用 `ZERO_VECTOR`；`ARRIVAL_DISTANCE_SQUARED` 改为私有。未采纳：与 flight-motion、flight-control 共用 f32 存储与机型记录查找（各自的故障位置不同，沿用既有模式）；拆分 `travelParked`（保持与 `0x2f314` 相同的线性次序）；`formation !== null` 的冗余判断（类型收窄需要）；每 tick 的少量临时对象（开销可忽略）。
- **文档影响：** 本项不改文档。[Core 模块说明](../../../../engineering/modules/core.md)的阶段表第 13、17 行、`leave` 的停放切换与移除、实体自身更新的过境门禁、新模块与负持续时间的项目规则，以及[源码结构指南](../../../../engineering/source-structure.md)的新模块，属 19 的同步范围；executable 可补入本项核实的数值细节（到达时清除的是本实体而非主体的偏移、随机偏移存入主体、`0x68598` 的路线与模板选择、|z| 用未舍入值比较、行进步长未舍入地比较、`0x56aa8` 与 `0x56e34` 的运算次序），同样交 19。原版事实与 U 项没有新结论，STATUS 与阶段索引无需改动。
