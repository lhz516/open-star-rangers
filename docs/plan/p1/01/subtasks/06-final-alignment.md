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

- [x] S-01 至 S-06、AC-01 至 AC-10 全部有匹配且当前有效的交付/证据，spec 行为无新增或删减。
- [x] 九类矩阵没有因文件作用域、缺包、无关报错或空用例而假通过；同步/宿主限制与例外明确，Promise 链仍只记录为限制。
- [x] 最新 `pnpm check` 和独立 Python 测试通过，现有测试未被降级/skip。
- [x] 最小 dev/build/preview 浏览器证据真实且适用于最终版本，所有权清理完成。
- [x] STATUS/工程约定的证据和事实准确，未将任务通过误写为整个阶段通过。
- [x] 没有 goal 范围之外的代码、依赖、原版内容、用户改动或云操作；代码交付已有聚焦本地提交。

## 验证方法

- `pnpm check`；`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`，记录最终版本与结果。
- 核对 01 至 05 证据及相关提交；检查本任务范围与未提交变化。原版数据不得因检查而读取。
- 需要重验浏览器时用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；仅文档证据修改检查结构/链接/元数据，不另作代码 cleanup。

## 完成证据

- 2026-10-01：以 `2eee1a3` 为最后一个交付提交执行最终对齐；再次 `pnpm check` 通过三个 TS 项目、lint、3 文件/49 用例及 build，独立 Python 3 用例通过。既有解析器测试未改动/删除/skip。
- AC-01 由 [01](./01-toolchain-baseline.md#完成证据) 的版本/锁文件复核支持；最终提交范围中 package.json/pnpm-lock/TS/Vite 配置均未改变，未新增依赖。
- AC-02 至 AC-04 由 [02](./02-type-environment-regression.md#完成证据) 的真实配置与诊断对照、[03](./03-lint-boundary-regression.md#完成证据) 的导入/扩展名/宿主与 async 矩阵支持。回归源码已核对，限制与允许层分开，负向不靠无关错误，Promise 链仍未宣称全面受检。
- AC-05、AC-06 由 [04](./04-check-chain-failure-contract.md#完成证据) 的独立预期失败退出和本次正常完整运行支持，检查器错误/ignored/空输入不是成功结果。
- AC-07、AC-08 由 [05](./05-local-shell-evidence.md#完成证据) 实际 dev 响应与独立 Chromium context 的 React 渲染/刷新支持；本次 build 的 HTML/JS 哈希与浏览器验证时完全相同，证据仍有效。
- AC-09、AC-10：两端口无监听，临时源由 finally 清理，项目无临时生产文件；源码变化仅为 ESLint 和工程回归测试，原版文件、用户数据和应用代码未进入变更。工程说明与 STATUS 已改为当前证据，其他运行骨架与 P1 退出保持未通过。
- 已建立 5 个前置本地提交：`2fc8c35`（基线）、`d12845b`（类型回归）、`eb68982`（lint）、`98873c3`（失败传播）、`2eee1a3`（本地浏览器/说明）。无 push、CI、部署或云修改。最终项只更新验证文档，未实现额外功能。
- 全部 S/AC 对齐，无需要新增的修复 subtask；本任务完成不等于 P1 阶段或原版保真通过。
