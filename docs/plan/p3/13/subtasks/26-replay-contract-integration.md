---
type: plan
status: active
phase: P3
task: "13"
subtask: "26"
updated: 2026-10-28
---

# 26 — 真实链、回放与帧分组一致性

**契约来源：** [spec](../spec.md#验收标准) 的 AC-01/03/04/13/14/25。
**依赖：** 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用实际Core→Runtime→Session→驾驶舱表现（含锁定与类型9视觉，D-02定稿），比较同种子输入在1×5、5、2+0+3帧分组下的模型状态和随机抽取。
- 必须包含切页、损伤、目标离开、来电同tick开始结束及绘制前后事件，不用恒定projection代理。
- 有无GPU层/声音读者时Core事件与周期哈希相同，P3-12表现流不被驾驶舱消耗。
- 验证容量前缀、transition/completed截断、Core/读模型/消费者失败、跨run和版本拒绝。

## 不包含

不更改行为以通过测试；发现缺口交协调者新增修复项，不在验证项暗改功能。

## 关键文件与契约

- [game-runtime-outputs.test.ts](../../../../../src/app/runtime/game-runtime-outputs.test.ts)、[game-session-presentation.test.ts](../../../../../src/app/session/game-session-presentation.test.ts)。
- 计划新增 `src/render/cockpit/cockpit-integration.test.ts`，使用真实驾驶舱表现模块（D-02定稿不建P3-14共享模型）。

## 写入范围

- `src/render/cockpit/cockpit-integration.test.ts`：计划新增组合回归。
- `src/render/cockpit/cockpit-integration.test-support.ts`：计划新增合成夹具。
- `src/app/runtime/game-runtime-outputs.test.ts`：真实TickOutput断言。
- `src/app/session/game-session-presentation.test.ts`：真实消费者排序。
- `src/core/replay/*.test.ts`：规则不变/版本拒绝回归。

## 验收标准

- [x] 动态输入的分帧一致性、Core/RNG不变性有可重复断言。
- [x] 一次性事件只消费一次，无中间projection丢失或未来状态倒填。
- [x] 使用真实Core/Runtime/驾驶舱表现模块而非mock；锁定与警告视觉只依赖同tick projection（D-02修订）。

## 验证方法

`pnpm test -- src/render/cockpit src/app/runtime src/app/session src/core/replay`、`pnpm check`；测试维护的[simplify](../../../../../.agents/skills/simplify/SKILL.md)仅限本组回归。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-26`（基线 `2bd89ec1`）。只新增与扩展测试，未改任何实现；未启动 DOSBox-X，未运行 Ghidra，未新增原版事实。全部输入为代码生成的合成内容。

**交付（测试）。**

- [cockpit-integration.test-support.ts](../../../../../src/render/cockpit/cockpit-integration.test-support.ts)：合成场景（仿 `ai-replay.test.ts`：玩家、两架 7 类敌机、17 类基地、僚机、两架远处 8 类敌机，另有一架无护盾无船体的 16 类在玩家处于 tick 2 碰撞而亡，使玩家船体受损、子系统变化；敌机带导弹，tick 66 起 type-9 导弹警告；玩家带固定炮与四枚导弹；基地状态回复为长度 0 的一帧，在同一 tick 开始并结束）。`play(frameSizes)` 在 `ControlledHost` 上经正式 Core→Runtime→Session 运行 200 tick，输入只在每 5 tick 块的首 tick 给出；`wire()` 照 `wireFlightRun` 的次序接线（无渲染器）：每帧先逐 tick 推进 P3-12 的真实表现模块（含效果与被毁相机），再以本帧全部 tick 推进 `createCockpitRun` 的全部真实模块（同一宿主种子；P3-12 的后裁剪面取合成运行设置），帧无 tick 时不调用驾驶舱；记录每块末的驾驶舱状态（`diagnostics`、布局、B/覆盖/S 的哈希、消息行快照、地图 `drawn()`）、每批 tick 与每 tick 的 Core 事实。`oneTickAtATime()` 以同一输入把同样的 tick 逐个交给新驾驶舱，作为参照。
- [cockpit-integration.test.ts](../../../../../src/render/cockpit/cockpit-integration.test.ts)（21 项）：
  - **动态场景**：左页 0/1/2/4/5/6 的切换（菜单页在同 tick 内开合）、子系统状态变化 ≥ 3 种、锁定 progress 取 −1、0 与 10–100、导弹警告由 false 变 true、僚机目标入 Warp 的 `target-cleared`（cause `warp`，绘制前事件）、3 条来电其中 1 条同 tick 开始结束（绘制后入队）、视角 0xC→8→0xC 与同 tick 的 0xC→1→0xC、地图画面只在视角 8 的两个块末有 `drawn()`、抽取数 > 20；同 tick 开始结束的来电只入队一次（块末队列 +1、`incoming` 为 null、无丢弃）。
  - **分帧一致性（AC-03）**：1×5、5、2+0+3 三种分组下，40 个块末的驾驶舱状态（含随机抽取数、表面哈希、消息与地图）全部相同，每 tick 恰好交付一次、按序、每批 ≤ 5；与逐 tick 参照相同；P3-12 的逐 tick 相机与激活及其随机流状态相同。
  - **Core 与 P3-12 不变（AC-04/AC-01）**：每种分组下，无接线、只有 P3-12、P3-12 + 驾驶舱 + 另一读者（如 P3-14 声音那样逐 tick 读锁定与警告）四种运行的 Core 事件与每 tick 检查点（快照哈希，含世界 RNG）全同；只有 P3-12 时其记录与随机流状态与有驾驶舱时相同（驾驶舱不抽 P3-12 的流）；另一读者不改变驾驶舱状态；录制 replay 后 `compareReplayResults` 为 match。
  - **锁定与警告只读同 tick projection（D-02 DD-02/DD-03）**：同样的 tick 逐个交给两个驾驶舱，一个把锁定换成上一 tick 的、一个把警告换成 15 tick 前的（type-9 每 0x15 时钟单位才翻转并绘制），其余不变：画面在该提示首次变化之前从不相同、之后出现差异。
  - **拒绝的批次（DC-04）**：第 8 帧（tick 36–40）的批次被改为“各 tick 带帧末 projection”（未来状态倒填）、重复、缺失、乱序或第 6 项时，驾驶舱在任何绘制与抽取之前以 `invalid-input` 拒绝、状态等于 tick 35 块末、仍为 `ready`，会话以 `consumer` 故障；Core 照常跑完该帧，录制与无驾驶舱时的前缀相同。另一 owner/run 的批次被拒绝且不变，同 run 的同一批随后被接受并等于参照；退出后新运行的驾驶舱从 tick 0 开始，旧运行的驾驶舱不再收到帧。0 tick 帧不调用驾驶舱、不改变状态；退出后不再请求帧。
  - **截断、停止与失败**：录制容量停止（在创建边界注入 step 抛 `CoreInputError('recording', …)`，与 Runtime 的真实容量路径相同；真实上限需 4000 余 tick，故不实跑）只交付成功前缀 41–42，之后为静止帧，驾驶舱停在 42 且等于参照与无停止运行的逐 tick 前缀，会话 `stopped`/`recording-capacity`、不再请求帧；Core 故障与读模型（projection）提取故障时该帧不交付，驾驶舱停在 40 块末；模块绘制失败（右显示屏缺模型，`ContentContractError`）使驾驶舱 `failed`、会话以 `consumer` 故障，Core 录制与 P3-12 记录等于无失败运行的前缀。**真实的衔接与完成截断**（`thirdLossSpec`：两次能量救援 G-02/6 后第三次损失）：5 tick 一帧下，截断帧只交付到截断 tick，驾驶舱随即处于该 tick，紧接的静止帧不推进；保持期间无帧请求；全部 tick 1 至完成 tick 各交付一次；至少一次截断落在帧内；最终状态等于逐 tick 参照；有无驾驶舱的 Core 录制相同。
  - 该文件以顶层 `vi.mock` 包装 Core 的创建入口（与 `game-runtime-fault.test.ts` 相同的直通包装，只在失败用例中对一次调用布防），所以在 Vitest 的 isolated 项目中运行；未布防时每次调用都是真实 Core。
- [game-session-presentation.test.ts](../../../../../src/app/session/game-session-presentation.test.ts)：`play` 增加 `cockpit` 选项，以应用的 `cockpitContentOf`（`mission-startable` 合成包与 `cockpitCopy()`）照应用方式经真实 `wireFlightRun` 接入驾驶舱与其 GPU 层。新增 10 项：每块末只有一个 `cockpit-layer` 对象、驾驶舱记录逐块推进；三种分组 × 三种画面（绘制、上下文丢失、无 WebGL 2）下 Core 结果与无表现的运行相同、P3-12 的选择与抽取与无驾驶舱时相同、驾驶舱块末状态与逐 tick 一帧相同，且每帧 P3-12 先走完本帧全部 tick 驾驶舱才推进（DC-04）。
- [game-runtime-outputs.test.ts](../../../../../src/app/runtime/game-runtime-outputs.test.ts)：真实 5 tick 帧的每项 projection 四个驾驶舱分区为 ready，tick 3 的自动选靶只出现在第 3 项起（前两项为 null），不由帧末倒填。
- [replay.test.ts](../../../../../src/core/replay/replay.test.ts)：补 `rulesVersion` 7、8、9（P3-11/P3-12 之前、其单独分支、P3-13/12 之前）在运行前以 `record.rulesVersion` 拒绝；现有用例已断言快照格式 9、规则版本 10。

**验证。**

- `pnpm exec vitest run src/render/cockpit src/app/runtime src/app/session src/core/replay`：58 个文件、1430 项通过。`pnpm exec vitest run src/render/cockpit/cockpit-integration.test.ts`：21 项通过（约 17 s）；`game-session-presentation.test.ts` 32 项通过（约 10 s）。
- `pnpm check`（typecheck + lint + 全部 Vitest + 生产构建）：通过，退出码 0（只有既有的 > 500 kB 块体积警告）。
- 未发现实现缺陷；未改行为。

**Rubber-duck（code-review 代理担任）。** 四项发现，均已处理：① 锁定与警告同时延迟时只证明了锁定——已拆为锁定延迟 1 tick 与警告延迟 15 tick 两项，各自断言画面变化（警告延迟须超过 type-9 一个翻转周期，否则第一次标签读到的仍是已变后的值）；② 夹具对空批次也调用驾驶舱，而 `wireFlightRun` 不调用——已照生产加守卫并改测试名；③ 会话测试中“各块 diagnostics 不同”因含 tick 而恒真——改为断言各记录最近绘制时刻逐块增长；④ 快照哈希随版本变化的断言是同义反复——已撤回。审阅确认 `vi.mock` 直通包装、注入容量停止与逐 tick 比较的取舍成立。

**Simplify。** 只限本组回归：去掉未用的 tick 事实字段（视角、目标），夹具内部用的常量与函数不再导出；未引入通用框架。

**文档影响。** 不在写入范围、建议协调者处理：`docs/engineering/modules/render.md` 运行装配一节的“测试支持”可补一句 `cockpit-integration.test-support.ts`（真实链的合成场景与 `wireFlightRun` 式接线）与检查命令。另请协调者知悉：代码中没有任何读取快照的入口，AC-01“旧快照明确拒绝”实际只由 replay 记录的 `rulesVersion`/`version` 拒绝保证（旧检查点哈希只随旧记录出现）。原版事实、unknowns、STATUS 与 tasks.md 无需更新。

**私有输出。** 无。
