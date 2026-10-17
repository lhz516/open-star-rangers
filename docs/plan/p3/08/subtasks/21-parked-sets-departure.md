---
type: plan
status: active
phase: P3
task: "08"
subtask: "21"
updated: 2026-10-15
---

# 21 — 停放 AI、对象集合与离场

**契约来源：** [spec](../spec.md) 的 S-11、AC-09；[停放、对象集合与离场](../spec.md#停放对象集合与离场)；05 的研究与 08、09 定稿。
**依赖：** 16, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-parked.ts`：停放处理器 `0x62250` 及子处理器，在对象更新的控制器路径中运行（15 的分派），结果由第 13 阶段的既有行进与交战消费；不在行进阶段重复决策，RNG 交接与 E4 次序按 08 定稿。
- 对象集合：按 09 定稿（[P3-02 CR-29](../../02/spec.md#cr-29-对象集合与地图可见标志的分工d-03)），复用 P3-09 已实现的 `object-sets` 阶段、集合、`mapVisible` 与揭示函数（[object-sets.ts](../../../../../src/core/systems/object-sets.ts)、[map-visibility.ts](../../../../../src/core/rules/map-visibility.ts)，MW-06），不另建；实现 `0x62250` 的目标搜索与 `0x62760` 的读取、僚机停放步对揭示函数的调用，并执行 CR-29 的联合测试 1–7。
- 离开指令 `0x5e710` 与 Warp 离场请求（消息 0x800000）在 01/05 确认可达时实现：投递与处理时分别复检，处理写入区域切换与 Warp 字段，后续由 P3-06 的停放 Warp 跳跃执行；[area.ts](../../../../../src/core/systems/area.ts) 需要时调整。不可达时由 14 的检查拒绝，不实现。
- 测试：首次与无玩家、上一采样的集合、失效 ID（不变式）、地图开/关/连续帧下读者所见的集合与 `mapVisible`（CR-29 的 1–7）；停放控制器的时序与 RNG；离场请求的复检与跨 tick 链。

## 不包含

- 地图可见性分支，以及 `object-sets` 阶段、集合与揭示函数的实现（P3-09，已交付）；基地报告（P3-10）。

## 关键文件与契约

- 已有：[area.ts](../../../../../src/core/systems/area.ts)、[pipeline.ts](../../../../../src/core/systems/pipeline.ts)；P3-09 的 [object-sets.ts](../../../../../src/core/systems/object-sets.ts) 与 [map-visibility.ts](../../../../../src/core/rules/map-visibility.ts)（只调用，不改）。
- 计划新增：`src/core/rules/ai-parked.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-parked.ts`：停放处理器（新建）。
- `src/core/rules/ai-parked.test.ts`：测试（新建）。
- `src/core/systems/pipeline.ts`：停放 AI 的接入与离场请求处理。
- `src/core/systems/area.ts`：离场与停放的衔接。
- `src/core/systems/area.test.ts`：测试。
- `src/core/systems/ai.ts`：停放分派。
- `src/core/systems/ai.test.ts`：集成测试（含 CR-29 的联合测试）。
- `src/core/systems/pipeline.test.ts`：删除已接入的 `warp-departure` 拒绝用例。

## 验收标准

- [x] AC-09 的各项由测试覆盖，含在 P3-09 的实现上执行的 CR-29 联合测试 1–7（地图开、关与连续帧）；不另建集合或揭示函数。
- [x] P3-06、P3-07 的停放测试保持通过。
- [x] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 阶段与历史快照测试，期望由 05 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：** 新建 [ai-parked.ts](../../../../../src/core/rules/ai-parked.ts)：`0x62250` 的模式 0/2（期限 = 采样 + 0x40，无抽取）与模式 1（入口期限、按入口读取的 m 按种类分派、末尾 C+0xF0 += rand % 64），目标搜索 `0x62578`/`0x62714`、候选选择 `0x62760`（偏好种类 `0x68018` 的 rand % 100 与存在性、集合次序的最近者与哨兵 −1.0、三类射程排除仍计入 n、p = 2 的 +0x90 射程丢弃、超过 A2 时的随机挑选）、僚机投放 `0x62aa0`（3-D 覆盖、严格、无序算覆盖）与离开指令 `0x5e710`（截断量值的主轴、−0 与 NaN 取上边、世界边外 1000，再调 `0x5e6cc`）。僚机分支依次调用投放、P3-09 的 `revealMapVisibility` 与敌方集合搜索；读取 `WorldState.objectSets` 与 `mapVisible`，不另建集合或揭示函数。`0x61f20` 留作可选的 `ParkedCall.consumeCommand`（20 接入；未接入时 r = 0）。[ai.ts](../../../../../src/core/systems/ai.ts) 把停放处理器加入 `HANDLERS`（现为全集，删去“未接入”的路径与 `installController`/`removeController` 的导出——离场由既有生命周期完成，不需直接调用），僚机投放调用 22 的 `constructTransponder(context, 僚机, 'wingman')`，世界 RNG 逐次同步，使构造的抽取位于处理器自身抽取之间；新增 `applyWarpDeparture`（处理时完整复检 `mayDepartByWarp`，成功写区域切换、`inWarp`、`warpClock` = 0、`lastParkedUpdateClock` = 时钟 − 0x80）。[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 处理 `warp-departure`，`UNWIRED_REQUESTS` 随最后一项移除而删去；每 tick 分派计数改为 `TickContext.aiDispatches`（替代 16 的 WeakMap）。area.ts 无需改动：P3-06 的 `warpOutRequested` 已执行停放 Warp 跳跃。
- **原版常量（新事实，交 28/协调者写入 executable D3）：** 本机只读读取 `SRANGERS.EXE` 的 f32 `0x1724a8` 为 3.0（同法核对已知的 `0x1724a4` = 100、`0x170fe4` = 3.0、`0x170fe8` = 0.25），所以 A2 = F(F(15000 × 3)²) = 2,024,999,936，与实例化的 `RANDOM_TARGET_DISTANCE_SQUARED` 相同，代码复用该常量；f64 `0x172398`/`0x1723a0` 为 +1000/−1000。只记数值，不含原版字节。
- **测试：** [ai-parked.test.ts](../../../../../src/core/rules/ai-parked.test.ts) 39 项（D1 种类表与期限、跟随者/领队/捷径与离开指令、`0x800`、D2 的保持/清除/重试期限、D3 的次序与并列、射程排除及其计入 n、僚机只计 `mapVisible`、p = 2 丢弃、随机挑选与跳过 0x2000/0x4000、偏好种类的抽取/过滤/不存在、D6 的轴与边、D4 的严格覆盖与 Warp、僚机分支在 r = 1 且 m ∉ {2, 5} 时跳过投放、揭示与搜索）。[ai.test.ts](../../../../../src/core/systems/ai.test.ts)：停放安装无抽取、只在到期时于对象更新中运行（未到期的 tick 对象更新不抽取；到期 tick 领队与基地按走查次序各 1 次抽取，停放更新的抽取在其后，行进朝控制器选出的目标，停放更新不再改控制器）；移除/重装；僚机投放在同一走查中创建停放 Xpon 并首次回调、构造的 1 次抽取在处理器末次抽取之前、下次重建前不是成员、该 tick 的停放更新选中它（4 次到期检查）且无 `transponder-deployed`、下次因自覆盖不再投放（AC-10 的僚机部分）；僚机 b 4（目的地在活动区外）经 `warp-departure` 离场、停放、安装 `0x62250` 与跳跃（19 的交接）。CR-29 联合测试 1–7（逐 tick 断言集合、`mapVisible`、搜索结果与抽取）：1 地图关（自身揭示只影响本次搜索，同 tick 地图步与下次重建后不可见）；2 第 N 个 tick 开图，N + 1 的搜索读到 N 的揭示并叠加自身揭示；3 第 M 个 tick 关图，M + 1 只有基础值与自身揭示；4 连续地图帧与快照等于按 MW-06 独立重算（含提前返回）；5 停靠、被毁、Warp 中与被毁源仍是成员且可被选中，走查中投放的 Xpon 在重建前不是成员；6 无僚机、无玩家与创建后的第一次决策；7 两个世界不共享、同输入的状态文本一致。[area.test.ts](../../../../../src/core/systems/area.test.ts)：离场链（N 区域切换与字段、N + 1 移除并停放、N + 2 安装停放处理器、立即到期并跳跃）、处理时复检失败（目标点回到活动区、+0x90 失效、已停放、已在 Warp、Warp 计时不允许）静默丢弃、同一对象第二个请求无效果、处理前被移除不故障。`pipeline.test.ts` 删去已过时的“未接入即故障”用例（写入范围已由协调者加入）。
- **检查：** `pnpm typecheck`、eslint 通过；`pnpm exec vitest run src/core` 123 个文件 3546 项通过（含 P3-06、P3-07 的停放、交战与 area 测试）；`pnpm check`：typecheck、lint 与 build 通过，全量 vitest 9967 项中只有 `replay/budget.test.ts` 与 `replay/snapshot.test.ts` 各一项在全量负载下超过 5 s 超时，单独重跑通过（本树 3.8 s、3.3 s，基线 5edb87f5 为 4.4 s、2.8 s，与本项无关的既有慢测试）。
- **rubber-duck：** 无阻塞问题；三项覆盖缺口已补：CR-29 第 5 项加入停靠与被毁源、射程排除的成员计入 n 并可被随机挑选、复检加入 Warp 计时。
- **simplify：** 采纳：测试中多余的 `before` 重赋值、重复的停放控制器读取函数合并、`toggleMap` 布尔、`Departure` 类型别名、`searchesObjectTarget`、去掉冗余的 `count > 0`、`1 << kindBit`。未采纳：把 `clockAfter`/`chop32`/`worldRand`/测试的阶段运行器提取为共享导出（各模块现有私有副本，提取需改写入范围外的文件）；把 `consumeCommand` 改为必需（它是 20 的接缝，与 19 的 `WingmanCall.consumeCommand` 相同）；每次抽取新建 `RandStream` 的分配（每次到期更新 1–3 次抽取，代价可忽略，且构造在调用中途从世界 RNG 抽取）。
- **文档影响：** spec、CR 与 original 文档的行为描述与实现一致，无需改动。交协调者/28：executable D3 记入 `0x1724a8` = 3.0（A2 = 2,024,999,936）与 D6 的 ±1000；`docs/engineering/modules/core.md` 补停放处理器、`warp-departure` 的处理与 `TickContext.aiDispatches`，并删去请求“未接入即故障”的说明（若有）。AC-10 的僚机部分已在本项测试中覆盖。

