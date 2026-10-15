---
type: plan
status: active
phase: P3
task: "10"
subtask: "15"
updated: 2026-10-14
---

# 15 — 通讯反应与僚机报告接入

**契约来源：** [spec](../spec.md) 的 S-04、AC-06；[无线电队列与通讯反应](../spec.md#无线电队列与通讯反应)的“通讯反应”“僚机报告”。
**依赖：** 03, 14, 29。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 P3-07 标出的固定调用点以静态调用接入 `0x3c208`、`0x3c0f4`（[damage.ts](../../../../../src/core/systems/damage.ts) 模块注释所列位置，含碰撞致死低于 0 时的两次调用），在实例化扩展点接入 `0x38cd4`（[spawn.ts](../../../../../src/core/systems/spawn.ts)），在停放行进中接入僚机到达与靠近基地的报告（[area.ts](../../../../../src/core/systems/area.ts)）。
- 友伤累计与窗口、各限频、感谢计数、消息身份与全部条件抽取按 Q-05 与 D-03；只用世界 RNG，次序固定；不凭外发事件延后重放。
- 更新 P3-07 的连锁测试中按批准变化而改变的部分（新增的抽取改变后续序列）；不同渲染频率、音频与 G-03 绘制有无不改变世界 RNG、事件与哈希。

## 不包含

- 队列本身（14）；P3-08 对友伤累计的消费、P3-11 对感谢计数的统计与救援的清除调用。

## 关键文件与契约

- [damage.ts](../../../../../src/core/systems/damage.ts)、[destruction.ts](../../../../../src/core/systems/destruction.ts)、[spawn.ts](../../../../../src/core/systems/spawn.ts)、[area.ts](../../../../../src/core/systems/area.ts)。
- 计划新增：`src/core/rules/comm-reactions.ts`、`src/core/systems/comm-reactions.ts` 及测试。

## 写入范围

- `src/core/rules/comm-reactions.ts`、`src/core/rules/comm-reactions.test.ts`、`src/core/systems/comm-reactions.ts`、`src/core/systems/comm-reactions.test.ts`：计划新增。
- `src/core/systems/damage.ts`、`src/core/systems/damage.test.ts`、`src/core/systems/destruction.ts`、`src/core/systems/destruction.test.ts`、`src/core/systems/spawn.ts`、`src/core/systems/spawn.test.ts`、`src/core/systems/area.ts`、`src/core/systems/area.test.ts`：调用点。
- `src/core/systems/combat-chains.test.ts`、`src/core/systems/combat-wiring.test.ts`、`src/core/replay/combat-replay.test.ts`：已批准变化的断言更新。
- `src/core/systems/base-response.ts`、`src/core/systems/base-response.test.ts`：`0x3bed0` 无命令分支的威胁再通报（调用 `0x3c208` 第 3 步，14 留空）。
- `src/core/systems/displays.ts`、`src/core/systems/displays.test.ts`：帧末子步中尾随警告的调用（CB-09 第 2 项）。
- `src/core/systems/missiles.test.ts`：受害者首次说话的头像抽取使抽取数变化（RX9 第 4 行；仅断言）。
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`：`dispatchSpawn` 与 `updateParked` 改为接收 TickContext（仅调用行）。

## 验收标准

- [x] AC-06：每个调用点在原定位置接入；碰撞致死的重复调用与其他路径区分；友伤/限频/感谢状态与条件抽取的分布和先后按 Q-05 独立推导。
- [x] 不同渲染频率与表现有无不改变世界 RNG、规则事件与状态哈希。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 随机部分按代码推导，对 0–32767 的全部 rand 值计数原像。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** 纯规则 [rules/comm-reactions.ts](../../../../../src/core/rules/comm-reactions.ts)（攻击者种类、友方 `0x6807c`（即 `0x6887c` 去掉 `0x800`）、敌方攻击者、限频、低船体、友伤窗口、名称序号偏移、rand % 4、3500² 与尾随对齐）；[systems/comm-reactions.ts](../../../../../src/core/systems/comm-reactions.ts) 的 `reactToHit`（`0x3c208`）、`reactToDestruction`（`0x3c0f4`）、`reportEnemyAppears`（`0x38cd4`）、`reportParkedEnemy`（`0x3c3b0`）、`checkTail`/`warnTail`（`0x4edf4`/`0x38c30`）与给 P3-11 的 `clearCommunicationLimits`。调用点：[damage.ts](../../../../../src/core/systems/damage.ts)（`0x2a694` 护盾抽取之后、船体与子系统之前，攻击者非 none；破坏时置标志之后、`object-destroyed` 之前；`0x2a5fc` 之后船体 ≥ 0 调 `0x3c208(0)`，否则再调一次 `0x3c0f4`）、[spawn.ts](../../../../../src/core/systems/spawn.ts)（活动的敌方对象在初始移动块之后，抽取改为直接步进世界生成器以保持次序）、[area.ts](../../../../../src/core/systems/area.ts)（敌方停放行进写入位置且在活动区域内，交战之前）、[displays.ts](../../../../../src/core/systems/displays.ts)（`frame-end` 驾驶舱视角 0xC、0xD、1、6 中左显示屏之后）、[base-response.ts](../../../../../src/core/systems/base-response.ts)（`0x3bed0` 无命令分支：戳超过 0xB40 复查威胁，无威胁清戳，超过 0x2D00 清戳并 `0x3c208(0x93780, 0, 自身, 0)`），以及 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 两处调用行改为传 `TickContext`。
- **与验收措辞的差异（按批准的修订与协调者决定）：** 僚机到达基地的限频完全修理（RX6、D-01 ③）按协调者选方案 A 移交 17（`fullRepair` 归 17），本项不实现，`limits.wingmanArrivalRepair` 不写；`0x3c3b0` 按 ③ 实现为敌方停放对象的接近检查，不是僚机报告。尾随警告按 ⑦ 只在视角 0xC、0xD、1、6 中每 tick 由计时门控；攻击者条件的 AI 字节属 P3-08，P3-08 之前没有处理器状态，`attackerOnTail` 恒为假（CB-17 决定 11），本项不遍历种类 `0x780`，`warnTail` 单独测试，P3-08 接入时在 `checkTail` 中加入遍历并调用它。`0x38e4c` 对任何非 0、非玩家的攻击者生效（RX3）。限频按数值比较，原版为 u32 环绕（2³² 单位后才不同）。音乐回调只作表现标记入队，结尾的音乐复位/步进（G-01）不实现。
- **测试（期望按 executable RQ1、RQ2、RQ4、RX1–RX10 与 P3-02 CB-03/05/09/12 独立写出）：** [rules/comm-reactions.test.ts](../../../../../src/core/rules/comm-reactions.test.ts)（14 项：掩码逐位、限频边界、i32 低船体与友伤环绕、名称偏移；0–32767 的原像计数：第二条消息 rand % 4 各 8192，头像 rand % 3 为 10923/10923/10922、rand % 5 为 6554×3/6553×2，头像池满时第二次抽取）；[systems/comm-reactions.test.ts](../../../../../src/core/systems/comm-reactions.test.ts)（22 项：三步与五步的每个分支、限频戳的写与不写、抽取次数与 RNG 状态、事件、说话者快照，敌方出现、停放基地报告、尾随节奏与 `warnTail`，以及读取 projection/Render State/snapshot 与否 300 tick 内事件、RNG 与状态文本相同）；[damage.test.ts](../../../../../src/core/systems/damage.test.ts)（护盾抽取先于头像抽取；僚机船体在 `0x2a694` 读伤前、在 `0x2a5fc` 读伤后；碰撞致死 < 0 两条损失消息、= 0 一条，均先于 `object-destroyed`；玩家命中与击毁友方）；[base-response.test.ts](../../../../../src/core/systems/base-response.test.ts)（再通报 5 项）；[spawn.test.ts](../../../../../src/core/systems/spawn.test.ts)（实例化的敌方出现：比限频阻塞时多 1 次抽取并写戳；无僚机不写）；[area.test.ts](../../../../../src/core/systems/area.test.ts)（停放报告在交战之前抽取头像并写戳；无玩家或非敌方不报告；既有测试改用 `TickContext`）；[displays.test.ts](../../../../../src/core/systems/displays.test.ts)（尾随检查只在 4 个视角）。已批准变化引起的既有断言更新：[missiles.test.ts](../../../../../src/core/systems/missiles.test.ts) 无发射者的导弹命中活动的 `0x87c` 机体时，先抽头像（RX9 第 4 行），强制骰改为第二次抽取；`combat-chains`、`combat-wiring` 与 `combat-replay` 的断言无需改变（其场景中没有满足条件的反应抽取）。僚机台词的 rand % 3、% 2 映射在 14 的 `queueLine`（radio.ts，私有函数，14 已按值测试），本项以世界 RNG 状态核对次数。
- **检查（基于 f0501360）：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts --testTimeout=60000` 2659 通过；`pnpm check` 中 typecheck、lint 通过，vitest 8773/8774 通过，唯一失败为 `replay/snapshot.test.ts` 的 5000 ms 超时（机器高负载），单独与 `pnpm exec vitest run --testTimeout=60000` 全部 8774 通过；`pnpm build`、`pnpm typecheck`、`pnpm lint` 退出码 0。
- **rubber-duck：** 指出 missiles.test.ts 的 RNG 断言未更新（已在授权范围内更新，并按第二次抽取重选种子）与原像计数只覆盖 rand % 4（已补头像 % 3/% 5 与满池）。另发现并修复：取 W 时未完成的生成器遍历泄漏了实体表的遍历计数（改为 for-of 提前返回）。
- **simplify：** 采纳：限频与到期改用 `contracts/time.ts` 的 `isDue`；`0x6887c` 去掉 `0x800` 与 `0x6807c` 合并为一个友方掩码，base-response 改用它；敌方掩码复用 targeting.ts 的 `ENEMY_KINDS`；删去未用的周期常量与 P3-08 之前恒空的攻击者遍历；`reactToHit`/`reactToDestruction` 条件改为 if/else 与具名布尔值；先比较种类位再取 W。未采纳：统一各处 `withRand`/世界生成器助手与测试上下文助手（位于本项写入范围之外的 radio.ts、original-random.ts、test-support 文件）；`travelParked` 改在 `commit` 内报告（会在行进中间抽取，改变次序）。
- **文档影响：** 原版事实未变（全部已在 executable RQ/RX）；Core 模块分册的反应、调用点与已知差异（数值限频、尾随无 P3-08 时恒假）由 27 汇总；建议协调者在执行记录中记下僚机到达修理移交 17 已在本项落实为“不实现”。STATUS 与阶段索引无需修改。
