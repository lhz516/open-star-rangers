---
type: plan
status: active
phase: P3
task: "08"
subtask: "17"
updated: 2026-10-15
---

# 17 — AI 驾驶

**契约来源：** [spec](../spec.md) 的 S-06、AC-05；[AI 驾驶](../spec.md#ai-驾驶)；03 的研究与 08 定稿的请求。
**依赖：** 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [steering.ts](../../../../../src/core/rules/steering.ts) 上扩展 AI 机体所需的转向（提前量模式、横滚匹配、噪声例程、+0x118 点积判定等支持范围内的部分），不另建模块；计划新增 `src/core/rules/ai-piloting.ts` 放置 AI 移动助手对消息 0x40000、0x80000 的组装。
- [missiles.ts](../../../../../src/core/systems/missiles.ts) 的 `applySteer` 接受 AI 机体，经 P3-06 的 `applyFloatControl` 应用；[flight-control.ts](../../../../../src/core/systems/flight-control.ts) 的速度匹配请求加入 AI 形状，复用 `applySpeedMatch`。
- 原版直接调用的移动块重建等按所属规则与阶段执行。
- 复核 P3-06 已知差异中“对象更新与请求处理之间的指令速度读者”，结论写入完成证据（28 并入 Core 模块说明）。
- 测试：AI 请求经正式流水线产生运动；投递次序、同 tick 多请求、主体或目标失效；导弹的既有行为不变。

## 不包含

- 何时驾驶（解释器 16、处理器 18/19/21）。

## 关键文件与契约

- 已有：[steering.ts](../../../../../src/core/rules/steering.ts)、[missiles.ts](../../../../../src/core/systems/missiles.ts)、[flight-control.ts](../../../../../src/core/systems/flight-control.ts)。
- 计划新增：`src/core/rules/ai-piloting.ts` 及其测试。

## 写入范围

- `src/core/rules/steering.ts`：AI 转向扩展。
- `src/core/rules/steering.test.ts`：测试。
- `src/core/rules/ai-piloting.ts`：AI 驾驶请求（新建）。
- `src/core/rules/ai-piloting.test.ts`：测试（新建）。
- `src/core/systems/missiles.ts`：`applySteer` 的机体应用。
- `src/core/systems/missiles.test.ts`：测试。
- `src/core/systems/flight-control.ts`：AI 速度匹配。
- `src/core/systems/flight-control.test.ts`：测试。
- `src/core/rules/speed-match.ts`：速度匹配一般化为 (a, lo, hi)（修订 ⑧）。
- `src/core/rules/speed-match.test.ts`：一般化与 (0, 0, 1) 位一致的测试。
- `docs/original/formats/executable.md`：A2–A5 实现中核实的代码事实。
- `src/core/systems/pipeline.ts`：接入 `ai-match-speed` 并移出 UNWIRED_REQUESTS。
- `src/core/systems/pipeline.test.ts`：移除已接入的拒绝用例。

## 验收标准

- [x] AC-05 由流水线测试覆盖；导弹与玩家的既有测试通过。
- [x] 指令速度读者的复核结论已记录。
- [x] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 流水线测试，期望由 03 与 P3-06 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：**
  - [steering.ts](../../../../../src/core/rules/steering.ts) 加入 AI 机体的转向库（A1–A6），在控制器的转向块上原地修改：设置 `setSteeringFractions`（`0x5c768`）、`setSteeringNoise`（`0x5c7e8`）、`setLeadMode`（`0x5c878`）、`setSizeClass`/`approachRadius`（`0x5c73c`、`0x5dab0`）、`setTargetOffset`/`clearTargetOffset`（`0x5c6d4`、`0x5c6fc`、`0x5c72c`）、`steerAtTarget`（`0x5c584`，含主体 +0x8C 与锁定级清零）、`steerAtPoint`（`0x5c658`）；目标点 `updateTargetPoint`（`0x5c8b0`：每采样缓存、经 +0x8C 重定向、提前量模式 1–5 与其余模式走模式 4、两种偏移框架、点驾驶时偏移逐采样累加）；`computeSteering`（`0x5cd1c`：锥角位、L.z = ±0、横滚匹配与 C+0x118 的点积判定）；噪声 `steeringNoise`（`0x5d490`）与 `throttleNoise`（`0x5d6a8`）。读取的世界数据经 `AiSteeringScene` 传入。`0x5cc6c`（操作码 203–205）在切片中不可达（ai §10.2），未实现。导弹路径的既有函数未改动。
  - 新建 [ai-piloting.ts](../../../../../src/core/rules/ai-piloting.ts)：`pilotScene`/`aiPilot` 从世界构造场景（目标半径为载入后碰撞形状半径、标记为 0；提前量模式 5 读第 0 列表当前挂点的炮速，空列表为故障，原版读到栈上陈值、切片不可达）；投递者 `postSteering`（`0x5d014`）、`postRates`（`0x5d0ec`）、`postAxes`（`0x5d1ac`）、`postThrottle`（`0x5d41c`）、`postBreakTurn`（`0x5d274`）、`postSpeedMatch`/`postTargetSpeedMatch`（`0x5d090`、`0x5d080`）与规避 `evade`（`0x5d374`，照原样保留每采样缓存怪癖，CR-24 决定 6）。处理器（16、18、19、21）在对象更新中以本次更新的 RandSource 调用它们；本项不加处理器。
  - [missiles.ts](../../../../../src/core/systems/missiles.ts) 的 `applySteer` 接受 AI 机体（机型记录与最高速度经 `0x21fd8`；无块、无记录或锁定无效果），既不是导弹也不是机体为故障。[speed-match.ts](../../../../../src/core/rules/speed-match.ts) 的 `matchedSpeed`/`speedMatch`/`applySpeedMatch` 推广为 (a, lo, hi)（缺省 `PLAYER_MATCH` = (0, 0, 1)）；[flight-control.ts](../../../../../src/core/systems/flight-control.ts) 加 `applyAiMatchRequest`（无事件；目标查不到、主体无机型记录、任一方无块时不写）。[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 接入 `ai-match-speed` 并从 `UNWIRED_REQUESTS` 移除，[pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts) 的未接入表随之去掉该行（22 集成后由协调者加入写入范围，本项在其之上重新应用，`UNWIRED_REQUESTS` 只剩 `warp-departure`）。
- **原版事实（executable A2–A5，P3-08/17，已确认·代码）：** 本项在私有 Ghidra 副本中只读查看原生指令（输出留在 `local/research/p3-08/piloting/`），补记 `0x5dab0` 的逐类半径与 f64 余量、`0x5c8b0` 的写回点与模式字节 ≥ 6 走模式 4、点驾驶偏移逐采样累加、`0x5d0ec`/`0x5d1ac`/`0x5d41c` 投递清零的新块（不改 S 的 CB）及 `0x5d0ec` 的噪声次序、横滚值的运算次序。只记常数与结构，没有字节或反汇编。
- **测试（期望由 A1–A7 与上述原生次序独立推导）：**
  - `steering.test.ts` 新增 31 项：各设置函数、半径表（无目标/有目标/类 ≥ 5）、`0x5c584` 的四个分支（含同句柄不动作、空句柄保留 S+0x10、锁定级清零）、目标点（缓存、重定向、失效清空、提前量各模式与 v = ±0、两种偏移、点驾驶累加）、转向块（无效不动、锥角位、饱和、L.z = 0、横滚匹配的四个条件与 100 的严格边界）、两种噪声（加值、钳位、未设置行、> 1.0 不抽取、关闭不抽取）。
  - `ai-piloting.test.ts` 16 项：场景、各投递者的块与抽取次序（`0x5d014` 原地改 CB，其余投递新块不改 CB）、`0x5d090` 只看句柄、规避（先转后满油门、S 不变、+0x8C 恢复、锁定级清零、入口目标失效恢复为空、无效威胁只投油门）与缓存怪癖（同采样已运行 `0x5c8b0` 时按当前目标而非威胁转离）。**AC-05 的正式流水线测试**：对象更新后投递的 `steer` 经请求处理与运动阶段，与手工写入同一块状态的孪生世界逐位相同；同 tick 的 `steer` 与 `ai-match-speed` 按投递次序生效（两种次序）；推广匹配的三组 (a, lo, hi)；主体失效丢弃、匹配目标失效不写；同 tick 两条 `steer` 按行覆盖；受扰机体在请求处理中于投递噪声抽取之后抽取 5 次。
  - `speed-match.test.ts` 新增 7 项：(0, 0, 1) 与 P3-06 的结果逐位相同（含 −0、非整数最高速度与 0）、a/lo/hi 各自的作用、v 在 f32 写回前与下限比较。`missiles.test.ts` 新增 3 项（机体的 `steer`、无块与锁定无效果、标记为故障），替换原“非导弹即故障”一项；`flight-control.test.ts` 新增 3 项（`applyAiMatchRequest`）。
  - `pnpm exec vitest run src/core`：115 个文件、3327 项全部通过（含导弹、玩家与 P3-06 的既有测试）。在 22 集成后的目标分支（71c25d82）上，`pnpm check`（TypeScript、ESLint、Vitest 327 个文件 9772 项、生产构建）通过。
- **P3-06 指令速度读者的复核（交 28 并入 Core 模块说明）：** 结论是已知差异不变，AI 的加入没有带来新的读者。原版 Enter 在按键处理中直接写玩家的指令速度（+0x6C）与到达标志（+0x78），Core 在请求处理中写；差别只对对象更新与请求处理之间读取玩家这两个字段的规则可见。P3-08 在这一区间（对象更新中的 AI 控制器）读取的速度只有 `0x21c78`（移动块 +0x08 的当前速度：提前量模式 3–5 的 v 与 w、攻击航线的 F(`0x21c78`(T))、Xpon 构造的油门）、机型记录 +0xB8 与武器记录速度，都不是指令速度；当前速度只在运动阶段改变（玩家匹配在 `craft` 模式下只写指令速度，Warp 上下文不处理 Enter）。AI 自身的 `ai-match-speed` 与 `steer` 的速度因子在原版与 Core 中都在消息循环里写入，次序一致。依据：executable A3、A9 之后的攻击航线（WA7）、X 构造的第 8 步与 A5；对 AI 区域的速度读取逐项核对。
- **rubber-duck：** 一项阻塞——`applyAiMatchRequest` 对没有机型记录的主体（例如标记）会因读块而故障，而 CR-21 规定为不写；已改为先查机型记录，补测试。一项非阻塞——复核结论须写入完成证据，即上一条。其余（算术、噪声、请求次序、推广匹配、缓存怪癖）与提供的原生事实一致。
- **simplify：** 采纳：`postRates`/`postAxes`/`postThrottle` 不再返回常量 `true`；`postAxes` 与 `postBreakTurn` 用 `steering.ts` 导出的 `axis`/`controlBlock`（冻结，去掉强制转换）；`float32Argument` 共用（`postSpeedMatch` 的校验并入，故障位置为 `steering.argument`）；`float32Vector`；`updateTargetPoint` 只解析一次目标；`computeSteering` 去掉临时数组与 `forEach`；噪声的钳位合为 `clamped`、行按 1、2、3 显式展开；`missiles.ts` 的导弹与机体共用 `applyControl(world, entity, record, control)`。未采纳：把 `steer` 处理移到 flight-control.ts、把投递包装移到 systems/、拆分 steering.ts（spec 规定在 steering.ts 上扩展、子任务规定 ai-piloting.ts 在 rules/，`steer` 已由流水线路由到 `applySteer`）；合并玩家与 AI 的匹配处理（门禁与事件不同）；每次调用构造场景的闭包（只在处理器调用时短期存在）。
- **文档影响：** executable A2–A5 已补记（同一提交）。`docs/engineering/modules/core.md` 的请求清单、`steer` 主体与转向库说明、已知差异中的指令速度读者交 28（子任务 28 的范围，goal 执行记录已列 core.md 过时）。无其他需要更新的文档。
- **交协调者：** [ai.ts](../../../../../src/core/systems/ai.ts) 的 `stepController` 注释写“P3-08/17 加入处理器之后的 AI 锁定更新（`0x5dfec`）”，但 ai.ts 不在 17 的写入范围，本子任务的范围也不含它；`0x5dfec`（A13）属于开火（18 的通道次序与 `missileReady`），建议由 18 实现并改正该注释。

