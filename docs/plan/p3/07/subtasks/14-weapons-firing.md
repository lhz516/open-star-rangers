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
- `src/core/systems/pipeline.test.ts`：请求路由表中两条 `launch` 占位故障行的删除（构造已实现）。
- `docs/original/formats/executable.md`：W7、W9、W11 的指令级事实（已确认，代码；只记结构，不记数值）。

## 验收标准

- [ ] AC-05：`cycle-main-weapon` 与 `select-missile` 覆盖空、单项、多项列表、弹药耗尽、禁用挂点、循环方向与子系统特例；`no-weapon` 只在机型没有挂点时；`weapon-selected` 的 `changed` 正确。
- [ ] AC-06：逐命令判定与次序；每次尝试的原因次序与“最后一次尝试”的原因（含 `misfire`、`out-of-arc`）；扣费、冷却与弹药的写入时机正确；未发射时无 `shot-fired`。
- [ ] AC-06：AI 入口复用列表开火规则；自动挂点按 W9 的独立规则，只与列表开火共用挂点状态、发射请求与弹丸构造；发射请求保存挂点、通道、命令身份与参照目标；`shot-fired` 含完整快照；发射帧不运动、不碰撞；挂点变换符合 craft §3.8。
- [ ] 两种构造的初值、`0x218e8` 模式 1、`0x21a3c` 与散布抽取符合 W11 与 CR-09；锁定只为玩家、在 CR-07 的位置运行。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step` 断言命令结果、事件与新实体；规则函数的期望由 W1–W11 独立推导。
- 不涉及浏览器；原版对照见 26、27。

## 完成证据
