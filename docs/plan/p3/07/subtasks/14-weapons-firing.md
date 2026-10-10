---
type: plan
status: active
phase: P3
task: "07"
subtask: "14"
updated: 2026-10-10
---

# 14 — 挂点、开火与发射

**契约来源：** [spec](../spec.md) 的 S-04、AC-05、AC-06；[武器与开火](../spec.md#武器与开火)、技术决定 9；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（武器块、挂点状态、导弹与弹丸的战斗状态）、[CR-03](../../02/spec.md#cr-03-移动块的模式-12d-03)（`linear` 块的构造）、[CR-05](../../02/spec.md#cr-05-命令原因码与内部请求d-01)（`fire`、选择命令、AI 入口与发射请求）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`weapon-selected`、`shot-fired`）、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（玩家更新中的锁定）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（导弹的移动块）。
**依赖：** 02, 12, 30。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **选择（CR-05，W3）：** `cycle-main-weapon` 为列表 0 的下一项，`select-missile` 为列表 1 的下一项或上一项。共同前置判定之后，机型没有挂点 → `no-weapon`；否则 `accepted`：原版此时总会更新序号、在列表 1 上清除锁定，即使所选挂点不变；紧随结果发出 `weapon-selected`（`changed` 表示当前挂点是否改变）。子系统 5、8 对列表的作用（W4 的挂点损坏、状态与修理）作为本模块的函数，供 15 与 P3-10 调用。
- **开火（CR-05，W5–W8）：** `primary` 作用于列表 0，`secondary` 作用于列表 1；按数组次序逐个判定，读取当时的选择、参照目标、冷却与资源。当前挂点为空 → `no-weapon`；否则按 W5 的组与交替规则尝试。至少一个挂点投递了发射请求 → `accepted`；否则取**最后一次尝试**的原因。每次尝试的原因次序：
  - 炮：`insufficient-charge`（只对玩家）→ `weapon-disabled` → `cooldown`（相等时可射）→ `misfire`（受损抽取失败，冷却照常重置）→ 瞄准炮无可用解而又不能退回不瞄准时为 `no-target` 或 `out-of-arc`；
  - 导弹：`no-ammunition` → `weapon-disabled` → `no-target`（制导导弹）→ `cooldown`。
  扣费、冷却与弹药按 W6、W8 在判定中写入，之后的命令读到写入后的值；制导导弹发射后清除锁定。Core 不保存跨 tick 的扳机电平（技术决定 9）。
- **参照目标（CR-05）：** 瞄准炮的瞄准、制导导弹的目标要求与导弹请求保存的 `target`：对玩家取 11 的参照目标查询（与 `target` 命令相同），对 AI 机体取其 `ai.objectTarget`。
- **导弹锁定（`0x2ddbc`，W8）：** 只为玩家运行，位于玩家更新中 P3-06 的失效目标清除之后、速度辅助之前（11 的接入点，CR-07）。
- **AI 入口与自动挂点（CR-05，W9、W10）：**
  - AI 的开火入口：扳机规则 `0x2d578` 的通道 0、1、2，自动挂点 `0x2dad0`、瞄准获取 `0x2da58`、瞄准解 `0x2e9d4` 与半球判定 `0x2d894`。它们是 Core 内部函数，供 P3-08 调用，不产生命令结果；用内部合成状态测试，不新增生产注入 API。
  - 自动挂点是独立的开火规则（W9）：不检查也不扣充能、受损抽取不同、失败也消耗连发并重置冷却、开火时不检查射界、出生偏移随机。它与列表开火只共用挂点状态、发射请求与弹丸构造。
- **发射请求（CR-05，W11）：** 在开火判定处投递 `launch` 请求（`gun` 或 `missile`），保存挂点、`ShotTrigger`（命令的通道与 `commandIndex`、AI 的通道或自动挂点）、载入变换后的挂点偏移（自动挂点另加抖动）、瞄准姿态（炮 +0x28 ≠ 0 时），以及导弹的发射字节与参照目标。发射请求受任务流程门禁 `0x339cc` 约束：该门禁由 P3-11 加入，本项不建空函数（CR-13）。
- **构造（W11，在本 tick 的请求处理中）：**
  - 弹丸（`0x25b0c`）：经 `0x218e8` 的模式 1 分支由发射者的位姿与速度得到 `linear` 块（`hitTest` 为 true，CR-03）；`ProjectileCombat` 的初值与表现选择器。
  - 导弹（`0x2b00c`）：按 CR-09 以油门 0（制导）或满油门（无制导）调用 P3-06 的模式 0 构造；制导导弹再经 `0x21a3c`（30 在 W11 记录的原生语义）置到达标志，把速度与指令速度设为 min(导弹最高速度, 发射者速度)，并重算速度比；导弹 +0x20 ≠ 0 时 3 次散布抽取；资源取 12 导出的 `0x3060c` 非机体分支；`MissileCombat` 的初值（`target` 取请求保存的目标，此时可解析才写入；`program` 按 CR-02）。
  - 运行时种类的 P3-06 字段取 12 导出的缺省。
  - 发射者为玩家时递增 `shots` 的发射计数（W11）。
  - 构造之后发出 `shot-fired`；新实体本 tick 不运动、不参与碰撞。
- **测试：**
  - `fire → cycle-main-weapon → fire`、目标与开火交错、重复请求。
  - 每个原因的条件与“最后一次尝试”；冷却的等号与跨阈值；扣费、冷却与弹药的写入时机；锁定的阶段与清除。
  - 选择的 `no-weapon`、`changed` 与锁定清除。
  - AI 入口；自动挂点的独立规则。
  - 发射请求保存的身份与目标；两种构造的初值、`0x218e8` 模式 1、`0x21a3c` 与散布抽取次数；射击统计；`shot-fired` 的内容；发射帧不运动；挂点变换的独立期望。

## 不包含

- 弹丸运动与命中（17）、导弹制导（20）、伤害（15）；AI 何时开火（P3-08）；音效（P3-14）；按住采样与清键（P3-04、P3-05）。
- P3-06 的模式 0 构造本身；`0x339cc` 的门禁（P3-11）。

## 关键文件与契约

- `src/core/systems/weapons.ts`（11 新建）：命令判定、玩家更新中的锁定与 `launch` 请求的处理。
- P3-06 交付的模式 0 构造与最高速度纯函数（CR-09，以合并后的实际路径为准）。若其导出尚不能按油门调用，按协调者转交 P3-06 的要求处理，不在 P3-06 的模块之外另建构造（未就绪的调用在 22 接上）。
- 12 导出的非机体分支与运行时种类缺省；11 的参照目标查询；30 在 [W11](../../../../original/formats/executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code) 记录的 `0x21a3c`。
- 计划新增：`src/core/rules/mounts.ts`、`src/core/rules/firing.ts`、`src/core/rules/movement-builders.ts`、`src/core/systems/launch.ts` 及相邻测试。

## 写入范围

- `src/core/systems/weapons.ts`：选择、开火、锁定与发射请求。
- `src/core/systems/weapons.test.ts`：武器系统测试（新建）。
- `src/core/rules/mounts.ts`：挂点列表、选择与挂点损坏（新建）。
- `src/core/rules/mounts.test.ts`：挂点测试（新建）。
- `src/core/rules/firing.ts`：开火条件、冷却、扣费、锁定、AI 入口与自动挂点（新建）。
- `src/core/rules/firing.test.ts`：开火测试（新建）。
- `src/core/rules/movement-builders.ts`：`0x218e8` 的模式 1 分支（新建；18 加入模式 2）。
- `src/core/rules/movement-builders.test.ts`：构造测试（新建）。
- `src/core/systems/launch.ts`：弹丸与导弹的构造（新建）。
- `src/core/systems/launch.test.ts`：构造测试（新建）。
- `src/core/systems/commands.test.ts`：`fire`、`cycle-main-weapon`、`select-missile` 不再是未实现命令、导弹锁定入口对应的断言更新。
- `src/core/systems/flight-control.test.ts`：受武器命令影响的断言更新。
- `src/core/world/world.test.ts`：武器命令结果的断言更新。
- `src/core/systems/pipeline.ts`：`RequestQueue` 的 `defer`/`release`（玩家命令的发射请求排在 P3-06 的 control/match 请求之后，按原版 T3 的帧内次序），`updatePlayerControls` 在玩家更新之后释放。
- `src/core/systems/pipeline.test.ts`：请求路由表中两条 `launch` 占位故障行的删除（构造已实现），以及 `defer`/`release` 的测试。
- `docs/original/formats/executable.md`：W7、W9、W11 的指令级事实（已确认，代码；只记结构，不记数值）。

## 验收标准

- [x] AC-05：`cycle-main-weapon` 与 `select-missile` 覆盖空、单项、多项列表、弹药耗尽、禁用挂点、循环方向与子系统特例；`no-weapon` 只在机型没有挂点时；`weapon-selected` 的 `changed` 正确。
- [x] AC-06：逐命令判定与次序；每次尝试的原因次序与“最后一次尝试”的原因（含 `misfire`、`out-of-arc`）；扣费、冷却与弹药的写入时机正确；未发射时无 `shot-fired`。
- [x] AC-06：AI 入口复用列表开火规则；自动挂点按 W9 的独立规则，只与列表开火共用挂点状态、发射请求与弹丸构造；发射请求保存挂点、通道、命令身份与参照目标；`shot-fired` 含完整快照；发射帧不运动、不碰撞；挂点变换符合 craft §3.8。
- [x] 两种构造的初值、`0x218e8` 模式 1、`0x21a3c` 与散布抽取符合 W11 与 CR-09；锁定只为玩家、在 CR-07 的位置运行。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step` 断言命令结果、事件与新实体；规则函数的期望由 W1–W11 独立推导。
- 不涉及浏览器；原版对照见 26、27。

## 完成证据

- **实现（基于认领提交 `d6bb9d7`，先后快进到目标分支 `1741de4`、`324a087`、`a8bc4a8`）：**
  - [mounts.ts](../../../../../src/core/rules/mounts.ts)：选择 `0x2e4ec`（`selectMount`：i32 加、两向回绕、空列表为 −1/无挂点、列表 1 清锁定等级、不跳过不可用挂点、无挂点的机型为 null 不改变）；子系统 8、5 的挂点损坏 `0x2e310`/`0x2e150`、修理 `0x2e3c8`/`0x2e1fc` 与状态 `0x2e438`/`0x2e264`（供 15、P3-10 与 CR-10）；`0x2dd04`。列表 0 的遍历先走同时开火链接、再走交替链接，列表 1 只走交替链接。
  - [firing.ts](../../../../../src/core/rules/firing.ts)：扳机例程 `0x2d578`（`fireList`：同时开火链上每组一发；有交替链的组按最早开火、严格早于时钟、并列取前者的次序尝试未尝试成员；返回投递数与最后一次尝试的结果）；炮 `0x2e5e8` 与充能 `0x30cc8`/`0x30cec`（只对玩家）、导弹 `0x2e86c`（锁定字节、制导导弹发射后按 `0x2dd04` 清锁定）；瞄准解 `0x2e9d4`（同一调用内的缓存）、射界与半球判定 `0x2d894`；玩家锁定 `0x2ddbc`（`updateLock`）；自动挂点 `0x2dad0` 与获取 `0x2da58`。规则函数只改所给的武器块与充能、从所给 RandSource 抽取、把发射交给回调，不读世界。
  - [movement-builders.ts](../../../../../src/core/rules/movement-builders.ts)：`0x218e8` 模式 1 的项（`linearItem`，含 `spinning` 来源以速度为第三行并经 `0x56d18` 补全）、`0x21794` 模式 1（`linearBlock`）、`0x56d18`（`orthonormalFrame`）、构造与瞄准共用的偏移位置、`0x21a3c`（`applyGuidedLaunchSpeed`）、导弹散布（`scatteredRows`，3 次抽取，复用 P3-06 的行旋转）与 `0x21c78`（`speedOf`）。18 在此加入模式 2。
  - [weapons.ts](../../../../../src/core/systems/weapons.ts)：三个命令的判定（CR-05 的共同前置判定、`no-weapon`、`accepted` 与最后一次尝试的原因、`weapon-selected` 紧随结果）；参照目标取 13 的 `referenceTarget`；`updateMissileLock` 入口（读玩家实际目标；调用点按 goal 执行记录“11 的后续并入 22”由 22 接入）；P3-08 的入口 `fireAiChannel`（目标为 `ai.objectTarget`、AI 通道触发、无命令结果）、`fireAutomatic`、`acquireAutomatic`。
  - [launch.ts](../../../../../src/core/systems/launch.ts)：请求处理中的 `0x25b0c`、`0x2b00c`：弹丸为 `linear`（速度为炮 +0x08、命中检测、不加发射者速度，炮 +0x28 ≠ 0 时行改为请求的姿态，位置仍按发射者的行）；导弹的最高速度取弹体 +0xB8（12 的 `missileMaximumSpeed`），以油门 0（制导）或满油门调用 P3-06 的 `craftMovementBlock`，制导导弹再经 `0x21a3c`，+0x20 ≠ 0 时散布；`target` 取请求保存且仍可解析的目标，`program` 按 CR-02；运行时种类字段取 12 的 `runtimeKindDefaults`；玩家发射者递增 `shots`；构造后发出 `shot-fired`。发射者已不可解析的请求不创建任何东西（与主体已移除的请求一样丢弃）。
  - [pipeline.ts](../../../../../src/core/systems/pipeline.ts)（获批的范围扩展）：`RequestQueue.defer`/`release`（延后的请求立即计入 `requestsPerTick`，处理时仍有未释放者为 Core 故障）；`updatePlayerControls` 在 P3-06 的玩家更新之后释放。
- **请求次序的决定（协调者转交的开放问题）：** 玩家开火命令的发射请求延后到 P3-06 的 control/match 请求之后（`defer`/`release`），AI 与自动挂点的发射仍立即投递。依据：原版一次玩家更新内的次序为按键（消息 2、0x80000）→ 0x20000 → 扳机（消息 8）→ 自动选敌（T3），CR-07 也写明扳机在 0x20000 之后。这样同一 tick 内 `[match-target, fire]` 与 `[fire, match-target]` 都先 `speed-matched` 后 `shot-fired`，受扰动的 control 请求与散布导弹的抽取也按原版次序；判定、写入与发射请求保存的身份不变。未采用的方案是保持立即投递并记为差异。P3-06 的 flight-control.ts 不需修改。`0x21fd8` 的浮点路径不是构造所需（导弹构造只用 P3-06 的模式 0 构造与 30 记录的 `0x21a3c`），无缺失。
- **对切片不可达数据的项目选择：** 放在列表中的自动炮（+0x28 = 2）沿发射者的行发射（原版读消息池中的残留字节）；只有炮挂点可作自动挂点；列表 1 的首个有弹挂点是炮时不驱动锁定；锁定期限为负时为 Core 故障、冷却期限超出安全整数为预算故障（原版 u32/i32 回绕）；每次扳机调用的“已尝试”标志从空开始（CR-01 已拒绝原版会保留标志的排列）。
- **原版事实（已确认，代码，P3-07/14）：** 实现所需而文档缺少的指令级细节写入 [executable 的 W7、W9、W11](../../../../original/formats/executable.md#w7-aim-solution-0x2e9d4-and-hemisphere-test-0x2d894--confirmed-code)：`0x56d18` 在两个调用者参数下的作用、瞄准点 z 不经中间存储而 x/y 存储、射界乘积先存为 f32 再比较（半球与锁定的乘积为双精度）、自动挂点抖动的逐分量舍入、获取在射界判定前已写入瞄准、构造的 k 不存储且位置先按发射者的行计算。来源为只读 Ghidra（私有副本 `-noanalysis -readOnly`，被忽略的 `local/research/p3-07/weapons-firing/`，输出 `out/q1`、`out/q2`，并复用 02 的 `weapons/out` 列表）。常量数值只用于实现，不写入文档。没有新的未决项，U 项不变。
- **测试：** `pnpm check` 通过（232 个文件，7,414 项，生产构建成功）；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（61 个文件，2,031 项）；`pnpm typecheck`、`pnpm lint`、`pnpm check:compliance` 通过。新增或更新的断言：
  - [mounts.test.ts](../../../../../src/core/rules/mounts.test.ts)：多项列表两向回绕；单项与空列表（−1）的 `changed: false`；不跳过已毁、无弹挂点；列表 1 清锁定、列表 0 不清；无挂点为 null 且不改变；损坏的抽取次数（rand % 数量，再 rand % 弹药）、沿链跳过已毁、全毁时只抽 1 次、列表 1 只走交替链；修理的单个与全部及返回值、不恢复弹药；状态 0/1/2；`0x2dd04`。
  - [firing.test.ts](../../../../../src/core/rules/firing.test.ts)：同时开火组各一发与扣费；冷却等号可射、差 1 不可射；充能只对玩家、相等可射；四种炮原因的次序；哑火（奇数失败并重置冷却、不扣费；偶数射出，各 1 次抽取）；跨组的最后一次尝试；瞄准炮无目标与出射界时由交替成员不瞄准地射出、位 0x08 时取反行 1、3；最早开火优先、并列取前、未写入先于任何时钟；只尝试组头的情形；同一调用的瞄准缓存；瞄准解（静止、提前量、+0x34 的偏移、z 不中间存储、零速度故障）；射界的等号、f32 存储后比较；半球的射程等号与各侧；导弹四种原因次序、扣弹、锁定字节（受损减 1）、玩家与 AI 的锁定清除、无制导不清、AI 列表 2；锁定的五种归零条件、更新时刻、无弹与无制导、0 → 4 各阶段、射程与锥角的严格比较、+0x3C、子系统 3 受损时的抽取、宽限与恢复、负期限故障；自动挂点的抖动与 5 次抽取、不扣充能、受损抽取失败也消耗连发、各跳过条件；获取的射界通过与失败（仍写瞄准）、目标失效清除、导弹挂点故障。
  - [movement-builders.test.ts](../../../../../src/core/rules/movement-builders.test.ts)：偏移位置的逐步存储；`0x56d18`；模式 1 的项与 `spinning` 来源；`linear` 块；`0x21a3c` 的三种速度关系、按位复制与基准 0；散布的轴选择与 3 次抽取。
  - [weapons.test.ts](../../../../../src/core/systems/weapons.test.ts)：经正式 `step`：选择的事件与 `changed`、空与单项列表、`no-weapon`；共同前置判定不改变状态；开火的结果、`shot-fired` 与新实体（发射帧不运动，位置为偏移加速度乘步长）；`fire → cycle-main-weapon → fire`；重复请求的冷却；充能的写入时机；未发射无事件；craft §3.8 的挂点加长；参照目标与后续选择不改写已产生的请求；`no-target`；瞄准炮；发射请求在 P3-06 请求之后；锁定入口；AI 通道与自动挂点。
  - [launch.test.ts](../../../../../src/core/systems/launch.test.ts)：弹丸的全部初值与 `shot-fired`；瞄准姿态与位置；只计玩家；姿态与炮类型不符的故障；发射者失效时不创建；导弹的制导速度、散布与抽取、目标、`program` 的四种情形、无制导满油门不抽取。
  - [pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts)：删除两条 `launch` 占位故障行；`defer`/`release` 的计数、次序与未释放故障。[commands.test.ts](../../../../../src/core/systems/commands.test.ts)、[world.test.ts](../../../../../src/core/world/world.test.ts)：武器命令不再是未实现命令（无挂点时 `no-weapon`，无玩家时 `player-unavailable`）。
- **rubber-duck：** 采纳 2 项：(1) 阻断：同一 tick 的 `[match-target, fire]` 先发出 `shot-fired`——按上述决定以 `defer`/`release` 修复并加测试；(2) 冷却期限的安全整数检查。其余方面（选择、损坏、开火分组与原因、瞄准与锁定算术、自动挂点、构造）未发现问题。
- **simplify：** 采纳：复用 `load-transforms.ts` 的 `AUTOMATIC_GUN` 与 13 的 `targetDistance`（同一表达式）；各规则模块自有 `store`；`speedOf` 移到 movement-builders.ts；`fireList` 的循环改为“下一个未尝试的交替成员或无”；`listStatus` 改为两个布尔量；`listMount` 不导出；射击计数集中在 `applyLaunchRequest`；弹丸位置取 `0x218e8` 项的位姿；`applyLaunch` 改为再导出。未采纳：把 `GunLaunch`/`MissileLaunch` 与 pipeline.ts 的请求变体统一（超出获批的 pipeline.ts 改动）；合并锁定恢复分支的期限（等级 2 用算术右移、3/4 用截断除法，负奇数时不同，属原版语义）；把三个测试文件的合成武器数据移到共享 test-support（需新文件，超出写入范围）；每次调用的小对象、Set、生成器与冻结复制（非热点）。
- **文档影响：** 原版事实如上写入 `docs/original/`。[core.md](../../../../engineering/modules/core.md) 与 [source-structure.md](../../../../engineering/source-structure.md) 的模块清单（mounts、firing、movement-builders、launch）与 `RequestQueue.defer`/`release` 按 goal 归 28 更新，本项不改。STATUS 与阶段索引无需改动。
