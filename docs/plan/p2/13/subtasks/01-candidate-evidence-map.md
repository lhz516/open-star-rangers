---
type: plan
status: active
phase: P2
task: "13"
subtask: "01"
updated: 2026-10-08
---

# 01 — 候选、前置与证据适用性映射

**契约来源：** [spec](../spec.md) 的 S-01、S-03、AC-01、AC-06、AC-11 与 AC-12；[行为与边界](../spec.md#行为与边界)、[退出条件覆盖](../spec.md#退出条件覆盖)、技术决定 4。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **前置任务：** 对 P2-01 至 P2-12 逐项核对以下内容，不能只看路由的 `done` 或 `accepted` 标签：
  - spec 与 goal 的 `status: accepted` 和真实的批准记录；
  - tracker 全部为 `completed`；
  - 最终对齐的完成证据存在并写明通过。

  不一致的项列为问题。
- **候选与差异：**
  - 记录 HEAD 提交、`git status`（工作树与索引）、Node 与 pnpm 版本。
  - 列出 `f925d21..HEAD` 的文件差异，按“进入构建或测试”与“不进入”分组。前者包括 `src/`、`e2e/`、`tools/`、`package.json`、`pnpm-lock.yaml`、`.nvmrc`、`vite.config.ts`、`playwright.config.ts`、`tsconfig*.json`、`eslint.config.js`、`index.html`、`public/` 与 `docs/original/manifest.md`。
  - 给出生产影响结论。构建指纹与 `ContentIdentity` 由 05 记录。
- **退出映射（AC-11 的输入）：** 把以下三类要求映射到责任任务与证据链接，供 07 作逐项判定：
  - 总计划的四项 P2 退出条件；
  - [阶段责任覆盖](../../tasks.md#6-阶段验收覆盖)的全部行；
  - 总计划 P2 行列出的主要交付。
- **证据适用性（AC-06）：** 对 S-03 的每一类写明来源候选、相关差异、复用理由，或需要补验的部分：
  - P2-12 的原版对照（V-1 至 V-4、A-1、M-1 至 M-4、呈现约定）与其会话；
  - 产物出站 API 清单与来源/许可人工审阅（本轮由 04 判定构建指纹是否相同）；
  - P2-10 的浏览器存储证据、P2-04 的真实 Worker 证据与 P2-11 的自动用例（本轮由 03 的 E2E 补齐）；
  - **P2-11 AC-21 的用户实机核对：** 该核对在 `graphics-2…models-2` 上完成，须对照之后的 P2-06、P2-07 修订逐项判断。逐项为：识别与状态序列、刷新后的缓存恢复、查看器各类资源、四类音效试听与停止、耗时。对每一项写明是否受影响、是否有后续有效证据（例如 P2-12/29、30 的 agent 浏览器会话、P2-12 的 E2E），以及结论。
- **失败处理：** 判定受影响且没有其他有效证据的必需项，记为问题，写明受影响的退出条件、原责任与恢复条件；协调者据此新增子任务（需用户的复核或修复项），不在本项中执行。

## 不包含

- 运行工程、浏览器、合规检查或真实数据核对（02–05）；处置未知项（06）；写评审（07）。
- 改写其他任务的历史证据；新的原版研究或对照。

## 关键文件与契约

- 各任务的 `docs/plan/p2/NN/{spec,goal}.md` 与最终对齐子任务；[tools/task-state.ts](../../../../../tools/task-state.ts)。
- [P2-12/26](../../12/subtasks/26-final-alignment.md#第四次运行2026-10-08通过)、[P2-12/29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据)、[P2-12/30](../../12/subtasks/30-deferred-recaptures.md#完成证据)、[P2-12/31](../../12/subtasks/31-hud-resource-gap.md#完成证据)、[P2-11/19](../../11/subtasks/19-user-real-machine-check.md#完成证据)、[P2-11 spec AC-21](../../11/spec.md#验收标准)。
- [P2-12 候选身份](../../12/spec.md#候选身份)的变化规则。

## 写入范围

- 无。

## 验收标准

- [x] AC-01：12 个前置任务的批准、tracker 与最终对齐证据都已核对；记录 HEAD、工作树/索引状态、Node/pnpm 版本、`f925d21..HEAD` 的分组差异与生产影响结论。
- [x] AC-11（映射）：四项退出条件、阶段覆盖表的每一行与总计划 P2 行的每项主要交付，都映射到责任任务与证据链接，没有遗漏。
- [x] AC-06：适用性表覆盖 S-03 的全部类别；P2-11 AC-21 逐项有结论；需要 03、04 补齐的类别明确标出。
- [x] AC-12：每个不一致、受影响且缺少证据的项都写明受影响的退出条件、原责任任务、原因与恢复条件；没有时写明“无”。

## 验证方法

- `node tools/task-state.ts p2/NN`（NN 为 01 至 12）；逐个打开 goal 的子任务跟踪与最终对齐子任务的完成证据。
- `git --no-pager status --short`、`git --no-pager diff --name-only f925d21..HEAD`、`git --no-pager log --oneline f925d21..HEAD`。
- 不涉及浏览器验证；原版证据不适用（只核对已有记录）。

## 完成证据

2026-10-08，worker 分支 `exec-p2-13-01`（宿主改名，对应协调者的 `exec/p2-13-01`），基点即认领提交 `c2018af72a3ef0245afab43d8badfdc2f1e203fe`。只读核对；本项只改本文件，不改变候选。

### 候选与前置（AC-01）

- **工作树：** `git status --porcelain --untracked-files=all` 无输出，索引为空；被忽略的只有指向主检出的 `local` 链接。
- **环境：** Node v22.22.0，pnpm 12.8.1，macOS 26.6（25G72，arm64）。Chrome 与端口由 03 记录。
- **前置任务：** 逐个打开 spec、goal 与最终对齐文档核对，路由只作旁证。
  - 24 份 spec 与 goal 的 front matter 都为 `accepted`，`## 审批` 都有用户批准记录。
  - 12 个 tracker 共 199 行，全部 `completed`，与 `subtasks/` 的 199 个文件一一对应；`node tools/task-state.ts p2/01` 至 `p2/12` 都为 `done`。
  - 执行期新增的子任务，在各自 goal 的执行记录或审批中都有对应记录（逐个检索编号）。

  | 任务 | 批准记录（spec / goal） | tracker | 最终对齐 |
  |---|---|---|---|
  | P2-01 | spec 10-03 批准；10-04 两次修订、10-06 修订由用户批准，10-08 修订随 P2-07 修订按用户决定执行。goal 10-03 批准，08 同日批准，09、10 为补救 | 10/10 | [07](../../01/subtasks/07-final-alignment.md#完成证据)：第二次，“结论：通过” |
  | P2-02 | spec、goal 10-04；11–13 为补救 | 13/13 | [10](../../02/subtasks/10-final-alignment.md#完成证据)：第三次，“最终对齐通过” |
  | P2-03 | spec、goal 10-05；11–14 为补救 | 14/14 | [10](../../03/subtasks/10-final-alignment.md#完成证据)：第三次，通过 |
  | P2-04 | spec、goal 10-05；13 为补救 | 13/13 | [12](../../04/subtasks/12-final-alignment.md#完成证据)：第二次，通过 |
  | P2-05 | spec、goal 10-05 | 13/13 | [13](../../05/subtasks/13-final-alignment.md#完成证据)：10-05 完成，覆盖、不变量与命令都成立 |
  | P2-06 | spec 10-05；10-06、10-08 修订由用户批准。goal 10-05；10-08 修订（21）由用户批准；14–20 见执行记录 | 21/21 | [13](../../06/subtasks/13-final-alignment.md#完成证据)：20 补救后复跑，21 之后于 10-08 再复跑，检查全部通过 |
  | P2-07 | spec 10-05；10-05、10-06 的执行期修订依据用户在 execute-goal 中的授权，10-08 修订依据用户决定。goal 10-05；18–21 见执行记录 | 21/21 | [17](../../07/subtasks/17-final-alignment.md#完成证据)：10-08 修订后复核，检查全部通过 |
  | P2-08 | spec、goal 10-05；三次执行期修订依据用户授权；14、15 见执行记录 | 15/15 | [13](../../08/subtasks/13-final-alignment.md#完成证据)：15 补救后，“每项都有证据” |
  | P2-09 | spec、goal 10-05；14 为补救 | 14/14 | [13](../../09/subtasks/13-final-alignment.md#完成证据)：“最终对齐通过” |
  | P2-10 | spec、goal 10-05；AC-06、AC-07 的修订由用户批准；08 为补救 | 8/8 | [07](../../10/subtasks/07-final-alignment.md#完成证据)：第二次，通过 |
  | P2-11 | spec、goal 10-06；10-07 修订由用户批准；21–24 见执行记录 | 24/24 | [20](../../11/subtasks/20-final-alignment.md#完成证据)：10-07，检查全部通过 |
  | P2-12 | spec、goal 10-07；10-08 的两种次级基准、范围例外与技术决定 8 的修订由用户批准；27–33 为补救 | 33/33 | [26](../../12/subtasks/26-final-alignment.md#第四次运行2026-10-08通过)：第四次，01–33 全部完成，S、AC 都有证据 |

- **候选差异（`f925d21..HEAD`）：** `f925d21` 是 HEAD 的祖先。共 8 个提交（`508c088` 至 `c2018af`）、34 个文件，全部是文档、技能与规划。
  - **进入构建或测试：0 个。** 逐项比较 `f925d21` 与 HEAD 的 git 树对象，以下都相同：
    - `src/`、`e2e/`、`tools/`；
    - `package.json`、`pnpm-lock.yaml`、`.nvmrc`；
    - `vite.config.ts`、`playwright.config.ts`、6 个 `tsconfig*.json`、`eslint.config.js`、`index.html`、`LICENSE`、`.gitignore`；
    - 整个 `docs/original/`（含 `manifest.md`）。

    仓库中没有 `public/`。[构建插件](../../../../../tools/compliance/build-plugin.ts)另把 `LICENSE` 与 `tools/compliance/*.ts` 记为输入，也都不变。测试与工具读取的仓库文档只有 `docs/original/manifest.md`；`task-state` 的测试在临时目录中构造文档。
  - **不进入：34 个。**
    - `.agents/skills/` 8 个：execute-goal 3、generate-goal 2、generate-spec 2、review-spec 1；`AGENTS.md`；
    - `docs/README.md`、`docs/STATUS.md`；
    - `docs/decisions/` 3 个（ADR-0016、ADR-0017、索引）；`docs/engineering/` 2 个（agent-workflow、source-structure）；`docs/guides/` 2 个（baseline-environment、original-evidence）；
    - `docs/plan/p2/tasks.md`；`docs/plan/p2/12/` 5 个（spec、goal、26、30、33）；`docs/plan/p2/13/` 10 个（本任务的规划）。
  - **生产影响结论：无。** 最终候选的构建与内容应与 P2-12 候选相同，即构建指纹 `sha256:ec5af1f5…f690`、`ConverterVersion` `osr-import.graphics-3.logic-1.audio-1.models-3`、切片定义版本 3、manifest `sha256:6d91667b…facfad5`、来源 `source:sha256:fd97bcea…81be`。依据见 [P2-12/26 第二次运行](../../12/subtasks/26-final-alignment.md#第二次运行2026-10-08未通过残余项待用户决定)、[29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据) 与 [31](../../12/subtasks/31-hud-resource-gap.md#完成证据)。本轮的实测指纹与 `ContentIdentity` 由 05 记录；若与此不同，本结论与下文的复用结论都失效，须按 spec 技术决定 4 重做。

### 退出映射（AC-11 的输入）

[总计划 §12](../../../master-plan.md#12-开发阶段与验收条件) P2 行的四项退出条件是[阶段覆盖表](../../tasks.md#6-阶段验收覆盖)的前四行；该表共 15 行。下表只给责任与证据入口，不作判定（判定归 07）。

| # | 覆盖表的行 | 责任任务 | 证据入口 | 本轮落点 |
|---|---|---|---|---|
| 1 | 退出：资源与原版本地截图对照还原正确 | P2-05 至 P2-08、P2-11；对照 P2-12 | 最终对齐：P2-05 [13](../../05/subtasks/13-final-alignment.md#完成证据)、P2-06 [13](../../06/subtasks/13-final-alignment.md#完成证据)、P2-07 [17](../../07/subtasks/17-final-alignment.md#完成证据)、P2-08 [13](../../08/subtasks/13-final-alignment.md#完成证据)、P2-11 [20](../../11/subtasks/20-final-alignment.md#完成证据)。P2-12 [判定汇总](../../12/subtasks/26-final-alignment.md#第三次运行2026-10-08未通过源码结构的呈现约定表与-30-不一致)与[第四次运行](../../12/subtasks/26-final-alignment.md#第四次运行2026-10-08通过)；V-1 [29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据)、[30](../../12/subtasks/30-deferred-recaptures.md#完成证据)；V-2 [21](../../12/subtasks/21-user-comparison-session.md#完成证据)、[30](../../12/subtasks/30-deferred-recaptures.md#完成证据)；V-3 [16](../../12/subtasks/16-layout-comparison.md#完成证据)；V-4 [17](../../12/subtasks/17-hud-texture-coverage.md#完成证据)、[30](../../12/subtasks/30-deferred-recaptures.md#完成证据)、[31](../../12/subtasks/31-hud-resource-gap.md#完成证据)；A-1 [14](../../12/subtasks/14-sound-baseline-equivalence.md#完成证据)、[21](../../12/subtasks/21-user-comparison-session.md#完成证据)、[28](../../12/subtasks/28-a1-original-comparison.md#完成证据)；呈现约定 [22](../../12/subtasks/22-presentation-verdicts.md#完成证据)、[33](../../12/subtasks/33-presentation-table-alignment.md#完成证据) | 01 的适用性（下文）；P-1 的用户复核；07 判定 |
| 2 | 退出：一个任务的数据能载入 Core | P2-01、P2-09；P2-11 诊断；P2-12 | P2-01 [07](../../01/subtasks/07-final-alignment.md#完成证据)；P2-09 [11](../../09/subtasks/11-core-load-mission.md#完成证据)、[12](../../09/subtasks/12-local-base-check.md#完成证据)、[13](../../09/subtasks/13-final-alignment.md#完成证据)；P2-11 [04](../../11/subtasks/04-mission-diagnostics.md#完成证据)；P2-12 M-1、M-2、M-4 [18](../../12/subtasks/18-mission-comparison.md#完成证据)，M-3 [19](../../12/subtasks/19-map-frame.md#完成证据)，候选核对 [12](../../12/subtasks/12-candidate-check.md#完成证据) | 02 的 Vitest；05 的 `loadMission`；P-1 的用户复核（真实界面导入与恢复后的任务诊断）；07 |
| 3 | 退出：越界或损坏的输入被安全拒绝 | P2-02、P2-03；P2-05 至 P2-09；P2-04、P2-10、P2-11 | 各任务最终对齐（见上文前置表）；P2-12 金丝雀 [05](../../12/subtasks/05-failure-canary-fixtures.md#完成证据)，失败矩阵 [08](../../12/subtasks/08-failure-input-content.md#完成证据)、[09](../../12/subtasks/09-failure-worker-cancel.md#完成证据)、[10](../../12/subtasks/10-failure-storage-lifecycle.md#完成证据) | 02 的各层坏输入测试；03 的 F-01 至 F-14 与 I-1 至 I-7；07 |
| 4 | 退出：导入无需服务器接收资源 | P2-02、P2-04、P2-10、P2-11；P2-12 | P2-11 生产预览 CSP [14](../../11/subtasks/14-production-preview-csp.md#完成证据)、[21](../../11/subtasks/21-production-preview-csp.md#完成证据)；P2-12 网络审计 [02](../../12/subtasks/02-network-audit.md#完成证据)、产物出站审阅 [11](../../12/subtasks/11-outbound-compliance-review.md#完成证据)（在 [29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据) 中于 `ec5af1f5…` 上重跑） | 03 的网络审计与 CSP 用例；04 的构建指纹与出站清单适用性；07 |
| 5 | CCD/IMG 原始扇区、ISO9660 与 `.NOB` 按需读取 | P2-02、P2-03 | P2-02 [10](../../02/subtasks/10-final-alignment.md#完成证据)、本地基准 [09](../../02/subtasks/09-local-base-check.md#完成证据)；P2-03 [10](../../03/subtasks/10-final-alignment.md#完成证据)、按需读取 [03](../../03/subtasks/03-on-demand-archive.md#完成证据)、本地基准 [09](../../03/subtasks/09-local-base-check.md#完成证据)；实际本地导入 P2-12 [12](../../12/subtasks/12-candidate-check.md#完成证据) | 02；05 |
| 6 | 基准版本、光盘指纹、稳定 Asset ID 与规范内容 | P2-01、P2-03；各转换任务 | P2-01 [07](../../01/subtasks/07-final-alignment.md#完成证据)；P2-03 目录指纹 [04](../../03/subtasks/04-catalog-fingerprint.md#完成证据)、识别 [05](../../03/subtasks/05-identify-verified-source.md#完成证据)；P2-12 身份与引用闭包 [12](../../12/subtasks/12-candidate-check.md#完成证据)、[31](../../12/subtasks/31-hud-resource-gap.md#完成证据)（闭包 165/165），联合闭环 [06](../../12/subtasks/06-joint-development.md#完成证据)、[07](../../12/subtasks/07-joint-production.md#完成证据) | 05 的构建指纹与 `ContentIdentity` |
| 7 | 玩家、敌机、基地、弹药、导弹、碎片的模型、贴图与调色板 | P2-05、P2-06 | P2-05 [13](../../05/subtasks/13-final-alignment.md#完成证据)；P2-06 [13](../../06/subtasks/13-final-alignment.md#完成证据)（含贴图坐标修复 [21](../../06/subtasks/21-mesh-uv-planar.md#完成证据)）；P2-11 实际预览 [09](../../11/subtasks/09-viewer-models-effects.md#完成证据)、[19](../../11/subtasks/19-user-real-machine-check.md#完成证据)；P2-12 [29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据)、[30](../../12/subtasks/30-deferred-recaptures.md#完成证据)、[17](../../12/subtasks/17-hud-texture-coverage.md#完成证据)；无未披露替代：[12](../../12/subtasks/12-candidate-check.md#完成证据) 的“无占位”与来源断言 | 03；05；P-1 的用户复核（模型） |
| 8 | 飞行驾驶舱、HUD 位图/字体、战略地图图形 | P2-05、P2-07 | P2-07 [17](../../07/subtasks/17-final-alignment.md#完成证据)（生产驾驶舱与 HUD [12](../../07/subtasks/12-production-cockpit-hud.md#完成证据)，SNIP/DIAG [20](../../07/subtasks/20-snip-diag-conversion.md#完成证据)）；P2-12 V-3 [16](../../12/subtasks/16-layout-comparison.md#完成证据)，V-4 [17](../../12/subtasks/17-hud-texture-coverage.md#完成证据)、[30](../../12/subtasks/30-deferred-recaptures.md#完成证据)、[31](../../12/subtasks/31-hud-resource-gap.md#完成证据) | 03；05；P-1 的用户复核（SNIP 帧） |
| 9 | 开火、导弹、爆炸、Warp 核心音效 | P2-08 | P2-08 [13](../../08/subtasks/13-final-alignment.md#完成证据)（控制器 [07](../../08/subtasks/07-audio-controller.md#完成证据)、浏览器播放 [08](../../08/subtasks/08-browser-audio-playback.md#完成证据)、试听 [10](../../08/subtasks/10-listening-comparison.md#完成证据)、生产音效表 [11](../../08/subtasks/11-production-sound-table.md#完成证据)）；P2-11 查看器试听 [22](../../11/subtasks/22-viewer-audio.md#完成证据)；P2-12 A-1 [14](../../12/subtasks/14-sound-baseline-equivalence.md#完成证据)、[21](../../12/subtasks/21-user-comparison-session.md#完成证据)、[28](../../12/subtasks/28-a1-original-comparison.md#完成证据) | 03（合成采样的播放与停止） |
| 10 | 单任务及战略地图/Warp 所需数据，必要时定向提取参数 | P2-09，引用与 P2-06、P2-07 对齐 | P2-09 [13](../../09/subtasks/13-final-alignment.md#完成证据)；P2-12 [18](../../12/subtasks/18-mission-comparison.md#完成证据)、[19](../../12/subtasks/19-map-frame.md#完成证据)；规则执行交 P3 | 05 |
| 11 | 导入/转换 Worker、进度、取消、故障与生命周期 | P2-04；各转换任务、P2-11 | P2-04 [12](../../04/subtasks/12-final-alignment.md#完成证据)（浏览器 Worker [06](../../04/subtasks/06-browser-worker-adapter.md#完成证据)、[09](../../04/subtasks/09-browser-worker-paths.md#完成证据)、[10](../../04/subtasks/10-browser-lifecycle-failures.md#完成证据)）；P2-11 生命周期 [13](../../11/subtasks/13-lifecycle-hot-reload.md#完成证据)；P2-12 响应 [03](../../12/subtasks/03-responsiveness-probe.md#完成证据)、资源平衡 [04](../../12/subtasks/04-resource-balance.md#完成证据)、作业与取消失败 [09](../../12/subtasks/09-failure-worker-cancel.md#完成证据) | 03 |
| 12 | 指纹 + 转换器版本的 IndexedDB 最小缓存 | P2-10、P2-11 | P2-10 [07](../../10/subtasks/07-final-alignment.md#完成证据)；P2-11 缓存编排 [03](../../11/subtasks/03-cache-orchestration.md#完成证据)、浏览器恢复 [12](../../11/subtasks/12-cache-browser-recovery.md#完成证据)；P2-12 存储与生命周期失败 [10](../../12/subtasks/10-failure-storage-lifecycle.md#完成证据)。迁移与清理不属于 P2：总计划 P5 行列有“缓存版本管理与清理” | 03；P-1 的用户复核（同源刷新恢复） |
| 13 | 仅为切片建设的最小资源查看器 | P2-11 | P2-11 [20](../../11/subtasks/20-final-alignment.md#完成证据)（查看页 [11](../../11/subtasks/11-viewer-page.md#完成证据)、模型与效果 [09](../../11/subtasks/09-viewer-models-effects.md#完成证据)、试听 [22](../../11/subtasks/22-viewer-audio.md#完成证据)）；P2-12 联合闭环 [06](../../12/subtasks/06-joint-development.md#完成证据)、[07](../../12/subtasks/07-joint-production.md#完成证据) | 03；P-1 的用户复核 |
| 14 | 工程边界、合成自动测试、原版隔离与许可 | 各实现任务、P2-12 | 各任务最终对齐中的 `pnpm check` 与 `check:original`；P2-12 [11](../../12/subtasks/11-outbound-compliance-review.md#完成证据)、[25](../../12/subtasks/25-engineering-docs.md#完成证据)，[26 第二次运行](../../12/subtasks/26-final-alignment.md#第二次运行2026-10-08未通过残余项待用户决定)的 `check:compliance` | 02；04；08 的 `check:original` |
| 15 | 退出判定及 P3/P4/P5 交接 | P2-13 | — | 07 的 draft 评审；负责人确认在本 goal 之外 |

总计划 P2 行列出的主要交付，都落在上表的行中：

| 主要交付 | 覆盖表的行 |
|---|---|
| 开发者现有的 CCD/IMG 镜像导入（原始扇区 + ISO9660 目录）；`.NOB` 封包解析 | 5 |
| 切片用到的模型、贴图与调色板（玩家飞船、1–2 种敌机、一个基地、弹药/导弹/碎片） | 7 |
| 飞行中的驾驶舱、HUD 位图与字体，战略地图图形 | 8 |
| 核心音效（开火、导弹、爆炸、Warp） | 9 |
| 一个任务及战略地图/Warp 所需数据 | 10 |
| 若任务数据嵌在 EXE 中，相应提取（条件交付） | 10。P2-09 [07](../../09/subtasks/07-file-range-locator.md#完成证据) 研究后判为不适用：必需的空间参数都在已覆盖的 `SCENARIO.NOB` 条目中。EXE 区域读取实际用于效果几何（P2-06 [16](../../06/subtasks/16-executable-region-reader.md#完成证据)）与 SNIP/DIAG（P2-07 [20](../../07/subtasks/20-snip-diag-conversion.md#完成证据)） |
| 只为这些资源做最小资源查看器 | 13 |
| 缓存按光盘指纹 + 转换器版本存入 IndexedDB，暂不做迁移与清理 | 12；迁移与清理归 P5 |

### 证据适用性（AC-06）

| 类别 | 来源候选 | 与最终候选的相关差异 | 结论 | 本轮补齐 |
|---|---|---|---|---|
| P2-12 原版对照：V-1 至 V-4、A-1、M-1 至 M-4、呈现约定 | 判定汇总绑定 `02fd66f` 起的同一构建 `ec5af1f5…f690`（`f925d21` 与之相同）。16、17、18 以 `final-31` 在该构建上重跑；29、30 的 agent 会话也在该构建上。14、21、22、23 与 18、19、28 中与贴图坐标无关的判定沿用 `97b70de`（`4d6c6bdc…`）的 payload 相同项，理由记在 P2-12 的 [29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据)、[31](../../12/subtasks/31-hud-resource-gap.md#完成证据)，并经 [26](../../12/subtasks/26-final-alignment.md#第三次运行2026-10-08未通过源码结构的呈现约定表与-30-不一致) 接受 | `f925d21..HEAD` 没有构建或测试输入的变化（上文） | 按技术决定 4 的“只改文档”情形复用，不重判分类 | 05 确认身份未变 |
| 上述对照的会话（只用于 P2-12 的对照判定）：P2-12/15、21、23 的用户部分，28 的用户注明；21、29、30 的 agent 视觉对照 | 同上 | 同上 | 复用 | — |
| 产物出站 API 清单与来源/许可人工审阅 | [P2-12/11](../../12/subtasks/11-outbound-compliance-review.md#完成证据) 在 `2f9a8da`（`4d6c6bdc…`）上审阅；[29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据) 在 `02fd66f`（`ec5af1f5…`）上重跑扫描与定位器对照，结论不变。自 `e5383d8` 起，`pnpm-lock.yaml` 与 `.nvmrc` 未变；`package.json` 只有 `ff06c01` 给 lint 脚本加了缓存参数，依赖字段未变（P2-12/11 已记录） | `f925d21..HEAD` 没有构建输入与依赖文件的变化 | 预期可复用，须本轮确认 | **04**：本轮构建指纹等于 `ec5af1f5…f690`、依赖文件无变化，才沿用；否则按原契约重做 |
| P2-10 浏览器存储证据 | [P2-10/07](../../10/subtasks/07-final-alignment.md#完成证据)（`07d135d`，10-05） | `src/platform/storage/` 自 `07d135d` 只改了 2 个测试文件；之后 P2-11 新增的调用方由 P2-11、P2-12 的 E2E 覆盖 | 生产代码未变，仍适用 | **03**：本轮完整 E2E |
| P2-04 真实 Worker 证据 | [P2-04/12](../../04/subtasks/12-final-alignment.md#完成证据)（`685bb96`，10-05） | 此后 `import-job.ts`、`import-protocol.ts`、`import-host.ts`、`production-package.ts` 与 `src/app/import/` 随 P2-05 至 P2-11 改变（阶段、协议版本与包配置）。各任务都重跑了浏览器 Worker 用例，P2-12 在 `f925d21` 上连续两次 181 项通过 | P2-04 自身的证据已由后续 E2E 取代 | **03**：本轮的 `import-worker`、联合闭环与作业取消失败用例 |
| P2-11 自动用例 | [P2-11/20](../../11/subtasks/20-final-alignment.md#完成证据)（`cab90f2`，10-07，102 项） | 此后 `src/app`、`src/ui`、`src/render`、`src/platform` 只改了测试；生产变化在转换器与包配置（P2-06/21、P2-07 修订），由 P2-12 在 `f925d21` 上的 181 项覆盖 | 须本轮重跑 | **03**：三个项目的全部用例 |
| P2-11 AC-20 本地 Node 真实数据核对 | [P2-11/23](../../11/subtasks/23-local-real-data-import.md#完成证据)（`graphics-2…models-2`） | 转换输出已变 | 不再适用，已由 P2-12/12 的 `final-26b`（`f925d21`）取代 | **05** |
| P2-11 AC-21 用户实机核对 | [P2-11/19](../../11/subtasks/19-user-real-machine-check.md#完成证据)（10-07，`bb31160` 之后的 `graphics-2…models-2`，Chrome 154） | 见下表 | 试听沿用；其余受影响的部分须由用户在最终候选上重做 | 不由 03、04 补齐；见[问题 P-1](#问题ac-12) |

#### P2-11 AC-21 逐项

**差异范围：** `bb31160..97b70de` 没有生产代码改动，所以用户核对的内容与 P2-12/12 的旧候选 `97b70de` 相同。

`bb31160..f925d21` 中，名称不是测试的源文件改动有 19 个：18 个生产文件，加上只被测试与 test-support 导入的合成构建器 `src/original-data/synthetic.ts`。生产文件都在以下几处：

- `src/content/`：切片定义版本 3、状态显示屏文字 payload 与一个新错误码；
- `src/original-data/` 的转换、`formats/mesh.ts` 与来源映射；
- `src/workers/production-package.ts`：`ConverterVersion` 与份额，`assets` 202 → 218、`payloadBytes`、`imagePixels`。

`src/app`、`src/ui`、`src/render`、`src/platform`、`src/runtime` 与 `src/core` 只改了测试。内容上，6 个 model payload 改变，新增 10 个 Asset：9 个 SNIP 帧 image 与 1 个 DIAG `data`。其余 149 个 payload 指纹不变，包括全部 18 个 sound（[P2-12/29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据)）。来源指纹与生产目录不变。

**证据性质：** AC-21 是用户在真实界面上的手工核对；[P2-11 spec](../../11/spec.md#验收标准) 把它排除在 agent 浏览器验证与自动 E2E 之外。[P2-12 技术决定 8 的修订](../../12/spec.md#技术决定)只把视觉对照交给 agent，“导入与恢复、任务诊断、试听”仍由用户完成。本 spec 的技术决定 4 与验证策略也规定，受影响的 AC-21 部分由用户重做。

因此，P2-12/29、30 中 agent 的真实导入只为视觉对照准备查看器，在本表中只作旁证：它们说明最终构建上的这些路径能走通，但不代替用户的核对。这两次会话由 agent 用自己的 Playwright 浏览器（独立 profile）在本机完成，29 记为 Chrome，30 记为 Chromium。

| AC-21 项 | 是否受影响 | 旁证（不代替用户核对） | 结论 |
|---|---|---|---|
| 识别出版本；依次出现“完整资源可查看”“已保存在本浏览器”“任务可载入 Core” | 受影响：导入路径中的转换输出与预期包配置改变；界面与状态推导代码未变 | P2-12/29（`02fd66f`）与 30（同一构建 `ec5af1f5…`）中，agent 在本地生产预览（带 CSP）中经真实生产 Worker 导入光盘：四组完整、已保存、任务可载入，页面显示的身份等于新候选（[29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据)、[30](../../12/subtasks/30-deferred-recaptures.md#完成证据)）。Node 的 `final-26b`（`f925d21`）核对了版本 ID、四组完整与 `loadMission` | 须由用户重做（P-1） |
| 刷新后从缓存恢复成功，任务再次可载入 | 受影响：恢复的内容与恢复时的筛选条件（包配置、`cockpit-hud-map` 组新增 `data`）改变；`src/platform/storage` 与 `src/app/resources` 未改 | 29 在新构建上同源刷新后恢复并校验成功（32 ms），查看器显示的 manifest 与转换器版本等于新候选（被忽略的 `local/research/p2-12/recheck/record.md`）。该记录没有写出恢复后的任务状态；导入与恢复都经 [resource-holder.ts](../../../../../src/app/resources/resource-holder.ts) 的 `#replace` 调用同一 `diagnoseMission`。P2-12/21 的用户会话只在旧候选上确认过恢复后任务可载入 | 须由用户重做（P-1） |
| 查看器：玩家、敌机、基地模型，三种效果，每类图像、调色板、两个布局、全部字库都至少打开一项，没有错误 | 部分受影响：6 个模型 Asset（含 `model/debris`）的 payload 改变；新增 9 个 SNIP 帧（`hud-mfd`，既有 image schema）。DIAG 不是查看项。三种效果、调色板、布局、字库与原有图像的 payload 都不变，查看器代码未变 | 模型：29 在新构建中打开 4 个机型的列表 0、僚机列表 0 与玩家列表 1，30 在同一构建上打开各列表 1 与效果。SNIP 帧：P2-12/31 经应用的查看器消费者（`viewerCatalog` 与 `resolveEntry`，Node）解码，9/9 画面等于独立读取；`final-31` 中查看器解码 143 个、未解码 0。会话记录中没有应用错误；29 中一次画布空白由 agent 自己经 CDP 改设备像素比引起，已撤销且未用于判定 | 不受影响的类别沿用 P2-11/19；模型与 SNIP 帧须由用户重做（P-1） |
| 开火、导弹、爆炸、Warp 都能听到，停止按钮有效，返回菜单后声音停止 | 不受影响：18 个 sound payload、音频转换（`audio-1`）、`src/platform/audio` 与界面都未变 | 另有 P2-12/21（同为旧 payload）的 12 项用户试听与 [28](../../12/subtasks/28-a1-original-comparison.md#完成证据) 的原版直接对照 | 沿用 P2-11/19，不需重做 |
| 页面显示的作业、提交与恢复耗时 | 数值受影响（包增至 165 个 Asset）；显示代码未变 | 29 的页面值：作业 264 ms、保存 35 ms、恢复并校验 32 ms；30：作业 279 ms、保存 29 ms | 须由用户在重做时记录（P-1） |

### 问题（AC-12）

**P-1：P2-11 AC-21 中受影响的部分没有最终候选上的用户核对。**

- **受影响的退出条件与覆盖行：**
  - 退出条件第 1 项（P2-11 的实际资源预览）与第 2 项（真实界面导入与恢复后的任务诊断）；
  - 覆盖表第 7 行（模型实际预览）、第 8 行（新增 SNIP 帧的实际显示）、第 12 行（同源刷新恢复）、第 13 行（查看器实际消费）。
- **原责任：** P2-11（[AC-21](../../11/spec.md#验收标准)，[子任务 19](../../11/subtasks/19-user-real-machine-check.md#完成证据)）。
- **原因：**
  - 用户的核对在 `graphics-2…models-2` 上完成。之后，经批准的 P2-06/21 与 P2-07 修订改变了 6 个 model payload，新增 10 个 Asset，并改变了预期包配置。
  - 后续在最终构建上的真实导入、恢复与查看只有 agent 的会话。按上述契约，它们不能代替用户的核对。
  - 03 的 E2E 只用合成数据，也不能代替。
- **恢复条件：** 协调者新增一个需用户的复核子任务（本项不执行）。用户在最终候选上按[本地导入指南的实机核对](../../../../guides/local-import.md#用户实机核对)重做以下各项；最终候选以 05 记录的提交、构建指纹（预期 `ec5af1f5…f690`）与 `ContentIdentity` 为准，用本地生产预览（带拟定 CSP）与 Chrome。
  1. 经真实界面导入自己的光盘：识别出版本，依次出现三种状态；
  2. 刷新后从缓存恢复成功，任务再次可载入；
  3. 在查看器中打开玩家、一种敌机与基地模型，以及至少一个 SNIP 帧，没有错误；
  4. 记录页面显示的作业、保存与恢复耗时、Chrome 版本与日期。

  试听与其余查看类别不需重做。复核只依赖候选身份，不依赖 02–05 的其他结果。若之后有修复改变了生产输出，须在新的候选上重做。

**其他：** 没有发现批准、tracker 或最终对齐的不一致。其他需要补齐的类别都已分配给 03、04、05，属于本 goal 的正常检查。

以下非阻塞观察交 07 参考，不改写其他任务的历史记录：

- **措辞残留：** P2-01 与 P2-06 的 spec 审批中，2026-10-06 修订的标题仍带“待批准”，但同一条记录写明用户已于当日批准，front matter 为 `accepted`。批准状态没有歧义。
- **勾选框：** P2-12 的 [17](../../12/subtasks/17-hud-texture-coverage.md#验收标准) 保留 1 个、[21](../../12/subtasks/21-user-comparison-session.md#验收标准) 保留 2 个未勾选项，是它们完成时的实际状态。这些项由补救子任务 28、29、30、31 与用户批准的范围例外关闭，[26](../../12/subtasks/26-final-alignment.md#第二次运行2026-10-08未通过残余项待用户决定) 逐项引用（28 写明 21 的 AC-18 由它补记）。不是缺失的证据。
- **最终对齐的表述：** P2-05、P2-06、P2-07、P2-11 的最终对齐没有单独的“结论：通过”一行，以全部验收勾选、逐项覆盖与检查通过表述完成；其余 8 项写明“通过”。
- **`reviewed:` 标记：** 除 P2-08、P2-10 外，P2 各 spec 的 `reviewed:` 与当前内容不符。这是批准记录在审阅之后写入所致，路由只在 spec 为 `draft` 时使用该标记，对 `accepted` 的 spec 没有影响。P2-07/17 提到的重新标记不是本任务的前提。
- **P2-11 的候选：** P2-11 的最终对齐（10-07）早于 P2-06/21 与 P2-07 的 10-08 修订，其 AC-20、AC-21 对应旧候选。AC-20 已由 P2-12/12 与本轮 05 取代；AC-21 见 P-1。

### 审阅、检查与文档影响

- **检查：** 本文件 157 个相对链接与锚点检查无误（P2-12/27 的本地 `links.py`）；`git diff --check` 通过。证据中只有提交、哈希、计数、ID 与判定，没有原版内容或主机私有路径。
- **Rubber-duck：** 1 项阻塞、2 项非阻塞，全部采纳。
  - **阻塞：** 初稿把 P2-12/29、30 的 agent 会话当作 AC-21 受影响部分的后续有效证据，并据此认为不需用户复核。这与 P2-11 AC-21 的用户手工性质、P2-12 技术决定 8 的修订（导入与恢复、任务诊断仍归用户）及本 spec 的技术决定 4 冲突。已改为旁证，并记为 P-1。
  - **非阻塞：** 依赖文件的历史说法改为准确的 `ff06c01` 例外；“19 个生产文件”改为 18 个生产文件加 1 个合成构建器。
- **Simplify：** 本项只改文档，没有实现代码，不需要。
- **文档影响：** 本项只记录候选、映射与适用性。工程约定、指南、原版事实与未知项都不受影响：本地导入指南的实机核对清单已能直接用于 P-1 的复核。STATUS、阶段索引与 goal 归协调者，建议见 worker 报告。
