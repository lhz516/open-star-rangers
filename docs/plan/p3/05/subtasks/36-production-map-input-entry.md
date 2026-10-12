---
type: plan
status: active
phase: P3
task: "05"
subtask: "36"
updated: 2026-10-12
---

# 36 — 生产绑定的隔离地图验证入口

**契约来源：** [spec](../spec.md) S-11、AC-09、AC-12、AC-18；[验证策略](../spec.md#验证策略)。
**依赖：** 27、31。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 隔离地图入口使用唯一生产绑定表，不复制 Escape 条目；保持合成几何与上下文明确标注，不改 Core 或生产地图分工。
- 提供仅开发入口可用的人工开启无锁地图操作，供 37 取得实际 Escape 输入证据。
- 增加未锁地图 Escape 的浏览器回归；保留已锁 Escape 仅解锁的既有测试及全部地图回归。

## 写入范围

- `src/ui/game-input/map-input-entry.test-support.tsx`
- `e2e/map-input.development.spec.ts`、`e2e/support/map-input.ts`

## 验收标准

- [ ] 入口使用生产绑定，未锁 Escape 提交一次 toggle-map 并关闭合成地图，不打开任务菜单。
- [ ] 人工验证操作可经可访问按钮进入无锁地图；没有修改生产 Core 状态或添加生产调试入口。
- [ ] 地图 e2e、`pnpm check` 通过；浏览器输入不冒充系统快捷键证据。

## 验证方法

- 地图浏览器回归、完整工程检查、rubber-duck 与 scoped simplify。

## 完成证据
