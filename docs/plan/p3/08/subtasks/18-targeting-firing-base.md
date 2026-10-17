---
type: plan
status: active
phase: P3
task: "08"
subtask: "18"
updated: 2026-10-15
---

# 18 — 目标、开火、规避与基地

**契约来源：** [spec](../spec.md) 的 S-07、S-08、AC-06；[目标、开火与规避](../spec.md#目标开火与规避)；03 的研究与 08 定稿。
**依赖：** 15, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-targeting.ts`：AI 目标 +0x90 与对象目标 +0x8C 的原版写入点、`0x632a4` 交战份额（AICO 组 0 三元组）、`0x5e444` 候选与 `0x2daa0` 保持值；读取命中与接近记录。
- 计划新增 `src/core/rules/ai-firing.ts`：按下 `0x5df20`（按住期限）、松开 `0x5df84`、射程判定 `0x5dfa4`；`src/core/systems/ai.ts`（15 新建）中 `0x5dcd4` 的三个通道次序与自动挂点调用，经 [weapons.ts](../../../../../src/core/systems/weapons.ts) 的现有入口开火（`shot-fired` 的 `trigger` 为 `ai` 或 `automatic`，不产生命令结果）。
- 基地的内置处理器（`0x62c10` 及其自动挂点行为）按 03 的结论实现，接入 15 的分派。
- 规避与其他机动的支持范围内分支（按 03 的结论）作为原语供 16 的操作码与内置处理器调用。
- 测试：目标写入点、份额、候选与保持；控制器决策与扳机/自动开火的先后与期限边界；通道 1 不丢弹或重复；发射者或目标失效、耗弹、受损、活动切换；基地连发节奏；僚机导弹的制导共用。

## 不包含

- 僚机处理器（19）；解释器（16）。

## 关键文件与契约

- 已有：[weapons.ts](../../../../../src/core/systems/weapons.ts)、[firing.ts](../../../../../src/core/rules/firing.ts)。
- 计划新增：`src/core/rules/ai-targeting.ts`、`src/core/rules/ai-firing.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-targeting.ts`：目标（新建）。
- `src/core/rules/ai-targeting.test.ts`：测试（新建）。
- `src/core/rules/ai-firing.ts`：扳机与基地行为（新建）。
- `src/core/rules/ai-firing.test.ts`：测试（新建）。
- `src/core/systems/weapons.ts`：入口复用的必要调整。
- `src/core/systems/weapons.test.ts`：测试。
- `src/core/systems/ai.ts`：通道次序与基地处理器接入。
- `src/core/systems/ai.test.ts`：集成测试。

## 验收标准

- [x] AC-06 的各项由规则与完整阶段集成测试覆盖。
- [x] P3-07 的战斗测试保持通过。
- [x] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 测试，期望由 03 与 W9/W10、CR-05/CR-07 独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现（2026-10-15）：**
  - 新建 [ai-targeting.ts](../../../../../src/core/rules/ai-targeting.ts)：阵营判定（ai §11.3）；A15 的读取 `recentAttacker`（+0xA4/+0xA8，严格或含等号，窗口按 u32）与 `proximityClearance`（`0x2d37c`：F(d² − r²(对方))，有己方种类时先减己方 r²；r² 为载入后形状 +0x14）；交战份额 `engagementShare`（`0x632a4`，A9；SCEN 波次模式按 CR-26 为 0；第 7 步的非活动 +0x90 经调用者提供的 `depart` 即 `0x5e6cc`，由 21 实现）；计时 `armEngagement`/`refreshEngagement`/`engageTarget`（`0x63250`/`0x63600`/`0x63744`，A10）；自动挂点的 `nextIdleAutomaticMount`（`0x2d72c`）、`previousAutomaticMount`（`0x2d7cc`，向下回绕、可为自身）、`chooseAutomaticTarget`（`0x5e444` + `0x2daa0`：无状态过滤、前一挂点目标作后备、首个候选时才丢弃失效的前一目标、保持值原样存）与 `isRetargetDue`（`0x2dabc`，CR-24 决定 3：保持值 ≤ 0x1C0 一律视为已到期）。对象目标 +0x8C 只经 17 的 `steerAtTarget`（`0x5c584`）改变；+0x90 的写入者（A8）都不在本项。
  - 新建 [ai-firing.ts](../../../../../src/core/rules/ai-firing.ts)：`pressChannel`/`releaseChannel`（`0x5df20`/`0x5df84`）、`isChannelInRange`（`0x5dfa4` 经 `0x2dd54`：当前挂点，导弹链无弹药失败）、AI 步的扳机循环 `runTriggerLoop`、`isSteady`（`0x5e15c`，f64 常量 `0x17233c`/`0x172344`）、`enableAiLock`/`disableAiLock`（`0x5e1b0`/`0x5e1d4`）、AI 锁定 `updateAiLock`（`0x5dfec`，A13：读列表 1 当前挂点；锁定角为 +0x28 的反余弦 f32；0 → 2 → 3 → 4，不经 1、无宽限，每 0x40 更新；列表 1 当前为炮且 +0x18 字节非 0 时读出炮记录之外，故障）、基地 `installBase`/`updateBase`（`0x62b60`/`0x62c10`，A14）。
  - [ai.ts](../../../../../src/core/systems/ai.ts)：`HANDLERS` 加入基地（模式 0 安装并同一调用运行更新体，模式 2 无操作）；`stepController` 完成 `0x5dcd4`：活动或停靠时扳机循环（经 P3-07 的 `fireAiChannel`）、`automaticMounts` 时 `fireAutomatic`，到期时处理器模式 1，其后 `aiLock` 时 `missileReady` := `0x5dfec`；更正了把 AI 锁定归 17 的注释。[weapons.ts](../../../../../src/core/systems/weapons.ts) 未改。
- **与 CR-23 文字的偏差（交协调者）：** CR-23 写“其后（不论处理器是否到期）aiLock 时 missileReady := `0x5dfec`”。私有反汇编 `0x5dcd4` 中 `0x5dfec` 的调用位于“采样 > C+0xF0”的分支内（`JBE` 直接返回），即 AI 锁定只在处理器到期的那次步中更新；A12 的英文表述与此一致（“when sample > C+0xF0, the handler …, and afterwards …”）。实现按原版代码；ai.test 的“AI 锁定只在处理器到期时更新”一项以完整阶段断言。CR-23 的措辞与 ai.md §1 *Scheduling* 宜由协调者更正。
- **验证：**
  - `pnpm exec vitest run src/core/rules/ai-targeting.test.ts src/core/rules/ai-firing.test.ts src/core/systems/ai.test.ts src/core/systems/weapons.test.ts`：73 项通过。份额的每个分支（无玩家、Warp、攻击者窗口与阵营、计数排除、百分比与 a/b/c、c > T2 SAR 1 免抽取、抽取 rand % 96 < +0xE4、同阵营落空、非活动目标请求离场与被拒）、计时的抽取与重设、挂点选择的走查次序/后备/丢弃/保持值；按下的期限、扳机循环的次序与释放（通道 1 恰一次、保持 0 恰一次）、射程与平稳、AI 锁定的各阶段与失败条件、规避（`0x5d374` 的 `0x5c584`）使锁定从 0 重来；基地安装的抽取数、偏航 1.0 的投递、两遍选择的结果（用三个挂点与两个目标区分安装那一遍是否发生）。
  - 完整阶段（ai.test）：基地在首次回调安装，同一调用中每个空闲自动挂点 1 次抽取并装填；移除不抽取，停放后恢复重装再抽取、不重选；自动挂点从安装后的 AI 步起每 4 个 tick 开火、三发后在下一次到期更新重新装填，`shot-fired` 的 `trigger` 为 `automatic`、无命令结果；处理器的按下在下一次 AI 步先于自动挂点开火（`{ type: 'ai', channel: 0 }`），连同受损自动挂点的抽取次数核对 RNG 交接；AI 锁定只在到期步更新、2 → 3 → 4 后通道 1 发射制导导弹，`launchByte` 4、程序 `heat-seeker`（既有制导规则），发射后等级清零、只发一次；被毁（状态 4）不运行、区域切换移除控制器且不开火。weapons.test：AI 制导发射携带锁定等级（受损挂点减 1）并清零；目标失效 `no-target`、无弹药 `no-ammunition`。
  - `pnpm exec vitest run src/core`：118 个文件全部通过，含 P3-07 的战斗测试（`combat-*`、`weapons`、`missiles`、`launch` 等）；`pnpm check`（typecheck、lint、9,818 项测试、build）通过。15 的两项测试改为只对未接入的处理器断言“不安装”、对程序槽只比较所选记录（基地已接入）。
- **rubber-duck：** 无阻塞项。采纳：基地安装测试改用三个挂点与两个目标以证明安装那一遍选择；自动挂点节奏与 RNG 交接的精确断言。未采纳：“`0x38bb0` 应跳过不合格的种类 2 对象”——原版 `0x38bb0` 只取走查中的第一个种类 2 对象再判定（私有反汇编），与 P3-10 的 comm-reactions 一致。
- **simplify：** 采用 `isDue`、radio.ts 的 `hasKind`、去掉 `scene.subject` 的未检查转换、收窄导出；未采纳：把 `firingDataOf` 与 `weapons.ts` 的私有副本合并（合适的位置 firing.ts 不在写入范围）、各规则模块的 `clockAfter` 合并（同上）、每步闭包的微优化与把 AI 步次序移入规则模块（保持 15 的系统分派结构）。
- **文档影响：** 本项写入范围内无须更新的文档。建议（不在写入范围）：executable A12 写明 `0x5dfec` 只在处理器到期时调用，A9 写明 `0x38bb0` 只判定第一个种类 2 对象，A15/ai §11.3 记下 `0x2d37c` 的算式；P3-02 CR-23 措辞更正；core.md 的 AI 步、基地处理器与 `ai-targeting.ts`/`ai-firing.ts` 交 28。
- **交接：** 16、19 调用本项原语（按下/松开/射程/平稳/锁定开关、份额与计时、`recentAttacker`、`proximityClearance`）；份额的 `depart` 由 21 的 `0x5e6cc` 提供，16 接入操作码 501/502 时需在 21 完成前传入（例如 21 完成前暂时不可达时的处理须由协调者定）。

