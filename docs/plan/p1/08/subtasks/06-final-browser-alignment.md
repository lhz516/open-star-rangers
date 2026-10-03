---
type: plan
status: active
phase: P1
task: "08"
subtask: "06"
updated: 2026-10-02
---

# 06 — 最终浏览器对齐

**契约来源：** [spec](../spec.md) 全部 S-01–S-08 与 AC-01–AC-15 的覆盖核对；浏览器证据对应 AC-01、AC-03–AC-07、AC-10–AC-13，并交叉验证 AC-15。
**依赖：** 01, 02, 03, 04, 05, 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只做验证，不交付新功能代码；发现缺口时由 execute-goal 新增修复子任务，插入本行之前并加入依赖。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 与[工程约定](../../../../engineering/README.md#已验证的-cdp-自动化路线)的 CDP 路线：自有 `pnpm dev` 与 `pnpm build` + `vite preview`，隔离临时 profile 的 Chrome，init script 探针按调用栈归属计数 rAF、生命周期监听、ResizeObserver、resolution 查询、键盘监听与画布。
- 逐项取得 AC-01、AC-03、AC-04、AC-05、AC-06、AC-07、AC-11、AC-13 证据；AC-10 在 WebGL 禁用的隔离 Chrome 中取证；AC-12 由执行回合做可还原的 Fast Refresh 编辑并确认 effect 实际重跑，结束后还原并证明无残留。
- 核对 goal 验收覆盖表每一行都有实现与证据；汇总 01–05 的 Node 与审阅证据；更新 goal 执行记录、阶段索引导航，以及在优先项变化时更新 [STATUS](../../../../STATUS.md)。

## 不包含

- 功能实现或修复（新增修复子任务）。
- Firefox、WebKit、真实设备矩阵与系统快捷键拦截（P1-10/P5）。
- 罕见失败（failed/faulted/清理失败锁存）的浏览器复现：无注入入口，以 02/03 Node 与 05 审阅为证，不伪造。

## 关键文件与契约

- 证据写入本文件“完成证据”；浏览器只用种子 0 的合成演示，截图在页面内解码采样，不入库。
- 既有 P1-07 观察：上下文丢失/恢复后释放产生的 Three.js `INVALID_OPERATION` 警告不属于本任务，测试窗口不主动执行该路径。

## 验收标准

- [ ] AC-01、AC-03–AC-07、AC-10（浏览器部分）、AC-11、AC-12、AC-13 的真实浏览器证据完整，或逐项记录 blocked 及准确原因。
- [ ] AC-15 的浏览器交叉验证（一次性 start、先释放后创建、Exit 不被撤销）与 03 的 Node 证据一致。
- [ ] 验收覆盖表的每个 S/AC 都有实现与证据；`pnpm check` 在最终代码上通过；`node tools/task-state.ts p1/08` 在 tracker 全部 completed 后路由为 `done`。
- [ ] 自建浏览器、服务器、临时 profile 与临时编辑全部清理；`git status` 除预期改动外无残留；无原版内容或截图入库。

## 验证方法

- 每项按 spec 的验证方法列出：设置/操作、预期、观察证据、结论（passed/failed/blocked）。
- 环境记录：浏览器版本、操作系统、视口、源、启动参数、隔离方式与清理结果。

## 完成证据
