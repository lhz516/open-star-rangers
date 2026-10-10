---
type: plan
status: active
phase: P3
task: "06"
subtask: "11"
updated: 2026-10-10
---

# 11 — 运动阶段与积分

**契约来源：** [spec](../spec.md) 的 S-03；AC-02，AC-07（首次运动的合成部分）；[运动阶段与积分](../spec.md#运动阶段与积分)；D-08 的阶段接入；技术决定 1、12。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **`movement` 阶段（第 8 阶段，`0x221fc`）：** 在 `PIPELINE` 中提供 `run`，阶段表与次序不变；实时种类遍历（玩家最先）；筛选为活动不是停放（活动与停靠都参与）且状态为被毁源或活动及以上；通过筛选的实体缺少移动块为故障。按移动块模式分派：`craft` → 模式 0 积分，`warp` → 模式 3 积分；其他模式在类型上不可构造（P3-07、P3-09 按扩展规则加入）。
- **模式 0 积分（`0x222f0`）：** 按[运动阶段](../../../../original/formats/executable.md#movement-stage-and-integration-p3-0601)的次序与写回点：冲量位移与衰减（衰减后小于 0 时冲量为 null）→ 用更新前速度沿第三行前进 → 未到达时按机型 +0xBC/+0xC0 趋向指令速度、以未写回的双精度值判定越过并按位取目标、置到达 → 速度比（参考为机型 +0xB8，不为正时不更新）→ 转向因子（+0xC8）→ 依次绕第 1、2、3 行旋转（定时旋转可叠加稳定速率、衰减、以 f32 任务秒判定到期；第 3 行的 +0xC4 耦合）。积分不读、不钳制 `maximumSpeed`。
- **模式 3 积分（`0x22600`）：** 不平移、无冲量、只有加速分支，速度比按指令速度；旋转同模式 0。触发归 P3-09，本项以内部状态测试。
- **旋转例程：** 三个例程按 M-02 的行与符号；sin、cos 用 `Math.sin`/`Math.cos` 后写回 f32，每个分量按旧值做一次双精度和、一次 f32 写回；不重新归一化。
- **数值：** 中间运算双精度，f32 写回用 `Math.fround`；非有限或超出支持域的结果锁存为 `invariant-violated` 故障，不发布部分输出。
- **位姿权威：** 积分直接更新实体的 `position` 与 `orientation`（原版没有副本或写回）。
- **分阶段接入：** 冲量与定时旋转（P3-07 写入，切片可达）的消费在此实现，以内部状态测试。非玩家飞行器在 P3-08 交付前按实例化时的移动块运动。
- **测试：** 每个分支的独立期望（含越过与恰好等于指令速度、+0xBC/+0xC0 为 0、+0xB8 不为正、+0xC8 两种取值、+0xC4 耦合、定时旋转与稳定速率叠加及到期等号）；步长 0、2、4、6 与支持域边界；停靠与被毁源参与运动；本 tick 实例化的实体不运动、下一 tick 按生命周期激活；上限降低后速度高于上限仍按减速率下降；故障锁存；起飞初态在首次运动之后只沿 +z 改变位置。

## 不包含

- 操纵应用（12）；匹配与辅助（13）；停放、区域与世界边界（14）。
- 弹丸与导弹的运动、命中测试（P3-07）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `PIPELINE` 与 `runTick`；[float32.ts](../../../../../src/core/rules/float32.ts)。
- 计划新增：`src/core/systems/movement.ts`（阶段）、`src/core/rules/flight-motion.ts`（积分与旋转纯函数）及相邻测试。
- 01、02 的完成证据。

## 写入范围

- `src/core/systems/pipeline*.ts`：`movement` 阶段的接入与测试。
- `src/core/systems/movement*.ts`：运动阶段（新建）与测试。
- `src/core/rules/**`：积分与旋转纯函数（新建）与测试。
- `src/core/world/**`：位姿写回与故障所需的最小改动。
- `src/core/systems/spawn.test.ts`、`src/core/projections/render-state.test.ts`、`src/core/replay/recording.test.ts`、`src/core/replay/snapshot.test.ts`：活动实体开始运动后，修正假定活动实体不动的既有测试（只改测试；2026-10-10 协调者按 scope-request 加入）。

## 验收标准

- [x] AC-02：筛选（含停靠与被毁源）、遍历、模式分派、公式、写回点与次序符合 M-01；独立期望覆盖全部分支（含模式 3、冲量、定时旋转与耦合）；内部步长 0/2/4/6 与边界正确；公开 step 不接受零步长或任意补时；本 tick 新生实体不运动；积分不钳制最高速度；非有限或域外结果锁存故障且无部分输出。
- [x] AC-07（部分）：起飞初态在首次运动之后符合 M-09（只有 z 前进，速度、速度比与三行逐位不变）。
- [x] 阶段表的次序与 P3-02 一致；没有可注入处理器的生产入口。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 单元与阶段测试；期望由原版公式独立推导，不用被测 helper 生成。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据

- **2026-10-10（worker，基于 d8e03d1d，认领提交 9d28259c 之后协调者扩大写入范围）：**
  - **规则（新建 [flight-motion.ts](../../../../../src/core/rules/flight-motion.ts)，纯函数，供 P3-07 复用）：** `rotateRows`（`0x228cc`/`0x22a50`/`0x22990`：c、s 为 `Math.cos`/`Math.sin` 的 f32，两行各分量按旧值 f32(a·c + b·s)、f32(b·c − a·s)，不重新归一化）；`motionStep`（dt = 单位 ÷ 64 秒，须为 f32；t = f32(时钟 ÷ 64)；接受 0 与任意非负安全整数单位，供内部测试与 18 的校准）；`integrateCraft`（模式 0，`0x222f0`）与 `integrateWarp`（模式 3，`0x22600`）共用一个私有积分器，按 executable 的次序与写回点：冲量（用衰减前大小位移，按代码常数 `0x170094` 衰减，衰减后小于 0 为 null）→ 用更新前速度沿第三行前进 → 未到达时趋向指令速度（先存 f32(v)，再以双精度 v 判定越过并按位取指令速度；恰好等于不算到达）→ +0xB8 为正时速度比 → 转向因子（+0xC8）→ 依次绕第 1、2、3 行旋转（定时旋转加启用的稳定速率、用衰减前速率、衰减、t 大于结束时刻才结束；无定时第 3 行时 +0xC4 与偏航启用则耦合）。模式 3 不平移、不读冲量、只加速，比值除以指令速度且无正值检查。积分不读 `maximumSpeed`。原版解除屏蔽溢出、无效与除零异常，因此每个 f32 写回点非有限即 `invariant-violated`（`flight-motion.result`），包括随后被丢弃的值；步长越域为 `flight-motion.step`。结果为新对象，不改输入。
  - **阶段（新建 [movement.ts](../../../../../src/core/systems/movement.ts)，接入 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 第 8 阶段，阶段表不变）：** 实时遍历全部种类（玩家最先）；`movesThisTick`：不是停放（活动与停靠）且为被毁源或状态 7 及以上；通过筛选而无移动块为 `movement.block` 故障；记录取该种类的机型记录（无记录为 `movement.record`，P3-07 在 `motionRecord` 处为导弹给出弹体记录）；按 `block.mode` 穷尽分派（P3-07 在 `moveEntity` 的 switch 中加入 `linear`、`spinning` 及模式 1 后的命中测试，缺 case 不能通过编译）；结果直接写回实体的 `position`、`orientation` 与 `movement`。步长取 `config.clockUnitsPerTick`，t 取本 tick 的时钟。`copyMovement`（entity-table）改为导出，供积分结果复制移动块。
  - **测试（合成数据，期望独立推导）：** [flight-motion.test-support.ts](../../../../../src/core/rules/flight-motion.test-support.ts) 是按 executable 的写回点、在 BigInt 精确有理数上逐步舍入（D = 53 位就近，F = `float32OfRational`，FSIN/FCOS 为 320 位泰勒和先舍入到 64 位再存 f32，零的符号按 IEEE 就近）的一帧参照，不用 JavaScript 浮点运算、`Math.fround` 或被测代码；它与 01 的被忽略独立求值器 `ref_step.py` 在 24 个模式 0/3 用例（耦合、+0xC8、定时与稳定叠加、冲量）上逐位一致（本地核对，不入库）。[flight-motion.test.ts](../../../../../src/core/rules/flight-motion.test.ts)（101 项）：三个旋转例程（行与符号、角 0 时 −0 变 +0、不归一化）；步长换算与越域故障；模式 0 的直线、一般第三行、加速、减速、长步到达、双精度 v 判定越过（加速与减速两侧，f32(v) 恰为指令速度）、恰好等于不到达而下一步减速到达或无 +0xC0 时保持、+0xBC/+0xC0 为 0、高于任何上限仍按 +0xC0 下降、到达时冻结、+0xB8 为 0 与负、+0xC8 两种取值、三轴次序不可交换、关闭的轴不施加、+0xC4 耦合（偏航开/关、横滚叠加、用本步更新后的比值）、定时旋转（衰减、与稳定速率之和先存 f32、t 等于结束时刻保留、越过后结束、定时横滚取代耦合、长步越零）、冲量（衰减、小于 0 结束、恰为 0 保留）、步长 0 只改变零的符号、96 步转向/耦合/定时结束/变速序列逐帧一致、结果冻结且与输入脱离、6 种非有限故障（含被到达覆盖的速度存储、未使用的转向因子、已结束定时旋转的衰减）；模式 3 的不平移不衰减冲量、到达、指令速度不高于速度、冻结、转向与耦合、零指令速度故障；旋转后的行越出 f32 范围的故障。各分支均在步长 0、2、4、6 单位下核对。[movement.test.ts](../../../../../src/core/systems/movement.test.ts)（21 项）：活动 × 状态的 12 种筛选、被毁标志不影响筛选、多种类各用自己的机型记录与本 tick 的步长（4 单位）和 f32 时刻、warp 块不平移、无块与无机型记录的故障；在运行的世界中：本 tick 实例化的玩家不运动、下一 tick 起飞初态只沿 +z 前进 64 × 1/32（x、y、单位矩阵、速度、指令速度、速度比与到达逐位不变，AC-07 部分）；降低上限后速度按 +0xC0 下降且不读 `maximumSpeed`；非有限结果锁存故障，之后 step/projection/renderState/snapshot 抛同一错误；运行配置拒绝零步长、tick 输入不接受步长字段。`pipeline.test.ts`：已实现阶段加入 `movement`，阶段表次序不变。变异检查：以 f32(v) 判定到达（加速、减速）、前进位移多一次舍入、耦合用旧比值、行分量的积先存 f32、结束用 ≥、定时与稳定之和或耦合和不存 f32、模式 3 读冲量、比值除数互换、冲量用衰减后大小、不平移，均使测试失败。
  - **既有测试的调整（协调者授权的写入范围）：** 活动实体开始运动后，`spawn.test.ts` 的僚机位置改为断言实例化事件的位置，锚点用例在依赖对象生成的 tick 之前读取被毁源的位置；`render-state.test.ts` 的两帧用例改用新的 `stillEntityInit`（[world.test-support.ts](../../../../../src/core/world/world.test-support.ts)，油门 0 的块）；`recording.test.ts` 的不可写检查点改用停放实体；`snapshot.test.ts` 的 `richState` 中活动的运行时实体改为有机型记录的种类位 19（种类 25 没有机型记录，运动按设计故障）。
  - **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：42 个文件 1,334 项通过；`pnpm check`（类型、ESLint、213 个文件 6,717 项测试、生产构建）通过；`pnpm check:compliance` 通过。
  - **rubber-duck：** 一条阻塞意见已采纳：原先只在返回前检查保留的值，被到达覆盖、未被使用或随结束丢弃的非有限 f32 存储不会故障；改为在每个写回点检查（原版解除屏蔽溢出异常），并补 3 项回归测试。其余无意见。
  - **simplify：** 采纳：两个积分器合并为一个私有实现；位移改为单个 `displace`，去掉临时数组；块复制复用 `copyMovement`；参照按块的 `mode` 分派；冲量衰减常数不导出；静止实体的测试构造器移入 test-support。未采纳：`motionStep` 复用 `stepSeconds`（后者只接受正偶数步长，本函数须接受 0 与原版记录的步长）；把“步长须为 f32”移入运行配置校验（改变 P3-02 的配置契约；只影响超过 2^25 单位/tick 的合成配置，此时运动阶段显式故障）；阶段内不重复校验步长、提升机型表引用（收益可忽略）。
  - **文档影响：** [Core 模块说明](../../../../engineering/modules/core.md)的阶段表第 8 行（“空”）与 P3-06 交接段、[源码结构指南](../../../../engineering/source-structure.md)（`rules/flight-motion.ts`、`systems/movement.ts`、`flight-motion.test-support.ts`、`stillEntityInit`）需同步，按 goal 的分工由 19 更新（不在本项写入范围）。原版事实、未决项与 ADR 不受影响：实现没有新的原版结论。
  - **交接：** P3-07：模式 1、2 在 `moveEntity` 的 switch 中加入（同时扩展 entity-table 的校验、复制与快照写入器），导弹的弹体记录在 `motionRecord` 中给出；`rotateRows`、`integrateCraft`、`integrateWarp`、`motionStep` 可直接调用。18：`motionStep` 接受原版记录的步长与时钟，积分器接受任意前态，即为有界校准入口。12–14：活动实体现在每 tick 运动，测试中需要固定位置的活动实体可用 `stillEntityInit`。

