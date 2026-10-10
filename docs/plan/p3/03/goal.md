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
| S-08 | 04、08、09、12、13、15、16、24、25、26 | 12：EXE 字串；13：视角标签；15、16：转换；19：装配；24：#47 研究；25：`hud-text` 契约；26：HUD 文字的转换与装配 |
| S-09 | 04、05、09、13、16、17 | 13：RENS 头部；16：TEX 11069；17：场景设置；19：装配 |
| S-10 | 05、09、14、16、17 | 14：编码 1 解码；16：帧图像；17：爆炸表与动画；21：全部 186 帧 |
| S-11 | 05、09、16、17 | 16：BITM 图像；17：星云列表与 ID 链 |
| S-12 | 05、16 | 16：TEX 11089 的图像与调色板 |
| S-13 | 18、19、27 | 18：角色与 Asset ID 规则；19：并入音频表；27：sound payload schema 2 与重复播放 |
| S-14 | 06、15–17、19、26 | 19：切片定义版本 4、接线、份额、组件与包身份；26：`hud-text` 角色与份额；23：复核 |
| S-15 | 07–19、25–27 | 各行的合成样本测试；19：合成内容包与合成导入；26、27：合成 HUD 文字与 `repeat` 声音；20：浏览器回归 |
| S-16 | 21 | 21：本地 CLI、nob-check、独立读取与外观核对 |
| S-17 | 21、22 | 21：工具用法与 `AGENTS.md`；22：分册、目录树、指南、文档地图；23：链接检查 |
| AC-01 | 01–05、22、24 | 01–05、24：结构、类型、计数、引用、变换、文字规则与零值位置；14：ANIM 解码按代码确认的规则实现；22：U 项；23：文档无原版内容；门槛条款由 spec 修订 1 的批准满足 |
| AC-02 | 07 | 07：段 2 的正向与拒绝表驱动测试，`loadMission` 透传、冻结与确定性 |
| AC-03 | 10、15 | 10：TABL 4003 的选择与 CINF 记录；15：`subresource-mismatch` 与越界拒绝 |
| AC-04 | 10、15 | 10：20 组记录、嵌套数组与 +0x0C 不转换；15：转换 |
| AC-05 | 11、15 | 11：程序表、`entries`、代码标识与组 0 三元组；15：多出或缺少条目时报 `subresource-mismatch` |
| AC-06 | 12、13、15、16、25、26 | 12、13：解析与拒绝；15、16：只含本任务的部分；25：HUD 文字的键集与格式常量；26：64 条的转换与拒绝 |
| AC-07 | 13、16、17 | 13：RENS 头部字段；16：两个 TEX；17：`data/projectile-visuals` 不变 |
| AC-08 | 14、16、17 | 14：合成编码与解码逐像素相等，覆盖全部分支与拒绝；16：帧图像；17：爆炸表与 ID 链 |
| AC-09 | 16、17 | 16：BITM 图像绑定 `palette/flight/models`；17：顺序与 ID 链 |
| AC-10 | 18、19、27 | 18：11 个 sound Asset 与唯一性；19：既有 18 个声音的 ID、角色与字节不变；27：`flags` 8 为 `repeat`、既有字节不变与重复播放 |
| AC-11 | 07、08、09、25、27 | 07–09、25：各 payload 族的往返、拒绝与隔离测试；27：sound payload schema 2 |
| AC-12 | 19、26 | 19：版本 4 完整、逐一缺少角色时不完整、版本 3 报 `definition-version-mismatch`；工程边界回归；26：`hud-text` |
| AC-13 | 15–18、26 | 15–17：子资源部件只在解析后才为 `verified`，四条 ID 链；18：音频映射；26：HUD 文字的 64 个区域 |
| AC-14 | 06、08–17、19、25、26 | 06：限值名；08–14、25：结构限值恰等于上限通过、超出 1 拒绝；15–17：份额计量；19、26：份额推导与 `PRODUCTION_PACKAGE`；22：记录 |
| AC-15 | 19、20、27 | 19：组件递增、旧版本记录为 `cache-incompatible`、版本 4 提交与恢复（Node）；27：schema 1 的声音不再恢复；20：`resource-cache`、`cache-recovery` |
| AC-16 | 19、26 | 19：生产作业的四组结果、读取日志、失败不发送组、协议与回归；26：读取日志含 HUD 文字区域 |
| AC-17 | 20、27 | 20：E2E 与 browser-testing 的画面与声音核对，含 `repeat` 声音；27：合成 `repeat` 声音 |
| AC-18 | 06–21、25–27 | 各行的边界与诊断测试；23：边界回归、ESLint、代码审阅与 `pnpm check:original` |
| AC-19 | 21 | 21：本地 CLI、nob-check、独立读取与外观核对，输出只在 `local/` |
| AC-20 | 21、22 | 21：工具用法与 `AGENTS.md`；22：S-17 的其余文档与 audio 的 `flags` 8；23：`updated:`、链接与锚点 |
| AC-21 | 19–23 | 23：`pnpm check` 与 `pnpm test:e2e` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-scen-event-research.md](./subtasks/01-scen-event-research.md) | — | completed |
| [02-craft-debris-research.md](./subtasks/02-craft-debris-research.md) | — | completed |
| [03-ai-data-research.md](./subtasks/03-ai-data-research.md) | — | completed |
| [04-comm-hud-text-research.md](./subtasks/04-comm-hud-text-research.md) | — | completed |
| [05-image-research.md](./subtasks/05-image-research.md) | — | completed |
| [06-shared-contract-foundation.md](./subtasks/06-shared-contract-foundation.md) | 01, 02, 03, 04, 05 | completed |
| [07-mission-events.md](./subtasks/07-mission-events.md) | 01, 06 | completed |
| [08-rule-data-payloads.md](./subtasks/08-rule-data-payloads.md) | 02, 03, 04, 06 | completed |
| [09-flight-data-payloads.md](./subtasks/09-flight-data-payloads.md) | 04, 05, 06 | completed |
| [10-craft-debris-parsers.md](./subtasks/10-craft-debris-parsers.md) | 08 | completed |
| [11-ai-parsers.md](./subtasks/11-ai-parsers.md) | 08 | completed |
| [12-comm-text-parsers.md](./subtasks/12-comm-text-parsers.md) | 08 | completed |
| [13-scene-label-parsers.md](./subtasks/13-scene-label-parsers.md) | 09 | completed |
| [14-anim-explosion-parsers.md](./subtasks/14-anim-explosion-parsers.md) | 09 | completed |
| [15-rule-data-conversion.md](./subtasks/15-rule-data-conversion.md) | 10, 11, 12 | completed |
| [16-flight-graphics.md](./subtasks/16-flight-graphics.md) | 13, 14 | completed |
| [17-flight-data-step.md](./subtasks/17-flight-data-step.md) | 16 | completed |
| [18-event-hud-sounds.md](./subtasks/18-event-hud-sounds.md) | — | completed |
| [19-package-integration.md](./subtasks/19-package-integration.md) | 07, 15, 17, 18 | completed |
| [20-browser-verification.md](./subtasks/20-browser-verification.md) | 19, 26, 27 | in-progress |
| [21-local-check-tools.md](./subtasks/21-local-check-tools.md) | 19, 26, 27 | in-progress |
| [22-docs-sync.md](./subtasks/22-docs-sync.md) | 20, 21, 25, 26, 27 | pending |
| [24-hud-exe-text-research.md](./subtasks/24-hud-exe-text-research.md) | — | completed |
| [25-hud-text-payload.md](./subtasks/25-hud-text-payload.md) | 06, 09, 24 | completed |
| [26-hud-text-assembly.md](./subtasks/26-hud-text-assembly.md) | 25, 27 | completed |
| [27-sound-repeat.md](./subtasks/27-sound-repeat.md) | 19 | completed |
| [23-final-alignment.md](./subtasks/23-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-09 — 并行执行安排：** 协调者在 `p3-03-rule-data-spec` 分支上执行，同时运行的 worker 不超过 3 个（默认）。沿用 P3-01 的宿主做法：worker 在应用管理的 worktree 中运行（以认领提交为基），分支改名为 `exec-p3-03-NN` 作为认领标记；主仓库的 `local` 以符号链接接入，研究输出只写入本行自己的 `local/research/p3-03/<主题>/`，其余位置只读。本任务不运行原版；Ghidra 只读，必要时使用本行范围内的私有副本。
- **2026-10-09 — 01 完成（交 07、22 的要点）：** 段 2 只由 28 字节的事件触发组成，全部 59 个都被 +0x54 引用；三个运行时计数在任务构建时（`0x66c00`→`0x694f8`→`0x6953c`）调度之前被重置，07 不转换也不检查它们；生成配对（+0x14/+0x18）只在运行时由记录 +0x30/+0x38 建立，存储值只能为零，07 保留 `object-record.ts` 对 +0x30/+0x38 非零的拒绝。区间为 i32 下界、i32 上界、指向计数的消息指针数组（数量为 0 时为空指针）、i32 数量、8 位选择值与 3 个未读字节，观测值见 [scenario](../../../original/formats/scenario.md#section-2-event-triggers-p3-03)。交 22：U-022 的线索（+0x30/+0x38 已确认为生成配对的触发指针与区间序号；段 2 文字是成功后总结页按区间拼接的文字，不是任务中的消息；段 2 路径由数据驱动），U-002 中“任务内文字”的措辞，以及 [executable 任务结果](../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)第 2 步对 `0x69a70` 的描述（按 4 字节步长读取前若干个计数字）的更正。
- **2026-10-09 — 03 完成；AICO 6001 的导入范围（协调者判定，待用户复核）：** 03 发现闭环除组 0 三元组外，还在组 0 中读取 AICO 6001 的头部 +0x08…+0x48 与 +0x18 所指的 5 × 16 字节 `f32` 数组（[ai §2](../../../original/formats/ai.md)），认为 S-05、Asset 表与 `ai-programs` 只列三元组，触发研究门槛 3。用户当时无法回答（“Work autonomously and make good decisions”）。协调者判定门槛 3 未触发，不修订 spec：spec 规定导入范围以 P3-01 数据闭包为准，闭包 [#22](../01/subtasks/10-data-closure.md#决定表) 把 AICO 6001 整个条目列为导入；字段处理规则 7 规定按难度组的选择只取所选部分，整条目载入的结构按条目完整导入。因此 `ai-programs` 导入闭环读取的 AICO 6001 全部字段：按组 0 选出的三元组、头部字段与该数组（数量字按布局核对）；S-05 与 payload 表中的“组 0 三元组”是不完整的列举，不是范围限制。闭包没有新增依赖，不必向 P3-01 追加。用户可在复核时改为只取三元组并拆出后续任务。交 08、11、15：内置表 `0x1762f8` 的区域带 20 个 LE fixup（+0x00 指向对象 4 中的 10 个名称字串，+0x18 指向对象 2 的处理程序），现有区域读取器拒绝被 fixup 修补的区域，11 派发时加入 `le-executable.ts` 的写入范围。交 22：文档地图链接 ai.md；executable 的 AISTUFF 闭包一段对 AICO 的描述与其 Limits 中解释器未追踪的说法已被 ai §1、§5 取代；imfat §5 的 DFPG/AICO 行改为结构已确认并链接 ai.md；U-001、U-022 的线索见 03 的完成证据。
- **2026-10-09 — 02 完成（交 06、08、10、22 的要点）：** 没有触发研究门槛：CINF 4037 与 DEBRIS 4501 的每个非零位置都有存储类型（多数由原生访问确认，少数由 24 个 CINF 的数据为高概率），见 [craft](../../../original/formats/craft.md)。只以与符号无关的方式使用的整数字段记为 int32，只转换 0…2³¹−1，最高位为 1 时为 `unsupported-payload`。弹体记录与机型记录共用 236 字节布局（只有 6 个位置非零，指针与数量必须为零）；机型 +0x10 与 DEBRIS +0x18 共用一种 68 字节的碰撞形状布局。任何 `f32` 位置都没有 −0、NaN 或无穷大，唯一的次正规数是导弹 +0x40（每个 CINF 一条），规范 JSON 须逐位保留。载入变换用到 EXE 数据对象中的 5 个常量（归代码规则，见 craft §5），炮挂点的调整读取 RENS 10751 的记录长度（已作为 `data/projectile-visuals` 交付）。spec `debris-parameters` 一行把 +0x0C 写作“归一化取反副本”：原生代码在 +0x0C 存归一化、未取反的副本，并就地对 +0x00…+0x08 取反；两者都属规则 5 的算术派生，处理不变（+0x0C 不转换，取反由消费者实现），只是措辞不准，spec 未改。交 22：executable 数据闭包一节中 DEBRIS 的同一处措辞与“武器记录”中 `0x2cf38` 改写的派生字段（炮 +0x0C/+0x10、导弹 +0x08/+0x0C/+0x10/+0x2C/+0x50、机型 +0x14 与条件边界、炮挂点 +0x08 的调整）的更正，以及链接 craft.md；imfat §5 的 CINF 行与 §7 引用列表、文档地图；U-001、U-008、U-026、U-027 的线索见 02 的完成证据。
- **2026-10-09 — 04 完成（交 12、22 的要点）：** 没有触发研究门槛，每个非零位置都有已确认的存储类型，见 [comm](../../../original/formats/comm.md)、[hud](../../../original/formats/hud.md#2-tabl-entries-in-srnob-contents-likely) 与 [executable](../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)。TABL 10165 +0x6C 的值域按代码为 0–31 加上 33、34（观测值都在闭包的 {0–9, 33, 34} 内）；按 spec“值域按格式文档记录的值域核对”，12 以代码接受的值域核对，之外为 `unsupported-payload`。交 22：文档地图与 imfat §5 链接 comm.md；U-001、U-027、U-028、U-030 的线索见 04 的完成证据。01 交给 22 的“任务结果”第 2 步未动。
- **2026-10-09 — 新增 24：HUD 直接绘制的 EXE 文字（研究门槛 3，待用户决定）：** 04 发现 HUD、通讯与地图代码不经 `0x4e9e8`，直接绘制 EXE 中的文字常量（通讯面板标题、飞行叠加与地图、仪表上的若干字串，以及属 G-05 的基地内部），闭包 #30 只列出经 `0x4e9e8` 的 7 条。原版文字不能硬编码（P3-13 的“文字来自 Core 与导入内容”），因此闭环依赖闭包未列出的数据，触发研究门槛 3。用户当时无法回答。按门槛的步骤，协调者新增研究子任务 24：有界追踪这些绘制点，把事实追加到 executable 与 P3-01/10 的交接记录，并给出建议的 spec 修订；24 不依赖其他行，最终对齐加入对 24 的依赖。spec 未改。导入这些字串须由用户批准 spec 修订后再新增修复子任务；在此之前，AC-01 的“若触发研究门槛，修订已获批准”未满足，最终对齐会因此停下等待用户决定。其余子任务按已批准的范围继续。
- **2026-10-09 — 05 完成；TEX 11069 的表示（协调者判定，待用户复核）：** 研究门槛 2 未触发：图像编码 1 由 `0x58d64` 确认（含每个分支），全部 186 帧按该规则恰好用尽数据；帧没有自带调色板，在 DATA 下直接显示，透明为跳过的行段，行序自上而下，不是帧间增量（均已确认）。因此帧图像复用 `palette/flight/models`、显示方式为 direct，不产生 `palette/explosion/<nn>`。TEX 11089 的调色板与 DATA 的全部 256 项相同，映射不变；星云 BITM 在 DATA 下直接显示（已确认，代码）。见 [textures](../../../original/formats/textures.md)。05 另报：TEX 11069 是唯一没有自带调色板的 TEX，其颜色从不显示，64×64 的存储值是 `0x4294c` 使用的条带阈值，为第 2 列表的贴图 TEX 11073 生成逐像素不透明度；spec Asset 表中的 `palette/hit-shimmer` 因此没有来源。用户当时无法回答。协调者按 spec“研究若确认显示方式与上表不同，以研究结论为准”处理，采用 05 推荐的方案 (a)：`image/hit-shimmer` 保留角色，绑定 `palette/flight/models`、显示方式为 direct，索引值逐值保留（查看器显示的颜色不是游戏颜色）；`palette/hit-shimmer` 不产生。必需角色、kind 与 schema 都不变，spec 未改。用户复核时可改为方案 (b)：以 data payload 承载阈值（新角色与形状，须修订 spec）。交 09、16、19 与 AC-07 的核对按此进行。交 22：imfat §5 的 ANIM 行改为已确认并链接 textures §6/§7；audio 中“Selection (Likely)… not traced statically”已由 textures §7（`0x2409c`）确认；hud §3 的 EXIC 行链接 textures §7；U-001、U-018（星云已确认）、U-027、U-030 的线索见 05 的完成证据。
- **2026-10-09 — 06 完成（交 07–17、22）：** 新增限值名 `aiProgramRecords`、`aiScriptItems`、`aiEntries`、`commMenuItems`、`animFrameBytes`，其余结构沿用 `payloadEntryBytes`、`payloadItems`、`textBytes`、`executableRegion`（对应关系写在 `SourceLimitName` 的注释中）；`PayloadBlock.array()` 总是报告 `payloadItems`，使用新限值名的结构（以终止项结束的列表、ANIM 帧数据字节）须在读取前调用 `block.limit(path, name, …)`。新增内容错误码 `invalid-flight-data-payload`、`flight-data-reference-mismatch`。规范 JSON 在 `src/content/canonical-json.ts`：0x7F 及以上的码元写成小写 `\uXXXX`，码位 1–255 的字节串可以作为 JSON 字符串携带；`f32` 逐位往返（含次正规数），−0 编码为 0。logic payload 的字节不变。交 22 的模块分册条目见 06 的完成证据。
- **2026-10-09 — 24 完成；HUD 直接绘制的 EXE 文字（研究门槛 3 与 4，待用户决定）：** 闭包追加 #47–#54（[P3-01/10 的追加记录](../01/subtasks/10-data-closure.md#完成证据)）。#47 为闭环直接绘制的 64 个 EXE 文字区域：目标显示屏 11、0–3 型仪表 4、飞行叠加 8、地图标记名 1、地图与信息窗 28、左侧显示屏 9、9/12 型指示 3；只取所选任务可达的最小集合时为 51 条。其余为 LO、F2/G-08、作弊、波次、G-05、菜单或代码规则，不导入。结构事实见 [executable](../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)。导入须修订 spec 并经用户批准，三种方案：A（24 推荐）新增 cockpit-hud-map 组的 data 角色 `hud-text`（`data/hud/text`），payload 只存字节，换算列表作为 schema 常量；B 并入 `flight-messages`；C 新增 G 缺省（与 P3-13 的“文字来自 Core 与导入内容”冲突）。修订获批前不导入；受影响的子任务为 06（限值名）、09、12 或 13、16、19、21、22、23，修订后由协调者新增修复子任务。交 22：U-030、U-026、U-029 的线索；audio 中 SND 10409 的循环标志不完整（`0x175f14` 为导弹通道 `0x175f20`，`0x175f10` 为通道 `0x175f1c`）；comm 可补 `0x2c9d0` 的对象列表项（键、`0x170f98` 与名称）以及 `0x174b40` 属代码规则。详见 24 的完成证据。
- **2026-10-09 — 07 完成：** 段 2 事件触发经 `scen.ts` 解析、写入任务 payload（logic payload schema 2），`loadMission` 原样透传到 `MissionSetup.eventTriggers`。执行中按申请扩大了写入范围（`scct.ts` 的僚机 `eventTrigger: null`、两处测试的计数与 schema 版本），没有与其他行重叠。基准本地核对（只记计数）：SCEN 3019 为 1 个触发、3 个区间、每区间 1 条消息、最长 57 字节，与 scenario 一致，在限值 2/8/2/128 之内。LOGIC_CONVERTER_COMPONENT 未递增，由 19 处理。交 21 或 22：工具用法中 logic-check 的 `counts` 与 `limits` 列表加入事件各项；交 22 的接口变化见 07 的完成证据。
- **2026-10-09 — 09 完成（交 13、14、16、17、19、22）：** `src/content/flight/` 提供 models 组 4 个 data 角色的规范 JSON payload（各自 schema 1），`src/content/hud/view-labels-payload.ts` 提供 `view-labels`。限值：`explosionListItems` 16、`animationFrames` 32、`nebulaImages` 32、视角标签 `textBytes` 32（观测值 7、12、15、16 的 2 倍），解析前的 `payloadBytes` 上限为 16,384 与 256。`flightDataDependencies()` 为 17 生成描述符依赖；爆炸列表与星云列表接受 0 项（无格式下限），帧至少 1 项；引用为带固定 kind 的 `AssetReference`，可以重复。scene-settings 只用已确认的用途命名字段，+0x19–+0x1B 不转换。交 22 的模块分册条目见 09 的完成证据。
- **2026-10-09 — 08 完成（交 10、11、12、15、22）：** `src/content/rule-data/` 提供 logic 组 6 个规则数据角色的规范 JSON payload；payload 字节上限沿用 `LOGIC_LIMITS.payloadBytes`。交解析器与转换的要点（详见 08 的完成证据）：规范 JSON 不能承载 −0，读取器把它读为 0，因此转换器须把来源中的 −0.0 `f32` 判为 `unsupported-payload`（基准中没有）；程序表 +0x2C 的 ±0 映射为 null，`kindMask` 为 0 时同样为 null，读取器拒绝字面的 0。弹体记录的所有非指针、非数量位置都按机型的类型转换，包括形状的 +0x00/+0x04/+0x08–+0x1C；机型形状的 at00/at08 恰在 boxes 非空时为 null。`ai-programs` 的 `entries` 按 `0x649c8` 首次到达的顺序排列：每个程序依次为其 +0x1C 条目、安装脚本，再按偏移顺序排列各状态列表。TABL 2009 只承载第 0 项的文字（`objectListLastEntry`）；COMM 列表与脚本保留终止项。限值与 06 的来源限值名的对应见 08 的完成证据。
- **2026-10-09 — 13 完成：** RENS 头部与视角标签的解析器。RENS 条目上限为 2048：现有效果步骤的上限（0x60 + 64 × 28 = 1888）向上取整到 2 的幂，因为 2 × 376 的推导值 1024 会低于现有限值；TABL 10399 的条目上限为 512，标签文字用 `VIEW_LABELS_LIMITS.textBytes`（32）。指向指针表本身的标签指针按字段处理规则 4 判为 `unsupported-payload`。可共用的后续简化（识别 −0 的 `f32` 读取、`payload-block.ts` 中共用的字节串读取）超出本行范围，未做。交 22 的 API 见 13 的完成证据。
- **2026-10-09 — 10 完成（交 15、22）：** `parseCraftTable(archive, read, candidate)` 返回 `{ craftInfoEntryId, hitDamageScale }`（行为槽、列为组；槽 ≥ 18 或组 ≥ 3 为 `subresource-mismatch`）；`parseCraftInfo(archive, read, hitDamageScale)` 返回 `CraftInfo`；`parseDebrisParameters(archive, read)` 返回 `DebrisParameters`。条目上限：TABL 4003 为格式大小 432（超出为 `limit-exceeded`，更小为 `invalid-payload`），CINF 为 65,536，DEBRIS 为 32,768（`CRAFT_TABLE_FORMAT`、`CRAFT_INFO_ENTRY_BYTES`、`DEBRIS_ENTRY_BYTES`，15 在读取前用它们调用 `requireEntryBytes`）。新增规则：载入代码就地改写，因此结构之间不得共享字节（`unsupported-payload`）。机型数不为 20 时为 `unsupported-payload`；空文字予以接受。合成块由 08 的规范内容生成（`syntheticCraftTable`、`syntheticCraftInfoBlock`、`syntheticDebrisBlock`），15 可配合 `buildImfat` 使用。交 22 的 API 与限值表见 10 的完成证据。
- **2026-10-09 — 14 完成（交 16、17、21、22）：** `anim.ts` 提供 `ANIM_LIMITS`（entryBytes 131,072、frames 32、frameBytes 16,384）、只核对结构的 `readAnimationFrames`（供帧数与预算），以及 `decodeAnimationFrame`（子资源 `frames/<index>`，返回含掩码的 `SourceImage`）。`explosion.ts` 提供 `EXPLOSION_LIMITS`（listEntryBytes 256、listItems 16、recordBytes 8）、`parseExplosionLists` 与 `parseExplosionRecord`，后两者返回条目 ID，ID 链归 17。`source-graphics` 的 `readImageRecordHeader` 与 `decodeImageRecord` 新增可选参数 `kind`（`'image' | 'anim-frame'`），编码 1 只在 `'anim-frame'` 中接受。协调者接受 14 的四项解释：(1) 越过宽度的透明行段予以接受，因为绘制代码只结束该行，解码无损；越过宽度的不透明行段为 `invalid-payload`；(2) 编码字段不为 1 的 ANIM 帧为 `unsupported-encoding`；(3) 空帧数组、自带调色板与 +36 非零为 `unsupported-payload`，编码 1 的每个分支都由代码确认；(4) 布局严格：帧数组在 +8，帧数据按帧序连续到条目末尾，重定位只在 +0 与帧的 +20/+28。交 22 的分册与 textures 解析器条目见 14 的完成证据。
- **2026-10-09 — 12 完成（交 15、22）：** `parseCommMenus(archive, reads)` 按调用者给出的键读取 5 张表：COMM 条目上限 512；文字指针落在项目表内、或 TABL 2009 +0x04 非零，都为 `unsupported-payload`。`parseBaseRepairItems(archive, read)` 只读 +0x6C，值域为 0–31、33、34，条目上限 262,144。`readExecutableText` 与 `parseFlightMessages(regions, read)` 接受与 `stepRegionReader` 兼容的读取器和按键给出的 `{locator, path}`；`textBytes` 在读取前按区域长度判定，越界由 LE 读取器拒绝。15 可用 `comm.test-support.ts` 的 `syntheticCommTables`、`commMenuReads` 与 `COMM_MENU_IDS` 生成合成数据。留待之后的简化：在 `PayloadBlock` 上提供共用的 NUL 结尾字节串读取（`comm.ts`、`craft.ts`、`view-labels.ts`、`scen.ts` 中有重复），以及把 `BlockWriter` 等测试辅助移到 `formats.test-support.ts`。交 22 的 API 见 12 的完成证据。
- **2026-10-09 — 11 完成（交 15、22）：** `parseAiPrograms(archive, sources, group)` 返回 `{ content, entryIds }`；内置表经新增的 `LeExecutable.readFixedUpRegion` 读取（解码内部的 32 位偏移 fixup），10 个名称各以恰好覆盖文字与 NUL 的区域给出。名称、DFPG 列表与脚本文字须按顺序首尾相接、恰到块尾，按规则 4 强制。AICO 与 DFPG 的 512 字节条目上限是合法布局达不到的，AC-14 在限值检查处核对。本地核对（只在 `local/`）：原版 AISTUFF.NOB 与 EXE 解析成功，得到 25 个链上条目（3 个 DFPG、22 个脚本），组 1、组 2 的 16 个条目作为多余被拒，内置记录 10 条、名称区域 10 个、对象 2 中 8 个不同的处理程序、157 个脚本项，规范 payload 13,414 字节，与 ai §8 一致。交 15：`data/ai-programs` 的映射除 `0x1762f8`（长 0x34C，含数量字）外还须有 10 个名称区域；`stepRegionReader` 须对内置表区域改用 `readFixedUpRegion`，15 派发时加入 `step-entry-reader.ts` 的写入范围。交 22：executable §1 中“读取器拒绝被 fixup 修补的区域”与 ai §3.3 的同类说法已过时（`readRegion` 仍然拒绝，`readFixedUpRegion` 解码）；API 见 11 的完成证据。
- **2026-10-09 — 16 完成（交 17、19、22）：** 图形步骤新增两种来源：ANIM 帧（子资源 `frames/<i>`，在 14 的解码之前计量预算）与 TABL 10399 第 8 项的视角标签（`labels/8`，用 13 的解析器）。ANIM 与视角标签条目在读取字节之前按目录大小拒绝（上限 131,072 与 512），映射在整个步骤转换成功后才升为 `verified`。生产映射与声明在新的 `production-flight-graphics.ts`，按协调者的表示决定（受击闪烁、帧与星云都绑定 `palette/flight/models` 直接显示），未并入生产图形表。交 19：把 `PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS`/`MAPPINGS` 追加到生产图形表，在 `production-flight-graphics.ts` 中加入 `PRODUCTION_FLIGHT_GRAPHICS_SHARE`，并把 `productionFlightGraphicsEntries()`（不含 DATA 条目）与 `productionGraphicsEntries()` 合并。映射置信度按 spec 的 Asset 表：星云图像为 likely 并带 U-018（研究已确认直接显示），爆炸帧为 confirmed 并带 U-001。交 22：`GRAPHICS_DATA_SOURCES`、由 `MessagesDeclaration` 改名的 `DataDeclaration`、读取前的条目上限，以及 `production-flight-graphics.ts` 的导出。16 的报告没有作为消息送达，协调者从其会话记录中读取。
- **2026-10-09 — 17 写入范围扩展：** 规格的 Asset 表把 `data/explosion-animation/<nn>` 映射到整个 ANIM 条目，但 `SOURCE_ENTRY_TYPES.data` 不含 ANIM（规格“当前实现与依据”只列出 image 与 palette 含 ANIM），这 17 个 Asset 会被判为来源类型冲突。按 P2-07 为 data 加入 DIAG 的先例，17 的写入范围增加 `source-mapping.ts` 及其测试，在 data 中加入 ANIM；不改为映射 EXPL。original-data 分册的白名单说明交 22 同步。
- **2026-10-09 — 15 完成（交 19、22）：** `convertRuleData(source, limits, usage, sources = PRODUCTION_RULE_DATA_SOURCES)` 返回 `{ partition, usage }`：partition 是 logic 组的 `GroupDraft`（6 个 data Asset 按 ID 升序，带绑定指纹的 `SourceStateSet`），由 19 与 `convertLogic` 的草稿按 ID 合并；每个 Asset 计量 `{ assets: 1, payloadBytes: n }`。`PRODUCTION_RULE_DATA_SHARE` 目前全为 0，由 19 推导；未接入 import-job。`step-entry-reader` 新增 `stepRegionReaders` → `{ read, readFixedUp }`，`stepRegionReader` 不变。子资源写法：TABL 4003 为 `group-0/slot-1`，AICO 为 `group-0`，TABL 10165 为 `records/subsystem-selector`。测量窗口期间未写 `local/`、未做私有基线核对：10 个内置名称区域的长度（含 NUL：10、12、11、17、8、13、5、8、8、5）取自 03 的只读 Ghidra 输出，与 ai §3.3 一致，未在本次对照 EXE 复核；若有误，19 的本地作业会以 invalid-payload 失败关闭。交 22：ai.md §1/§3.3 宜记录组 0 闭包的 25 个条目 ID 与 10 个名称区域（地址与长度），使生产映射在 `docs/original/` 有出处；内置表与名称的读取前长度判定宜移入 `formats/ai.ts`（后续整理，非本任务验收项）。API 见 15 的完成证据。
- **2026-10-09 — 17 完成（交 19、22）：** `runFlightDataStep(source, mappings, declarations, limits, usage)`，其中 `declarations = { assets, references }`；references 是其他步骤对 186 个帧、15 个星云图像与 blast-v1–v4 的映射，只用于定位、从不读取。四条 ID 链不一致时在 archive 结构路径处报 subresource-mismatch；声明表与映射表之间的不一致在任何读取之前报 invalid-declaration；没有 EXPL 引用的已声明音效也报 subresource-mismatch（`#EXIC/lists`），所以 `data/explosions` 恰好依赖声明的爆炸音效；绑定到其他来源指纹的引用映射表在读取前报 fingerprint-mismatch。`NEBULA_LIST_LIMITS.entryBytes` 为 256（观测 68）。`SOURCE_ENTRY_TYPES.data` 加入 ANIM（见上文范围扩展，规格未改）。`PRODUCTION_FLIGHT_DATA_SHARE` 是留给 19 的空占位；未接入 import-job.ts；effect-step.ts 未改，`data/projectile-visuals` 仍只含记录。交 19：在效果步骤之后用 `PRODUCTION_FLIGHT_DATA_MAPPINGS`/`PRODUCTION_FLIGHT_DATA_DECLARATIONS` 运行 `runFlightDataStep`，并入 models 组草稿并填写份额（合成生产结构计量：20 个 Asset、222 条依赖边）。交 22：original-data 分册新增飞行数据步骤一节（API、ID 链、位置与限值）、`production-flight-data.ts` 的导出，以及在 P2-07 DIAG/SNIP 的说明旁补记 ANIM。可选后续整理（不属本任务）：把私有 NEBC 解析器移入 `formats/`，拆出 flight-data-declarations.ts，给 `readSourceMappingTable` 增加根路径参数。
- **2026-10-09 — P3-02 测量窗口：** 应 P3-02 协调者请求（用户同意），窗口期间各工作者不修改 `local/research/` 下的既有文件、不触碰 `local/StarRang/`，私有基线核对推迟；P3-02 于 16:43 通知窗口结束，约束解除。15 因此未做私有核对（见 15 的记录），19 的份额推导在窗口结束后运行。
- **2026-10-09 — 19 完成（交 20、21、22）：** 切片定义版本 4 与 13 个新增必需角色；logic 步骤合并 `convertRuleData` 的分区，图形步骤并入 16 的映射与声明（`mergeGroupDrafts`），模型阶段在效果步骤之后运行 `runFlightDataStep`，音频表并入 18 的 11 行，音频步骤改为与核验共用一次读取（输出不变）。本地基准份额（2 倍取 2 的幂）：飞行图形 assets 512、边 512、调色板项 512、像素 4,194,304、字节 4,194,304；规则数据 assets 16、字节 262,144；飞行数据 assets 64、边 512、字节 32,768；logic 与音频在既有限值内。`PRODUCTION_PACKAGE.limits` 为 810 assets、1,408 边、16,564,224 字节、5,373,952 像素、3,072 调色板项。读取日志测试加入闭包外的 MUSC 诱饵与未读条目的全量核对。已知缺口：基准上的生产作业与 logic-check 在 `warp-arrival` 的 `flags` 8 处失败关闭（`unsupported-payload`）；仅为测量而接受 8 时，基准作业得到限值内的完整版本 4 包。该缺口由 spec 修订 1 与后续修复子任务处理。交 20：查看器的第一个图像现在是带掩码的爆炸帧；AC-24 布局对照在透明纹素上的棋盘灰（102）与实际渲染的灰（153）不一致，19 把该测试改用不透明的导弹图像，20 须判明哪一方正确。交 22：模块分册（`mergeGroupDrafts`、音频共用读取、`ModelStepInput.flightData`、三个份额常量与 `PRODUCTION_PACKAGE.limits`、组件版本、`VERSION_4_ROLES`/`P2_ROLES_SLICE`、`regionExecutable` 的 fixup）、本地导入指南的重新导入说明、audio.md 中 11 个新 SND 的 `flags`（8 个为 1，10409 与 10455 为 0，10181 为 8）。
- **2026-10-09 — spec 修订 1 与修复子任务 25–27：** 用户就两项契约变化选择了推荐方案：HUD 直接绘制的 EXE 文字按方案 A 新增 cockpit-hud-map 组的 data 角色 `hud-text`，导入闭包 #47 的全部 64 条（24 的门槛 3 与 4）；SND 10181 的 `flags` 8 把 sound payload 递增为 schema 2，增加 `repeat` 循环方式（19 发现）。协调者据此修订 spec（修订 1，并把执行中的 AICO、调色板与 ANIM 来源类型判断写入技术决定 16），审阅后用户于同日批准，并要求向 goal 加入修复子任务。新增 25（`hud-text` 的 payload 契约）、26（HUD 文字的转换与装配，依赖 25、27）与 27（sound payload schema 2 与重复播放）；20 与 21 改为依赖 26、27，22 依赖 25–27，最终对齐 23 依赖全部其他行。20 加入 `repeat` 声音的浏览器断言与 19 交接的棋盘灰差异，21 的独立读取加入 64 个区域与播放次数，22 的写入范围加入 platform 分册、audio.md 与 ai.md。已完成行的证据不变。组件不再另行递增：19 的 `graphics-4` 与 `audio-2` 的中间输出没有在真实来源上产生过完整的包（基准作业在 `flags` 8 处失败关闭），因此最终输出仍用这两个组件版本。
- **2026-10-09 — 25 完成（交 26、22）：** `src/content/hud/hud-text-payload.ts` 提供 `HUD_TEXT_KEYS`（64 个中性键名，前缀为仪表、后接用途，种类以十六进制后缀表示）、`HUD_TEXT_FORMATS`（null 为原样绘制，数组为格式串的转换序列）、`HUD_TEXT_LIMITS`（`textBytes` 32、`payloadBytes` 16,384）、`scanFormatConversions`、`matchesHudTextFormat` 与读写函数；内容层错误复用 `invalid-flight-data-payload` 与 `non-canonical-payload`。本地只读核对（LE 读取器，输出只在 `local/research/p3-03/hud-text-payload/`）：64 个键与 64 个区域一一对应，共 467 字节（含 NUL），39 个格式串的转换序列与常量逐条一致，25 条原样文字（其中 1 条含一个 `%` 字节，原样文字的核对因此总是通过），真实内容的编码为 2,018 字节。交 26：区域表按 `HUD_TEXT_KEYS` 的顺序，`source` 层核对用 `matchesHudTextFormat`，合成内容用 `syntheticHudText`/`syntheticHudTextEntry`。交 22：API、键名规则与限值见 25 的完成证据。
- **2026-10-09 — 27 完成（交 20、22、26）：** sound payload schema 2：`SOUND_LOOP_MODES` 加 `repeat`（2），偏移 15 改名 `plays`（`SOUND_REPEAT_PLAYS` 2–255），`SoundPlayback` 为可辨识联合；`PRODUCTION_SND_RULES` 只增加 `flags` 8 → `repeat` 8 次。音频控制器对 `repeat` 循环一份缓冲，以同一个 `currentTime` 排程 `start(when)` 与 `stop(when + 次数 × 时长)`，自然结束后像 `none` 一样释放，可提前停止；端口增加 `currentTime` 与可选的 `when`，`viewer-audio.ts` 的能力包装只透传 `currentTime`（查看器行为不变）。既有声音字节不变：合成数据中 29 个声音有 28 个 payload 的哈希与递增前相同；基准上（只在 `local/research/p3-03/sound-repeat/`）28 个与 19 的代码逐字节相同，`warp-arrival` 只有偏移 14、15 不同，用量 29 个 Asset、470,861 字节、304,035 个采样点不变；完整生产作业得到版本 4 的 `complete` 包（logic 9、models 266、cockpit-hud-map 103、audio 29），在 `PRODUCTION_PACKAGE.limits` 之内。组件保持 `audio-2`。Chrome 实测 8 遍播放逐帧计数恰为 8 遍；Firefox 与 WebKit 未实测，以主线程读到的 `currentTime` 排程若宿主晚开始，最后一遍可能被截短，记为残余风险。交 20：合成光盘中 `audio` 场景的 `sound/event/synthetic-2` 为 `repeat` 3 次（测试含义的 `flags` 9），生产规则场景的 `warp-arrival` 为 8 次但片段只有几帧；需要可计时的 `repeat` 声音时可在 E2E 夹具中写入较长的合成 payload。交 22：content、platform、original-data 分册、audio.md 与本地导入指南的更新点见 27 的完成证据。
- **2026-10-09 — 26 完成（交 20、21、22）：** `data/hud/text` 由生成 cockpit-hud-map 组的图形步骤产出（`parseHudText`、`HudTextDeclaration`，区域按 `HUD_TEXT_KEYS` 的顺序；失败位置沿用 15 的 EXE 区域写法 `sources.mappings[m].parts[p].alternatives[0]/entries/<key>`），版本 4 加入必需角色 `hud-text`。份额单列为 `PRODUCTION_HUD_TEXT_SHARE`（assets 2、payloadBytes 4,096；基准观测 1 与 2,018），`PRODUCTION_PACKAGE.limits` 为 assets 812、payloadBytes 16,568,320。基准上（只在 `local/research/p3-03/shares/` 的新文件）完整生产作业首次得到 spec 修订 1 下的 `complete` 版本 4 包：logic 9、models 266、cockpit-hud-map 104、audio 29，`data/hud/text` 为 `verified`、2,018 字节；组件未递增（`graphics-4`）。`production-rule-data.ts` 改用共用的区域辅助函数，输出逐字节相同。交 22：original-data 分册（`parseHudText`、`HudTextDeclaration`/`isHudTextDeclaration`、图形步骤的 HUD 文字来源与位置写法、`production-hud-text.ts` 的导出与新份额、`production-executable.ts` 的 `executableRegionOf`/`regionLocator`、新的 `PRODUCTION_PACKAGE.limits`）；content 分册的 `hud-text` 角色；executable 的观测最大值（64 个区域、467 字节、最长 15 含 NUL）。`source-error.ts` 中 `textBytes` 限值名的注释可补 EXE HUD 文字，不在 22 的写入范围，留作后续整理。
- **2026-10-09 — 合并 main（用户要求，在最终对齐之前）：** 合并提交 `13fe3b4` 带入 P3-02（正式 Core 契约与任务实例化）。冲突的处理：`.github/github-app.yml` 用 main 的 local 链接脚本（取代本分支的同类脚本）；阶段索引同时链接 P3-02 与 P3-03 的 spec 与 goal；executable 依次保留 P3-02 与 P3-03 的研究小节；scenario 保留 P3-03 的段 2 行与 +0x30/+0x38 两行，并入 P3-02 的配对调度与记录计数，以及 P3-02 的生成矩形行。语义冲突：P3-02 的合成任务帧缺少 logic payload schema 2 要求的 `eventTriggers`，已在 `create-world.test-support.ts` 中补空数组。合并后 `pnpm check` 通过（207 个文件、6,422 个测试与构建）；main 未改 E2E、app、workers 或 original-data。20、21 的 worker 仍基于 `9c203d6`，集成时在合并后的分支上重新运行检查。交 22：Core 分册已含 P3-02 的正式契约，`MissionSetup.eventTriggers` 的说明须与之对齐。

## 审批

用户于 2026-10-09 明确批准本 goal（“approve the goal and commit”）。批准范围为 23 个子任务的拆分、依赖、执行方式与写入范围，以及验收覆盖表；跟踪表全部为 `pending`。

本次只记录批准，不代表实现完成，也不替代 spec 的批准；执行仍须由 execute-goal 进行。

用户于 2026-10-09 批准 spec 修订 1，并要求向 goal 加入修复子任务（“Approve the revised spec (revision 1); then add the remediation subtasks to the goal”）。据此加入 25–27，并调整 20–23 的依赖与范围，见执行记录。
