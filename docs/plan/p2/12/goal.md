---
type: plan
status: accepted
phase: P2
task: "12"
updated: 2026-10-08
---

# P2-12：资源管线联合验证与本地对照 — Goal

## 目标与来源

实现已批准的 [P2-12 spec](./spec.md) 中的 S-01 至 S-13 与 AC-01 至 AC-24：

- **合成 E2E 设施：** 新用例的项目归属约定、覆盖页面与 Worker 的网络审计、主页面响应探针、资源平衡快照，各带控制样本；失败与金丝雀合成场景及 Node 固定预期。
- **合成联合验证：** 开发与生产项目的联合闭环（各 3 轮）、失败矩阵 F-01 至 F-14，全部启用网络审计。
- **产物审阅：** 最终候选的出站能力清单、来源与许可、原版隔离。
- **原版本地对照：** 候选身份与覆盖核对；基准截图盘点与补拍；agent 的二维、HUD、任务字段对照；U-032 地图框架；用户在查看器中的模型、效果、音效与真实界面对照；呈现约定判定与修正；判定回填 `docs/original/`。
- **文档：** 本地导入指南的用户对照步骤，工程约定中的联合用例与审计说明。

本文件不重新定义行为契约。阶段退出判定归 P2-13。

## 代码现状与前提

