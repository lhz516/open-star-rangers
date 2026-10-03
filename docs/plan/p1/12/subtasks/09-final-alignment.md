---
type: plan
status: active
phase: P1
task: "12"
subtask: "09"
updated: 2026-10-03
---

# 09 — 最终全覆盖与隔离对齐（仅验证）

**契约来源：** [Spec](../spec.md) 的 S-01 至 S-07；AC-01 至 AC-15。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核验Spec全部范围/验收与01–08真实实现及证据：严格manifest、四范围与NUL/index、路径拒绝、锁/解析、保守SPDX、真实分发、全文notice、指纹/失效、CLI非零、隐私/人工审阅与权利边界。
- 核对最终树目标测试、pnpm check及pnpm check:compliance成功；若08后相关变化使证据失效重验，不套旧通过。确认report/inventory格式、counts/失败与输出义务未弱化，真扫描不代替合成负向矩阵。
- 核对01–08全完成、源/产物/包许可和文档链接/元数据、P1-10共享改动保护以及owned资源收尾，未授权的首次公开/法律/阶段退出仍不声称通过。
- 本项仅验证和记录，无新feature/CLI/plugin代码。发现缺口新增新ID修复项在本行前并作为依赖，不改旧ID/历史正确证据或放宽Spec。

## 不包含

不实现补丁、不新增资产/依赖/研究、不补原版hash、不改冻结政策、不部署/发布/push，不能用删除或忽略警告消除许可义务。

## 关键文件与契约

只读[Spec](../spec.md)、[Goal](../goal.md)、01–08完成证据、工具/根文档/当前dist；本项只写验收证据与唯一tracker。

## 验收标准

- [ ] S-01至S-07、AC-01至AC-15完整覆盖、证据当前适用，正/负样本真实命中目标错误，无未完成必需范围。
- [ ] 最终工具目标Vitest、pnpm check/compliance通过，报告与清单/notice有效；原版记录/Core/Runtime/Session规则、既有检查与版本不放宽。
- [ ] 完整源码/产物/许可与人工审阅证据明确，只本地检查、无原版/隐私泄露与未授权外部操作，owned资源清理完成。
- [ ] 01–08全完成、文档/导航准确；本项仅验证，无新代码，不冒称P1/P5退出或法律/严格clean-room保证。

## 验证方法

复核08对应最终树的命令/输出身份；失效则重跑目标Vitest、pnpm check、pnpm check:compliance与必要相关DOM核对。浏览器仅相关表面按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；[简化](../../../../../.agents/skills/simplify/SKILL.md)限定本项验证文档。检查完整diff、文件清单、S/AC及依赖图，无原版或实机新实验。

## 完成证据
