---
type: plan
status: active
phase: P3
task: "08"
subtask: "16"
updated: 2026-10-15
---

# 16 — 解释器与脚本

**契约来源：** [spec](../spec.md) 的 S-05、AC-04、AC-17（执行预算）；[解释器与脚本](../spec.md#解释器与脚本)；02 的研究与 08 定稿。
**依赖：** 15, 17, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-script.ts`：脚本载入、参数解析（区间、随机符号、缩放、关键字查值、可选值）与世界级解析缓存的使用计数；释放与最后释放后的重新解析；解析的抽取发生在原版载入时刻。
- 计划新增 `src/core/rules/ai-interpreter.ts`：表程序处理器 `0x64cb8`：安装路径 `0x64b54`、状态机 `0x64d58`（空/单/多项列表）、执行器 `0x5f4f4` 与支持范围内每个操作码；驾驶、目标与开火类操作码调用 17、18 的原语，不另写规则。
- 执行实例（游标、等待、返回栈）每个对象私有；按 08 定稿的指令步、栈与缓存预算，超限锁存 `CoreFaultError`，不靠宿主时间、不静默截断或额外让出；错误与事件不回显参数原文。
- `src/core/systems/ai.ts`（15 新建）中接入表程序处理器。
- 测试：每个可达状态转换与操作码的独立期望；两个对象共享解析、不共享执行状态；换脚本、安装、停放、被毁、移除的引用平衡；参数边界；预算的 limit 与 limit + 1。

## 不包含

- 驾驶、目标与开火原语（17、18）；僚机与停放处理器（19、21）。

## 关键文件与契约

- 计划新增：`src/core/rules/ai-script.ts`、`src/core/rules/ai-interpreter.ts` 及其测试。
- 已有内容类型：[ai-programs.ts](../../../../../src/content/rule-data/ai-programs.ts) 的 `AiScriptEntry`、`AiParameterEntry`。

## 写入范围

- `src/core/rules/ai-script.ts`：载入与解析（新建）。
- `src/core/rules/ai-script.test.ts`：测试（新建）。
- `src/core/rules/ai-interpreter.ts`：解释器与操作码（新建）。
- `src/core/rules/ai-interpreter.test.ts`：测试（新建）。
- `src/core/systems/ai.ts`：接入。
- `src/core/systems/ai.test.ts`：集成测试。
- `src/core/rules/steering.ts`：新增反向视角 `0x5cc6c`（`updateReverseView`），既有函数不变。
- `src/core/rules/steering.test.ts`：同上的测试。
- `src/core/rules/ai-attack-pass.ts`：攻击航线 `0x63c00`/`0x640d8`/`0x64474` 与“前方”判定 `0x5e844`（新建，供 19 复用）。
- `src/core/rules/ai-attack-pass.test.ts`：同上的测试（新建）。
- `src/core/rules/ai-firing.ts`：只导出既有的 `channelRange`（`0x2dd54`），行为不变。
- `src/core/world/create-world.test-support.ts`：合成脚本的通道关键字值。
- `src/core/replay/map-warp.test-support.ts`：P3-09 的链路夹具使敌机不选程序。
- `src/core/replay/combat-replay.test.ts`：解释器抽取改变 RNG 后的种子。

## 验收标准

- [x] AC-04 的各项由独立期望的测试覆盖；若聚合原版条目计数，附等价依据。
- [x] AC-17 的执行预算部分：循环或递归脚本不能使 tick 卡住，超限故障锁存且不发布部分结果。
- [x] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 规则、缓存与生命周期测试，期望由 02 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：** [ai-script.ts](../../../../../src/core/rules/ai-script.ts)：载入 `0x5e940`（计数 0 → 1 时按条目、记号次序解析并抽取；区间的值与符号抽取，度数区间在抽取后缩放）、共享、释放 `0x5e9a8`（最后一次释放删除，下次载入重新解析并重新抽取）、复位 `0x5e9d8`；按 ai §5.2 的等价条件以脚本级计数实现（CR-19、CR-24 决定 10）。[ai-interpreter.ts](../../../../../src/core/rules/ai-interpreter.ts)：`0x64cb8` 三种模式（每种模式先写 C+0xF0）、安装 `0x64b54`（`0x63250`、`0x5e4d0`、+0x34 的 `0x5c768`、+0x44 的 `0x5c7e8`、安装脚本运行一次后释放，同一调用接首次更新）、状态机 `0x64d58` 的 13 条规则、执行器 `0x5f4f4`（等待与保持入口、25 种操作码、负延时按 CR-24 决定 16 存为 max(时钟 + 延时, 0)）、执行预算（每次运行 1,024、每 tick 131,072 次分派，分派前检查，超限为 `CoreFaultError('budget-exhausted', 'ai.dispatches-per-run' / 'ai.dispatches-per-tick')`）。[ai-attack-pass.ts](../../../../../src/core/rules/ai-attack-pass.ts)：操作码 1101 的攻击航线 `0x63c00`、脱离点 `0x640d8`、第 1 阶段油门 `0x64474`、摆动与“前方”判定 `0x5e844`（19 复用）。[steering.ts](../../../../../src/core/rules/steering.ts)：`updateReverseView`（`0x5cc6c`，状态规则 3 进入状态 5 时调用）；`forwardDot` 改为导出供复用。[ai-firing.ts](../../../../../src/core/rules/ai-firing.ts)：只导出 `channelRange`。[ai.ts](../../../../../src/core/systems/ai.ts)：解释器加入 `HANDLERS`；每 tick 的分派计数；`mayDepartByWarp`（`0x2fef8`）与 `requestWarpDeparture`（`0x5e6cc`），后者投递 `warp-departure`（处理由 21 接入，接入前投递即 `pipeline.request-unwired` 故障）。
- **AC-04（独立期望，Node）：** [ai-script.test.ts](../../../../../src/core/rules/ai-script.test.ts)（8 项：整数区间 i32 回绕与负除数、符号抽取与 −2³¹、浮点区间公式与 −0、度数区间抽取后缩放、多值记号次序、首次载入的 6 次抽取与全部参数、两次载入共享不抽取且执行状态独立、最后释放删除后重抽、升序与一脚本一项、复位、闭包外脚本与上界故障）；[ai-interpreter.test.ts](../../../../../src/core/rules/ai-interpreter.test.ts)（27 项：动作与测试的分支规则、结束不前进、100/104/106/107/111/200/210/211/222/231/232/240/300/301/400–402/1000–1003/1101/9500/9999/10000 的投递字、抽取与分支、等待中的转向与通道 0 按下、保持步、负延时；状态规则 1–13：距离三分、单项列表也抽 1 次、运行中保持、单项重启无抽取、状态 2/6 结束回 3 且先释放后载入、空列表、攻击者与状态 4 期限及窗口端点、规则 8/9 的期限等号、受害者、停滞到 6 再经空列表回 3、状态 5 的反向视角与点积、近距规避；安装次序与抽取、`0x5e4d0` 的 +0xE0 写回与锁定门、s2 > 0.5 与 s1 > 0.3 两分支、下限与噪声、更新与移除释放）；[ai-attack-pass.test.ts](../../../../../src/core/rules/ai-attack-pass.test.ts)（11 项）；[steering.test.ts](../../../../../src/core/rules/steering.test.ts) 的 `0x5cc6c` 2 项；[ai.test.ts](../../../../../src/core/systems/ai.test.ts) 新增 6 项：首次回调中安装、安装脚本与首次更新的同一调用及 4 次抽取（`0x63250`、列表、解析、240），两架共享解析（第二架 3 次抽取）、区域切换与待移除各释放一次、重装重新解析并重抽，两个世界缓存互不相通，AI 步只在到期时以周期运行，`0x5e6cc` 的各拒绝条件与投递。期望由 ai §5、§11、§12 与 executable A3、A12、WA7 的记录推导；原版逐条目计数以脚本级计数代替，依据为 ai §5.2 的等价条件（创建时已拒绝解析失败）。
- **AC-17（执行预算）：** 每次运行第 1,024 次分派允许、第 1,025 次故障；每 tick 第 131,072 次允许、下一次故障（同一合成环路脚本）；`ai.test.ts` 中不让出的脚本使 `world.step` 抛出 `budget-exhausted`，之后的 `step` 与 `snapshot` 都抛出同一个锁存故障，不返回部分事件。
- **原版代码核对（只读，`local/research/p3-08/16-interpreter/` 与既有反汇编）：** `0x5cc6c` 以目标（无目标时自身）的行与目标点 S+0x1C 为原点；`0x5e4d0` 的 s1 用写回后的 \|+0xE0\|；`0x640d8` 大目标分支的 lo 用未舍入的 hi、另一分支的垂线判定为 D(py·F(py)) + D(pz·F(pz)) 与 0.9 比较；`0x64474`、`0x640d8` 的常量（0.1、±0.707、0.2、0.3、0.4、0.5、π′、2、1/3、100、0.9）由本地读取可执行文件的 f64 常量确认；`0x5e844` 为 0 < D(D(r3y·F(dy)) + D(r3z·F(dz))) + D(r3x·F(dx))。这些细节交 28 写入 ai §11.2 与 executable A3、WA7。
- **夹具（协调者批准的写入范围）：** 合成全操作码脚本的 231 改用值 0 的关键字（值 −1 的低字节越界为运行时故障 `ai-interpreter.channel`，已记入 CR-15）；P3-09 链路夹具的表程序只选种类 0x10，使敌机无程序不动；combat replay 的种子 10 → 12（1–16 中唯一仍有碎片撞击玩家的种子）。
- **检查：** `pnpm exec vitest run src/core` 121 个文件、3,451 项通过；`pnpm check`（typecheck、lint、332 个测试文件 9,872 项、build）通过；`pnpm test:e2e`（端口 5160/5161）226 项通过、2 项在高负载下失败（导入页一项与 joint-pipeline 的长任务预算），单独重跑 7/7 通过，与本项无关；e2e 中没有触及 `warp-departure`。rubber-duck 审阅：无阻塞问题；唯一建议（CR-25 规定的故障位置为 `ai.dispatches-per-run`/`ai.dispatches-per-tick`）已采纳。simplify：采纳 `forwardDot` 复用、执行循环去掉每次分派的闭包、状态列表查表与规则 11 化简、执行状态共享冻结常量、攻击航线的 `approach` 合并、`0x2fef8` 拆为 `mayDepartByWarp`；未采纳：截断助手全仓统一（越出范围）、每次更新只建一次场景（改动签名，收益小）、`TickContext` 加分派计数字段（`pipeline.ts` 不在范围，`ai.ts` 的 WeakMap 注明为替代）、按种子之外的方式固定 combat replay 的撞击。
- **文档影响：** 原版事实的补充（上条）与 core.md 的解释器、解析缓存、预算与 `requestWarpDeparture` 说明交 28（worker 不改 `docs/original` 与工程文档）；STATUS 不变。

