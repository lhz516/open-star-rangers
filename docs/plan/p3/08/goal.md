---
type: plan
status: accepted
phase: P3
task: "08"
updated: 2026-10-14
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
- **计划新增：** `src/core/rules/` 下的 `ai-support.ts`、`ai-parameters.ts`、`ai-selection.ts`、`ai-script.ts`、`ai-interpreter.ts`、`ai-piloting.ts`、`ai-targeting.ts`、`ai-firing.ts`、`ai-wingman.ts`、`ai-commands.ts`、`ai-parked.ts`；`src/core/systems/` 下的 `ai.ts`、`object-sets.ts`、`xpon.ts`；各自相邻的测试；`docs/original/behavior/B-010-ai-wingman.md`。名称可在实现时调整，职责与落点不变。
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
| [08-shared-contract-gate.md](./subtasks/08-shared-contract-gate.md) | 07 | in-progress |
| [09-cross-task-gate.md](./subtasks/09-cross-task-gate.md) | 07 | pending |
| [10-original-pilot-runs.md](./subtasks/10-original-pilot-runs.md) | 01, 03, 04, 05 | in-progress |
| [11-comparison-criteria-gate.md](./subtasks/11-comparison-criteria-gate.md) | 10 | pending |
| [12-contract-foundation.md](./subtasks/12-contract-foundation.md) | 08 | pending |
| [13-ai-static-data-import.md](./subtasks/13-ai-static-data-import.md) | 09 | pending |
| [14-ai-input-support.md](./subtasks/14-ai-input-support.md) | 12, 13 | pending |
| [15-program-selection-install.md](./subtasks/15-program-selection-install.md) | 14 | pending |
| [17-ai-piloting.md](./subtasks/17-ai-piloting.md) | 15 | pending |
| [18-targeting-firing-base.md](./subtasks/18-targeting-firing-base.md) | 15, 17 | pending |
| [16-interpreter-scripts.md](./subtasks/16-interpreter-scripts.md) | 15, 17, 18 | pending |
| [19-wingman-friendly-fire.md](./subtasks/19-wingman-friendly-fire.md) | 16, 18 | pending |
| [21-parked-sets-departure.md](./subtasks/21-parked-sets-departure.md) | 16, 18 | pending |
| [20-wingman-commands.md](./subtasks/20-wingman-commands.md) | 19, 21 | pending |
| [22-xpon-b-key.md](./subtasks/22-xpon-b-key.md) | 09, 15 | pending |
| [23-replay-limits-lifecycle.md](./subtasks/23-replay-limits-lifecycle.md) | 16, 18, 19, 20, 21, 22 | pending |
| [24-browser-regression.md](./subtasks/24-browser-regression.md) | 13, 22, 23 | pending |
| [25-real-content-check.md](./subtasks/25-real-content-check.md) | 23 | pending |
| [26-original-formal-runs.md](./subtasks/26-original-formal-runs.md) | 07, 11 | pending |
| [27-comparison-conclusions.md](./subtasks/27-comparison-conclusions.md) | 23, 25, 26 | pending |
| [28-docs-handoff.md](./subtasks/28-docs-handoff.md) | 13, 22, 23, 27 | pending |
| [29-final-alignment.md](./subtasks/29-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-14 — 并行执行安排：** 用户以 `/execute-goal`（无参数，默认并行，同时运行的 worker 不超过 3 个）执行本 goal；用户在执行期间不可用，协调者按本会话刚批准的唯一 goal 选定目标。协调者在 `p3-08-ai-wingman-spec` 分支（本 worktree）上执行。本宿主的 `create_session` 不能在协调者指定的文件夹中启动会话，因此沿用 P3-05、P3-07 的做法：worker 在应用为其会话创建的 worktree 中运行（以认领提交为基），由 worker 把分支改名为 `exec-p3-08-NN` 作为认领标记，`local` 由仓库的会话脚本链接；其余照 execute-goal 的并行规则。Ghidra 由各 worker 在各自写入范围内的私有项目副本中只读打开；基准环境（DOSBox-X）与 Computer Use 只由协调者操作。
- **2026-10-14 — 研究发现与 spec 的冲突（01）：** 原版在实例化扩展点 `0x20990` 只做程序选择，控制器安装与处理器模式 0 的工作（及其抽取）发生在对象首次回调的 object-update 阶段（Warp 中转测试之后）；spec 行为表第 1 行与“程序选择与安装·位置”把安装放在扩展点。按 spec 的研究推翻方向规则，由 07 汇总、08（D-01，连同 P3-02 CR-07）提出修订并取得用户批准后，15 才能开始。证据见子任务 01 的完成证据。
- **2026-10-14 — 10 的基准运行：** 沿用 P3-07 子任务 26 的做法，由协调者授权 10 的 worker 自行用 `measure.py` 运行原版（Computer Use 仍只由协调者操作）。基准环境与 P3-09、P3-10 的执行共用，由工具在 `local/research/` 上的会话锁与 DOSBox 进程检查串行；遇到 `session-busy` 或 `emulator-already-running` 时等待重试，不结束他人的进程。
- **2026-10-14 — 研究汇总完成（07）：** Q-01 至 Q-13 全部达到门槛，无阻塞。07 的完成证据列出 spec 的八项修订（①–⑧，含 01 发现的安装位置冲突）及交 08、09、10 的输入；这些修订由 08 一并写入并请用户重新批准。

## 审批

用户于 2026-10-14 明确批准本 goal（“approve the goal and commit”）。批准范围为 29 个子任务的拆分、依赖、写入范围与执行方式，以及验收覆盖。这不代表实现完成，不替代 spec 批准，也不批准 D-01 至 D-03 的定稿内容：08、09、11 仍须用户分别明确批准。
