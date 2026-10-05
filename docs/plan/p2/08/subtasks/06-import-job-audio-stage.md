---
type: plan
status: active
phase: P2
task: "08"
subtask: "06"
updated: 2026-10-05
---

# 06 — 导入作业的音频阶段、包身份组装与集成

**契约来源：** [spec](../spec.md) 的 S-06（生产 `ConverterVersion` 与组装）、S-07（作业部分）、S-11（Worker 部分）、S-12（本子任务部分），AC-05（`finished.usage`）、AC-06（生产值与同一作业各组身份相同）、AC-08；[转换与导入作业](../spec.md#转换与导入作业)、[包身份](../spec.md#包身份)、[技术决定](../spec.md#技术决定) 6、8。
**依赖：** 02、04、05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **生产音效模块（暂为空）：** 计划新增 `src/original-data/conversion/production-sounds.ts`，导出生产音效表与生产格式规则。
  - **本子任务：** 表为空，规则不接受任何 `flags`。空表时，生产作业的 `audio` 组在 P2-01 下为 `incomplete`（四个核心角色都是 `role-cardinality`）。这是 spec 允许的“核心角色没有任何映射”的行为，不是占位资源。
  - **11：** 依据研究填入行与规则。这之前不得以生产路径宣称任何 AC 已满足。
- **`ConverterVersion` 组成：** 在 `src/workers/` 中提供组成函数：`osr-import.` 加上按固定顺序以 `.` 连接的组件。生产值由 04 的 `audio-1` 组成，即 `osr-import.audio-1`。
- **作业（`src/workers/import-job.ts`）：** `createImportJob` 接受可选的 `{ open, audio }` 注入。
  - **生产入口：** 不传参，使用产品入口与生产音效模块。只有测试注入合成识别与合成的表、规则。
  - **流程：**
    1. 识别并报告 `identified`；
    2. 报告一次 `convert-audio` 进度，之后每次端口读取成功再报告一次，`readBytes` 跨阶段累计；
    3. 调用 04 的转换，得到组草稿；
    4. 用 02 计算一次 `ManifestIdentity`，组成完整的 `ContentIdentity`（schema 1、`CLASSIC_P2_SLICE` 的 ID 与版本、生产 `ConverterVersion`、manifest 身份，以及 `original-import` 来源与已识别的指纹），填入每组清单；
    5. 发送前预校验：用 `readPayloadRecords` 与 `payloadTransferList` 校验全部组的转移列表，并用 `readBudgetRecord` 读取最终用量。最终用量为来源用量加转换用量，来源用量包含核验读取与转换读取；
    6. 预校验通过后依次发送各组，返回用量。

    转换、预算与身份的失败都发生在第一次发送之前。
- **测试支持：** 同步 [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 与 [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)。
  - 既有的四组合成场景继续只走识别步骤，不能因加入音频阶段而重复发送 `audio` 组。实现可以单独导出识别步骤，生产入口的行为不变。
  - 新增音频场景：合成光盘含由 `buildImfat` 构造的 `MAIN/SR.NOB` 与合成 SND，以合成白名单识别，注入合成表与规则，运行生产作业的同一逻辑。
- **集成测试：** 扩展 [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts)，用 Node `MessageChannel` 连接作业、宿主、平台适配与持有者，跑音频场景与失败场景。
- **浏览器 Worker：** 扩展 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts)，经测试 Worker 入口跑同一音频场景。
- **文档：** 更新源码结构指南的导入作业与测试支持说明，以及[工程约定](../../../../engineering/README.md)中 Worker 测试的场景列表。

## 不包含

- 生产音效表的行与生产格式规则（11）。
- 播放端（07、08）。
- 页面接线、全包判定与缓存提交（P2-11）。

## 关键文件与契约

- **修改：** [import-job.ts](../../../../../src/workers/import-job.ts) 与 [import-job.test.ts](../../../../../src/workers/import-job.test.ts)、[import-worker.ts](../../../../../src/workers/import-worker.ts)（若注入方式需要）、上列测试支持、[import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts)、[import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts)。
- **计划新增：** `src/original-data/conversion/production-sounds.ts`（暂为空）；`ConverterVersion` 组成函数所在的 `src/workers/` 模块及其测试，文件名以执行为准。
- **复用：** 02 的 `manifest-identity.ts`、04 的 `audio-conversion.ts`、05 的协议 v2，以及 [ownership.ts](../../../../../src/content/ownership.ts)、[payload.ts](../../../../../src/content/payload.ts)、[budget.ts](../../../../../src/content/budget.ts)。

## 验收标准

- [ ] AC-06（生产值）：生产 `ConverterVersion` 为 `osr-import.audio-1`，能通过 `readConverterVersion`；组成函数按组件顺序拼接，非法组件被拒绝。
- [ ] AC-06（全包一致）：同一作业中各组清单的 `identity` 完全相同（`contentIdentityKey` 相等）；`manifestIdentity` 等于 02 对同一组草稿的计算结果。
- [ ] AC-05（作业用量）：`finished.usage` 等于来源用量与转换用量按维度相加，来源用量包含核验读取与转换读取。
- [ ] AC-08（Node 集成）：
  - 消息依次为 `identified`、至少一条 `convert-audio` 进度、`audio` 组与 `finished`；
  - 持有者得到 `group-complete`，`takeGroups()` 返回该组，发送方的 payload 视图已失效；
  - `conversion` 层错误往返后，与宿主转换的 DTO 相等。
- [ ] AC-08（发送前失败与发送后失败）：
  - 转换失败与预校验失败时，没有任何 `group` 消息；
  - 已收到组之后作业仍失败（例如注入无效的最终用量，或后续组的转移失败）时，持有者丢弃已收的组，`takeGroups()` 返回 null。
- [ ] AC-08（浏览器）：`pnpm test:e2e import-worker.spec.ts --project=development` 中，音频场景的结果与 Node 一致；既有场景保持通过。
- [ ] 空生产表下，生产作业对合成白名单识别出的输入发送 `incomplete` 的 `audio` 组（`role-cardinality`），作业正常结束。
- [ ] `pnpm exec vitest run src/workers src/app/import src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 集成测试，使用 Node `MessageChannel` 与合成光盘。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在 Chrome 的开发项目中运行 Worker E2E，只用代码生成的合成数据。
- 不适用原版对照；生产表与真实镜像在 11、12 中核对。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
