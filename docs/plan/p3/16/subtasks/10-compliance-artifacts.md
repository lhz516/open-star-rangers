---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "10"
updated: "2026-10-30"
---

# 10 — 合规与产物适用性

**契约来源：** [spec](../spec.md) 的 S-03、S-04（产物与许可类别）、AC-05、[技术决定](../spec.md#技术决定) 2 与 3。
**依赖：** 04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在含修复的候选上运行 `pnpm --silent check:compliance`，核对报告：`osr-local-compliance`/1，各必需范围 completed，零 finding，`passed: true`，退出码 0。
- **产物与许可审阅的适用性：** 按构建指纹与依赖文件（`pnpm-lock.yaml`、`package.json`、`.nvmrc`）相对 P3-15 最终基线的差异，判断出站 API 清单、生产预览 CSP 与来源/许可人工审阅对当前构建是否仍有效；有变化时只重核变化部分。
- 记录本次构建的 `dist` 指纹，以及它与 08、09 各自构建的关系。

## 不包含

- 最终的 `check:original`（17，在文档定稿后运行）。

## 关键文件与契约

- [合规 CLI](../../../../../tools/compliance/cli.ts)；[本地合规用法](../../../../guides/tools.md)。

## 写入范围

- `dist/**`：`check:compliance` 的构建（被忽略）。
- `test-results/compliance/**`：留存的报告（被忽略）。

## 验收标准

- [ ] AC-05：合规报告满足上述条件。
- [ ] AC-05：产物、CSP 与许可审阅的适用性已判定，有变化时已重核；不把完整文件哈希扫描说成原版解码内容的全面检测。

## 验证方法

- CLI JSON 与退出码；构建清单与依赖文件的差异。

## 完成证据
