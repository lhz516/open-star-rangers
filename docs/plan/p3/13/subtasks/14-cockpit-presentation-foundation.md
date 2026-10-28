---
type: plan
status: active
phase: P3
task: "13"
subtask: "14"
updated: 2026-10-28
---

# 14 — 驾驶舱表现状态与生命周期基础

**契约来源：** [spec](../spec.md#驾驶舱表现层契约计划新增) 的 S-02，AC-03/04/08/18。
**依赖：** 10, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现 D-01 的 owner/run 绑定、初始 tick、具名种子派生、只读查询、整体批次验证、失败锁存与幂等释放。
- 每逻辑 tick 一次调度，各仪表仍按到期/强制条件更新；首画不伪造 tick，重复绘制/0 tick 不打字或抽随机数。
- 提供各仪表独立子状态的最小组合契约和测试支持，Core blink 只消费不重算；CPU/队列预算按 D-01。

## 不包含

不实现仪表、共享音频模型、WebGL 或应用调度，不导入 app/ui/React/宿主时钟。

## 关键文件与契约

- 现有 [projection.ts](../../../../../src/core/projections/projection.ts)、10 的规范内容。
- 计划新增 `src/render/cockpit/presentation/` 的合同、调度、随机与测试支持；具体公共形状由 D-01 固定。

## 写入范围

- `src/render/cockpit/presentation/**`：计划新增纯表现基础及测试。
- `eslint.config.js`：仅驾驶舱纯模块边界。
- `tools/engineering-boundaries.test.ts`：真实程序及违规反例。

## 验收标准

- [x] 相同逐 tick 输入的分帧状态/RNG 一致，空批次不推进。
- [x] 乱序、跨运行与错误形状在抽取前拒绝，运行故障后不能继续。
- [x] 释放幂等、预算先检查，不消耗 Core 或 P3-12 随机流。

## 验证方法

`pnpm test -- src/render/cockpit/presentation tools/engineering-boundaries.test.ts`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限现有消费者需求，不做通用 UI 引擎。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-14`（基线 `3ecdd062`）。

**交付（`src/render/cockpit/presentation/`，纯模块，无 DOM/GPU/app/宿主时钟）。** 16–22 按下列组合契约各自实现模块，24 装配：

- [cockpit-contract.ts](../../../../../src/render/cockpit/presentation/cockpit-contract.ts)：DC-04 的封闭输入 `CockpitTick { output, camera, mapRightButton }`、`CockpitAdvance { ownerId, runId, ticks }`、`CockpitInitial { render, projection, camera }`（`output` 与 P3-04 `TickOutput` 结构兼容，不导入 app）；`CockpitView`（`flight` 0xC、`warp` 1、`map` 8、`external` 0x11、`base` 6、`none`）与 `CockpitLayout { viewMode, view, slot, palette, screenRows, worldRows }`；钩子上下文 `CockpitTickContext`（tick、clock、clockUnitsPerTick、render、`CockpitProjection`（四个读取分区已 ready 的窄化类型）、camera、mapRightButton、本 tick 有序事件、`previousViewMode`、实时的 `layout` 与 `fullRedraw`、content）与只在 ③ 可用的 `CockpitDrawContext`（另加 `random`、后备面 `back`、`publish(rect)`＝`0x583fc`、`publishRow(y, x0, x1)`＝`0x58578`）。
- **模块接口 `CockpitModule`**（全部钩子可选，按登记次序调用，登记次序即全局回调次序：8、6、9、12）：`instruments`（按类型的 `InstrumentHandler { activate?, prePass?, draw }`，所有模块合计每个槽内类型恰一个）、`beforeDraw(ctx, event, index)`（①）、`prepare(ctx)`（②，DC-09 的读取调用）、`eraseOverlay`（`0x456e4`）、`drawOverlay`（`0x45de0`）、`global`（`0x1a23a0` 每帧回调）、`paintElement(ctx, element, index) → PixelRect`（至多一个模块提供，有元素时必须有）、`afterDraw`（④）、`dispose`。模块自持子状态并自行导出只读查询；随机数与送屏只在 ③ 可用，其余阶段调用为 `invariant-violated`。
- **每 tick 次序**（[cockpit-presentation.ts](../../../../../src/render/cockpit/presentation/cockpit-presentation.ts)）：① 按事件原次序，`view-switched` 先做选组（B、S 填 0，置全量重绘，槽改变时按记录次序 `activate`），再交各模块 `beforeDraw`；② 各模块 `prepare`；③ 一次逻辑显示：`warp`/`map` 先把 B 整体填 0（不覆盖）→ `flight`/`external` 的 `eraseOverlay` → `flight`/`warp`/`external` 各记录 `prePass` → `flight`/`external` 的 `drawOverlay` → 全部 `global`（`base` 只到这里）→ 遍 0 元素 → 一次时钟样本下按源次序到期记录（`alwaysRedraw`、全量、间隔 0 或 u32 `clock − last > interval` 严格，调用即 `last := clock`）→ 遍 1 元素 → 清全量 → 帧末 B→S（`flight`/`warp` 第 0–315 行，`map`/`external` 整屏）；元素在 `everyFrame` 或全量时绘制，在非逐帧（即全量）或遍 1 时送屏；④ 各模块 `afterDraw`。`none` 视角不调用 ③。
- **生命周期与查询：** `createCockpitPresentation({ ownerId, runId, content, modules, initial, seed })`：创建时校验 owner/run、tick 0、四分区 ready、类型覆盖/重复与元素绘制者，分配固定 640×480 的 B（含覆盖位）与 S（无覆盖），执行飞行初始化的选组与激活，不推进、不绘制、不抽随机；`status()`（不抛错）、`layout()`、`surfaces()`（只读约定的实时 B/S）、`schedule()`（tick、clock、viewMode、fullRedraw、各槽 lastDraw、`randomDraws`）、`advance()`、幂等 `dispose()`（逐个调用模块 `dispose` 一次，汇总错误）。整批先校验（任何抽取与改动之前，`invalid-input`，模型不变、不锁存）：owner/run、≤ 5 项、首项为上次 tick + 1 且连续、各项 `output`/render/projection/camera 的 tick、clock、视角一致、时钟步长为 `clockUnitsPerTick`、事件属本 tick 且 ≤ `eventsPerTick`、`mapRightButton` 为布尔、四分区 ready、且视角只经 `view-switched` 改变（每 tick 结束视角等于最后一个该事件的视角，无事件时等于上一 tick；Core 的每次视角写入都经 `commitViewSwitch` 发出该事件）。处理中任何异常锁存 `failed`，之后除 `status`/`dispose` 外均为 `invalid-state`。
- [cockpit-random.ts](../../../../../src/render/cockpit/presentation/cockpit-random.ts)：`fnv1a32`、`cockpitPresentationSeed(s)`（s 的 4 字节小端 + ASCII `cockpit-presentation`）、`cockpitRandom(s)` → `RandStream`；创建只接收宿主种子，不接触 Core 或 P3-12 的流。[cockpit-layout.ts](../../../../../src/render/cockpit/presentation/cockpit-layout.ts)：`layoutOf`、`frameEndRows`、`copyRect`、`COCKPIT_BAND_TOP = 316`、`clockExceeds(clock, since, interval)`（u32 严格比较，供各模块自有时钟复用）。[cockpit-limits.ts](../../../../../src/render/cockpit/presentation/cockpit-limits.ts)：DC-08 全表 `COCKPIT_LIMITS`、`checkImagePixels`（2²⁰ 索引像素，分配前）、复用 P3-12 的 `PresentationError`/`checkCapacity`（`presentation-capacity` 等同一错误类型）。
- **测试支持** [cockpit.test-support.ts](../../../../../src/render/cockpit/presentation/cockpit.test-support.ts)：`cockpitContent(mutate?)`（经规范读取器）、`syntheticProjection(tick, view, deepPartialPatch)`（四分区 ready、无玩家，按需深合并）、`syntheticRender`、`syntheticCamera`、`syntheticInitial`、`cockpitTick(s)`、`cockpitBatch`、`viewSwitched`、`syntheticEvent`、`supportModule`（补齐未测类型的记录处理器与空元素绘制者，记录全部钩子调用）、`createTestPresentation({ modules, ... })`（被测模块 + 支持模块）、`isolatedDrawContext(tick, options)`（单独调用一个处理器：新 B/S、真实驾驶舱流、记录送屏）。

**边界。** `eslint.config.js` 新增本地规则 `osr/cockpit-imports`：`src/render/cockpit/**` 的非测试文件只能以相对路径引用自身、`src/core`、`src/content` 与 `src/render/flight/presentation`，不得引用包、计算式 `import()` 或 GPU 适配目录；并禁止 DOM/WebGL 全局、宿主时间/随机/调度与 async。GPU 适配目录 `src/render/cockpit/composition/**` 与 `src/render/cockpit/*/gpu/**`（供 20、22、24 的 Three.js 部分）可用 Three.js 与 render 层，但不得导入 React/Zustand/IndexedDB 库及 app、ui、platform、workers、original-data，不得用页面全局与宿主时间/随机/调度。P3-12 飞行表现条目的宿主限制改由共用的 `hostRestrictions` 生成，规则集合不变（原有正反例照常通过）。`tools/engineering-boundaries.test.ts` 新增：三个纯模块位置（presentation、gauges、raster）的 lint 正反例（各导入形式、DOM、宿主操作、测试与 test-support 不受限）、两个 GPU 适配位置的正反例，以及沿真实应用程序依赖图的传递检查（真实程序为空）与夹具反例（经 core 中转到 render/scene、three、app、document、计算式导入、纯模块经 re-export 到 `composition/` 与 `*/gpu/`）。

**验证。**

- `pnpm test -- src/render/cockpit/presentation tools/engineering-boundaries.test.ts`：403 文件、11 091 项通过（脚本实际跑全部测试）；`pnpm exec vitest run src/render/cockpit/presentation`：57 项通过；`pnpm exec vitest run tools/engineering-boundaries.test.ts -t cockpit`：7 项通过。
- `pnpm check`（typecheck + lint + 全部 Vitest 403 文件 11 095 项 + 构建）：通过，退出码 0。
- 关键断言：创建只激活 slot 0 的 10 条记录、`schedule()` 为 tick 0 且 `randomDraws` 0；首 tick 的完整钩子次序；到期规则逐 tick 表（含差值等于间隔不到期、u32 回绕）；元素绘制/送屏规则；F1 中 B 第 400 行的叠加标记直到后续复制区覆盖才进入 S、世界行标记只有被画像素覆盖；Warp 每次显示前 B 填 0、复制区内未画像素以 0 送出；地图/被毁视角/基地/0x13 各自的钩子序列；选组清 B、S 并全量重绘、只在槽改变时激活；24 种错误批次（他 owner/run、非数组、6 项、缺口、重复、乱序、第二项错误、时钟、render/projection/camera 的 tick 与视角、按钮电平、他 tick 事件、畸形事件、无事件的视角或子模式改变、结束视角与最后切换不符、畸形切换、分区未 ready）均在任何钩子与抽取前拒绝且 B/S/覆盖/schedule 不变；5 项与空批次可接受、空批次与重复查询不改变任何状态；随机值等于 `cockpitRandom(TEST_SEED)` 序列且与直接用宿主种子的流不同，①、②、④、激活与 tick 外抽取/送屏为 `invariant-violated`；15 个 tick（含视角切换、来电、目标离开、玩家出现与变化、随机抽取）按 1×15、5+5+5、2+0+3+0+5+4+1 分组的钩子日志、抽取值、B/S/覆盖与 schedule 完全相同；处理故障锁存、释放幂等且模块释放错误汇总；`checkImagePixels` 在上限通过、上限 + 1 为 `presentation-capacity`。
- **Rubber-duck（code-review 代理担任）：** 唯一发现——原先“无 `view-switched` 时按 tick 结束视角补选组”的回退基于错误前提（Core 的 Warp 开始、发射等每次视角写入都经 `commitViewSwitch` 发出事件，`commands.ts`/`warp.ts` 的直接写入只改每 tick 的 `commandView` 副本），会掩盖契约错误并多做原版没有的选组。已采纳：删除回退，改为整批校验视角只经该事件改变，并校验切换事件的模式为整数；相关测试改为拒绝用例。其余设计点（基地只跑全局回调、`invalid-input` 不锁存、不建模“无玩家状态”提前返回、随机/送屏只在 ③、S 无覆盖、元素绘制者返回边界）审阅认为符合契约。
- **Simplify：** 按四个角度自查本次 diff：`copyRect` 移到 cockpit-layout.ts 供实现与测试支持共用；元素送屏条件化简为“遍 1 或非逐帧”（与原条件在提前返回后等价）；测试支持复用 P3-12 的 `DESTRUCTION_VIEW_MODE`/`DESTRUCTION_SUB_MODE`；删去无意义的类型清单测试。未改行为，复跑上述检查通过。
- **文档影响：** 需要更新但不在本子任务写入范围：`docs/engineering/README.md` 的 Lint 规则一节应补“驾驶舱纯模块与 GPU 适配”条目（见 worker 报告的建议文本）；`docs/engineering/modules/render.md` 的驾驶舱 API 由 24 同步（其写入范围已含）。原版事实无新增，`docs/original/` 与 unknowns 无需更新。
- 无私有输出；检查日志只写在本 worktree 的 `node_modules/.cache/`。
