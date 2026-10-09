---
type: plan
status: active
phase: P2
task: "05"
subtask: "07"
updated: 2026-10-08
---

# 07 — 导入作业接入图形阶段

**契约来源：** [spec](../spec.md) 的 S-09 的 Worker 部分，S-07 的用量合并，S-08 的三类失败；[协议变化](../spec.md#协议变化)、[行为与边界](../spec.md#行为与边界)中的读取失败、转换失败、取消与阶段顺序行；技术决定 8、9；AC-10 的 `finished.usage` 部分、AC-11。
**依赖：** 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **[import-protocol.ts](../../../../../src/workers/import-protocol.ts)：** `IMPORT_STAGES` 变为 `identify-source`、`convert-graphics`，`IMPORT_PROTOCOL_VERSION` 从 1 递增为 2。消息形状与 DTO 语法不变。
- **[import-host.ts](../../../../../src/workers/import-host.ts)：** 宿主检查作业报告的进度阶段，作为作业缺陷的防线：阶段只能按 `IMPORT_STAGES` 的顺序前进，`convert-graphics` 只能在 `identified` 之后。违反时报 `internal-error`，与现有的识别进度规则一致。`SourceError` 已按 `source` 层转换，不需要改动。
- **[import-job.ts](../../../../../src/workers/import-job.ts)：**
  - 识别之后，以当前累计读取量发送一次 `convert-graphics` 进度，之后每次端口读取完成再发送一次；计量逻辑改为报告当前阶段。
  - 用 06 的生产声明与映射运行 05 的步骤。限值记录为 P2-02 的读取默认值（输入总字节）加 06 的份额。
  - 步骤结果只保留到作业结束；本任务不发送组消息，`finished.groups` 为空。
  - `finished.usage` 为已验证来源最终的读取用量与转换用量逐维相加。
  - 打开函数与图形步骤输入可以注入，生产默认值不变，测试用合成白名单与 06 的生产结构合成光盘。
- **[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)：** 把 `LATE_PROGRESS` 推广为阶段顺序规则。识别之前出现 `convert-graphics` 进度，或进入后续阶段后再出现较早阶段的进度，都报 `protocol-error@message.stage`。快照的 `stage` 照常更新。
- **[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)：** 增加使用 06 测试支持的合成光盘与打开函数，供本子任务与 08 使用。
- **测试：**
  - **协议：** [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 增加新阶段的正负用例与新版本号；更新断言版本 1 或阶段集合的既有用例。
  - **宿主：** 阶段顺序防线。
  - **持有者：** 两种阶段顺序违规都报 `protocol-error@message.stage`。
  - **`MessageChannel` 集成：** 沿用 [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 的方式，覆盖：
    - **成功：** 识别进度 → `identified` → 至少一条 `convert-graphics` 进度 → `finished`；`readBytes` 不减少，`groups` 为空，`usage` 的转换维度为 5、512、768 等，`sourceReadBytes` 等于最后一次进度的 `readBytes`。
    - **识别失败：** 结果与 P2-04 相同。
    - **图形阶段读取失败：** 例如生产结构中缺少 CCKD 条目，或端口在图形阶段拒绝读取；保持 P2-03 `source` 层或 P2-02 `disc` 层的原 code 与位置。
    - **转换失败：** 损坏的合成字体报 `source` 层 `invalid-payload`，位置为 `graphics[font/hud/…]…`。
    - 三类失败的快照都不含部分结果，诊断中没有文件名或宿主错误文本。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)的“导入 Worker”一节记录新阶段、协议版本 2、阶段顺序规则、用量合并与 `groups` 为空；[工程约定](../../../../engineering/README.md)中若有协议版本的说明，同步更新。

## 不包含

- 真实 Chromium Worker：归 [08](./08-browser-worker-graphics.md)。
- 本地基准：归 [10](./10-local-base-check.md)。
- 组消息的发送与组清单：归 P2-06/07/11。

## 关键文件与契约

- **修改：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts)、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)、[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)，以及相关测试：[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)、[import-host.test.ts](../../../../../src/workers/import-host.test.ts)、[import-job.test.ts](../../../../../src/workers/import-job.test.ts)、[import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts)、[import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts)。
- **复用：** 05 的步骤与 06 的生产模块和测试支持。

## 验收标准

- [x] AC-11：新阶段与协议版本 2，版本不符时在发送 `start` 之前失败；成功作业的消息顺序与 `groups` 为空；持有者的两种阶段顺序违规；三类失败分别保持各自的层、code 与位置，快照不含部分结果。
- [x] AC-10 用量部分：`finished.usage` 等于最终读取用量与转换用量逐维之和，`sourceReadBytes` 等于最后一次进度的 `readBytes`。
- [x] P2-04 的既有测试按新版本更新后全部通过；`pnpm exec vitest run src/workers src/app/import`、`pnpm typecheck`、`pnpm lint` 通过。
- [x] 能力边界不变：`src/workers` 只经产品入口取得原版字节，不使用网络 API；`tools/engineering-boundaries.test.ts` 通过。

## 验证方法

