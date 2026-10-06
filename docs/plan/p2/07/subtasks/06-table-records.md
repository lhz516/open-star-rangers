---
type: plan
status: active
phase: P2
task: "07"
subtask: "06"
updated: 2026-10-05
---

# 06 — TABL 图像列表记录

**契约来源：** [spec](../spec.md) 的 S-03（TABL 部分）、S-08 与 S-09 的 source 层；[容器子资源](../spec.md#容器子资源)、[限值与预算](../spec.md#限值与预算)中的 `tableRecords`、[错误码](../spec.md#错误码)；技术决定 3；AC-04 的 TABL 部分。
**依赖：** 03、04、05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **解析（扩展 [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts) 或计划新增的相邻模块）：** 只支持 05 在 hud 中记录为已确认的图像列表结构：
  - 记录数 1–64（`tableRecords`），在遍历前判定；
  - 按序号 i 取记录偏移；越界报 `subresource-not-found`；
  - 结构不符或记录指针越出块报 `invalid-payload`。
- **子资源：** 图形步骤接受 TABL 的 `records/<i>`（image）与 `records/<i>/palette`（palette），语法与 04 的其他容器一致；子资源与 kind 不匹配 → `invalid-declaration`。记录的解码、透明、限值与错误语义沿用 P2-05。
- **错误类型：** 向 `SourceLimitName` 追加 `tableRecords`。
- **测试：** 按 05 记录的结构生成合成 TABL：
  - `records/<i>` 得到正确的图像，且与偏移 0 的同一记录逐字节相同；
  - 结构不符、记录指针越出块 → `invalid-payload`；65 个记录 → `limit-exceeded`（`tableRecords`）；`i` 越界、对没有嵌入调色板的记录取 `…/palette` → `subresource-not-found`；
  - 经步骤转换 TABL 记录的用例（含与 CCKD、MFDD 来源混合的声明组）。
- **文档：** 源码结构“图形转换”一节记录 TABL 子资源与 `tableRecords`。

## 不包含

- 结构研究：归 [05](./05-table-structure-research.md)。
- 生产 TABL 映射与入选：归 [09](./09-hud-family-research.md) 与 [12](./12-production-cockpit-hud.md)。
- 05 没有确认的 TABL 结构：不实现，不按“看起来像图像”推断。

## 关键文件与契约

- **修改：** [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)、[source-error.ts](../../../../../src/original-data/source-error.ts) 及其测试；[conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)。
- **事实依据：** 05 更新后的 [hud](../../../../original/formats/hud.md) TABL 一节。

## 验收标准

- [ ] AC-04 的 TABL 部分全部通过。
- [ ] 解析只接受 hud 记录为已确认的结构；限值在遍历前判定。
- [ ] `pnpm typecheck`、`pnpm lint` 与聚焦测试通过；源码结构已更新。

## 验证方法

- `pnpm test -- src/original-data/conversion/`。
- 只用代码生成的数据；不涉及浏览器或原版数据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
