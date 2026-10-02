---
type: plan
status: active
phase: P1
task: "01"
subtask: "06"
updated: 2026-10-01
---

# 06 — 完整契约最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-06、AC-01 至 AC-10，包含范围排除和已知限制。
**依赖：** 01, 02, 03, 04, 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐条对照 approved spec、goal 覆盖表、完成代码与 01 至 05 证据，确认所有验收由真实结果而非代理检查支持。
- 重新运行当前完整工程与 Python 检查，核对测试发现、真实配置来源、目标诊断和允许层对照。
- 核对 05 浏览器证据对应当前构建；若其后产物或入口行为发生变化，按 browser-testing 重验，不能复用无效结果。
- 核对声明/锁文件未升级、无新依赖、无原版数据或用户文件进入本任务提交，临时样本和自有服务已清理。
- 本项只验证和记录；发现实现缺口新增修复 subtask，保持 06 为最终行并更新依赖，再重跑。不得在最终验证悄悄实现代码或改变验收。

## 不包含

- 不实现新功能、重写 spec 或修复未规划代码。
- 不视为 P1 阶段退出评审，不宣称 Core/Runtime/完整保真已通过。
- 不要求外部部署、原版文件、真实 Ghidra或新增 E2E 工具。

## 关键文件与契约

- [Spec](../spec.md)、[Goal](../goal.md)和同目录 01 至 05：权威契约、覆盖和验收证据。
- 计划交付的 `tools/engineering-boundaries.test.ts`、[ESLint](../../../../../eslint.config.js)、[TS core](../../../../../tsconfig.core.json)、[工程说明](../../../../engineering/README.md)、[STATUS](../../../../STATUS.md)：最终对齐对象。

## 验收标准

- [ ] S-01 至 S-06、AC-01 至 AC-10 全部有匹配且当前有效的交付/证据，spec 行为无新增或删减。
- [ ] 九类矩阵没有因文件作用域、缺包、无关报错或空用例而假通过；同步/宿主限制与例外明确，Promise 链仍只记录为限制。
- [ ] 最新 `pnpm check` 和独立 Python 测试通过，现有测试未被降级/skip。
- [ ] 最小 dev/build/preview 浏览器证据真实且适用于最终版本，所有权清理完成。
- [ ] STATUS/工程约定的证据和事实准确，未将任务通过误写为整个阶段通过。
- [ ] 没有 goal 范围之外的代码、依赖、原版内容、用户改动或云操作；代码交付已有聚焦本地提交。

## 验证方法

- `pnpm check`；`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`，记录最终版本与结果。
- 核对 01 至 05 证据及相关提交；检查本任务范围与未提交变化。原版数据不得因检查而读取。
- 需要重验浏览器时用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；仅文档证据修改检查结构/链接/元数据，不另作代码 cleanup。

## 完成证据
