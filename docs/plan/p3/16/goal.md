---
type: plan
status: accepted
phase: "P3"
task: "16"
updated: "2026-10-30"
---

# P3-16：P3 退出评审与 P4 交接 — Goal

## 目标与来源

实现已批准的 [spec](./spec.md) 中 S-01 至 S-11、AC-01 至 AC-20：
- 核对前置任务与最终候选；
- 补 P3-03 的覆盖映射；
- 按技术决定 4 修复 P3-09 × P3-10 的两种联合故障，并在最终候选上补验受影响的证据；
- 运行本地检查链；
- 审计 R-22 缺口、对照判定、缺省与未知项；
- 写出 draft 的 P3 退出评审与 P4/P5/P0 交接。

本文件不重新定义契约。评审结论按 spec 的[判定规则](./spec.md#判定规则)得出，任务完成不等于 P3 通过（[行为与边界](./spec.md#行为与边界)末段）。

## 代码现状与前提

- **联合故障的代码位置：**
  - [warp.ts](../../../../src/core/systems/warp.ts)：`judgeWarpRequest` 只按有效视角、目的地、冷却与能量判定；`judgeRequestWarp` 接受后 `defer` 一个 `warp-start`。`applyWarpStart` 在离港位姿下重算能量，不足时以 `warp.start-check` 故障。
  - [docking.ts](../../../../src/core/systems/docking.ts)：`checkDockingWait` 在 `mission-flow` 阶段投递 `dock`（子状态 4 到期）或自动 `depart`（子状态 5）。
  - [commands.ts](../../../../src/core/systems/commands.ts)：`judgeBaseKey` 接受 `launch` 后先改有效视角，再 `post` 一个 `depart`。
  - [pipeline.ts](../../../../src/core/systems/pipeline.ts)：`RequestQueue.findLastPending` 能在判定时查到本 tick 尚未处理的请求；阶段表中 `mission-flow` 先于玩家命令批次所在的 `object-update`。
- **现有测试：** [warp.test.ts](../../../../src/core/systems/warp.test.ts)、[docking.test.ts](../../../../src/core/systems/docking.test.ts)、[flight-control.test.ts](../../../../src/core/systems/flight-control.test.ts)、[commands.test.ts](../../../../src/core/systems/commands.test.ts)、[map-warp-replay.test.ts](../../../../src/core/replay/map-warp-replay.test.ts)。
- **契约与版本：** 冲突门禁在 P3-02 spec 的 [MW-04](../02/spec.md#mw-04-命令原因码与内部请求) 与 [CB-07](../02/spec.md#cb-07-命令判定) 中。P3-09、P3-10 spec 有重复的门禁描述，记录见 [Core 已知差异](../../../engineering/modules/core.md#已知差异)与[交接](../../../engineering/modules/core.md#交接)。`RULES_VERSION` 为 11（[rules-version.ts](../../../../src/core/replay/rules-version.ts)）；[replay-check.ts](../../../../tools/replay-check.ts) 与 E2E 支持通过符号读取它，不写死数值。
- **检查与工具：**
  - [`tools/package-check.ts`](../../../../tools/package-check.ts) 输出 `osr-package-check`/1，其中 `identity` 只是来源版本与指纹；
  - [合规 CLI](../../../../tools/compliance/cli.ts) 输出 `osr-local-compliance`/1；
  - [Playwright 配置](../../../../playwright.config.ts)有 development、production、development-headed 三个项目，`retries: 0`；
  - 构建指纹沿用 [P2-13/04](../../p2/13/subtasks/04-compliance-artifacts.md#完成证据) 的 `dist` 清单算法。
- **路由现状：** `node tools/task-state.ts p3/03` 为 `generate-goal`，覆盖表缺 S-18、S-19、AC-22、AC-23。交付证据在 [P3-10/29](../10/subtasks/29-comm-messages-import.md#完成证据) 与 [P3-08/13](../08/subtasks/13-ai-static-data-import.md#完成证据)。其余 P3 任务为 `done`。
- **计划新增：**
  - `docs/reviews/P3-exit.md`；
  - 被忽略的 `local/research/p3-16/`：真实数据核对、真实内容复跑、补验、风险复现与 R-22 审计的私有输出。
- **环境前提：**
  - 06 需要 `local/StarRang/cd/` 中的本地合法镜像与本机 Chrome；05 只需要镜像。
  - 08 需要 `tools/baseline` 的 Python 测试依赖（标准库）。
  - 09 的 development-headed 项目需要本机未锁屏的桌面会话（P3-14/27 曾因锁屏失败）。
  - 07 的补验可能需要 P3-14/26 的试听或 P3-15/06 的物理键盘项。只有影响分析判定它们受影响时，才交用户，并写明原因。
- **原版证据：** 不新增对照类别，不增加原版启动预算（spec 技术决定 5）。
  - 03 只做有界查证：读取 [Warp 门禁](../../../original/formats/executable.md#warp-cost-and-warp-start-p3-0905)与 [DK1–DK4](../../../original/formats/executable.md#docking-wait-docking-and-launch-p3-1004) 等已有记录，必要时做只读 Ghidra 分析；不运行 DOSBox-X。
  - 07 复用私有原版报告与样本，只重做新版一侧。
  - 主要运行时证据来自 `fixed 40000`，U-021 的前提由 13 逐类核对。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 17：复核清单与候选身份 |
| S-02 | 02、18 | 02、18：路由输出；17 复核 |
| S-03 | 05、08、09、10 | 17：在最终候选上运行 `check:original` 并复核各检查绑定的候选 |
| S-04 | 01、07、06 | 07：适用性表定稿；17 抽查 |
| S-05 | 03、04、11、18、19、20 | 04：Node 与 replay 回归；06、07：修复后补验；17 复核 |
| S-06 | 12 | 12：逐项审计；17 复核 |
| S-07 | 13、14、16 | 16：逐项判定；17 复核与结论一致 |
| S-08 | 15 | 15：登记表差异审阅；17 复核 |
| S-09 | 16 | 17：结构、元数据与结论一致性 |
| S-10 | 16 | 17：交接完整性 |
| S-11 | 02、03、04、15、16 | 17：文档差异、链接与元数据；STATUS 与阶段索引由协调者按 16 的建议修改 |
| AC-01 | 01 | 17：抽查批准来源与残留缺口 |
| AC-02 | 02、18 | 18：补 AC-23 的拒绝证据后 `node tools/task-state.ts p3/03` 为 `done` |
| AC-03 | 08 | 08：`pnpm check` 与两组 Python 测试的输出 |
| AC-04 | 09 | 09：`--list` 与执行报告逐项对账 |
| AC-05 | 10 | 10：合规 JSON 与产物适用性；17：`check:original` |
| AC-06 | 05 | 05：`PackageCheckReport` 的形状与完整身份比对 |
| AC-07 | 01、07、06 | 07：适用性表覆盖 S-04 全部类别 |
| AC-08 | 03、04、06、07 | 04：冲突与相邻路径的正式 step 和 replay；06：真实内容复跑；07：受影响对照的补验 |
| AC-09 | 12 | 12：八项逐项记录 |
| AC-10 | 13 | 13：R 项的计数与适用条件；17 抽查 |
| AC-11 | 13 | 13：V 项的计数与缺口出处 |
| AC-12 | 16 | 17：五项退出条件与证据一致 |
| AC-13 | 14 | 14：开发与生产构建的合成页面核对 |
| AC-14 | 16 | 17：覆盖表与主要交付无漏项 |
| AC-15 | 04、11、18、19、20、16 | 11：风险复现结论；16：失败与恢复条件表 |
| AC-16 | 15 | 15：登记表逐行差异 |
| AC-17 | 16 | 17：结论与逐项结果一致，draft 状态 |
| AC-18 | 16 | 17：交接各类别齐全 |
| AC-19 | 16 | 17：协调者对 STATUS 与阶段索引的修改、链接与元数据 |
| AC-20 | 全部 | 17：文件列表、合规与清理 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-candidate-evidence-map.md](./subtasks/01-candidate-evidence-map.md) | — | completed |
| [02-p3-03-coverage.md](./subtasks/02-p3-03-coverage.md) | — | completed |
| [03-joint-fault-contract.md](./subtasks/03-joint-fault-contract.md) | — | completed |
| [04-joint-fault-core.md](./subtasks/04-joint-fault-core.md) | 03 | completed |
| [05-real-data-candidate.md](./subtasks/05-real-data-candidate.md) | 18 | pending |
| [06-real-content-reruns.md](./subtasks/06-real-content-reruns.md) | 04, 18, 19 | pending |
| [07-affected-evidence.md](./subtasks/07-affected-evidence.md) | 01, 04, 19 | pending |
| [08-engineering-checks.md](./subtasks/08-engineering-checks.md) | 04, 18, 19 | pending |
| [09-browser-regression.md](./subtasks/09-browser-regression.md) | 04, 18, 19, 20 | pending |
| [10-compliance-artifacts.md](./subtasks/10-compliance-artifacts.md) | 04, 18, 19 | pending |
| [11-render-test-risks.md](./subtasks/11-render-test-risks.md) | — | completed |
| [12-r22-gap-audit.md](./subtasks/12-r22-gap-audit.md) | — | completed |
| [13-comparison-verdicts.md](./subtasks/13-comparison-verdicts.md) | 07, 12 | pending |
| [14-gap-annotation-audit.md](./subtasks/14-gap-annotation-audit.md) | — | in-progress |
| [15-unknowns-ownership.md](./subtasks/15-unknowns-ownership.md) | — | completed |
| [16-exit-review-handoff.md](./subtasks/16-exit-review-handoff.md) | 01, 02, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 18, 19, 20 | pending |
| [18-ac23-fixup-width.md](./subtasks/18-ac23-fixup-width.md) | — | completed |
| [19-explosion-sprite-sampling.md](./subtasks/19-explosion-sprite-sampling.md) | — | in-progress |
| [20-map-picture-recorder.md](./subtasks/20-map-picture-recorder.md) | — | pending |
| [17-final-alignment.md](./subtasks/17-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

**依赖的含义：**
- 04 的实现要等 03 的契约修订定稿。
- 06 至 10 都要在含修复的候选上取证。07 还需要 01 的初始适用性表。
- 13 需要补验后的有效性（07）与 R-22 的审计结果（12）。
- 16 汇总除 03、04 外的全部证据。03、04 的结论经 06 至 10 进入 16，最终对齐仍依赖它们。

**写入范围重叠：**
- 08、09、10、11、14 都会构建 `dist/`，按编号串行。
- 03 与 04 分别写 spec 文档与 `src/core/`，有真实依赖。
- 01、02、05、12、15 互不重叠，可以和 03 同时开始。
- 19 改 `src/render/`，影响构建与飞行画面；06–10 依赖它。20 只改 map-picture 用例，09 依赖它。
- 18 改 `src/original-data/`，在导入路径上；05、06、08、09、10 依赖它，使真实数据与候选检查绑定含修复的候选。

## 执行记录

- **2026-10-30 — 02 完成：** P3-03 覆盖表补 S-18、S-19、AC-22 三行与一条执行记录（证据见 [02](./subtasks/02-p3-03-coverage.md#完成证据)）。AC-23 暂不补：P3-03 spec 修订 3 的验证项 2 要求 fixup 目标偏移不是 16 位时以 `unsupported-payload` 拒绝，[P3-08/13](../08/subtasks/13-ai-static-data-import.md#完成证据) 记为偏差，没有该拒绝的实现与测试（`RegionFixup` 不暴露目标宽度）。依技术决定 7，授权定稿不能豁免必需证据；这是不改变契约的缺陷，按 S-05 交修复项 18，`node tools/task-state.ts p3/03` 在 18 完成前仍缺 AC-23。
- **2026-10-30 — 新增修复子任务 18（goal 变更）：** 按 S-05 与技术决定 10，把 AC-23 的拒绝缺口作为独立修复：[18](./subtasks/18-ac23-fixup-width.md) 让关键字表对非 16 位 fixup 目标偏移报 `unsupported-payload`，加合成拒绝测试，再补 P3-03 覆盖表的 AC-23 行。它改 `src/original-data/`，在导入路径上，因此 05、06（真实导入）与 08、09、10（候选检查）以及 16、17 增加对 18 的依赖，使这些证据绑定含修复的候选。选择修复而不是修订 P3-03 spec 去掉该拒绝项：修复范围小、保留已批准的契约，不降低判据。这是 goal 的变更，由协调者依用户本轮授权（“如果在执行过程中有需要修改spec、goal或其他Decision。我授权你直接同意。”）批准；不改 spec。
- **2026-10-30 — 03、01 完成：** 03 在 P3-02 MW-04 加第 1a 步（转换冲突），同步 CB-07、P3-09 的“同 tick 门禁与请求”与 P3-10 的“停靠请求与等待”，并在 P3-02 审批节记修订；原版查证：停靠到期与 `w` 同帧时原版先停靠再开始 Warp（各环节已确认（代码），组合高概率可达，后续未确认），离港与 `w` 同帧不可达（已确认（代码）），修复记为项目差异。01 的底稿列出审批来源 C 类（授权不足）项与需 07 判定的证据类别，并发现若干交 16 的文档问题（见 [01](./subtasks/01-candidate-evidence-map.md#完成证据)）。
- **2026-10-30 — 12 完成：** P3-11 之后只有 P3-14 启动过原版（21 次，11 次合格），没有一次取得 R-22 八项中的任何一项；八项都保持 blocked，原判据与恢复条件见 [12](./subtasks/12-r22-gap-audit.md#完成证据)。没有新增启动。
- **2026-10-30 — 11 完成，新增修复子任务 19、20（goal 变更）：** 11 在当前候选上复现（证据见 [11](./subtasks/11-render-test-risks.md#完成证据)）：(A) 爆炸精灵在缩放的边线上取边前一侧并读到下一帧的第 0 行，违反 P3-12 AC-05、AC-13、AC-16（原责任 P3-12/21），新增 [19](./subtasks/19-explosion-sprite-sampling.md)；(B) `map-picture.development.spec.ts:211` 的失败与负载无关，是记录器把第一帧当作精确发布锚点的测试测量缺陷，产品符合 DC-09（原责任 P3-13/28，AC-17），新增 [20](./subtasks/20-map-picture-recorder.md)，只改测试测量，不放宽判据、不加重试。受击闪烁屏幕门在本机不违反，作为交接风险。P3-15/13 记的“只对负载敏感”在本候选不成立。06–10、16、17 增加对 19 的依赖，09、16、17 增加对 20 的依赖，使候选检查与真实内容复跑绑定含修复的候选。两项都是不改变契约的缺陷修复（S-05、技术决定 10），由协调者依用户本轮授权批准 goal 变更；不改 spec。
- **2026-10-30 — 04 完成：** `request-warp` 在本 tick 有待提交的玩家 `dock`/`depart` 时为 `ignored`/`wrong-context`（MW-04 第 1a 步），两种故障修复前已用正式 step 复现；`RULES_VERSION` 11 → 12，快照 9、replay 3 不变；P3-02 MW-12 补差异 10（协调者按 worker 的范围请求扩大写入范围，提交 `67550ed4`）。集成后 `pnpm check` 通过。
- **2026-10-30 — 15 完成：** 登记表只改负责阶段一列：U-001、U-004、U-009、U-020 的 P3 部分与 U-027 的部件标志、槽 0/3 闭合；U-008、U-010、U-022、U-031 与 U-027 的其余分量、U-033 保留 P3，作为阻塞交 16；U-028 证据不足、不改。依据见 [15](./subtasks/15-unknowns-ownership.md#完成证据)。
- **2026-10-30 — 18 完成：** 关键字表对 32 位 fixup 目标偏移报 `unsupported-payload`（`RegionFixup` 带 `targetBits`），解析器与转换器路径各有拒绝测试，去掉修复后失败；合法输出不变，`ConverterVersion` 不递增；内置表的契约没有宽度要求，未改。P3-03 覆盖表补 AC-23，`node tools/task-state.ts p3/03` 为 `done`。集成后 `pnpm check` 通过。

## 审批

用户于 2026-10-30 明确批准本 goal（“approve goal and commit”）。批准范围为本文件的代码现状与前提、验收覆盖，以及子任务 01 至 17 的拆分、依赖、执行方式与写入范围。

这不代表实现完成，也不替代 spec 批准（spec 已于同日单独批准）；环境前提与 R-22、U-021 等验收前提也没有因此满足。
