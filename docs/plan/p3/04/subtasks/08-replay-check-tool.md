---
type: plan
status: active
phase: P3
task: "04"
subtask: "08"
updated: 2026-10-09
---

# 08 — replay 核对工具

**契约来源：** [spec](../spec.md) 的 S-08 与 [replay 核对工具](../spec.md#replay-核对工具)，数据模型的“replay 核对报告”；AC-16（Node 部分）。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `tools/replay-check.ts`：`node tools/replay-check.ts <录制.json> <CloneCD 文件组>`。
  1. 读取前检查文件字节上限，以同一句柄有界读取，文件在读取中变化或超限都拒绝；上限由 `ReplayRecord`/`ReplayResult`、`CORE_LIMITS`、字段长度与 JSON 编码最坏开销推导并固化，依据与精确数值写入工具说明与 [工具指南](../../../../guides/tools.md) 的交接（指南由 15 编写）。不先无界读取或解析。
  2. 校验顶层恰为 `{ record, result }`；expected 结果经 Core 公开校验边界验证后才执行重放。
  3. 复用 P3-03 新增的 `tools/package-check.ts` 的整包导入路径（`createImportJob` 转换整个文件组，保留全部组并调用 `validatePackage`）；需要时把该路径提取为两者共用的 helper，`package-check` 的行为与输出不变、其测试照常通过。不照搬 [logic-check.ts](../../../../../tools/logic-check.ts) 只检 logic 组的实现。按任务引用的 Asset ID 解码三份逻辑数据；内容身份取自实际验证结果，不从录制构造。
  4. `replayRecord` 重放，`compareReplayResults` 比较；版本、身份或 setupHash 不符一律拒绝，不改写记录或忽略差异。
  5. 输出固定形状 JSON 报告 `{ format: 'osr-replay-check', version: 1, passed, error, identity, mission, setupHash, finalTick, events, checkpoints, comparison }`；提前失败时未取得的字段为 null；通过退出 0，核对失败 1，用法错误 2。错误码为封闭集合：usage、read-failed、file-too-large、invalid-recording、content-failed、replay-failed、replay-mismatch、internal-error；location 为固定阶段或受约束的结构路径。报告不含名称、坐标、原始事件、宿主路径或异常原文。
- CLI 始终使用生产来源白名单。导出可注入导入作业与来源配置的核对函数，供 Node 测试与 10 的 E2E 使用合成光盘；不从记录选择白名单，测试配置不进入 CLI 参数。
- 随实现编写 `tools/replay-check.test.ts`：用 01 的可开始合成场景与 `createRecordingSession` 产生合成录制。

## 不包含

- 浏览器导出（07、09）与下载后的 E2E 核对（10）；真实内容核对（14）；工具指南的正文（15）。

## 关键文件与契约

- 计划新增：`tools/replay-check.ts`、`tools/replay-check.test.ts`。
- 复用：P3-03 的 [package-check.ts](../../../../../tools/package-check.ts)（整包导入与核对）；参照：[logic-check.ts](../../../../../tools/logic-check.ts)、[node-byte-source.ts](../../../../../tools/node-byte-source.ts)。
- 只读消费：[replay.ts](../../../../../src/core/replay/replay.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[completeness.ts](../../../../../src/content/completeness.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)。

## 写入范围

- `tools/replay-check.ts`：计划新增的工具。
- `tools/replay-check.test.ts`：计划新增的测试。
- `tools/package-check.ts`：仅在提取共用整包导入 helper 时修改，行为不变。
- `tools/package-check.test.ts`：同上，只做必要的导入调整。

## 验收标准

- [ ] AC-16（Node）：合成录制经核对函数与同一合成光盘重放一致，报告 `passed: true`、退出码 0。
- [ ] AC-16（Node）：文件超限（limit/limit+1）、读取中增长、顶层坏形状、坏 expected、版本/身份/setupHash 不符、结果分歧各以对应错误码失败，未取得字段为 null；未改写导出 JSON。
- [ ] CLI：用法错误退出 2；I/O 失败与未知来源（合成盘对生产白名单）非零退出并输出同形状报告；意外异常为 internal-error。
- [ ] 报告不含原版内容、名称、坐标、宿主路径或异常原文。
- [ ] `pnpm exec vitest run tools/replay-check.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node：合成光盘、合成录制与篡改变体；CLI 以子进程或 `main(argv)` 检查输出与退出码。
- 真实内容的 CLI 成功路径由 14 取得；不适用浏览器。

## 完成证据
