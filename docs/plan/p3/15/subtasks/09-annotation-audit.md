---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "09"
updated: "2026-10-29"
---

# 09 — 缺省与近似标注审计

**契约来源：** [spec](../spec.md) 的 S-08、[行为与边界](../spec.md#行为与边界)“对照与标注审计”、[技术决定](../spec.md#技术决定)末条（F1 `cockpit-front`）；AC-09。清单来自 [P3-01 的缺省清单](../../01/spec.md#缺省清单)与[标注规则](../../01/spec.md#标注规则)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项审计 G-01 起的每个缺省项及所有临时资源、近似规则：在当前构建的 UI（合成任务包，development 与 production）中找到用户可见的标注位置，并核对 [slice-gaps](../../../../../docs/engineering/slice-gaps.md)、[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)、P3-01 清单与相关任务证据中的说明与链接。
- 检索代码与文档中未登记的占位或近似（如临时资源标记、近似规则注释），确认每项均已披露；报告 F1 `cockpit-front` 的既有标注/责任缺口而不定义其 Core 效果。
- 结果写入本文档的完成证据：每项一行（G 项/资源、UI 位置、标注、文档链接、结论）。缺失或不一致作为差异交回责任任务。

## 不包含

- 新增或重新定义缺省；修改 UI 文案或文档（由责任任务修复）。

## 关键文件与契约

- [P3-01 spec](../../../../../docs/plan/p3/01/spec.md)、[slice-gaps](../../../../../docs/engineering/slice-gaps.md)、[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)。

## 写入范围

- `local/research/p3-15/annotation-audit/**`：合成画面截图与审计草稿。

## 验收标准

- [ ] AC-09：音乐、过场、通讯头像、替代页面及每个临时资源/近似规则都有 UI 标注与可追溯文档说明；无未披露的占位或近似。
- [ ] F1 `cockpit-front` 的既有缺口已报告并指明责任归属状态；差异已交回。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在 development 与 production 构建中以合成内容逐页观察；`rg` 检索代码与文档的占位/近似标记并与清单对照。

## 完成证据
