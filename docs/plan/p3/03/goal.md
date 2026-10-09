---
type: plan
status: accepted
phase: P3
task: "03"
updated: 2026-10-09
related: [ADR-0014, ADR-0015, ADR-0017, U-001, U-004, U-018, U-022, U-027, U-028, U-030]
---

# P3-03：规则数据与补充内容导入 — Goal

## 目标与来源

交付用户于 2026-10-09 批准的 [spec](./spec.md) 的 S-01 至 S-17、AC-01 至 AC-21：

- 研究 18 个导入项的结构，事实写入 `docs/original/`（01–05）；
- 为这些数据提供规范 payload、解析器与转换步骤（06–18）；
- 把它们装配成按切片定义版本 4 判为 `complete` 的生产包，递增转换器版本（19）；
- 浏览器、本地基准与文档的核对（20–22），最后做最终对齐（23）。

本文件不重新定义行为契约。

## 代码现状与前提

- **包与身份：**
  - [slice-definition.ts](../../../../src/content/slice-definition.ts) 为版本 3、15 个必需角色。
  - 四个转换器组件在 [convert-graphics.ts](../../../../src/original-data/conversion/convert-graphics.ts)、[convert-logic.ts](../../../../src/original-data/conversion/convert-logic.ts)、[audio-conversion.ts](../../../../src/original-data/conversion/audio-conversion.ts) 与 [convert-models.ts](../../../../src/original-data/conversion/convert-models.ts) 中，由 [converter-version.ts](../../../../src/original-data/conversion/converter-version.ts) 拼成 `osr-import.graphics-3.logic-1.audio-1.models-3`。
  - 完整版本字串还写在 [production-package.ts](../../../../src/workers/production-package.ts) 与六个测试中：`converter-version.test.ts`、`import-job.test.ts`、`import-pipeline.test.ts`、`convert-models.test.ts`、`audio-conversion.test.ts`，以及 `e2e/import-worker.spec.ts`。
  - [import-job.ts](../../../../src/workers/import-job.ts) 依次运行图形、逻辑、音频、模型与效果步骤，由 `applyManifestIdentity` 写入包身份；每个组只能有一份草稿。
- **任务数据：** [scen.ts](../../../../src/original-data/formats/scen.ts) 与 [object-record.ts](../../../../src/original-data/formats/object-record.ts) 只核对 +0x54 指向段 2 的第一个元素且没有生成配对。[logic-content.ts](../../../../src/content/logic/logic-content.ts) 的 payload schema 为 1，规范 ASCII JSON 的编解码在 [logic-payload.ts](../../../../src/content/logic/logic-payload.ts) 中，只服务 `LogicPayload`。[load-mission.ts](../../../../src/core/mission/load-mission.ts) 用展开复制声明。
- **图形与效果：** [source-graphics.ts](../../../../src/original-data/conversion/source-graphics.ts) 的 `readImageRecordHeader` 对编码 1 报 `unsupported-encoding`。[graphics-step.ts](../../../../src/original-data/conversion/graphics-step.ts) 按条目类型与子资源选择来源种类：data 只支持 DIAG。[effect-step.ts](../../../../src/original-data/conversion/effect-step.ts) 读取 RENS 记录与 EXE 区域；[production-executable.ts](../../../../src/original-data/conversion/production-executable.ts) 把文档地址转成区域 locator。
- **错误与协议：** [source-error.ts](../../../../src/original-data/source-error.ts) 的 `SourceLimitName` 与 [contract-validation.ts](../../../../src/content/contract-validation.ts) 的错误码都是封闭集合，[import-protocol.test.ts](../../../../src/workers/import-protocol.test.ts) 逐项列举它们。
- **合成数据：**
  - [formats.test-support.ts](../../../../src/original-data/formats/formats.test-support.ts)：SCEN、SCCT 与 M2ID；
  - [synthetic-content.test-support.ts](../../../../src/content/synthetic-content.test-support.ts)：合成内容包；
  - [synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts)：生产作业的合成光盘与白名单；
  - [e2e/support/](../../../../e2e/support/)：浏览器夹具。
- **计划新增：**
  - **content：** `src/content/canonical-json.ts`、`src/content/rule-data/`、`src/content/flight/`、`src/content/hud/view-labels-payload.ts`；
  - **original-data/formats：** `craft.ts`、`debris.ts`、`ai.ts`、`comm.ts`、`base-repair.ts`、`executable-text.ts`、`rens-header.ts`、`view-labels.ts`、`anim.ts`、`explosion.ts`；
  - **original-data/conversion：** `convert-rule-data.ts`、`production-rule-data.ts`、`production-flight-graphics.ts`、`flight-data-step.ts`、`production-flight-data.ts`、`production-flight-sounds.ts`；
  - **tools：** `tools/package-check.ts`；
  - **格式文档：** `docs/original/formats/craft.md`、`ai.md`、`comm.md`；
  - **本地研究：** 被忽略的 `local/research/p3-03/<主题>/`。

  各文件都附同目录的测试与测试支持。
