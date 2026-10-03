---
type: plan
status: active
phase: P1
task: "10"
subtask: "08"
updated: 2026-10-03
---

# 08 — 最终覆盖与边界对齐（仅验证）

**契约来源：** [Spec](../spec.md) 的 S-01 至 S-06；AC-01 至 AC-12。
**依赖：** 01, 02, 03, 04, 05, 06, 07。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项核验Spec全部S/AC与01–07真实证据，确认没有以bootstrap/Node/旧手工报告代替新runner必需浏览器测量。
- 检查工程与完整E2E在最终树通过，开发/生产/开发headed各有实际结果；类型/lint/Vitest边界、frozen锁、生产产物隔离保持。
- 核对关键阈值与输出：移动≥1s、像素≥9/±3、稳定≥3样本/≥300ms、各3轮/9输入/3生命周期/rAF≤1/GPU无增长/菜单净0、布局≤1px、replay真实match/mismatch、原生hidden与WebGL降级。
- 核对AC-10证据适用性、错误非零、资源所有权清理、文档元数据/链接与审批；不tick任何阶段退出。发现缺口添加新ID补救项在本行前并成为依赖，本项不交付新功能代码。

## 不包含

不写feature/helper/config代码、不修行为、不降低阈值、不扩大浏览器/设备/原版范围。无云/CI/push/发布授权，不重写上游历史证据。

## 关键文件与契约

只读[Spec](../spec.md)、[Goal](../goal.md)与01–07的交付/完成证据；本项只记录验收结果并维护唯一tracker，相关文档若有缺口归补救项。

## 验收标准

- [ ] S-01至S-06、AC-01至AC-12全部有适用且可追溯证据，无未完成必需browser判据或待解决错误。
- [ ] pnpm check、pnpm test:e2e与frozen锁证据对应最终树，源/产物中无Playwright测试入口或原版内容、无生产行为/纯模块边界变化。
- [ ] 所有owned资源/临时源码编辑/fixtures收尾，工程文档及链接准确，历史证据适用性与新测量区别明确。
- [ ] 01–07均完成，最终对齐只验证，无新增feature，无P1/P5退出/跨引擎保真声明。

## 验证方法

复核07最终命令与产物身份；若后续变更使其失效，重跑pnpm check及pnpm test:e2e，不能套用旧成功。浏览器证据核验/必要补测按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，[简化](../../../../../.agents/skills/simplify/SKILL.md)只审查本项验证文档，不重构生产代码。审阅完整diff、目标文件、tracker图与S/AC覆盖，无原版/实机新实验。

## 完成证据
