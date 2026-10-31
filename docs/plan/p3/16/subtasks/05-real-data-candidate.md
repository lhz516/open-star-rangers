---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "05"
updated: "2026-10-30"
---

# 05 — 真实数据候选核对

**契约来源：** [spec](../spec.md) 的 S-03、AC-06、[数据模型与契约](../spec.md#数据模型与契约)中“真实数据候选核对结果”一行、[技术决定](../spec.md#技术决定) 2。
**依赖：** 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **运行：** `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，报告写入 `local/research/p3-16/package-check/`。
- **核对报告形状：** `format: 'osr-package-check'`、`version: 1`、`passed: true`、`error: null`、`package.status: 'complete'`；各角色计数与限值通过，`loadMission` 不抛错，退出码 0。
- **还原完整 `ContentIdentity`：** 字段为 `schemaVersion`、`sliceId`、`sliceDefinitionVersion`、`converterVersion`、`manifestIdentity` 与 `origin`（`original-import` 加 `sourceFingerprint`）。来源是报告的 `package` 字段、当前内容常量与报告的来源指纹。与 P3-15/07 的私有记录比对完整值；历史全值无法恢复时如实记录，不用截断哈希证明相同。
- **候选关系：** 04 的修复只改 Core 规则，不改转换输出；本核对的身份适用于最终候选。若之后有改动影响转换器，由协调者按 spec 重做本项。

## 不包含

- 新增 CLI 字段或 schema；真实内容的玩法运行（06）。

## 关键文件与契约

- [package-check.ts](../../../../../tools/package-check.ts) 的 `PackageCheckReport`；[content-identity.ts](../../../../../src/content/content-identity.ts)；[P3-15/07](../../15/subtasks/07-real-content-runs.md#完成证据)。

## 写入范围

- `local/research/p3-16/package-check/**`：报告与比对的私有输出。

## 验收标准

- [ ] AC-06：报告满足上述成功形状，退出码 0。
- [ ] AC-06：完整 `ContentIdentity` 已记录并与 P3-15/07 比对；有差异或无法恢复时明确记录。
- [ ] 被跟踪的证据只含身份、计数、哈希与结论，没有原版内容。

## 验证方法

- 运行命令并检查 JSON 字段；记录命令、退出码与报告文件的 SHA-256。

## 完成证据