- Node 测试，使用结构化克隆端口、真实宿主与持有者，以及合成光盘。
- 浏览器验证见 08；不适用原版对照。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现（2026-10-05）：**
  - [import-protocol.ts](../../../../../src/workers/import-protocol.ts)：`IMPORT_PROTOCOL_VERSION` 改为 2，`IMPORT_STAGES` 为 `identify-source`、`convert-graphics`。新增 `canReportStage(latest, stage, identified)` 作为唯一的阶段顺序规则。
  - [import-host.ts](../../../../../src/workers/import-host.ts) 记录最近的阶段，违反规则时报 `internal-error`。[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 把 `LATE_PROGRESS` 推广为同一规则，违反时报 `protocol-error@message.stage`。
  - [import-job.ts](../../../../../src/workers/import-job.ts) 的 `createImportJob(open, graphics)`：
    - 计量报告当前阶段，识别后先以累计字节发送一次 `convert-graphics` 进度；
    - 用 06 的生产声明、映射与份额运行 05 的步骤，限值为 `{sourceReadBytes: 输入总字节} + 份额`；
    - 返回 `source.usage()` 与转换用量之和，不发送组。
  - [budget.ts](../../../../../src/content/budget.ts) 新增 `addBudgets`，相加后仍按预算记录校验。
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 新增 `NO_GRAPHICS`；`syntheticGroupsJob` 用它运行空的图形阶段，以免 P2-04 的组转移测试依赖图形内容。[production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts) 允许以 null 省略条目。
- **测试：** `pnpm exec vitest run src/content/budget.test.ts src/workers src/app/import src/platform/workers` 7 个文件 397 项通过。
  - **协议：** 版本 2 与两个有序阶段；`convert-graphics` 进度可读；前一版本 1 的 `ready` 被拒绝（`protocol-error@message.protocol`）；`canReportStage` 的 9 种前后关系逐项断言。
  - **宿主：** 识别 → 图形进度 → 组 → `finished` 的顺序号连续。图形进度在识别前、或识别进度在图形进度后，都报 `internal-error`。版本 1 的 `start` 报 `invalid-request@request.protocol`，不运行作业。
  - **持有者：** 图形进度更新快照阶段。以下三种情况都报 `protocol-error@message.stage`：图形进度作为第一条进度、图形进度在识别前、识别进度在图形进度后。`ready` 的版本为 1 时报 `protocol-error`，不发送 `start`。
  - **作业：**
    - 空图形输入时，识别后只有一条图形进度，`finished.usage` 等于读取用量；
    - 生产结构的合成光盘：识别后至少两条图形进度，进度逐读累计且阶段正确，`groups` 为空，`usage` 等于读取用量加 assets 5、paletteEntries 512、glyphs 768、payloadBytes 7,184。最后一次进度的 `readBytes` 等于 `sourceReadBytes`。
  - **`MessageChannel` 集成**（[import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts)，真实持有者、平台适配与宿主）：
    - **成功：** 消息为 `ready`、识别进度、`identified`、至少一条图形进度、`finished`，`readBytes` 不减少且末值等于 `sourceReadBytes`，`groups` 与移交结果为空。
    - **三类失败：** 生产白名单拒绝合成光盘时，快照停在 `identify-source`，为 `source` 层 `unsupported-version`。缺少 CCKD 条目时为 P2-03 `source` 层 `entry-not-found@sources.mappings[0].parts[0].alternatives[0]`。识别后端口拒绝读取时为 P2-02 `disc` 层 `read-failed@image:lba 18`。字库表长不符时为 `source` 层 `invalid-payload@graphics[font/hud/4x6].glyphs`。
    - 每种失败的快照都等于宿主转换的 DTO，停在相应阶段；`takeGroups()` 为 null，消息与快照中没有文件名或宿主错误文本。
  - **浏览器回归：** P2-04 的 `synthetic` 场景在 `identified` 与第一组之间多出一条空图形阶段的进度，[import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 的快照序列随之更新。`pnpm test:e2e import-worker.spec.ts --project=development` 8 项通过。
- **工程：** `pnpm typecheck`、`pnpm lint` 与 `pnpm check`（106 个文件，3061 项，含工程边界回归）通过。`src/workers` 只经产品入口与 `conversion/` 取得原版数据，没有网络 API。
- **Rubber-duck：** 无 Blocker/High/Medium。两项 Low 已补：断言图形阶段磁盘读取失败的确定位置 `image:lba 18`（不只以宿主结果为准）；增加图形进度作为第一条进度的持有者用例。
- **Simplify：** 采纳：
  - 宿主与持有者共用 `canReportStage`；
  - 预算相加移到 `content/budget.ts` 的 `addBudgets`；
  - `PRODUCTION_GRAPHICS_STEP` 改为模块私有；
  - `syntheticGroupsJob` 去掉未用的图形参数；
  - 作业与集成测试的阶段断言改为直接判断。

  未采纳“节流进度”：spec 要求每次端口读取完成发送一次进度。
- **文档影响：** [源码结构](../../../../engineering/modules/workers.md#导入-worker)的“导入 Worker”一节更新：
  - 协议版本 2、两个阶段与 `canReportStage`，宿主与持有者的阶段顺序规则；
  - 作业的阶段计量、图形转换、限值与用量合并，`groups` 为空，注入点；
  - `NO_GRAPHICS` 测试支持与集成测试覆盖。

  预算一节补充 `addBudgets`。工程约定与工具指南没有协议版本或阶段的说明，无需更新。

- **执行期修订（2026-10-05，[12](./12-character-map-research.md)）：** 字体 payload 增加每字形行数与字形数、生产映射填入后，合成作业的用量变为 glyphs 704、payloadBytes 7,683（[import-job.test.ts](../../../../../src/workers/import-job.test.ts) 已同步）。见 [goal 执行记录](../goal.md#执行记录)。以上为修订前的记录。
