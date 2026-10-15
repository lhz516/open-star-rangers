---
type: plan
status: active
phase: P3
task: "10"
subtask: "17"
updated: 2026-10-14
---

# 17 — 基地内部服务与完全修理

**契约来源：** [spec](../spec.md) 的 S-07、AC-09；[基地内部、修理与补给](../spec.md#基地内部修理与补给)。
**依赖：** 05, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 基地上下文命令：`navigate-selection` 夹在两端，`confirm-selection` 把仍需服务的项移到服务队列首位；显示列表与服务队列分开；事件按 Q-08 的实际调用阶段发出（执行键不论是否需要服务都有音效输入）。
- `base-interior` 阶段（视角 6）按 Q-08 服务队列首项：状态聚合、时序、字段修理、槽位 5/7/8 的特例（复用 [mounts.ts](../../../../../src/core/rules/mounts.ts) 的 `repairListMounts` 真实语义）、资源与弹药补给与上限、出队，以及地图打开、离港中断时的门禁。
- 完全修理 `0x39820` 作为独立纯规则：只重置 D7 所列字段，复用挂点修理/选择与 P3-06 的控制辅助；耗尽锁存允许真实恢复后再次耗尽；`commandIndex: null` 的 `weapon-selected` 只在原版有反馈的位置发出。停靠、离港与报告路径按 Q-07/Q-09/Q-05 调用它；救援的调用归 P3-11。
- 基地受攻击、受损或失效的影响按 Q-03/Q-08。

## 不包含

- 离港（18）；G-05 页面（22）；救援对 `0x39820` 的调用（P3-11）。

## 关键文件与契约

- [mounts.ts](../../../../../src/core/rules/mounts.ts)、[combat-init.ts](../../../../../src/core/rules/combat-init.ts)、[flight-control.ts](../../../../../src/core/rules/flight-control.ts)（控制锁定与扰动的辅助）、[energy.ts](../../../../../src/core/rules/energy.ts)（耗尽锁存）。
- 计划新增：`src/core/rules/base-service.ts`、`src/core/rules/full-repair.ts`、`src/core/systems/base-interior.ts` 及测试。

## 写入范围

- `src/core/rules/base-service*.ts`、`src/core/rules/full-repair*.ts`、`src/core/systems/base-interior*.ts`：计划新增。
- `src/core/rules/mounts*.ts`：必要时导出复用的辅助（不改语义）。
- `src/core/systems/pipeline*.ts`：`base-interior` 阶段接入。
- `src/core/systems/docking*.ts`：停靠时对完全修理的调用。
- `src/core/systems/commands*.ts`：基地上下文 `navigate-selection`、`confirm-selection` 投递 base-navigate、base-confirm（CB-07 §3；13 只给出门禁）。
- `src/core/systems/area.ts`、`src/core/systems/area.test.ts`：停放僚机到达基地的限频完全修理（RX6、CB-12；15 留空）。
- `src/core/systems/communications.ts`（仅注释）、`src/core/systems/communications.test.ts`、`src/core/systems/flight-control.test.ts`、`src/core/systems/displays.test.ts`、`src/core/systems/targeting.test.ts`、`src/core/systems/weapons.test.ts`：视角 6 需要基地服务状态（CB-11）与基地按键已接受后的测试前置与期望。

## 验收标准

- [x] AC-09：列表与队列、端点导航、执行与重排、部分进度、11 项单槽位/组/挂点特例、资源与弹药补给和上限按 Q-08；一次挂点修理不被当作全补。
- [x] 完全修理逐字段验证改变与保留：耗尽后恢复再耗尽、锁定与扰动、选择与冷却；事件只在原版对应位置发出；基地状态的影响有依据。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 各服务状态与时钟边界的独立期望；复用的 helper 用真实实现，不另写副本。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** `rules/full-repair.ts`（`repairFully`，`0x39820`，BS9：字段 0–18 清零、列表 1 与 0 全修、船体 c9C 与能量 c54、两表各走一整圈并补满所经导弹链、扰动复位；共享 `refillMissileChain`、`advanceWalk`、`resetDisturbance`）；`rules/base-service.ts`（BS4 的 `navigateCursor`、`confirmRow`，BS6 的 `repairStep`、`hullStep`、`energyStep`）；`systems/base-interior.ts`（`base-navigate`/`base-confirm` 的请求处理与事件、`base-interior` 阶段 `serviceBase`、跨任务入口 `fullRepair(context, entity, inRequestHandling)`）。`commands.ts` 的 `judgeBaseKey` 在基地上下文接受上下键与 Enter 并立即投递请求（CB-07 §3，协调者决定 a）；`pipeline.ts` 接入两种请求与阶段；`docking.ts` 在 `dock` 第 5 步对僚机完全修理（决定 c）；`area.ts` 在停放行进到达分支第一步做僚机到达的限频完全修理（RX6、CB-12，决定 b）。`serviceState`、`setUpBaseService` 留在 16 的 `rules/docking.ts` 并直接导入（该文件不在 17 的写入范围；周期与组字段表在 `base-service.ts` 中各有一份并互相注明）。
- **与旧 AC-09 措辞的差异：** 按 D-01 定稿 ②，服务队列与显示次序是同一数组，Enter 与完成后的轮转都可见地改变次序，光标是行号；测试按 BS4、BS5 验证同一数组，不再要求“显示排序不变”。服务步不发事件（CB-11、BS7：导弹遍历的选择音效原版从不处理），基地键每次都发 `base-navigated`/`base-confirmed`（端点与无需服务时 `moved` 为 false）。
- **期望来源：** 测试期望由 BS3–BS10、W3、W4、D7、RX6 与 CB-07/08/10/11/12/13 手工推导（本地研究记录 `local/research/p3-10/service/` 复核了 `0x39820` 与 `0x398ec` 导弹遍历的次序，不入库），复用的 `repairListMounts`、`listStatus`、`selectMount` 用真实实现。
- **测试：** `src/core/rules/full-repair.test.ts`（8：改变/保留逐字段、只修列表 0/1、类型以链首为准、一整圈不提前停、空表结束整个遍历但仍复位扰动、停放无移动块、选择不在表中为故障）；`src/core/rules/base-service.test.ts`（端点夹紧、Enter 移顶与光标值不变、组状态不是最大值、严格到期与先重新计时、组字段、列表 1 一次只修一个且不补弹并写状态 1、字段 8 无受损挂点时首步清零、字段 7 解锁与扰动复位且不改指令速度、船体满时也抽取、能量满才置标志、导弹遍历的四种结束形态、预算故障）；`src/core/systems/base-interior.test.ts`（13：正式 step 中按命令次序的接受与请求处理事件、行与记录、末行夹紧、玩家不可用与非基地上下文、无服务与无玩家实体、能量 +6/船体 +0x42/修理 +0x202 的首次时刻与唯一抽取、地图打开时计时保持且返回后逾期各做一次、不读停靠对象与基地状态、视角 6 无服务为故障、`weapon-selected`（`commandIndex` null）只对请求处理中的玩家、非玩家不发、耗尽锁存保留且能量更新后再耗尽发出新事件、停靠时僚机完全修理且无额外事件）；`src/core/systems/area.test.ts` 新增 2（僚机到达基地严格过限后修理并重设 +0x780、无消息与额外抽取；非僚机或非基地目标不修理）；`pipeline.test.ts` 更新阶段表与请求故障用例。
- **扩大范围后的测试调整（协调者批准，078e7ace）：** 视角 6 必有基地服务（CB-11），`communications.test.ts`、`flight-control.test.ts`、`displays.test.ts`、`targeting.test.ts`、`weapons.test.ts` 中进入视角 6 的用例改用 `base-interior.test-support.ts` 的 `enterBaseView`/`idleBaseService`；基地上下文的 `confirm-selection`、`navigate-selection` 改为 `accepted` 并在请求处理中发出 `base-confirmed`/`base-navigated`，`launch`（18）与地图 Enter（P3-09）仍为 not-implemented；`communications.ts` 只改注释。
- **检查：** `pnpm typecheck` ✓、`pnpm lint` ✓；本项相邻测试 154/154 ✓；`pnpm exec vitest run --testTimeout=60000` 295 个文件 8812/8812 ✓；`pnpm check`（含生产构建）退出码 0，8812/8812 ✓。
- **rubber-duck：** 无阻塞或非阻塞发现。**simplify：** 把基地键判定移入 `commands.ts`（消除 `base-interior`↔`commands` 的循环导入），`area.ts` 复用 `rearm`，`releaseSteering` 合并字段 7 的两项复位；跳过的建议：延后 `inRequestHandling`（CB-10 规定的跨任务入口，P3-11 需要）、服务阶段按需创建 RandStream（收益可忽略）。
- **文档影响：** Core 模块说明的 P3-10 交接与 STATUS 的更新归 27/协调者；`docs/original/` 无新事实（BS1–BS10 已入档，实现未发现矛盾）；本次检查无需另改文档。

