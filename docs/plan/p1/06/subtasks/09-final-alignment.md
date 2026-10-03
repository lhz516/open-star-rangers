---
type: plan
status: active
phase: P1
task: "06"
subtask: "09"
updated: 2026-10-02
---

# 09 — 完整 UI 指令闭环最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-08、AC-01 至 AC-15、技术决定 1–9 与“不包含”范围。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 10。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项核对 spec→goal 覆盖→实际实现→01–08 完成证据，并复核以下不变量：
  - 入队不显示成功；持续事实只来自 projection。
  - 结果按 owner+runId+commandId 关联，取消与 unconfirmed 区分清楚。
  - 采样为 10 Hz，关键边界即时发布；没有第二条循环或定时器。
  - store 不保存世界、RenderFrame 或事件历史。
- 运行最终 `pnpm check`；确认 P1-01 至 P1-05 的既有测试没有被删除、跳过或放宽，Core、Runtime、Session、平台宿主与 replay 格式未改。
- 复核前提：P1-05 的 08 已 completed 且证据完整。
- 复核 08 的浏览器证据齐全（实际 hidden、提交计数、StrictMode、卸载/再挂载、HMR、键盘、诊断），且临时编辑与探针已清理。
- 检查依赖与范围：只新增 Zustand（MIT），锁文件同步；无 Playwright/DOM runner、`.test.tsx` 发现范围、云/部署配置、存储或原版内容。
- 检查文档：[工程约定](../../../../engineering/README.md)、[源码结构指南](../../../../engineering/source-structure.md)与[阶段索引](../../tasks.md)与最终实现一致，链接与 front matter 有效。
- 按 [ADR-0014](../../../../decisions/ADR-0014-status-summary-only.md) 不更新 STATUS 退出项；完整证据留给 P1 阶段评审。
- 本项只做验证与文档对齐，不写功能代码。发现缺口时新增稳定新 ID 的修复项，插在本项前并加入依赖。

## 不包含

- 新功能、P1-07/08/09/10 交付或 P1 阶段退出判定。
- push、云资源或部署；无实现改动时不执行 simplify。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与 01–08 子任务文档。
- 01–07 交付的 `src/ui/`、`src/app/composition/`、[App.tsx](../../../../../src/app/App.tsx)，以及只读核验的 [Core](../../../../../src/core/synthetic/synthetic-scene.ts)、[Session](../../../../../src/app/session/synthetic-session.ts) 与 [replay](../../../../../src/core/synthetic/synthetic-replay.ts)。
- [package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml)。

## 验收标准

- [ ] 全部 8 个 S 与 15 个 AC 都有当前有效的完整证据，不以文档 accepted 或部分子任务冒充完成。
- [ ] `pnpm check` 通过，上游回归未被删除、跳过或放宽；受保护模块与格式未改。
- [ ] 命令反馈、采样、运行/owner 隔离与清理不变量一致，无乐观成功或第二条循环。
- [ ] 浏览器证据齐全，没有用模拟结果填补实际 hidden 或 HMR 缺口。
- [ ] 依赖许可、锁文件、范围、隐私与文档检查通过，临时资源已清理。
- [ ] STATUS 退出项未修改，联合回归与阶段判定留给 P1-10 和 P1 阶段评审。

## 验证方法

- `pnpm check`；逐项核对 S/AC 与 01–08 的测试、审阅和浏览器结果；检查文档链接、元数据及 tracker 与 subtask 文件一一对应。
- 只读审阅本 goal 的提交文件，与并行工作分开；浏览器证据使用 08 已取得的记录，缺失则本项不能通过。

## 完成证据
