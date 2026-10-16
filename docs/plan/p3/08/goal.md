---
type: plan
status: accepted
phase: P3
task: "08"
updated: 2026-10-15
related: [ADR-0006, ADR-0015, ADR-0017, B-003, B-004, B-006, B-009, U-001, U-021, U-022, U-025]
---

# P3-08：AI 与僚机 — Goal

## 目标与来源

实现用户于 2026-10-14 批准的 [spec](./spec.md) 中的 S-01 至 S-14 与 AC-01 至 AC-17：

- 原版研究 Q-01 至 Q-13，事实写入 `docs/original/`；
- 三个[实施关卡](./spec.md#实施关卡)：D-01 共享 Core 契约、D-02 比较判据、D-03 跨任务修订，各在依赖它的工作开始之前定稿并取得用户明确批准；
- AI 解析数据导入；AI 输入与支持范围；程序选择与安装；解释器与脚本；AI 驾驶；目标、开火、规避与基地；僚机处理器与友伤累计；僚机命令；停放 AI、对象集合与离场；Xpon 与 `b`；
- 标准 replay、容量与运行生命周期，浏览器回归，真实内容核对，R-11、R-12 的原版对照，文档与交接。

本文件不重新定义行为契约。

## 代码现状与前提

- **已有实现：** 实例化扩展中 `0x20990` 的留空位置在 [spawn.ts](../../../../src/core/systems/spawn.ts)；AI 初态与 `AiState`/`AiMode` 在 [initial-ai.ts](../../../../src/core/rules/initial-ai.ts)、[entity-table.ts](../../../../src/core/world/entity-table.ts)；[pipeline.ts](../../../../src/core/systems/pipeline.ts) 的 `object-sets` 阶段为空，`updateObject` 对机体只做通用生命周期，`Request` 的 `steer` 只接受导弹（[missiles.ts](../../../../src/core/systems/missiles.ts)）；停放行进与交战在 [area.ts](../../../../src/core/systems/area.ts)；AI 开火入口在 [weapons.ts](../../../../src/core/systems/weapons.ts)；`data/ai-programs` 的完整内容由 [rule-data.ts](../../../../src/core/world/rule-data.ts) 读入并受 setupHash 绑定，规则只读内置记录 1、2；内容契约在 [ai-programs.ts](../../../../src/content/rule-data/ai-programs.ts)（payload schema 1，[rule-data-payload.ts](../../../../src/content/rule-data/rule-data-payload.ts)）；`RULES_VERSION` 为 4（[rules-version.ts](../../../../src/core/replay/rules-version.ts)）。
- **计划新增：** `src/core/rules/` 下的 `ai-support.ts`、`ai-parameters.ts`、`ai-selection.ts`、`ai-script.ts`、`ai-interpreter.ts`、`ai-piloting.ts`、`ai-targeting.ts`、`ai-firing.ts`、`ai-wingman.ts`、`ai-commands.ts`、`ai-parked.ts`；`src/core/systems/` 下的 `ai.ts`、`object-sets.ts`、`xpon.ts`；各自相邻的测试；`docs/original/behavior/B-011-ai-wingman.md`。名称可在实现时调整，职责与落点不变。
- **任务前提：** P3-06、P3-07 已完成（`node tools/task-state.ts p3/06`、`p3/07` 报告 `done`）。P3-09、P3-10、P3-11 尚未开始：地图可见性分支、菜单到命令的正式 replay、救援重置的联合验证按 spec 交接给它们，本 goal 只验证不依赖它们的生产路径并明确记录未集成项。
- **用户关卡：** 08（D-01）、09（D-03）、11（D-02）须由用户明确批准定稿内容，本 goal 没有预先授权由 agent 代批；在批准之前，依赖它们的子任务不开始。
- **原版证据：** 研究用主 worktree `local/` 下的原版文件与只读 Ghidra；运行时对照用 `tools/baseline/measure.py`（[运行时测量](../../../guides/runtime-measurement.md)）。DOSBox-X 同一时间只有一个会话，由协调者调度；需要游戏输入时先写成配方刺激，配方不能表达的最小操作才请用户在私有副本中完成。结果受 U-021（cycles 未冻结）约束。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 08, 12 | 12 的契约测试；29 核对批准记录 |
| S-02 | 09, 13, 19, 22 | 13、22 的测试；29 核对批准记录 |
| S-03 | 14 | 14 的可达性与拒绝测试 |
| S-04 | 15 | 15 的规则与实例化测试 |
| S-05 | 16 | 16 的解释器与缓存测试 |
| S-06 | 17 | 17 的流水线测试 |
| S-07 | 18 | 18 的规则与集成测试 |
| S-08 | 18 | 18 的规则与集成测试 |
| S-09 | 19 | 19 的测试 |
| S-10 | 20 | 20 的契约测试 |
| S-11 | 21 | 21 的阶段与快照测试 |
| S-12 | 22 | 22 的测试；24 的浏览器触发（纳入 `b` 时） |
| S-13 | 01–07, 10, 11, 26 | 27 的对照结论；29 核对 |
| S-14 | 28 | 28 的文档审阅；29 核对 |
| AC-01 | 08, 09, 12 | 12、23 的回归；29 核对批准记录 |
| AC-02 | 14 | 14 的合成内容测试 |
| AC-03 | 15 | 15 的独立期望测试 |
| AC-04 | 16 | 16 的独立期望测试 |
| AC-05 | 17 | 17 的流水线测试 |
| AC-06 | 18 | 18 的规则与完整阶段测试 |
| AC-07 | 19 | 19 的测试 |
| AC-08 | 19, 20 | 20 的请求到消费契约测试 |
| AC-09 | 21 | 21 的阶段与历史快照测试 |
| AC-10 | 22 | 22 的 Node 测试；24 的浏览器触发 |
| AC-11 | 23 | 23 的标准录制与 replay |
| AC-12 | 25 | 25 的私有真实内容运行 |
| AC-13 | 01–07, 27 | 07、27 的文档检查与 `pnpm check:compliance`；29 核对 |
| AC-14 | 13 | 13 的 Node 测试与本机 package-check；24 的浏览器导入与恢复 |
| AC-15 | 10, 11, 26 | 27 的对照结论 |
| AC-16 | 28 | 28 的文档审阅与 `pnpm check` |
| AC-17 | 16, 23 | 16、23 的预算与生命周期测试；24 的浏览器生命周期 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-selection-closure-research.md](./subtasks/01-selection-closure-research.md) | — | completed |
| [02-interpreter-scripts-research.md](./subtasks/02-interpreter-scripts-research.md) | — | completed |
| [03-piloting-targeting-firing-research.md](./subtasks/03-piloting-targeting-firing-research.md) | — | completed |
| [04-wingman-commands-research.md](./subtasks/04-wingman-commands-research.md) | — | completed |
| [05-parked-sets-departure-research.md](./subtasks/05-parked-sets-departure-research.md) | — | completed |
| [06-xpon-crosstask-research.md](./subtasks/06-xpon-crosstask-research.md) | — | completed |
| [07-research-consolidation.md](./subtasks/07-research-consolidation.md) | 01, 02, 03, 04, 05, 06 | completed |
| [08-shared-contract-gate.md](./subtasks/08-shared-contract-gate.md) | 07 | completed |
| [09-cross-task-gate.md](./subtasks/09-cross-task-gate.md) | 07 | completed |
| [10-original-pilot-runs.md](./subtasks/10-original-pilot-runs.md) | 01, 03, 04, 05 | completed |
| [11-comparison-criteria-gate.md](./subtasks/11-comparison-criteria-gate.md) | 10 | completed |
| [12-contract-foundation.md](./subtasks/12-contract-foundation.md) | 08 | completed |
| [13-ai-static-data-import.md](./subtasks/13-ai-static-data-import.md) | 09 | completed |
| [14-ai-input-support.md](./subtasks/14-ai-input-support.md) | 12, 13 | completed |
| [15-program-selection-install.md](./subtasks/15-program-selection-install.md) | 14 | completed |
| [17-ai-piloting.md](./subtasks/17-ai-piloting.md) | 15 | completed |
| [18-targeting-firing-base.md](./subtasks/18-targeting-firing-base.md) | 15, 17 | completed |
| [16-interpreter-scripts.md](./subtasks/16-interpreter-scripts.md) | 15, 17, 18 | completed |
| [19-wingman-friendly-fire.md](./subtasks/19-wingman-friendly-fire.md) | 16, 18 | completed |
| [21-parked-sets-departure.md](./subtasks/21-parked-sets-departure.md) | 16, 18 | completed |
| [20-wingman-commands.md](./subtasks/20-wingman-commands.md) | 19, 21 | completed |
| [22-xpon-b-key.md](./subtasks/22-xpon-b-key.md) | 09, 15 | completed |
| [23-replay-limits-lifecycle.md](./subtasks/23-replay-limits-lifecycle.md) | 16, 18, 19, 20, 21, 22 | completed |
| [24-browser-regression.md](./subtasks/24-browser-regression.md) | 13, 22, 23 | completed |
| [25-real-content-check.md](./subtasks/25-real-content-check.md) | 23 | completed |
| [26-original-formal-runs.md](./subtasks/26-original-formal-runs.md) | 07, 11 | in-progress |
| [27-comparison-conclusions.md](./subtasks/27-comparison-conclusions.md) | 23, 25, 26 | pending |
| [28-docs-handoff.md](./subtasks/28-docs-handoff.md) | 13, 22, 23, 27 | pending |
| [30-merge-regression-docked-map.md](./subtasks/30-merge-regression-docked-map.md) | — | completed |
| [31-long-test-timeouts.md](./subtasks/31-long-test-timeouts.md) | — | completed |
| [29-final-alignment.md](./subtasks/29-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-14 — 并行执行安排：** 用户以 `/execute-goal`（无参数，默认并行，同时运行的 worker 不超过 3 个）执行本 goal；用户在执行期间不可用，协调者按本会话刚批准的唯一 goal 选定目标。协调者在 `p3-08-ai-wingman-spec` 分支（本 worktree）上执行。本宿主的 `create_session` 不能在协调者指定的文件夹中启动会话，因此沿用 P3-05、P3-07 的做法：worker 在应用为其会话创建的 worktree 中运行（以认领提交为基），由 worker 把分支改名为 `exec-p3-08-NN` 作为认领标记，`local` 由仓库的会话脚本链接；其余照 execute-goal 的并行规则。Ghidra 由各 worker 在各自写入范围内的私有项目副本中只读打开；基准环境（DOSBox-X）与 Computer Use 只由协调者操作。
- **2026-10-14 — 研究发现与 spec 的冲突（01）：** 原版在实例化扩展点 `0x20990` 只做程序选择，控制器安装与处理器模式 0 的工作（及其抽取）发生在对象首次回调的 object-update 阶段（Warp 中转测试之后）；spec 行为表第 1 行与“程序选择与安装·位置”把安装放在扩展点。按 spec 的研究推翻方向规则，由 07 汇总、08（D-01，连同 P3-02 CR-07）提出修订并取得用户批准后，15 才能开始。证据见子任务 01 的完成证据。
- **2026-10-14 — 10 的基准运行：** 沿用 P3-07 子任务 26 的做法，由协调者授权 10 的 worker 自行用 `measure.py` 运行原版（Computer Use 仍只由协调者操作）。基准环境与 P3-09、P3-10 的执行共用，由工具在 `local/research/` 上的会话锁与 DOSBox 进程检查串行；遇到 `session-busy` 或 `emulator-already-running` 时等待重试，不结束他人的进程。
- **2026-10-14 — 研究汇总完成（07）：** Q-01 至 Q-13 全部达到门槛，无阻塞。07 的完成证据列出 spec 的八项修订（①–⑧，含 01 发现的安装位置冲突）及交 08、09、10 的输入；这些修订由 08 一并写入并请用户重新批准。
- **2026-10-14 — Subtask 08 blocked:** D-01 的定稿须由用户明确批准，本 goal 没有授权 agent 代批；执行期间用户不可用（ask_user 无应答）。
  Evidence: D-01 草案已写成协调者 checkout 中未提交的改动——P3-02 spec 新节“P3-08 的契约修订（D-01）”（CR-15–CR-25，带“草案，待用户批准”标注，并在 CR-02/05/06/07/14 加待定说明）与 P3-08 spec 的修订 ①–⑧（① 推翻已批准的安装位置方向）；`node tools/task-state.ts p3/08` 无计划问题，链接检查 0 处问题，`pnpm check:compliance` 通过，rubber-duck 的 5 项阻塞已修正。待用户决定的事项：①–⑧ 的重新批准；基地自动挂点每次更新都重选与 Warp 离场的一帧表现差异；replay 格式 2→3（`b` 的新命令，沿用 P3-05 先例）；放宽已批准字段（运行时 +0xE0 可写、AI 写导弹锁定字段、`lastParkedUpdateClock` 下限 −0x80）。
  Affected acceptance: 08 全部验收；经依赖影响 12 起的全部实现子任务与 AC-01–AC-12、AC-14、AC-16、AC-17。09 与 08 写入范围重叠，在 08 解决前不开始。
  Resume when: 用户明确批准（或给出修改意见后批准）该 D-01 草案；协调者把批准原话写入 P3-02 与 P3-08 spec 的审批节并完成 08。
- **2026-10-14 — D-01 草案与 P3-10 已批准的 D-01 对齐：** P3-10 的 D-01（其分支 `p3-10-comms-base-resupply-spec`，CB-01–CB-19）已获批。未提交的 D-01 草案改为消费 P3-10 的 `deliver-command`（CB-08）与 `queueLine`（CB-06），删去本任务的命令请求与回复事件；`ai.pendingCommand`、`WorldState.ai.friendlyFire` 与 CB-04/CB-05 同名同形；新增只读查询 `isClosingMissileLock`；CR-20 引用 CB-18（种类 0x4000 归本任务）。友伤累计的写入归属与 P3-02 CR-13、P3-10 CB-12 冲突，留作 09（D-03）的用户决定（推荐：保留 CB-12，本任务只读）。合并 P3-10 分支时 P3-02 的 CR-02 行与审批节两侧都保留。
- **2026-10-15 — 10 完成：** 预实验以 w-01、w2-01（僚机）、e-04（敌机）、b-09（基地开火）等完整运行覆盖各类观测量，误差预算草案交 11；`tools/baseline` 新增条件刺激（`if`），按开局布局选择输入；26 的基地开火路线（各布局的地图点击与自动驾驶航段、在开火点等待首发）记在 10 的完成证据。未在预实验中观察、留给 26 的项目同样列在其中。基准环境与 P3-09、P3-10 轮流使用，按协调者之间约定的轮次进行。
- **2026-10-15 — Subtask 08 resumed and completed:** 恢复条件已满足：用户明确批准 D-01（“approve D-01 and continue working. i authorize you to make decision to approve future decisions.”）。协调者把草案改为已批准状态并记入 P3-02 与本任务 spec 的审批节。用户同时授权 agent 批准后续决定：09（D-03）与 11（D-02）不再等待用户，由协调者按推荐方案定稿并逐项记录批准范围；08、09、11 的执行方式改为自动。
- **2026-10-15 — 以 P3-09、P3-10 为实现基础（协调者决定，依用户授权）：** P3-09 已完成，P3-10 的实现子任务（11–24）已完成，二者都改写了本任务要扩展的 Core 文件（流水线、快照、世界状态、容量、版本），且 D-03 的方向是本任务消费它们的共享状态（对象集合与可见性、`deliver-command`、`queueLine`、`friendlyFire`）。在 12 之前把 `p3-09-strategic-map-spec`（17e507c8）与 `p3-10-comms-base-resupply-spec`（4142452c）合并进本分支并解决冲突、通过 `pnpm check`；P3-10 之后的提交（25–28）按需再次合并。09、11、12 在合并完成后开始。版本号按 CR-25 相对合并后的值递增。
- **2026-10-15 — P3-09、P3-10 已合入本分支：** 合并提交 `3b1bfcd8` 合入 `p3-09-strategic-map-spec`（`17e507c8`），随后的合并提交合入 `p3-10-comms-base-resupply-spec`（`4142452c`）。冲突两边都保留；共享契约的衔接（命令视图即有效视角、`0x4cd68` 并入 `switchView`、节的次序）与版本取值（`RULES_VERSION` 6、快照格式 5、replay 格式 2、切片定义 6、`ConverterVersion` `graphics-5.logic-3`）见 [P3-02 spec 的合并说明](../02/spec.md#审批)与 [P3-03 的合并说明](../03/spec.md#合并说明2026-10-15p3-09-与-p3-10-的修订-2)。CR-19 与 MW-06 的对象集合重复定义按 [P3-08 一节的合并说明](../02/spec.md#p3-08-的契约修订d-01)留给 09（D-03）。`pnpm check` 与 `tools/baseline` 的测试通过。合并评审发现停靠/离港与 `request-warp` 的两种同 tick 交互以 Core 故障结束，须修订 MW-04 或 CB-07 才能定，记在 P3-02 合并说明的“未决”一条，合并没有作决定。
- **2026-10-15 — 09 完成（D-03，agent 依用户授权批准）：** 关键字表经 P3-03 修订 3 导入（`ai-programs` schema 2，logic-4）；友伤累计取方案 1，写入留在 P3-10（CB-12），本任务只读；命令经 P3-10 的 `deliver-command`、回复经 `queueLine`，菜单到回复的联合测试归本任务（CR-28）；对象集合与地图可见标志由 P3-09 的 MW-06 唯一定义，CR-19 的重复撤回，本任务复用并承担联合测试 1–7（CR-29）；`b` 纳入，`KeyB` 写入 P3-05 绑定表。协调者据此更新阶段索引的责任描述，修正子任务 19、20、21 的范围与写入范围（不再新建 `object-sets.ts`，不在伤害中写友伤累计）。P3-09 × P3-10 合并留下的两个联合故障（停靠倒计时与 Warp 请求同 tick、同批 `launch` 与 `request-warp`）属于 P3-09/P3-10 的契约（MW-04 或 CB-07），记在 P3-02 的合并说明中，不在本 goal 内修复。
- **2026-10-15 — 12 完成：** 共享形状在合并后的基础上实现：`RULES_VERSION` 6→7、快照格式 5→6；replay 格式（2→3）随 22 加入 `drop-transponder` 命令时递增，22 的写入范围加入 `src/core/replay/recording.ts`。尚未接入的请求（`ai-match-speed`、`warp-departure`、`create-transponder`）投递即故障（`pipeline.request-unwired`），由 17、21、22 接入时移除。交 23：所有数值取最长时（P3-07 的 18 挂点战斗状态 + 最长控制器 + 内容上限的解析缓存）估计约 16.6 MiB，略超 `canonicalTextLength` 16 MiB，须在 23 的容量推导中处理。交 28：`docs/engineering/modules/core.md` 的版本与请求清单已过时。
- **2026-10-15 — 11 完成（D-02，agent 依用户授权批准）：** 判据 K-01–K-10 写入 spec 的“D-02 连续行为判据”，方法写入新的 B-011（B-010 已被 P3-09 的战略地图与 Warp 占用，ID 不复用，goal 与子任务 11、26、27 的引用已同步）。编队以独立规则模型核对并沿用 P3-06 的 R-04c 步长预算；僚机按三个抽取/控制流类采样；三项已批准差异（基地保持值、摆动相位、Xpon 首次回调表现）单独报告；正式采样至少 8 次完整运行，正式采样后仍缺的项逐项记录决定，不自动降级。
- **2026-10-15 — 13 完成：** 关键字表导入 `data/ai-programs`（schema 2），生产转换器版本 `graphics-5.logic-4.audio-2.models-4`，旧缓存不恢复；本机真实镜像 package-check 通过，摘要与独立的 LE fixup 解码一致。合成光盘的填充由 2 MiB 提到 4 MiB（每个小 EXE 区域读取一个原始扇区）。协调者接受一项偏差：转换器不区分 fixup 的 16 位目标偏移编码（`RegionFixup` 没有目标宽度字段，两种编码载入结果相同，真实镜像的编码已由独立解码器确认）。协调者随集成更新 U-001 与工具指南的包核对输出说明。
- **2026-10-15 — 14 执行中的契约修订（协调者依用户授权批准）：** 真实内容的一个可达脚本带负延时，CR-15 的 `negative-delay` 会使生产内容无法创建世界。改为已批准的差异（P3-02 CR-24 决定 16）：负延时等同于 0，期限存为 max(时钟 + 延时, 0)，由 16 实现；CR-15 撤销该拒绝。同时澄清 `missing-transponder` 的判定：只能来自任务中种类 14 的声明或选项。ai §12 的相应说明交 28。14 的写入范围加入合成生产内容与 `spawn.test.ts`。
- **2026-10-15 — 14 完成：** 支持闭包与创建时检查；真实内容的六种运行配置都能创建世界，闭包与 ai §10 一致。合成生产 AI 内容改为符合支持范围（合成光盘中对象 2 的填充不再覆盖其他 Asset）。交 28：ai §12 的数据核对补“可达脚本含负的 1001 数值”，core.md 的规则数据与世界创建说明已过时。合并 P3-09 与 P3-10 后 `e2e/base-interaction`（development）的“停靠并两次离港”一项失败（期望 `toggle-map` 被拒绝，实际被接受），在 14 之前的 d3313738 上同样失败，与 14 无关；由新增的 30 修复。
- **2026-10-15 — 新增 30：** 修复合并 P3-09、P3-10 后停靠中 `toggle-map` 被接受的回归（e2e 的 base-interaction development 一项）；29 加入对 30 的依赖。
- **2026-10-15 — 15 的处理器接入方式（协调者决定）：** 14 在创建时接受全部四个处理器身份，而处理器分别由 16、18、19、21 实现。15 用静态的 `WIRED_HANDLERS` 集合（15 之后为空）：未接入的处理器不执行安装（控制器保持 null，不调用处理器，不抽取），选择、程序槽、首次回调的判定与安装值照常实现并测试；各处理器子任务把自己的处理器加入集合，并在其测试中覆盖安装的同一调用更新体与抽取（AC-03 与重装抽取的端到端证据随之交接）。被排除：未接入即故障（所有含 AI 机体的世界在 tick 1 故障）；调整子任务次序。
- **2026-10-15 — 30 完成：** 两份契约一致（MW-04 第 2、4 步与 P3-10 spec 的范围一节），Core 未改；修正 e2e 的过时期望与基地页 `M` 的文案，加 Core 回归用例。e2e 中 `launch()` 在 257 次按键后立即清日志，偶有竞态（只见一次），留作已知的测试脆弱点。
- **2026-10-15 — 15 完成：** 第 13 步选择、对象更新中的控制器分派（`src/core/systems/ai.ts`）与 `HANDLERS` 接入规则；16、18、19、21 各自把处理器加入 `HANDLERS`，并覆盖安装同一调用的更新体与抽取，以及停放/恢复/被毁/移除后的重装抽取；21 用导出的 `installController`/`removeController` 处理 Warp 离场。交 28：core.md 补选择、控制器分派与接入规则。
- **2026-10-15 — 22 完成：** `drop-transponder`、`create-transponder`、`0x3897c` 与 `KeyB` 已实现，replay 格式 2→3；`create-transponder` 已从 UNWIRED_REQUESTS 移除。僚机投放（`0x62aa0`）的调用点交 21：调用导出的 `constructTransponder(context, 僚机, 'wingman')`，并测试同一遍走查中的首次回调、RNG 次序与该 tick 的停放更新选择（AC-10 的僚机部分）。交 24：飞行中按 `b`，断言 `transponder-deployed` 与 `creator: 'player'` 的种类 14 实体。交 28：core.md 的命令、请求、事件与 replay 格式版本清单；executable X3 的 f32 常量。D13 的能量时钟算式在 xpon.ts 与 combat-init.ts 中重复，统一需改 combat-init.ts，留作已知的重复。
- **2026-10-15 — 17 完成：** AI 驾驶经 `steer`（接受机体）与 `ai-match-speed`（P3-06 速度匹配一般化为 (a, lo, hi)，(0, 0, 1) 位一致）；UNWIRED_REQUESTS 只剩 `warp-departure`。交 18：`ai.ts` 的 `stepController` 注释把 `0x5dfec` 的 AI 锁定更新归 17，实为开火逻辑（A13），由 18 实现并更正注释。交 28：core.md 的请求清单、AI 转向库与 ai-piloting.ts。
- **2026-10-15 — 26 重新规划（协调者依用户授权批准）：** 用户要求“重新规划subtask 26，尽可能减少dosbox”。正式样本集改为 26 的 e-02（进行中）与一次新的组合僚机运行 W-ii（至多因偶发失败重做一次），加上按 D-02 不变的资格复用的 10 的 w-01、w2-01、e-04、b-09（只按其记录的字段判定）；W-i、W-iii、第二次 E 与两次 B 不再运行，DOSBox 用时约为 e-02 剩余 2 小时、W-ii 3.5 小时（重做至多再 3.5 小时），原计划至少 8 次、每次 1–4 小时。D-02 的数量改为目标；僚机导弹发射、愤怒与拒绝、状态 6 与记录 2、0x100 敌机的 K-01、僚机类 (i)/(iii)、基地布局 C 与冷却读数、W-ii 未取得的命令码等由代码证据与 Node 独立期望核对，27 逐项列为运行时覆盖的已知限制（不是行为差异），判定规则不变。spec（AC-15、正式采样计划、新增已知限制清单、取不到时的处理、审批）、B-011、26、27 随之修订，子任务跟踪表不变。P3-08 的最后一次基准运行结束后，协调者通知 P3-10。
- **2026-10-15 — 18 完成：** 目标、开火、AI 锁定与基地处理器（记录 6）。按原生 `0x5dcd4` 更正 CR-23：AI 锁定 `0x5dfec` 只在处理器到期的同一分支内执行（ai §1 与 executable A12 同步，A9、A15 补代码事实）。离场请求 `0x5e6cc` 以 `depart()` 回调交给 16、21：协调者决定 16 的回调投递 `warp-departure` 请求（最终行为），由 21 接入其处理；在 21 之前若测试触发未接入故障，16 报告协调者。已知限制：列表 1 的当前挂点为 +0x18 ≠ 0 的炮时 `updateAiLock` 故障（原版越过炮记录读取），切片中没有这种组合。交 28：core.md 的 AI 步、基地处理器与 ai-targeting/ai-firing。
- **2026-10-15 — 16 的范围扩大：** 解释器需要两个尚无实现的原语：反向视角 `0x5cc6c`（状态规则 3 在状态 5 入口调用，两个执行的 DFPG 都可达）与攻击航线 `0x63c00`（操作码 1101，敌机可达）。二者由 16 实现（`steering.ts` 增补、新建 `ai-attack-pass.ts`），19 复用攻击航线。
- **2026-10-15 — 16 完成：** 解释器 `0x64cb8`（安装、状态机 13 条规则、25 种操作码的执行器）、脚本级解析缓存、攻击航线 `0x63c00`（`ai-attack-pass.ts`，19 复用）、反向视角 `0x5cc6c`、CR-25 的分派预算；`HANDLERS` 加入解释器；`steering.forwardDot` 改为导出。`0x5e6cc` 为 `systems/ai.ts` 的 `requestWarpDeparture`，`0x2fef8` 为导出的 `mayDepartByWarp`，交 21 接入 `warp-departure` 并复用复检；没有单元或 e2e 测试走到未接入的离场请求。每 tick 的分派计数暂存在以 `TickContext` 为键的 WeakMap（`pipeline.ts` 不在 16 的范围），21 接入时可改为字段。e2e 在高负载下有两项偶发失败，单独重跑通过。交 28：16 的完成证据列出的代码事实写入 `docs/original`，以及 core.md 的解释器、解析缓存、预算与离场请求。
- **2026-10-15 — e-02 的处置：** e-02 在 98% 处因模拟器自行退出而失败（完整性与清理通过）。不补跑；结束前已完整走完的窗口按样本资格计入正式样本集，未走完的窗口不计入（spec 正式采样计划已记录）。W-ii（wii-01）随后开始。
- **2026-10-15 — 19 执行中的决定：** 编队停止的速度测试遇到已不存在的目标时取速度 0，记为 P3-02 CR-24 决定 17（已批准的差异）；19 的写入范围加入 `spawn.test.ts`（僚机安装镜像改变实例化后 40 tick 的 AI 状态期望）。
- **2026-10-15 — 19 完成：** 僚机处理器 `0x610c8` 与友伤后的“愤怒”（只读 P3-10 写入的累计）；`HANDLERS` 加入僚机。交 20：第 2 步在周期行为之前调用 `call.consumeCommand?.(call, controller)`，`ai.ts` 尚未传入消费者。交 21：`ai.ts` 的 `handlerCall` 可供停放处理器使用；僚机的 b 3（停放基地）与 b 4（目的地在活动区外）经 `requestWarpDeparture` 投递尚未接入的 `warp-departure`，21 接入前这样的世界不能运行。交 28：core.md 的僚机处理器与接缝；executable WA5 补“无序距离视为到达”；WA6 引用 CR-24 决定 17。
- **2026-10-15 — 21 完成：** 停放处理器 `0x62250`（种类分派、`0x62578`/`0x62714`、`0x62760`、僚机揭示与投放 `0x62aa0`、离开指令 `0x5e710`）读取 P3-09 的集合与 `mapVisible`，不另建；`warp-departure` 已接入（处理时复检，跨两个 tick 停放、安装 `0x62250` 并跳跃），UNWIRED_REQUESTS 删除；每 tick 分派计数改为 `TickContext.aiDispatches`；`HANDLERS` 为全集。`0x61f20` 是 `ParkedCall.consumeCommand` 可选接缝，交 20 在 `ai.ts` 的 `parkedCall` 中传入。AC-10 的僚机投放部分已覆盖。集成时主机负载很高（load ≈ 20），`snapshot`、`budget`、`image-payload`、`mission-scenarios` 的长测试超过 5 秒默认时限；以 `--testTimeout=30000` 全量 9,967 项通过，typecheck、lint、build 通过。长测试的时限由新增的 31 处理。交 28：executable D3/D6 的常量（f32 `0x1724a8` = 3.0，D6 的 f64 ±1000），core.md 的停放处理器、离场处理与 `aiDispatches`。
- **2026-10-15 — 31 完成：** 长测试有显式单项时限，测试内容不变（60 s：snapshot 两项、budget 文本预算、import-job 的场景配置组；30 s：image-payload 往返表、任务场景组、map-warp-replay 顶层组、engineering-boundaries 遍历真实应用的三项）；工程约定的测试规则已同步。只在两个全量测试并行（load ≈ 52）时超时的其他文件未改。
- **2026-10-15 — 20 完成：** 僚机命令的两个消费者（活动 `0x614a8`、停放 `0x61f20`）经 19、21 的接缝接入；回复经 P3-10 的 `queueLine`；菜单到回复的联合运行以未修改的 `replayRecord` 重放通过。`queueLine` 在处理器调用中从 `world.rngState` 抽取，所以僚机处理器改为逐次抽取（`worldRand`），与停放处理器一致。12 的 `WINGMAN_REPLIES` 中停放码 4 的回复线号由 0x14 更正为 0xE（WB4、CR-22）。交 28：core.md 的消费者接入、回复与逐次抽取的原因、码 4 的更正。
- **2026-10-15 — 快照文本上限（23，协调者依用户授权决定）：** 实测最坏情形（32 挂点、所有数值最长）约 25.7 MiB，P3-07 至 P3-10 的状态在 32 挂点时本身已超 16 MiB。`canonicalTextLength` 提高到 32 MiB，budget 测试断言严格最坏情形在其内；P3-02 CR-25 已更正。
- **2026-10-15 — 23 完成：** AC-11 的标准录制不含替身（敌机、基地、僚机、P3-10 菜单码 1 与 6、`b`、Warp 停放与重装、解析缓存的脚本切换）；AC-17 的 Node 部分在世界层面（每 tick 分派恰好 131,072 通过、下一次故障；每次运行 1,024 次分派后停止；AI 与 `b` 触及请求与实体上限；会话的暂停、隐藏、恢复、重试、两个会话与经 Runtime 显示的 AI 故障）。`canonicalTextLength` 为 2²⁵，严格最坏情形已实测。录制中僚机奉命攻击但 420 tick 内未射击（断言其目标）。交 28：core.md 的上限表。
- **2026-10-15 — 24 完成：** 浏览器回归 `e2e/ai-wingman.development.spec.ts`：AC-10 的 `b` 与 Node 重放（`creator: 'player'`）、AC-14 的 schema 2/logic-4 导入与恢复且旧 logic-3 缓存不提供、AC-17 的 AI 推进、暂停、真实隐藏、故障显示与退出重进。协调者接受一项已知限制：在当前转换器键下放入 schema 1 的 `data/ai-programs` payload（只能由篡改或非发布包产生）恢复时显示为已验证，开始任务时由世界创建以明确的内容诊断拒绝，不开始运行；真实旧缓存使用 logic-3 键，不会被提供。高负载下有两项既有 e2e 偶发失败，单独重跑通过。
- **2026-10-15 — 25 完成：** 真实内容的六种配置与名单项 2 的长运行（共 7 次，无故障，replay 一致，`replay-check` 通过），AC-12 的 O1–O7 均取得；最大值：每次运行 11 次分派、每 tick 24 次分派与 60 个请求。交 27/28 的两项 Core 观察（不是原版事实，不使 AC-12 失败）：已结算的玩家 Xpon 停放后恢复时，停放切换以非零速度重建移动块，再约 32 tick 减速到静止；敌机有时自行 Warp 离场后很快在活动区内重装。

## 审批

用户于 2026-10-14 明确批准本 goal（“approve the goal and commit”）。批准范围为 29 个子任务的拆分、依赖、写入范围与执行方式，以及验收覆盖。这不代表实现完成，不替代 spec 批准，也不批准 D-01 至 D-03 的定稿内容：08、09、11 仍须用户分别明确批准。2026-10-15 用户批准 D-01，并授权 agent 批准此后的决定（含 D-02、D-03）。
