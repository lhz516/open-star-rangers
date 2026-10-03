---
type: plan
status: active
phase: P1
task: "07"
subtask: "08"
updated: 2026-10-02
---

# 08 — 最终浏览器证据与契约对齐

**契约来源：** [spec](../spec.md) 的全部 S-01–S-09、AC-01–AC-17。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 09, 10。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用自有 Vite、隔离 Chromium profile 和 seed 0 合成数据，完成真实画面、4:3 黑边、DPR、上下文丢失/恢复、unavailable（能力可用时）、暂停/重启/退出及 React/StrictMode 生命周期证据。
- 对 HMR/Fast Refresh 与临时 Profiler 证据按 spec 准备、观察、还原；记录扩展能力、blocked 项和清理结果。
- 最终核对 spec/goal/subtask 覆盖、工程文档、依赖/锁文件、工作树和无原版内容。

## 不包含

- 不建立 Playwright runner、CI、部署或真实多浏览器/设备矩阵。
- 不把 Canvas 存在、HTTP 200 或 Node 替身当作 WebGL 通过；不修改 browser-testing skill 的约束。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md)、本 subtask。
- [browser-testing skill](../../../../../.agents/skills/browser-testing/SKILL.md)、[App](../../../../../src/app/App.tsx)、[package.json](../../../../../package.json)。

## 验收标准

- [ ] AC-05、AC-08、AC-09、AC-10、AC-12、AC-14、AC-15 的真实浏览器证据完整或逐项记录 blocked。
- [ ] 所有浏览器测试只使用自建 synthetic 数据，记录 browser/OS/origin/viewport/DPR/错误与清理。
- [ ] 终审确认所有 S/AC 有实现与证据映射，`node tools/task-state.ts p1/07 --json` 路由可进入 done。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的 preflight、隔离、清理要求；截图 Buffer 在页面内解码后只保留文字采样。
- 运行 `pnpm check` 和 `node tools/task-state.ts p1/07 --json`；审阅 `git diff`/`git status`，不得提交原版内容或临时插桩。

## 完成证据
