---
type: plan
status: accepted
phase: P2
task: "13"
updated: 2026-10-08
related: [ADR-0007, ADR-0014, ADR-0017]
---

# P2-13：P2 退出评审与 P3 交接 — Goal

## 目标与来源

交付用户于 2026-10-08 批准的 [spec](./spec.md) 的 S-01 至 S-09、AC-01 至 AC-17：

- 在最终候选上运行本地检查链与真实数据核对，判断历史证据的适用性；
- 处置仍以 P2 为负责阶段的未知项；
- 形成 draft 的 P2 退出评审并交接 P3、P4、P5 与 P0 收尾的责任。

已定位的契约内缺陷在本 goal 中以独立修复子任务闭环。本文件不重新定义行为契约。完整的 draft 评审不等于 P2 通过；负责人确认与阶段切换都不由本 goal 批准或执行代替。

## 代码现状与前提

- **候选：** 起草时 HEAD 为 `7150a9c`，工作树干净（`docs/plan/p2/13/` 与阶段索引的规划改动除外）。P2-12 的最终候选为提交 `f925d21`，构建指纹 `sha256:ec5af1f5…f690`，`ConverterVersion` 为 `osr-import.graphics-3.logic-1.audio-1.models-3`，切片定义版本 3。自 `f925d21` 起只改了 `docs/`、`.agents/skills/` 与 `AGENTS.md`。执行时由 01 重新核对。
- **构建输入：** 构建产物中的 `compliance-inventory.json` 除源码、依赖与配置外，只把 `vite.config.ts` 与 `docs/original/manifest.md` 记为输入（[build-plugin.ts](../../../../tools/compliance/build-plugin.ts)）。本 goal 修改的评审、规划文档与 `docs/original/unknowns.md` 都不进入构建，不改变构建指纹；`manifest.md` 不在任何写入范围内。
- **真实数据候选核对：** 被忽略的 `local/research/p2-12/candidate/candidate-check.ts`（P2-12/12，经 P2-12/31 更新）要求工作树干净，自行运行 `pnpm build`，计算构建指纹，并用两个子进程各跑一次生产导入、校验全包并载入 Core。输出按 `--label` 写在脚本同目录。P2-12 的最终记录为 `final-26b.json` 与 `final-26b-build-manifest.txt`。原版数据在 `local/StarRang/cd/STAR_RANGERS.{ccd,cue,img,sub}`。
- **产物出站扫描：** 被忽略的 `local/research/p2-12/outbound/outbound-scan.ts`（P2-12/11）没有输出标签，重跑会覆盖 P2-12 的输出，须复制到 `local/research/p2-13/outbound/` 后运行。
- **浏览器回归：** [playwright.config.ts](../../../../playwright.config.ts) 有 `development`、`production`、`development-headed` 三个项目，使用已安装的 Chrome；端口可用 `OSR_E2E_DEV_PORT`、`OSR_E2E_PREVIEW_PORT` 覆盖（[environment.ts](../../../../e2e/support/environment.ts)）。P2-12 的联合闭环、失败矩阵、网络审计与响应用例在 [e2e/](../../../../e2e/) 中（`joint-*`、`failure-*`、`network-audit-*`、`responsiveness-*`、`resource-balance-*`）。
- **合规：** `pnpm --silent check:compliance` 先构建再做原版与许可两项检查（[工具指南](../../../guides/tools.md#本地合规)）；持久报告只放被忽略的 `test-results/compliance/`。
- **P2-11 AC-21 的适用性须重点判断：** 用户的实机核对（[P2-11/19](../11/subtasks/19-user-real-machine-check.md#完成证据)）在 `graphics-2…models-2` 上完成。之后 P2-06、P2-07 的修订改变了 6 个 model payload，并新增 10 个 Asset。P2-12/29、30 在新候选上由 agent 在浏览器中做了真实导入与查看，但缓存恢复与试听是否被覆盖，须由 01 逐项判断。若判定受影响且没有其他有效证据，协调者新增需用户的复核子任务。
- **计划新增：** `docs/reviews/P2-exit.md`；被忽略的 `local/research/p2-13/`（仅在需要重跑出站扫描时）与 `local/research/p2-12/candidate/p2-13*` 输出。
- **环境：** 起草时为 Node 22.22.0、pnpm 12.8.1、Python 3.12.3，已安装 Google Chrome；依赖已安装。缺依赖时才按 frozen lock 恢复。

### 跨任务前提

| 前提 | 完成依据与执行前核对 |
|---|---|
| P2-01 至 P2-12 已完成 | 各 goal 的子任务跟踪全部 `completed`，`node tools/task-state.ts p2/NN` 为 `done`；最终对齐证据见 spec 的[前置交付与候选](./spec.md#前置交付与候选)。由 01 逐项核对 |
| P2-12 的判定汇总与范围例外 | [P2-12/26 第三次运行](../12/subtasks/26-final-alignment.md#第三次运行2026-10-08未通过源码结构的呈现约定表与-30-不一致)、[第四次运行](../12/subtasks/26-final-alignment.md#第四次运行2026-10-08通过)与 P2-12 spec 的[判定分类](../12/spec.md#判定分类) |
| P2-12 的网络、失败与出站证据 | [02 网络审计](../12/subtasks/02-network-audit.md#完成证据)、[08](../12/subtasks/08-failure-input-content.md#完成证据)、[09](../12/subtasks/09-failure-worker-cancel.md#完成证据)、[10](../12/subtasks/10-failure-storage-lifecycle.md#完成证据) 失败矩阵、[11 出站审阅](../12/subtasks/11-outbound-compliance-review.md#完成证据) |
| 原版数据与本地脚本 | `local/` 中的光盘镜像与上述被忽略的脚本存在；不可用时 05 为 blocked，不以合成数据代替 |

### 原版证据

本任务不新增原版对照。最终候选与 P2-12 候选只有无生产影响差异时，复用 P2-12 的判定。若出现生产影响，受影响的类别按 spec 技术决定 4 与 P2-12 的[候选身份](../12/spec.md#候选身份)规则重做：

- agent 按[原版证据获取](../../../guides/original-evidence.md)重做视觉、布局、二维资源与任务对照；
- 用户只重做受影响的试听与 P2-11 AC-21 部分。

协调者为此新增子任务。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01、05 | 01：前置批准、tracker、证据与候选差异；05：构建指纹与 `ContentIdentity`；08：最终候选一致 |
| S-02 | 02、03、04、05；定位缺陷后加入实际修复项 | 02：工程与 Python；03：完整 E2E；04：聚合合规；05：真实数据核对；修复项：回归与受影响重验；08：各证据绑定的提交只有不进入构建的差异 |
| S-03 | 01、03、04 | 01：按差异的逐类适用性，含 P2-11 AC-21 逐项；03：P2-04、P2-10、P2-11 自动用例本轮通过；04：出站清单与人工审阅；07：评审中的适用性表；08：无悬空类别 |
| S-04 | 定位缺陷后加入实际修复项 | 01–06 记录失败与定位；修复项：回归、受影响检查与单独提交；08：最终对齐依赖全部修复项 |
| S-05 | 07 | 07：逐项判定；08：与证据一致 |
| S-06 | 06 | 06：逐项判定与登记表负责阶段；07：评审的未知项表；08：登记表差异只在负责阶段一列 |
| S-07 | 07 | 07：新 draft 评审；08：结构、结论与确认状态 |
| S-08 | 07 | 07：交接各分类；08：不越界、不复制原版事实 |
| S-09 | 06、07 | 06：登记表负责阶段；07：评审与直接相关说明，STATUS 与阶段索引的改动建议交协调者；08：协调者已按建议修改并符合确认关卡 |
| AC-01 | 01、05 | 01：12 项批准、tracker、证据、提交与差异；05：构建指纹、`ContentIdentity`；08：最终差异 |
| AC-02 | 02 | 02：`pnpm check` 与 Python 实测的各项结果与退出码；08：仍对应最终候选 |
| AC-03 | 03 | 03：`--list` 计数与完整三项目执行，联合、失败矩阵与网络审计用例在其中；08：无漏验或掩盖 |
| AC-04 | 04 | 04：聚合合规的格式、范围、发现与退出码，依赖文件差异；08：文档定稿后的 `check:original` |
| AC-05 | 05 | 05：真实数据核对通过、脚本哈希、与 `final-26b` 的身份比较，另以一次负向运行确认脚本会失败；08：身份仍适用 |
| AC-06 | 01、03、04 | 01：适用性表；03、04：本轮补齐的类别；07：评审引用；08：生产受影响的类别未沿用旧判定 |
| AC-07 | 07 | 07：按类计数、高概率依据类型、范围例外与未确认呈现约定的清单；08：与 P2-12 判定汇总一致 |
| AC-08 | 05、07 | 05：本轮 `loadMission`；07：结合 P2-12 M-1 至 M-4 判定；08：规则语义归 P3 的区分 |
| AC-09 | 03、07 | 03：失败矩阵 F-01 至 F-14 与不变量 I-1 至 I-7 的本轮结果；07：结合各层坏输入测试判定；08：每行有证据 |
| AC-10 | 03、04、07 | 03：网络审计正向对照与产品用例零意外违规、生产预览 CSP 用例；04：出站清单对当前构建的适用性；07：判定；08：一致 |
| AC-11 | 01、07 | 01：退出条件、覆盖表与总计划交付的映射；07：逐项判定；08：无漏项 |
| AC-12 | 01–06；定位缺陷后加入实际修复项；07 | 各项记录原因、责任与恢复条件；修复项：根因、回归、重验与提交；07：汇总；08：漏验的行未标 `completed` |
| AC-13 | 06 | 06：逐项判定与依据；08：登记表差异逐行审阅 |
| AC-14 | 07 | 07：四部分结构、draft、结论与逐项结果一致；08：未把本 goal 的批准当作结论确认 |
| AC-15 | 07 | 07：交接分类与全部非“已确认/不再需要”的 U 项；08：无原版事实复制、无虚构任务 |
| AC-16 | 07 | 07：评审、直接相关说明与给协调者的 STATUS/阶段索引建议；08：协调者的修改符合确认关卡，阶段索引 front matter 仍为 draft |
| AC-17 | 01–07；修复项 | 各项只写各自的写入范围；08：最终文件列表、无原版内容与新依赖、自有资源已清理、无 push 或部署 |

没有具体缺陷时，S-04 与 AC-12 的修复部分以“无缺口”证据核验，不预建空修复项。取得真实失败结果并写明恢复条件，可以支持完整的“不通过”评审；缺少必需的观测或执行时，相关行保持 blocked。

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-candidate-evidence-map.md](./subtasks/01-candidate-evidence-map.md) | — | completed |
| [02-engineering-checks.md](./subtasks/02-engineering-checks.md) | — | completed |
| [03-browser-regression.md](./subtasks/03-browser-regression.md) | — | in-progress |
| [04-compliance-artifacts.md](./subtasks/04-compliance-artifacts.md) | — | pending |
| [05-real-data-candidate.md](./subtasks/05-real-data-candidate.md) | — | pending |
| [06-unknowns-ownership.md](./subtasks/06-unknowns-ownership.md) | — | completed |
| [07-exit-review-handoff.md](./subtasks/07-exit-review-handoff.md) | 01, 02, 03, 04, 05, 06 | pending |
| [08-final-alignment.md](./subtasks/08-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

01 至 06 彼此没有真实前提。02 至 05 都会构建 `dist/`，写入范围重叠，因此按编号串行；01 与 06 可以和它们同时进行。07 需要全部证据与修复闭环才能判定，08 只做验证。

## 执行记录

## 审批

用户于 2026-10-08 明确批准本 goal（“approve goal and commit all”）。批准范围为当前的 8 个子任务、依赖、写入范围与验收覆盖。这不代表实现完成，不替代 spec 批准，也不授权执行之外的 push、部署、评审结论确认或阶段切换。
