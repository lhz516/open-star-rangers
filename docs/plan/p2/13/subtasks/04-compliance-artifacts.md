---
type: plan
status: active
phase: P2
task: "13"
subtask: "04"
updated: 2026-10-08
---

# 04 — 合规与产物审阅适用性

**契约来源：** [spec](../spec.md) 的 S-02、S-03、AC-04、AC-06、AC-10 与 AC-12；技术决定 2、4、5。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **聚合合规：** 在干净工作树的当前提交上运行 `pnpm --silent check:compliance`。记录 `format`（`osr-local-compliance`）、`version`（1）、`kind`、各范围的完成状态与计数、findings、coverage、`passed` 与退出码。需要持久报告时只写入被忽略的 `test-results/compliance/`。
- **依赖文件：** 核对 `package.json`、`pnpm-lock.yaml` 与 `.nvmrc` 相对 `f925d21` 的差异。没有变化时写明；有变化时按 P2-12/11 的方法重新审阅新增或变化的依赖与声明。
- **构建指纹与出站清单（AC-10、S-03）：** 按 P2-12/12 的算法得到本次构建的分发文件清单与指纹，与 P2-12 最后一次出站扫描绑定的构建（`local/research/p2-12/outbound/build-manifest.txt`）及 `final-26b` 比较。
  - **相同：** 出站 API 清单与来源/许可人工审阅对当前构建直接适用，记录比较结果。
  - **不同：** 把 `outbound-scan.ts` 复制到 `local/research/p2-13/outbound/` 后运行，先跑 `--control` 再跑扫描，保留 P2-12 的输出不变；对变化的 chunk 按 P2-12/11 的方法重做人工审阅。
- **生成的声明：** `LICENSE.txt`、`THIRD-PARTY-NOTICES.txt` 与 `compliance-inventory.json` 由本次构建生成，不手改。
- **失败处理：** 同 02（技术决定 5、6）。

## 不包含

- 最终评审文档定稿后的 `check:original`（08）。
- 修改合规工具、manifest 或许可政策；法律、名称、秘密或首次公开的确认。

## 关键文件与契约

- [tools/compliance/cli.ts](../../../../../tools/compliance/cli.ts)、[report.ts](../../../../../tools/compliance/report.ts)、[build-plugin.ts](../../../../../tools/compliance/build-plugin.ts)；[工具指南：本地合规](../../../../guides/tools.md#本地合规)。
- [P2-12/11](../../12/subtasks/11-outbound-compliance-review.md#完成证据)、[P2-12/12](../../12/subtasks/12-candidate-check.md#完成证据)；被忽略的 `local/research/p2-12/outbound/`。

## 写入范围

- `dist/**`：聚合检查先运行的生产构建（被忽略）。
- `test-results/compliance/**`：可选的持久报告（被忽略）。
- `local/research/p2-13/**`：只在构建指纹不同、须重跑出站扫描时写入（被忽略）。

## 验收标准

- [ ] AC-04（聚合部分）：输出为 `osr-local-compliance`/1，各范围完成、零发现、`passed:true`、退出码 0；依赖文件相对 `f925d21` 没有变化，或变化已重新审阅。
- [ ] AC-10（产物部分）与 AC-06（产物类别）：当前构建指纹与出站扫描绑定的构建比较结果已记录；相同则出站清单与人工审阅适用，不同则已重跑并完成变化部分的审阅。
- [ ] AC-12：失败时写明受影响的退出条件、原责任任务与恢复条件；没有时写明“无”。没有修改被跟踪的文件。

## 验证方法

- `pnpm --silent check:compliance`；`git --no-pager diff f925d21 -- package.json pnpm-lock.yaml .nvmrc`；构建清单比较。
- 不涉及浏览器验证；不读原版数据（扫描只读本项目的 `dist/` 与 manifest 中的哈希）。

## 完成证据
