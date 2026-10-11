---
type: plan
status: active
phase: P3
task: "07"
subtask: "21"
updated: 2026-10-10
---

# 21 — 停放交战规则

**契约来源：** [spec](../spec.md) 的 S-09、AC-11（规则部分）；[停放对象的抽象交战](../spec.md#停放对象的抽象交战)；P3-02 spec 的 [CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（停放更新的入口、读写的字段与数值）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`hit` 的 `parked` 原因与事件次序）、[CR-14](../../02/spec.md#cr-14-容量快照与版本d-01)（停放多目标的事件上界）。
**依赖：** 05, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **入口（E1，CR-09）：** P3-06 的停放遍历对每个本次更新的对象，在离开世界（`0x2f314`）之后调用一次：`ai.mode` = 1 时为多目标 `0x2ffec`（E2），否则为 `0x30150`（E3）。实现为供停放更新调用的函数；接入 `parked-update` 阶段归 22。
- **读写字段（CR-09）：** 读 `ai.mode`、`ai.target`、`ai.objectTarget`、`formation.leader` 与 `ruleInputs.aiValueB`（+0xE0）；写 `ai.objectTarget`（多目标）与双方的 `nextEnergyClock`。
- **规则（E3）：** 按种类的不交战概率、目标引用的选择、目标状态与阵营门禁、距离（含目标半径）与挂点射程、射击次数、导弹的选择与概率、伤害求和、TABL 4003 倍率与按目标种类的倍率；抽取全部来自世界 RNG，并与 P3-06 的停放更新逐对象交错（E4）。
- **数值（E5）：** 经过时间含活动期间，≥ 2³² 为 Core 故障（约 777 天，不可达）；射击次数 q = floor(经过时间 × 炮 +0x14 ÷ 64)，炮 +0x14 的范围由 12 的载入检查保证；炮伤害的合计按 i32 回绕。
- **伤害与事件：** 伤害以射击者自身的种类、来源为空调用 15 的 `0x2a694`（不经 `0x2a40c`、`0x2a5fc`，不写 `hitFeedbackClock`）；`hit` 的原因为 `parked`，攻击者为射击者（`shooter`），击杀与事件类别按射击者种类（E6）。停放对象被毁时直接待移除且不爆炸（`object-destroyed` 的 `outcome` 为 `removed`）。事件位于 P3-06 对同一对象的 `object-left-world` 之后；同一遍历中先被毁的对象之后被跳过（E1）。
- **测试：** 每个门禁与分支；多目标与单目标；倍率只用在本路径；射击次数与 i32 回绕；经过时间的故障边界；抽取次数与次序；随机部分按代码推导的映射与原像计数；事件的字段与次序。

## 不包含

- 停放更新的调度、经过时间与离开世界（P3-06）及其接线（22）；AI 目标策略（P3-08）。

## 关键文件与契约

- 使用 14 的挂点规则、15 的 `0x2a694` 与 12 的 TABL 4003 倍率（`hitDamageScale`）。
- 计划新增：`src/core/systems/parked-engagement.ts`、`src/core/rules/parked-engagement.ts` 及相邻测试。

## 写入范围

- `src/core/systems/parked-engagement.ts`：停放交战入口（新建）。
- `src/core/systems/parked-engagement.test.ts`：系统测试（新建）。
- `src/core/rules/parked-engagement.ts`：交战规则（新建）。
- `src/core/rules/parked-engagement.test.ts`：规则测试（新建）。

## 验收标准

- [x] AC-11（规则）：调用条件、概率、目标与阵营门禁、距离、挂点、抽取与倍率按 E1–E7；倍率不用于其他伤害路径；读写的字段与 CR-09 一致。
- [x] 经过时间 ≥ 2³² 为故障；炮伤害合计按 i32 回绕；`hit` 的原因为 `parked`；停放对象被毁时直接待移除且不爆炸；抽取次数与次序正确。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：以合成停放对象调用入口函数，断言伤害、事件与 RNG 后态；期望独立推导。
- 接线与停放/活动切换的测试在 22；原版对照见 27。

## 完成证据

- **实现（基于认领提交 `8b55129`；worker 分支为应用为该会话创建的 `p3-07-21-worker`，见 goal 执行记录）：**
  - [rules/parked-engagement.ts](../../../../../src/core/rules/parked-engagement.ts)：纯规则，不读世界、只从所给 RandSource 抽取。E3.1 的类别抽取（`declinesEngagement`：种类按 0x2、0x87c、0x78000、0xf9c7c 的次序判定，rand % 100 分别小于 80、90、95、90 时不交战；其余种类不抽取）；阵营门禁（`isOpposingSide`：自身在 0x6c87f 时对方不在 0x6c07f，否则对方不在 0x93f80，种类 0x800 与自身对立）；E3.2 的引用选择（`targetReference`：模式 0 与 ≥ 6 读 +0x90，1–4 读 +0x8C，5 不交战）；E2 的收集半径²（f32(R × R)）与 `0x56b50`（各轴双精度差乘其 f32 存储，(y + x) + z，未舍入）及严格比较（NaN 通过）；E3.3 的距离（((|Δy| + |Δx|) + |Δz| − r) × 3 × 0.25，一次 f32 存储）；E3.5 的射击次数（chop(elapsed × 1/64 × 炮 +0x14) ÷ 除数向零取整，≤ 1 计 1）；E3.6 第 2 步的种类倍率（0.88、0.5、0.9 或无）；`volley`：导弹选择（+0xE0 ≥ 0 时，在类型 1、弹药 ≠ 0、射程 > d 的挂点中取第 rand % c 个）→ 炮的合计（射程 > d，`Math.imul` 与 i32 回绕）→ 选中导弹（目标种类位 1 时再抽 rand % 100 < 20 才加）→ chop(合计 × S) → 种类倍率。f32 存储溢出与 FISTP 超出 i32 为 Core 故障（原版的未屏蔽异常）。
  - [systems/parked-engagement.ts](../../../../../src/core/systems/parked-engagement.ts)：入口 `engageParked(context, entity, elapsed)`（E1）：`ai.mode` = 1 走 `0x2ffec`，否则 `0x30150`（除数 1）。`0x2ffec` 按遍历次序收集种类 0xfffff 中阵营对立且严格在半径内的对象（不看活动、状态、被毁与 Warp），对每个候选先写 `ai.objectTarget` 再以候选数为除数交战，结束后保留最后一个；无候选时不变。`0x30150`：类别抽取 → 编队长（`formation.leader` 不可解析时结束）→ 按编队长的模式取目标 → 门禁（可解析、船体 > 0、不在 Warp、以自身种类判阵营）→ 距离取自身到目标、减目标形状半径（`ruleData.craft[种类].shape.radius`）→ 挂点取机型记录与 `ruleData` 的载入后射程、炮 +0x14/+0x1C、导弹 +0x5C → 选中导弹弹药减 1 → 合计 > 0 且目标未被毁时调用 15 的 `applyEngagementDamage` → 双方 `nextEnergyClock` := 时钟。TABL 4003 倍率取 `craftInfo.content.hitDamageScale`，Core 中只有本模块读取（另一处是 setupHash 的绑定）。抽取经世界 RNG，每次抽取立即写回 `world.rngState`，因此伤害入口的抽取紧随其后；调用者（22）在调用前提交自己的 RandStream、调用后从 `world.rngState` 继续，即可按 E4 逐对象交错。经过时间不是 0 至 2³² − 1 的整数时故障：≥ 2³² 为 `budget-exhausted`，负数或非整数为 `invariant-violated`；自身或目标不是机体为 `invariant-violated`（现有规则不会给出运行时种类的 AI 引用）。
  - CR-09 的读写：读 `ai.mode`、`ai.target`、`ai.objectTarget`、`formation.leader`、`ruleInputs.aiValueB`；写 `ai.objectTarget`（多目标）与双方的 `nextEnergyClock`；另按 E3.5 与 CR-02 字段表写选中导弹挂点的 `ammunition`（CR-09 的写入列表未列此项，CR-02 的字段表已列“停放交战选中的导弹（E3）”）。伤害、`hit`（原因 `parked`、攻击者为射击者、无来源与命中点、不写受击时钟与记录）、`object-destroyed`（类别按射击者种类，停放受害者 `removed` 并待移除）由 15 的入口完成。接入 `parked-update` 阶段归 22。
- **测试：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（70 个文件，2,271 项）；`pnpm typecheck`、`pnpm lint`、`pnpm check:compliance`（`passed: true`）通过；`pnpm check` 通过（241 个文件，7,654 项，生产构建成功）。期望由 E2–E5 独立推导：算术用 BigInt 有理数（`derivation.test-support.ts` 的 `float32OfRational`、`rationalOfDouble`）与手算，抽取对 0–32767 全部 rand 值计数原像，按 32768 = q·n + r 推导：
  - [rules/parked-engagement.test.ts](../../../../../src/core/rules/parked-engagement.test.ts)（23 项）：各类别的抽取边界与 1 次抽取、不抽取的六个种类、交战原像 20 × 327、10 × 327、5 × 327；20 × 20 种类对的阵营门禁与 0x800 自身对立；模式 0–7、255 的引用；R² 的 f32 舍入（4097² 取偶）与溢出故障；`0x56b50` 用 f32 存储的乘数（Δy = 1 + 2⁻²⁵）、(y + x) + z 的分组（2⁵² 在 y 与 z 上结果不同）、差值存储溢出故障；严格比较与 NaN；距离公式、先减半径、半径内为负、f32 舍入与溢出故障；射击次数的取整、除数、至少 1、2³² − 1 × 32 得 2³¹ − 1 与 FISTP 溢出故障；20 个种类的倍率，以及 0.88、0.5、0.9 对正 i32 合计等于 floor(×22/25)、floor(÷2)、floor(×9/10)（含 2³¹ − 1）；volley 的炮合计与严格射程、负 d、除数分摊、无导弹时不抽取、导弹的第 (rand % c) 个（10,923/10,923/10,922 个原像，负弹药合格）、对僚机 20 × 328 个原像计入、i32 回绕（含回绕为非正）、倍率按有理数截断、倍率后超出 i32 故障。
  - [systems/parked-engagement.test.ts](../../../../../src/core/systems/parked-engagement.test.ts)（22 项）：经入口的完整 `hit` 与双方能量时钟、不抽取、不写受击时钟与记录、AI 状态只读；离开世界后同一更新照常交战；单目标路径按模式读引用；编队长提供目标而距离与阵营取自身；编队长失效、各门禁失败时状态与事件不变，类别抽取先于编队长与门禁（只消耗该次抽取）；活动与新建目标照常交战；已被毁而船体 > 0 的目标不受伤害但仍消耗导弹并写能量时钟；射程不及时无事件但写能量时钟；导弹选择、弹药与对僚机的抽取；类别抽取 → 导弹 → 伤害入口抽取的次序与停放受害者被毁后待移除、不爆炸、不计击杀；类别抽取失败只消耗 1 次；最长经过时间的 i32 回绕（536,870,904 → 201,326,589）；倍率只用于本路径（同一世界中碰撞伤害不缩放）；多目标的收集（严格半径、不看活动、状态、被毁与 Warp、阵营）、除数 n、最后的 `objectTarget`；0x800 收集自身；无候选时不变；有编队长时交战其目标 n 次；多目标中各候选的抽取与其伤害入口抽取按次序交错；经过时间 2³²、−1、0.5 的故障与 2³² − 1 可用；非机体的自身与目标故障。
- **rubber-duck：** 采纳 2 项：(1) `0x56b50` 的三个 f32 存储溢出应为故障——改用带检查的存储并加测试；(2) 失败门禁的测试只用了不抽取的种类，未保护“类别抽取先于其他一切”——加入以种类 0x8000 在无目标与编队长失效时只消耗 1 次抽取的测试（把抽取移到门禁之后的变异会使其失败）。审阅认为其余部分与 E1–E7 一致。
- **simplify：** 采纳：规则测试改用 `world.test-support.ts` 的 `expectFault`；射击次数改为带显式期望的表；去掉重复的原像断言。未采纳：`0xfffff` 常量（唯一导出的同值常量 `FORWARD_KINDS` 含义不同）；`worldRand` 复用一个 RandStream（伤害入口在中间抽取时缓存的流会过期）；穷举直方图（验收要求原像计数，文件耗时 < 0.5 秒）；多目标中每个候选重建挂点描述（候选之间弹药会变）；测试的 `Scene` 同时含 `state` 与 `context`（与 damage.test.ts 一致）。范围外、交 22：让停放更新持有并传递一个 RandSource 给交战与伤害入口，或按本入口的约定在调用前后同步 `world.rngState`；`updateParked` 目前只收 `(world, emit)`，接线时需要 `TickContext`。
- **文档影响：** 行为事实已在 executable 的 E1–E7，本项没有新的原版事实，U 项不变。发现 E2 的阵营门禁写作“candidate kind ∉ A / ∉ B”，但跟踪文档未定义 A、B（研究草稿中为 A = `0x6c07f`、B = `0x93f80`，与同文件初始 AI 与导弹近炸的写法一致）；`docs/original/` 不在本项写入范围，已在 worker 报告中提议由协调者补上。[core.md](../../../../engineering/modules/core.md) 与 [source-structure.md](../../../../engineering/source-structure.md) 的模块清单按 goal 归 28 更新，本项不改。STATUS 与阶段索引无需改动。
