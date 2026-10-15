---
type: plan
status: active
phase: P3
task: "08"
subtask: "13"
updated: 2026-10-14
---

# 13 — AI 解析数据导入

**契约来源：** [spec](../spec.md) 的 S-02、AC-14；[跨任务修订](../spec.md#跨任务修订d-03)、[持久化与兼容](../spec.md#持久化与兼容)；09 定稿的 [P3-03 修订](../../03/spec.md)。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 P3-03 修订，把关键字表等解析用静态数据作为 EXE 区域导入 `data/ai-programs`：
  - 原版数据：[ai.ts](../../../../../src/original-data/formats/ai.ts) 读取新区域（LE fixup 与字符串目标校验、表项与预算）；转换器 [convert-rule-data.ts](../../../../../src/original-data/conversion/convert-rule-data.ts)、映射 [production-rule-data.ts](../../../../../src/original-data/conversion/production-rule-data.ts)；
  - 内容契约：[ai-programs.ts](../../../../../src/content/rule-data/ai-programs.ts) 加入表的类型与读取，[rule-data-payload.ts](../../../../../src/content/rule-data/rule-data-payload.ts) 的 `ai-programs` schema 由 1 递增；合成辅助 [rule-data.test-support.ts](../../../../../src/content/rule-data/rule-data.test-support.ts) 与 [production-rule-data.test-support.ts](../../../../../src/original-data/conversion/production-rule-data.test-support.ts) 同步；
  - 生产 `ConverterVersion`（[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts)）递增，旧缓存不恢复；
  - 会话载入：[mission-input.ts](../../../../../src/app/resources/mission-input.ts) 仍把完整内容交给 Core，不提取局部参数；
  - [package-check.ts](../../../../../tools/package-check.ts) 报告新表的计数与哈希。
- 测试：结构、字符串、fixup、重复键与预算坏值的拒绝（limit 与 limit + 1）；旧 schema 与旧转换器版本的缓存不恢复；合成生产者与消费者一致。
- 文档：[ai](../../../../original/formats/ai.md) §6 的导入处置；[content](../../../../engineering/modules/content.md) 与 [original-data](../../../../engineering/modules/original-data.md) 分册；[本地导入指南](../../../../guides/local-import.md)中须重新导入的说明。
- 本机真实镜像运行 `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，与独立读取的结构核对；报告只留在 `local/research/p3-08/import/`，公开只记计数与哈希。

## 不包含

- Core 对新表的消费（14、16）；浏览器导入与恢复回归（24）。

## 关键文件与契约

- 见工作范围；全部为已有文件。计划新增的只有被忽略的 `local/research/p3-08/import/`。

## 写入范围

- `src/original-data/formats/ai.ts`：新区域读取。
- `src/original-data/formats/ai.test.ts`：读取测试。
- `src/original-data/formats/ai.test-support.ts`：合成 AI 来源中的关键字表区域、fixup 与名称区域。
- `src/core/world/setup-hash.ts`：setupHash 覆盖新表。
- `src/core/world/create-world.test.ts`：setupHash 覆盖测试。
- `src/app/import/import-pipeline.test.ts`：转换器版本断言。
- `src/workers/import-job.test.ts`：转换器版本断言。
- `e2e/import-worker.spec.ts`：转换器版本断言。
- `src/workers/production-package.test.ts`：规则数据份额的基线观测。
- `src/app/resources/resource-holder-cache.test.ts`：被取代的旧版本不恢复。
- `src/original-data/source-error.ts`：关键字表的上限名称。
- `src/workers/import-protocol.test.ts`：上限名称的穷举清单。
- `src/workers/synthetic-import.test-support.ts`：合成光盘的读取余量。
- `tools/package-check.test.ts`：合成光盘余量与新表的报告断言。
- `tools/logic-check.test.ts`：合成光盘余量。
- `src/original-data/conversion/**`：转换、映射、版本与合成辅助及其测试。
- `src/original-data/synthetic.test-support.ts`：合成 LE 区域（需要时）。
- `src/content/rule-data/**`：内容契约、payload schema、合成辅助与测试。
- `src/app/resources/mission-input.ts`：完整内容的传递。
- `src/app/resources/mission-input.test.ts`：传递测试。
- `src/workers/production-package.ts`：生产包配置随版本变化时。
- `tools/package-check.ts`：报告新表。
- `docs/original/formats/ai.md`：导入处置。
- `docs/engineering/modules/content.md`：内容契约说明。
- `docs/engineering/modules/original-data.md`：原版数据说明。
- `docs/guides/local-import.md`：重新导入说明。
- `local/research/p3-08/import/**`：真实镜像核对输出（被忽略）。

## 验收标准

- [ ] AC-14 的 Node 部分：schema、转换器版本、映射、读取器与合成生产者/消费者同步；坏值安全拒绝；旧 schema/旧缓存不恢复。
- [ ] 真实镜像经 `tools/package-check.ts` 转换通过，新表与独立读取一致；公开记录只含计数与哈希。
- [ ] 完整 AI 内容经会话交给 Core；`pnpm check` 通过。

## 验证方法

- 受影响测试文件先跑，再 `pnpm check`；本机运行 package-check；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
