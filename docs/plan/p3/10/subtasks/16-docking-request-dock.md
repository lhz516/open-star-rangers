---
type: plan
status: active
phase: P3
task: "10"
subtask: "16"
updated: 2026-10-14
---

# 16 — 停靠请求、等待与停靠

**契约来源：** [spec](../spec.md) 的 S-05、S-06、AC-07、AC-08；[停靠请求与等待](../spec.md#停靠请求与等待)、[停靠](../spec.md#停靠)。
**依赖：** 04, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 命令码 9 进入子状态 3；回复回调（按 D-03 的时刻）在子状态 3 时进入 4；`mission-flow` 阶段读上一 tick 的取样检查期限、到期与停靠对象有效性，到期投递停靠请求并设为 5；比较的严格与否、u32 视图按 Q-06。
- 请求处理中执行停靠：`0x3959c` 门禁返回遍历中首个合格基地（严格 < 1000），须等于停靠对象，否则回到子状态 0 并发出取消事件；成功时按 Q-07 的次序保存位姿、停靠玩家及符合条件的僚机、进入视角 6、清除目标、建立服务列表与光标、置重绘、发出停靠事件与入港衔接事件（G-02/3）。
- 子状态 5 的“请求已投递未应用”不报为已停靠；菜单与倒计时期间世界照常推进。
- 测试覆盖阈值等号（菜单 ≤、执行 <）、无回复、对象失效、重复请求、换通讯对象、过期回复，以及首个合格基地比请求目标更远的多基地用例。

## 不包含

- 服务（17）；离港（18）；地图与 Warp 规则（P3-09）；被毁流程（P3-11）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `mission-flow` 阶段与请求处理；[targeting.ts](../../../../../src/core/systems/targeting.ts) 的目标清除先例。
- 计划新增：`src/core/rules/docking.ts`（门禁与距离）、`src/core/systems/docking.ts`（子状态与执行）及测试。

## 写入范围

- `src/core/rules/docking.ts`、`src/core/rules/docking.test.ts`、`src/core/systems/docking.ts`、`src/core/systems/docking.test.ts`：计划新增。
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`：`mission-flow` 阶段与请求处理接入。
- `src/core/systems/communications.test.ts`、`src/core/systems/radio.test.ts`：子状态 3/5 场景补上有效的停靠对象与期限（仅测试前置条件）。

## 验收标准

- [x] AC-07：子状态 3、4、5 的进入、到期检查、回复与取消按 Q-06，覆盖等号与跨阈值；子状态 5 不误报已停靠。
- [x] AC-08：菜单门禁含等号、执行门禁严格且取首个合格者；保存位姿、僚机距离内/外、目标清除、视角、列表与光标、重绘按 Q-07；成功转移才产生入港事件。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [rules/docking.ts](../../../../../src/core/rules/docking.ts) 为纯规则：停靠对象有效性（可解析且状态 ≥ 7，DK1）、子状态 3/4/5 的逐 tick 判定（上一取样 ≥ 期限，非严格，DK5）、`0x3959c` 执行搜索（Warp 视角 0/1 无结果；种类遍历中首个活动为 `active` 且距离平方严格 < 1,000,000 的基地，NaN 通过）、僚机列表首项判定（以保存的**基地**位置量距离）、`0x39cb4` 状态查询与 `0x39664` 的稳定降序服务行及计时/速率。[systems/docking.ts](../../../../../src/core/systems/docking.ts) 的 `checkDockingWait` 接入 `mission-flow`（只在 `inMission` 且子状态 3–5、玩家实体存在时；停靠对象为 null 为 `docking.object` 故障，CB-17 决定 3）：3/4 中对象失效 → 释放、子状态 0、`docking-cancelled`（`invalid-object`）后 `flushRadio`；3 超时只设 0（不清空、不释放）；4 到期投递 `dock` 并设 5。`dock` 在请求处理中按 DK2 次序：门禁失败只释放并发出 `gate` 取消；成功时保存基地位姿（逐位复制）、玩家停靠、符合条件的僚机停靠、一次丢弃的世界抽取、视角 6（上一视角、目标清除不发事件、重绘）、服务列表，发出 `docked` 与 `transition`（G-02/3）；不读子状态（DK1 竞态）。[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 接入两处，`depart`、`base-*` 仍为故障。
- **留给后续子任务：** 停靠僚机的完全修理 `0x39820` 由 17 在 `dock` 中标注的位置接入；子状态 5 失效时的自动离港由 18 接入（规则已返回 `launch`，系统暂不投递）；P3-09 的 `switchView` 落地后替换 `enterBaseView`。服务规则日后若迁入 17 的 `base-service.ts`，`serviceState` 随之移动。
- **测试（期望独立推导）：** `pnpm exec vitest run src/core/rules/docking.test.ts src/core/systems/docking.test.ts src/core/systems/pipeline.test.ts` 110 通过，其中：
  - AC-07：正式 step 的完整链（键 tick 2 → 回复取出 tick 3 → 可见 tick 4 → 结束 tick 84 → 期限 168 + 0x200 → tick 341 停靠，等号处投递）；无回复（头像 4 查找失败、无入队）在上一取样 = 请求取样 + 0x780 时超时；超时保留对象/队列/页；3、4 中对象失效（状态 < 7、已移除、播放中回复被停止且不执行回调）先于期限判定；4 的等号与前一 tick；子状态 5 的投递在请求处理前玩家仍为 `active`、视角未变、无服务；有效的 5 不变；无玩家实体不检查；倒计时中世界照常运动；换通讯对象不改等待；重复请求重定目标；旧请求的回复推进新等待并在新基地停靠；4 到期同 tick 的码 9 先重启等待，`dock` 仍按同一基地停靠后子状态为 3。
  - AC-08：1000 单位处菜单给出停靠项而执行门禁取消（正式链）；范围严格（1000 失败、其下一 f32 通过、NaN 通过）；首个合格基地（较低种类位、同种类按分配次序）比请求目标更远时取消，请求该者则停靠；Warp 视角、非活动基地与边界上门禁失败只释放（不抽取、不改视角/目标/服务/队列/页）；保存的是基地位姿；僚机按与基地的距离内/外、只看列表首项、只看活动；一次抽取；视角 6、上一视角、目标清除、重绘、左页不变；服务行按状态降序（组 33/34 的累计非最大值）、光标 0、三个期限与速率；无玩家实体无作用。
  - 变异检查：把执行门禁改为含等号、把期限比较改为严格，各有 6 项测试失败。
- **范围内的连带修改（协调者已批准，846911ea）：** `communications.test.ts` 的近处菜单门禁与码 9 两例、`radio.test.ts` 的 Warp 视角回调与“只在子状态 3 执行回调”两例，原先在子状态 3/5 中没有停靠对象，接入 `mission-flow` 后按 CB-17 决定 3 成为故障；只补上有效的停靠对象与仍在前方的期限，断言语义不变（后者的期限常量 77 改为 5000 以免 4 的到期先触发停靠）。
- **全量：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 中 TypeScript、ESLint 通过，Vitest 8711/8714，失败的 3 项均为负载下的超时（`tools/e2e-configuration.test.ts` 20 s、`src/workers/import-job.test.ts` 与 `src/core/replay/snapshot.test.ts` 5 s）。单独重跑：前两者通过，`snapshot.test.ts` 的规范文本一例仍超时 5.1 s，加长超时后 15/15 通过；与未改动基线交替测时为 3.7/11.9/19.2 s 对 2.5/15.8/5.3 s（机器负载均值约 20），属负载而非本项。`pnpm build` 单独运行通过。变基到 846911ea 后再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：2592/2599，7 项均为负载均值约 50 时的 5 s 超时（`snapshot.test.ts`、`damage.test.ts`、`engineering-boundaries.test.ts` 等）；这三个文件以 `--testTimeout=120000` 重跑 121/121 通过。
- **rubber-duck：** 无阻塞问题；三条非阻塞建议均已采纳：子状态 3/4/5 改为显式分派（`isDockingSubState`，P3-11 新增子状态不会误入）、补充无回复的端到端超时、门禁取消不触及队列/通道/页的断言。
- **simplify：** 采纳：取消事件与停靠对象读取合并为局部辅助、`enterBaseView` 返回旧视角、期限安全整数检查移入 `setUpBaseService`、服务状态预先计算、复用 `WINGMAN_KIND_BIT` 与 `COCKPIT_VIEW_MODE`、测试的 `runDock` 与场景类型别名。未采纳：基地掩码、视角常量与 1,000,000 常量的跨模块合并（需改动本项范围外的 `comm-menus.ts`、`targeting.ts` 等）；`withRand` 未导出；长链测试保留以覆盖 RQ6 的真实时间链。
- **文档影响：** 原版事实与契约无新增或改变。[Core 模块说明](../../../../engineering/modules/core.md)的阶段表第 2 行（`mission-flow` 现由 `checkDockingWait` 实现停靠子状态）与请求类型列表（`dock`）需更新，不在本项写入范围，交协调者或文档对齐子任务。