- **装配顺序：** 06–18 只提供能力与生产表，生产作业的输出不受影响。只有 07 改变 logic 组的任务 payload，因为任务内容的形状随段 2 改变。新增 Asset 的接线、切片定义版本 4、各转换器组件的递增、份额与生产包配置，都集中在 19 一次完成。中间提交不对外发布，也不宣称缓存兼容。
- **文档归属：** 模块分册、源码结构、导入指南、文档地图与 U 项由 22 统一同步；工具用法与 `AGENTS.md` 由 21 更新。各实现行在完成证据中列出接口变化，交给 22；不在本行的写入范围内修改这些文档。
- **环境（起草时核对）：**
  - 本 worktree 没有 `local/` 与 `node_modules/`。执行前，协调者按[并行执行](../../../engineering/agent-workflow.md#并行执行)的环境约定链接主仓库的 `local/`，并运行 `pnpm install --frozen-lockfile`；worker 同样如此。缺少 `local/` 时，需要原版数据的行（01–05、19 的份额推导、21）记为 blocked。
  - Ghidra 静态分析一律 `-noanalysis -readOnly`。并行的研究行各自在自己的 `local/research/p3-03/<主题>/` 中使用项目的私有只读副本，避免项目锁冲突；不 `-overwrite`。
- **跨任务前提：** [P3-01](../01/goal.md) 已完成，其[数据闭包决定表](../01/subtasks/10-data-closure.md#决定表)是导入范围；[P2 退出评审](../../../reviews/P2-exit.md)为 accepted。按[阶段索引](../tasks.md#推荐执行顺序)，P3-02 可以并行。它也可能修改 `src/core/`；07 对 `src/core/mission/` 只做事件透传，两条分支的合并由用户决定。

### 原版证据

全部由 agent 按[原版证据获取](../../../guides/original-evidence.md)自行取得：已有记录、本地数据、只读 Ghidra，以及本地截图或参考视频（单凭视频最高为高概率）。本任务不需要基准运行，也不需要用户操作。研究若触发 spec 的[研究门槛](./spec.md#研究门槛与阻塞)，该行记为 blocked，写明受影响的 AC 与恢复条件；不以合成值、临时资源、近似规则或硬编码补齐。需要基准运行时，按门槛请用户操作，并写明为什么静态证据不足。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01–05 | 01–05：格式文档的结构、类型证据与观测值；22：U 项；23：门槛逐项满足或已按 spec 阻塞 |
| S-02 | 01、07 | 07：合成段 2 的转换、拒绝与 Core 透传；19：生产作业中的任务 payload |
| S-03 | 02、08、10、15 | 10：解析与选择；15：映射与 ID 链；19：装配 |
| S-04 | 02、08、10、15 | 同 S-03 |
| S-05 | 03、08、11、15 | 11：组 0 闭包与不透明代码标识；15：ID 链；19：装配 |
| S-06 | 04、08、12、15 | 12：菜单解析；15：转换；19：装配 |
| S-07 | 04、08、12、15 | 12：选择值与值域；15：子资源映射；19：装配 |
| S-08 | 04、08、09、12、13、15、16 | 12：EXE 字串；13：视角标签；15、16：转换；19：装配 |
| S-09 | 04、05、09、13、16、17 | 13：RENS 头部；16：TEX 11069；17：场景设置；19：装配 |
| S-10 | 05、09、14、16、17 | 14：编码 1 解码；16：帧图像；17：爆炸表与动画；21：全部 186 帧 |
| S-11 | 05、09、16、17 | 16：BITM 图像；17：星云列表与 ID 链 |
| S-12 | 05、16 | 16：TEX 11089 的图像与调色板 |
| S-13 | 18、19 | 18：角色与 Asset ID 规则；19：并入音频表 |
| S-14 | 06、15–17、19 | 19：切片定义版本 4、接线、份额、组件与包身份；23：复核 |
| S-15 | 07–19 | 各行的合成样本测试；19：合成内容包与合成导入；20：浏览器回归 |
| S-16 | 21 | 21：本地 CLI、nob-check、独立读取与外观核对 |
| S-17 | 21、22 | 21：工具用法与 `AGENTS.md`；22：分册、目录树、指南、文档地图；23：链接检查 |
| AC-01 | 01–05、22 | 01–05：结构、类型、计数、引用、变换、文字规则与零值位置；14：ANIM 解码按代码确认的规则实现；22：U 项；23：文档无原版内容 |
| AC-02 | 07 | 07：段 2 的正向与拒绝表驱动测试，`loadMission` 透传、冻结与确定性 |
| AC-03 | 10、15 | 10：TABL 4003 的选择与 CINF 记录；15：`subresource-mismatch` 与越界拒绝 |
| AC-04 | 10、15 | 10：20 组记录、嵌套数组与 +0x0C 不转换；15：转换 |
| AC-05 | 11、15 | 11：程序表、`entries`、代码标识与组 0 三元组；15：多出或缺少条目时报 `subresource-mismatch` |
| AC-06 | 12、13、15、16 | 12、13：解析与拒绝；15、16：只含本任务的部分 |
| AC-07 | 13、16、17 | 13：RENS 头部字段；16：两个 TEX；17：`data/projectile-visuals` 不变 |
| AC-08 | 14、16、17 | 14：合成编码与解码逐像素相等，覆盖全部分支与拒绝；16：帧图像；17：爆炸表与 ID 链 |
| AC-09 | 16、17 | 16：BITM 图像绑定 `palette/flight/models`；17：顺序与 ID 链 |
| AC-10 | 18、19 | 18：11 个 sound Asset 与唯一性；19：既有 18 个声音的 ID、角色与字节不变 |
| AC-11 | 07、08、09 | 07–09：各 payload 族的往返、拒绝与隔离测试 |
| AC-12 | 19 | 19：版本 4 完整、逐一缺少角色时不完整、版本 3 报 `definition-version-mismatch`；工程边界回归 |
| AC-13 | 15–18 | 15–17：子资源部件只在解析后才为 `verified`，四条 ID 链；18：音频映射 |
| AC-14 | 06、08–17、19 | 06：限值名；08–14：结构限值恰等于上限通过、超出 1 拒绝；15–17：份额计量；19：份额推导与 `PRODUCTION_PACKAGE`；22：记录 |
| AC-15 | 19、20 | 19：组件递增、旧版本记录为 `cache-incompatible`、版本 4 提交与恢复（Node）；20：`resource-cache`、`cache-recovery` |
| AC-16 | 19 | 19：生产作业的四组结果、读取日志、失败不发送组、协议与回归 |
| AC-17 | 20 | 20：E2E 与 browser-testing 的画面与声音核对 |
| AC-18 | 06–21 | 各行的边界与诊断测试；23：边界回归、ESLint、代码审阅与 `pnpm check:original` |
| AC-19 | 21 | 21：本地 CLI、nob-check、独立读取与外观核对，输出只在 `local/` |
| AC-20 | 21、22 | 21：工具用法与 `AGENTS.md`；22：S-17 的其余文档；23：`updated:`、链接与锚点 |
| AC-21 | 19–23 | 23：`pnpm check` 与 `pnpm test:e2e` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-scen-event-research.md](./subtasks/01-scen-event-research.md) | — | pending |
| [02-craft-debris-research.md](./subtasks/02-craft-debris-research.md) | — | pending |
| [03-ai-data-research.md](./subtasks/03-ai-data-research.md) | — | pending |
| [04-comm-hud-text-research.md](./subtasks/04-comm-hud-text-research.md) | — | pending |
| [05-image-research.md](./subtasks/05-image-research.md) | — | pending |
| [06-shared-contract-foundation.md](./subtasks/06-shared-contract-foundation.md) | 01, 02, 03, 04, 05 | pending |
| [07-mission-events.md](./subtasks/07-mission-events.md) | 01, 06 | pending |
| [08-rule-data-payloads.md](./subtasks/08-rule-data-payloads.md) | 02, 03, 04, 06 | pending |
| [09-flight-data-payloads.md](./subtasks/09-flight-data-payloads.md) | 04, 05, 06 | pending |
| [10-craft-debris-parsers.md](./subtasks/10-craft-debris-parsers.md) | 08 | pending |
| [11-ai-parsers.md](./subtasks/11-ai-parsers.md) | 08 | pending |
| [12-comm-text-parsers.md](./subtasks/12-comm-text-parsers.md) | 08 | pending |
| [13-scene-label-parsers.md](./subtasks/13-scene-label-parsers.md) | 09 | pending |
| [14-anim-explosion-parsers.md](./subtasks/14-anim-explosion-parsers.md) | 09 | pending |
| [15-rule-data-conversion.md](./subtasks/15-rule-data-conversion.md) | 10, 11, 12 | pending |
| [16-flight-graphics.md](./subtasks/16-flight-graphics.md) | 13, 14 | pending |
| [17-flight-data-step.md](./subtasks/17-flight-data-step.md) | 16 | pending |
| [18-event-hud-sounds.md](./subtasks/18-event-hud-sounds.md) | — | pending |
| [19-package-integration.md](./subtasks/19-package-integration.md) | 07, 15, 17, 18 | pending |
| [20-browser-verification.md](./subtasks/20-browser-verification.md) | 19 | pending |
| [21-local-check-tools.md](./subtasks/21-local-check-tools.md) | 19 | pending |
| [22-docs-sync.md](./subtasks/22-docs-sync.md) | 20, 21 | pending |
| [23-final-alignment.md](./subtasks/23-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

## 审批

用户于 2026-10-09 明确批准本 goal（“approve the goal and commit”）。批准范围为 23 个子任务的拆分、依赖、执行方式与写入范围，以及验收覆盖表；跟踪表全部为 `pending`。

本次只记录批准，不代表实现完成，也不替代 spec 的批准；执行仍须由 execute-goal 进行。
