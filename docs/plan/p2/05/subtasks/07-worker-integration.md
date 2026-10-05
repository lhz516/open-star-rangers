---
type: plan
status: active
phase: P2
task: "05"
subtask: "07"
updated: 2026-10-05
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

- [ ] AC-11：新阶段与协议版本 2，版本不符时在发送 `start` 之前失败；成功作业的消息顺序与 `groups` 为空；持有者的两种阶段顺序违规；三类失败分别保持各自的层、code 与位置，快照不含部分结果。
- [ ] AC-10 用量部分：`finished.usage` 等于最终读取用量与转换用量逐维之和，`sourceReadBytes` 等于最后一次进度的 `readBytes`。
- [ ] P2-04 的既有测试按新版本更新后全部通过；`pnpm exec vitest run src/workers src/app/import`、`pnpm typecheck`、`pnpm lint` 通过。
- [ ] 能力边界不变：`src/workers` 只经产品入口取得原版字节，不使用网络 API；`tools/engineering-boundaries.test.ts` 通过。

## 验证方法

- Node 测试，使用结构化克隆端口、真实宿主与持有者，以及合成光盘。
- 浏览器验证见 08；不适用原版对照。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