- **上游已完成：** `node tools/task-state.ts` 对 `p2/01` 至 `p2/11` 输出 `done`（[STATUS](../../../STATUS.md)）。本任务复用：
  - **页面与持有者：** [App.tsx](../../../../src/app/App.tsx)、[resource-holder.ts](../../../../src/app/resources/resource-holder.ts)（代际、完整性、缓存、任务状态分开维护）、[resource-status.ts](../../../../src/app/resources/resource-status.ts)、[mission-diagnostics.ts](../../../../src/app/resources/mission-diagnostics.ts)、[import-job-owner.ts](../../../../src/app/import/import-job-owner.ts)（`ImportJobSnapshot`、协议错误常量）。
  - **Worker 与协议：** [import-job.ts](../../../../src/workers/import-job.ts)、[import-host.ts](../../../../src/workers/import-host.ts)（`toErrorData` 的层级映射）、[import-protocol.ts](../../../../src/workers/import-protocol.ts)、[production-package.ts](../../../../src/workers/production-package.ts)（`PRODUCTION_PACKAGE`）、[browser-import-worker.ts](../../../../src/platform/workers/browser-import-worker.ts)。
  - **内容与 Core：** [content-identity.ts](../../../../src/content/content-identity.ts)、[completeness.ts](../../../../src/content/completeness.ts)、[slice-definition.ts](../../../../src/content/slice-definition.ts)、[manifest-identity.ts](../../../../src/content/manifest-identity.ts)、[logic-content.ts](../../../../src/content/logic/logic-content.ts)、[load-mission.ts](../../../../src/core/mission/load-mission.ts)。
  - **缓存：** [resource-cache-contract.ts](../../../../src/platform/storage/resource-cache-contract.ts)（13 个失败码、`ResourceCacheKey`）、[resource-cache-records.ts](../../../../src/platform/storage/resource-cache-records.ts)。
  - **呈现：** [viewer-presentation.ts](../../../../src/render/viewer/viewer-presentation.ts)，置信度表见[源码结构](../../../engineering/source-structure.md#资源查看渲染)。
  - **错误契约（失败矩阵的固定预期依据）：** disc 层的 `image-size-mismatch`、`invalid-directory`、`limit-exceeded`、`budget-exceeded`（[clone-cd.test.ts](../../../../src/original-data/disc/clone-cd.test.ts)、[iso9660-directory.test.ts](../../../../src/original-data/disc/iso9660-directory.test.ts)）；source 层的 `unsupported-version`（[identify-source.ts](../../../../src/original-data/source/identify-source.ts)）、`invalid-payload`、`budget-exceeded`（[convert-graphics.ts](../../../../src/original-data/conversion/convert-graphics.ts)）；import 层的四个 code。
- **测试设施（已有）：**
  - 测试入口 [app-entry.test-support.tsx](../../../../src/app/app-entry.test-support.tsx)（`worker`、`cache`、`capacity`、`audio` 查询参数）与 Worker 场景 [import-worker.test-support.ts](../../../../src/workers/import-worker.test-support.ts)（`synthetic`、`models`、`models-corrupt`、`content-invalid`、`busy`、`job-throws`、`late-error`、`top-level-throw` 等）、[synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts)（`sliceCoveredFiles`、`productionSizedFiles`）。
  - E2E 支持：[browser-test.ts](../../../../e2e/support/browser-test.ts)（错误收集与精确诊断）、[browser-probes.ts](../../../../e2e/support/browser-probes.ts)（不保留消息内容）、[audio-playback.ts](../../../../e2e/support/audio-playback.ts)、[resource-cache.ts](../../../../e2e/support/resource-cache.ts)（`readStoredRecords`、`armHold`、`withQuotaOverride`、`withPersistentProfile`、`seedPackage`；`requestsDuring` 只看主页面）、[viewer-observations.ts](../../../../e2e/support/viewer-observations.ts)、[production-cache.ts](../../../../e2e/support/production-cache.ts)（`seedProductionCache` 用 `add`，同键只能预置一次）、[native-lifecycle.ts](../../../../e2e/support/native-lifecycle.ts)（真实可见性，已被开发项目的音频用例使用）、[app-entry.ts](../../../../e2e/support/app-entry.ts)。
  - 参照用例：[joint-resources.spec.ts](../../../../e2e/joint-resources.spec.ts)（3 轮往返、计数逐轮相等）、[production-preview.spec.ts](../../../../e2e/production-preview.spec.ts)（CSP 违规记录、Worker 404 与 HTML 回退）、[fast-refresh.spec.ts](../../../../e2e/fast-refresh.spec.ts)、[cache-recovery.spec.ts](../../../../e2e/cache-recovery.spec.ts)、[resource-cache.spec.ts](../../../../e2e/resource-cache.spec.ts)（真实配额与事务中断）。
  - Playwright 项目归属目前按显式文件列表维护（[playwright.config.ts](../../../../playwright.config.ts)、[e2e-configuration.test.ts](../../../../tools/e2e-configuration.test.ts)）。Vitest 只发现 `src/**/*.test.ts` 与 `tools/**/*.test.ts`（[vite.config.ts](../../../../vite.config.ts)）。
- **计划新增（均尚不存在）：**
  - `tools/e2e-network-policy.ts` 及其测试；`e2e/support/` 下的 `network-audit.ts`、`audited-test.ts`、`responsiveness.ts`、`resource-balance.ts`、`canaries.ts`；
  - `src/workers/failure-matrix.test.ts` 与失败场景测试支持；
  - `e2e/` 下的控制样本、联合闭环与失败矩阵用例，按 01 的命名约定区分项目；
  - `local/research/p2-12/`：本地脚本与输出，被忽略、不提交。

  文件拆分可在执行时微调，但不得新增依赖或通用测试框架，不得让生产模块图包含测试支持。
- **本地数据与工具（2026-10-07 均已存在）：**
  - `local/StarRang/cd/` 的 CloneCD 文件组（12、13、14、16、17、18 需要）；
  - `local/StarRang/captures/` 的 92 张基准截图（13、15、16、17 需要）；
  - `local/research/p2-08/` 的 18 个试听 WAV 与清单（14、21 需要）；
  - `local/research/p2-11/pipeline.ts`（12 复用）；
  - `~/Tools/bin/dosbox-x` 与 `local/research/p2-01/runtime-vrt-map.py`（15、19 需要）。

  缺少时相应子任务为 blocked，不能用合成数据代替。
- **人工前提：** 15、19、21、23 需要用户亲自操作（补拍、配合调试器读数、导入与恢复、试听、复核），agent 不能代替（spec 技术决定 8）。2026-10-08 修订后，21、23 中的视觉对照由 agent 经 Computer Use 完成。
- **研究前提：** 19（U-032）不保证能定论；两法都不能判定时 AC-20 为 blocked，由用户决定后续安排。22 的修正只在证据达到高概率且能用现有呈现接口表达时进行；需要内容或几何变化的差异转责任任务，新增修复子任务。
- **原版证据：** [mesh §3](../../../original/formats/mesh.md#3-comparison-with-the-original-partial)、[cockpit R5](../../../original/formats/cockpit.md#production-composites-and-element-overlaps-r5)、[hud 覆盖表](../../../original/formats/hud.md#slice-screen-coverage-and-hud-image-families-r3-r4-r6)、[audio 试听](../../../original/formats/audio.md#listening-comparison-p2-0810)、[scenario 字段清单](../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)、[executable 地图投影](../../../original/formats/executable.md#strategic-map-projection)、[B-001](../../../original/behavior/B-001-strategic-map.md)，以及 [unknowns](../../../original/unknowns.md) 的 U-004、U-019、U-022、U-023、U-027 至 U-030、U-032。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 12 | 12 本地 Node 脚本；26 在最终候选上重跑 |
| S-02 | 05、06、07 | 06 开发项目 E2E；07 生产项目 E2E |
| S-03 | 04、06、07、10 | 04 控制样本；06、07 每轮与同文档往返；10 生命周期 |
| S-04 | 05、08、09、10 | 05 Node 固定预期；08、09、10 开发项目 E2E |
| S-05 | 03、06、07、09 | 03 控制样本与可控繁忙 Worker；06、07 实际窗口；09 I-7 |
| S-06 | 02、05 | 02 控制样本；03、06–10 产品用例零违规 |
| S-07 | 11 | 11 产物审阅与 `pnpm check:compliance`；26 重跑 |
| S-08 | 13、15、16、17、21、23 | 16、17 本地脚本；21、23 用户对照 |
| S-09 | 14、21 | 14 采样等价；21 用户试听 |
| S-10 | 18、19、21 | 18 独立读取与 Core 核对；19 调试器读数；21 页面诊断 |
| S-11 | 22、23 | 22 单元与 E2E；23 用户复核 |
| S-12 | 24 | 26 判定汇总与文档审阅 |
| S-13 | 20、22、25 | 26 文档链接与元数据、工程检查 |
| AC-01 | 12 | 12 本地脚本；26 最终候选重跑 |
| AC-02 | 05、06 | 06 开发项目 E2E |
| AC-03 | 07 | 07 生产项目 E2E |
| AC-04 | 04、06、07 | 04 控制样本；06、07 每轮快照与同文档往返 |
| AC-05 | 03、06、07 | 03 控制样本与可控繁忙 Worker；06、07 实际窗口 |
| AC-06 | 05、08 | 05 Node；08 开发项目 E2E |
| AC-07 | 05、08 | 05 Node；08 开发项目 E2E |
| AC-08 | 05、07、09 | 09 开发项目 E2E 与受控端口；07 生产回退用例 |
| AC-09 | 05、10 | 10 真实 IndexedDB 与原生可见性 E2E |
| AC-10 | 02、03、06–10 | 各用例审计零违规与标记到达证明；26 汇总 |
| AC-11 | 02 | 02 两个项目的控制样本 E2E 与单元测试 |
| AC-12 | 11 | 11 产物与 source map 审阅 |
| AC-13 | 11 | 11 合规命令与审阅；26 重跑 |
| AC-14 | 15、21、23 | 21 用户对照；23 受影响项复核 |
| AC-15 | 15、21、23 | 21 用户对照；23 受影响项复核 |
| AC-16 | 16、21 | 16 本地像素比较；21 用户界面确认 |
| AC-17 | 17、21 | 17 本地覆盖表；21 用户界面确认 |
| AC-18 | 14、21 | 14 采样等价；21 用户试听 |
| AC-19 | 18、21 | 18 本地核对；21 用户真实导入与恢复 |
| AC-20 | 19 | 19 调试器读数或截图测量；文档 diff |
| AC-21 | 22、23 | 22 单元、E2E 与文档；23 复核 |
| AC-22 | 24 | 26 判定汇总表与回填审阅 |
| AC-23 | 20、22、25 | 26 链接与元数据检查 |
| AC-24 | 26 | 26 `pnpm check`、`pnpm test:e2e` 两次、`pnpm check:compliance`、依赖文件 diff |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-e2e-project-routing.md](./subtasks/01-e2e-project-routing.md) | — | completed |
| [02-network-audit.md](./subtasks/02-network-audit.md) | 01 | completed |
| [03-responsiveness-probe.md](./subtasks/03-responsiveness-probe.md) | 01, 02 | completed |
| [04-resource-balance.md](./subtasks/04-resource-balance.md) | — | completed |
| [05-failure-canary-fixtures.md](./subtasks/05-failure-canary-fixtures.md) | — | completed |
| [06-joint-development.md](./subtasks/06-joint-development.md) | 01, 02, 03, 04, 05 | completed |
| [07-joint-production.md](./subtasks/07-joint-production.md) | 01, 02, 03, 04, 05 | completed |
| [08-failure-input-content.md](./subtasks/08-failure-input-content.md) | 01, 02, 04, 05 | completed |
| [09-failure-worker-cancel.md](./subtasks/09-failure-worker-cancel.md) | 01, 02, 03, 04, 05 | completed |
| [10-failure-storage-lifecycle.md](./subtasks/10-failure-storage-lifecycle.md) | 01, 02, 04, 05 | completed |
| [11-outbound-compliance-review.md](./subtasks/11-outbound-compliance-review.md) | 22 | pending |
| [12-candidate-check.md](./subtasks/12-candidate-check.md) | — | completed |
| [13-comparison-baselines.md](./subtasks/13-comparison-baselines.md) | 12 | completed |
| [14-sound-baseline-equivalence.md](./subtasks/14-sound-baseline-equivalence.md) | 12 | completed |
| [15-user-captures.md](./subtasks/15-user-captures.md) | 13 | completed |
| [16-layout-comparison.md](./subtasks/16-layout-comparison.md) | 12, 15 | completed |
| [17-hud-texture-coverage.md](./subtasks/17-hud-texture-coverage.md) | 12, 15 | completed |
| [18-mission-comparison.md](./subtasks/18-mission-comparison.md) | 12 | completed |
| [19-map-frame.md](./subtasks/19-map-frame.md) | 12 | completed |
| [20-guide-user-comparison.md](./subtasks/20-guide-user-comparison.md) | — | completed |
| [21-user-comparison-session.md](./subtasks/21-user-comparison-session.md) | 12, 14, 15, 20 | in-progress |
| [22-presentation-verdicts.md](./subtasks/22-presentation-verdicts.md) | 16, 17, 21 | pending |
| [23-user-recheck.md](./subtasks/23-user-recheck.md) | 22 | pending |
| [24-original-backfill.md](./subtasks/24-original-backfill.md) | 16, 17, 18, 19, 21, 22, 23 | pending |
| [25-engineering-docs.md](./subtasks/25-engineering-docs.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10 | completed |
| [26-final-alignment.md](./subtasks/26-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-07 — 协调方式：** 本机宿主不能在协调者创建的文件夹中启动会话，worker 改用应用创建的 worktree（从 `goal/p2-12` 分出，分支经 rename 为带应用前缀的 `lhz516-exec-p2-12-NN`，代替 `exec/p2-12-NN`）；集成按 `Worker-Commit` trailer 核对。协调者在 `open-star-rangers.worktrees/goal-p2-12` 维护目标分支；用户会话使用固定在 `9e6188f` 的单独检出（构建指纹与 12 的候选相同）。
- **2026-10-07 — 用户决定：** spec 技术决定 8 保持不变；Computer Use 只用于不显示原版画面的准备操作。C-09 不考虑 LO 分辨率（总计划已以 HI 为 Classic 基准）；C-12 原拟由 17 的本地脚本估计，后经 rubber-duck 指出 17 的范围不含截图级贴图可见性，改在 21 中视觉判定（2026-10-08 技术决定 8 修订后由 agent 完成）。
- **2026-10-08 — 17 完成，AC-17 的 agent 部分仍 blocked：** 17 的覆盖表与核对已完成。23 个图像（gauge-bar 0/3、status-display background-2、overlay 0–5/8、unit-marker 0/1/7/8/14/17/26–28、zoom-icon 26–28、image/missile）、palette/missile 与 font/hud/4x6 为“无法判定”，原因是 C-07/C-08/C-09/C-10 的补拍被延后（见 15 的用户决定）。按用户“记录缺口，相应验收保持 blocked，稍后重做”的决定，本行按已完成记录，AC-17 的缺口交 26 新增修复子任务处理；恢复条件为补拍上述场景。U-030：文字后的状态显示屏标记与 srangers_068 的左显示屏不能排除缺少切片图形，交 24 判断。
- **2026-10-08 — 视频次级基准（用户批准）：** 用户指定一个公开实机视频播放列表，并批准其帧作 V-1、V-2、地图图标与 HUD 状态的次级基准；以视频为基准的判定最高为高概率，逐像素比较仍只用本地截图。spec 与指南已同步。
- **2026-10-08 — 技术决定 8 修订（用户批准）：** 用户要求并明确批准 21、23 中的视觉对照（C-05、C-12、V-1、V-2、二维显示）改由 agent 经 Computer Use 完成，试听仍由用户完成。spec、工作流、指南与 21、23 已同步修订。此前（2026-10-07 23:55）一次只读文本读取时，工具自动附带了查看器截图，其中有一张原版贴图；当时尚未修订，该截图未用于任何判定。
- **2026-10-07 — 负载相关的检查超时：** 高负载（load ≈ 13–30）下 `pnpm check` 中 `tools/engineering-boundaries.test.ts` 的渲染边界用例偶发 5 s 超时（单独运行约 1.8 s 通过；06、09 的 worker 在不含对方改动的基线上也遇到）。集成时以 `vitest run --maxWorkers=3` 加 typecheck、lint、build 代替完整并行运行，未改超时。26 应在低负载下运行 `pnpm check`。
- **2026-10-07 — 15 的补拍缺口（用户决定）：** 用户选择本轮不再补拍，未取得的部分按义务逐项记为无法取得。受影响的 AC-14（手性、敌机/僚机/基地碎片、模型贴图可见性）、AC-15（碎片形状、炮弹、导弹）与 AC-17（导弹图像、状态显示屏、4×6 字库、地图标记、模型贴图）部分保持 blocked，稍后补拍重做；26 发现这些缺口时按 execute-goal §5 新增修复子任务。C-05、C-12 可在 21 会话开始时由用户完成。
- **2026-10-07 — 07 的实际窗口取证（协调者已接受）：** 同文档往返用例的恢复不计入 AC-05：新 context 起始 1–2 s 内，点击的输入任务出现 61–110 ms 的长任务，CDP 追踪显示是点击派发前的渲染等待，与恢复工作无关。AC-05（生产）取 3 轮用例的 7 个窗口（识别 ×3、恢复 ×4，长任务均为 0）；门槛未放宽，记录未过滤。负载下恢复的最大任务距 50 ms 门槛只有约 15–25 ms 余量，26 应在低负载下复跑。

## 审批

2026-10-08，用户批准修订 spec 技术决定 8（见执行记录），本 goal 的子任务划分与依赖不变。

用户于 2026-10-07 明确批准本 goal（“approve goal and commit”）。批准范围：子任务 01 至 26 的划分、依赖、执行方式与写入范围，以及验收覆盖表。这不代表实现完成，也不替代 spec 批准（spec 已于同日批准）。
