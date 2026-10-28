---
type: plan
status: active
phase: P3
task: "12"
subtask: "12"
updated: 2026-10-17
---

# 12 — 表现模块：相机、选择者与激活流

**契约来源：** [spec](../spec.md) 的 S-08、AC-11；[表现层效果与会话级选择者](../spec.md#表现层效果与会话级选择者)、[表现层契约（计划新增）](../spec.md#表现层契约计划新增)、[内容输入与校验](../spec.md#内容输入与校验)。
**依赖：** 10, 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/presentation/`：每个运行一份、不依赖 DOM、Three.js 与 WebGL 的表现模块。
- 运行开始时校验爆炸表、动画帧数与星云列表等输入（空类别、帧数一致性、索引界内），失败以内容错误拒绝开始；抽取 EXIC 子集（保留请求次序与重复）。
- 逐 tick 消费 11 的批次：维护 `beforeStep` 与 `afterStep` 相机（F1 与 Warp 为观察实体位姿；新运行以原点与单位矩阵初始化；无观察实体时保留最后合法值）；在激活 tick 为每个 Core 爆炸选择一次 EXPL（`large` 列表 1，`missile` 列表 3，`other` 按步首相机的 400 距离切换），缓存到 ID 离开 Render State。
- 交付 `PresentationTick` 与爆炸激活流：每次激活恰通知一次，查询无副作用，迟加入的消费者从当前状态恢复且不重播；owner/run 绑定，拒绝跨运行、倒退或缺 tick 的输入。
- 表现随机源与世界 RNG 分开，按运行由宿主种子初始化，测试可注入；预算在分配前检查，超出给出 `presentation-capacity` 类错误。
- 加入 lint 边界：`src/render/flight/presentation/` 不得导入 `three`、DOM 或 `src/app`。
- 测试：子集、选择、400 两侧、缓存寿命（出屏、暂停、地图、动画结束不改选择）、重试、消费者登记先后、limit/limit+1。

## 不包含

- 额外爆炸、事件 0x10 与判别值 1/2 碎片（13）；被毁视角相机（14）。
- 渲染（15 起）。

## 关键文件与契约

- 现有：[flight-data-content.ts](../../../../../src/content/flight/flight-data-content.ts)、[flight-data-readers.ts](../../../../../src/content/flight/flight-data-readers.ts)、[explosions.ts](../../../../../src/core/rules/explosions.ts)（`explosionFrame` 语义）、[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。
- 计划新增：`src/render/flight/presentation/` 下的模块与测试。

## 写入范围

- `src/render/flight/presentation/*.ts`：表现模块基础、相机、选择者、激活流与测试。
- `eslint.config.js`：表现模块的导入边界。
- `tools/engineering-boundaries.test.ts`：边界回归。

## 验收标准

- [x] AC-11：子集、单次选择、400 距离、原始序号、缓存寿命、重试与激活流的每项断言通过；P3-14 契约替身收到同一选择与步末相机，每次激活恰一次。
- [x] 内容输入错误在开始前拒绝；预算 limit 通过、limit+1 在分配前失败。
- [x] `pnpm exec vitest run src/render/flight/presentation tools/engineering-boundaries.test.ts` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试，注入随机源；合成内容来自 [flight-data.test-support.ts](../../../../../src/content/flight/flight-data.test-support.ts)。

## 完成证据

- **实现（2026-10-17，按已批准的 P3-02 [FS-07](../../02/spec.md#fs-07-表现层的只读接口renderflight不在-core)、FS-08 与本 spec 的表现层契约；FS-07 与旧措辞不一致处以 FS-07 为准）：** 新增 `src/render/flight/presentation/`：
  - [presentation-contract.ts](../../../../../src/render/flight/presentation/presentation-contract.ts)：FS-07 的 `ExplosionSelection`、四种键（`core:`/`extra:`/`fragment-explosion:`/`fragment:`）、带 `eventIndex` 的 `ExplosionOrigin`、`PresentationCamera`（逻辑像素视口）、`ExplosionActivation`、`PresentationTick`、`PresentationExplosion`；输入 `PresentationTickInput`/`PresentationFrameInput` 与 11 的 `TickOutput` 结构一致（不导入 `src/app`）；13 与 14 的接入缝：`PresentationEffects`（`reserveObject` 返回对象槽、`activate` 消费槽、`move`/`end`/`releaseObject`/`nextFragmentKey`，只在本 tick 的 step 内有效）与 `DestructionCamera`（每 tick 含 tick 0 调用，只在 0x11/8 取其位姿）。
  - [explosion-selection.ts](../../../../../src/render/flight/presentation/explosion-selection.ts)：开始前的内容检查（列表 1、2 非空，条目动画存在且有帧，列表 1+2 与列表 3 各自帧数一致，星云非空；`ContentContractError` 带结构路径）；X8 子集（每个非空列表一次 `rand % count`，保留 5/5/3 个原始序号，回绕并保留重复；空列表 3 不抽取——Core 的 CR-01 已在有导弹时拒绝它，导弹爆炸遇空列表 3 为 `invariant-violated`）；X4 单次选择（`large` 列表 1、`missile` 列表 3、`other` 用 Core 的 `0x56b50` `squaredDistance` ≥ 160000 取列表 2，否则列表 1；`item` 为原列表序号；每次一个 rand，校验 0–32767）。
  - [presentation-camera.ts](../../../../../src/render/flight/presentation/presentation-camera.ts)：视口 0xC/1/6 为 (0,0)–(639,315)，8/0x13/0x11·8 为 (0,0)–(639,479)，其余 `unsupported-view`；`afterStep` 在 0xC/1/6/8/0x13 取观察实体位姿，无观察实体保留上一位姿（tick 与视角更新），0x11/8 取被毁相机缝的位姿（未提供则 `unsupported-view`）；新运行从原点与单位行开始。
  - [presentation-budget.ts](../../../../../src/render/flight/presentation/presentation-budget.ts)：`PresentationError`（`presentation-capacity`/`invalid-input`/`unsupported-view`/`invariant-violated`/`invalid-state`）与 `PRESENTATION_LIMITS`（objects 4,096；selections `CORE_LIMITS.entities` + 4,096 = 6,144），分配前核对。
  - [flight-presentation.ts](../../../../../src/render/flight/presentation/flight-presentation.ts)：`createFlightPresentation` 每运行一份，绑定 owner/run，以 tick 0 的 Render State 创建（先校验内容、抽子集，再算 tick 0 相机）；`advance(frame)` 先整体校验（同 owner/run、tick 从上一 tick 连续、render 的 tick/clock 一致、时钟不倒退），拒绝时不改状态；逐 tick：步末相机 → 按 `explosion-started` 次序以步首相机选择 Core 爆炸 → effects（其激活排在 Core 之后，FS-10 决定 8）→ 丢弃已离开 Render State 的 Core 选择；整帧处理完再按 tick 升序通知订阅者，每个订阅者每个 tick 一次，迟订阅不重播，监听器异常不影响其他监听器且帧后抛出。`camera()`、`explosions()` 无副作用。处理中的任何错误使模块 failed；`dispose` 幂等并拒绝之后的使用。运行内键与来源历史保证每键一次激活、每个额外爆炸序号与每个碎片只爆炸一次；`presentationRandom(seed)` 给出独立于世界 RNG 的表现随机源（测试注入 `scriptedRand`）。
  - 边界：[eslint.config.js](../../../../../eslint.config.js) 新增 `osr/flight-presentation-imports`（`src/render/flight/presentation/**` 的非测试文件只能以相对路径引用自身、Core 与 content，包、计算式 import 一律拒绝），并禁止 DOM/宿主全局（`window`、`document`、`crypto`、`Date`、`performance`、定时器、rAF、WebGL 类型等）、`Math.random`/`Date.now`/`performance.now`/`getRandomValues`/`randomUUID` 与 async/await。[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 新增 lint 正反例（两层目录深度、四种导入形式、类型导入、测试文件不受限）与依赖图检查（传递可达只到 Core、content 与自身，无包，无 DOM 名称，含夹具反例）；audio 与 presentation 共用抽出的 `sourceReach` 遍历。
- **测试与 AC-11 对照：** [explosion-selection.test.ts](../../../../../src/render/flight/presentation/explosion-selection.test.ts)（子集次序、回绕、重复、7 项列表、空列表 3 不抽取、rand 越界；400 恰在边界取列表 2、f32 内侧取列表 1、从相机而非原点量距；内容拒绝的路径）；[presentation-camera.test.ts](../../../../../src/render/flight/presentation/presentation-camera.test.ts)（各视角视口与位姿、保留、被毁视角、不支持视角）；[flight-presentation.test.ts](../../../../../src/render/flight/presentation/flight-presentation.test.ts)（步首相机两侧 400 的选择、`eventIndex` 与事件次序、缓存寿命：移动/地图视角/0 tick 帧/动画早已结束/无观察实体都不改选择且不再抽取，离开 Render State 才丢弃，激活 tick 即不在表中则立即丢弃；二次激活故障；5 tick 帧整帧处理后通知；跨 owner/run、缺 tick、重复、render 不符、时钟倒退均拒绝且不改状态；P3-14 契约替身先后登记各收到每次激活恰一次与该 tick 的 `afterStep`，与 `explosions()` 的选择一致，退订幂等；监听器异常；重试为新实例、旧实例全部拒绝；被毁相机缝；effects 缝的次序、键、来源种类 24、槽、移动与结束、各类非法请求、异步 step；预算：objects 4,096 通过/4,097 失败与槽释放后复用，selections 6,144 通过/6,145 在抽取前失败）。
- **检查：** `pnpm exec vitest run src/render/flight/presentation tools/engineering-boundaries.test.ts` 4 文件 146 项通过；`pnpm lint` 通过；`pnpm check` 通过（343 文件 10138 项，构建成功）。变基到含 32 的目标分支（`4ebd0a68`）后，合成 Render State 补 `speedShare: 0`（FS-07 不读它），焦点测试 146 项与 `pnpm check`（344 文件 10178 项，构建成功）再次通过。
- **rubber-duck：** 三项阻断均已修正：碎片再爆炸的 `sourceKindBit` 改为 24，请求按来源限定变体（额外爆炸 `large`/`other`，碎片 `other`）；对象预算改为 `reserveObject` 返回的槽，`activate` 必须消费未占用的槽，`end` 释放；lint 增加 async/await 与 `crypto`/`getRandomValues`/`randomUUID` 限制，并在运行时拒绝返回 promise 的 effects。非阻断项也已采纳：运行内 Core 键历史（离表后再激活也拒绝）、额外爆炸的父爆炸须已在本运行激活、`(父, 序号)` 与碎片各只一次。simplify：复用 Core 的 `frozenVec`，计数器改为由 `#live`/`#slots` 的大小核对，键用登记表而非解析字符串，`#settleCore` 无 Core 爆炸时不建表，边界测试抽出共用遍历；未采纳：监听器改为 `Set`（会合并重复订阅，改变行为）、每 tick 的 effects 上下文闭包与 `explosions()` 结果缓存（量小）、把 ordinal/变体约束下放给 13（是 FS-07 与 X3 的契约）、eslint 与依赖图名单合一（依赖图检查是第二道防线）。
- **文档影响：** 不改 `docs/engineering`（按协调者指示交 28）。建议 28 在 [engineering/README.md](../../../../engineering/README.md) 的 Lint 规则与 [modules/render.md](../../../../engineering/modules/render.md) 记载：表现模块的导入/宿主能力边界与对应回归；`createFlightPresentation`、`presentationRandom` 与两条接入缝（effects、destruction camera）的用法；针对性测试命令 `pnpm exec vitest run src/render/flight/presentation`。原版事实、unknowns、STATUS 与指南无需更新。

