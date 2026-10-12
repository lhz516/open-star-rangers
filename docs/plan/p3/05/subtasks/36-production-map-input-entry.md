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
- 增加未锁地图 Escape 的浏览器回归；保留浏览器原生解锁后地图仍打开的回归。Playwright 投递到页面的 Escape 按生产绑定关闭地图，不冒充原生 Escape 的仅解锁路径。

## 写入范围

- `src/ui/game-input/map-input-entry.test-support.tsx`
- `e2e/map-input.development.spec.ts`、`e2e/support/map-input.ts`
- `docs/engineering/keyboard-input.md` 的隔离地图入口说明与更新时间。

## 验收标准

- [x] 入口使用生产绑定，未锁 Escape 提交一次 toggle-map 并关闭合成地图，不打开任务菜单。
- [x] 人工验证操作可经可访问按钮进入无锁地图；没有修改生产 Core 状态或添加生产调试入口。
- [x] 地图 e2e、`pnpm check` 通过；浏览器输入不冒充系统快捷键证据。

## 验证方法

- 地图浏览器回归、完整工程检查、rubber-duck 与 scoped simplify。

## 完成证据

- **2026-10-12：** 入口改用唯一的 `GAME_INPUT_BINDINGS`。`?manual=1` 才挂载人工开启无锁地图、读取观察快照和关闭测试会话按钮；默认入口布局、几何及资源计数不变。按钮明确标注合成地图，错误显示在快照中；不改 Core 或正式任务地图。
- `OSR_E2E_DEV_PORT=5301 OSR_E2E_PREVIEW_PORT=5302 pnpm exec playwright test e2e/map-input.development.spec.ts --project=development --workers=1`：最终 **11/11** 通过，无重试。新增无锁 Escape 验证一次 `toggle-map`、关闭地图、不打开菜单、关闭后不再提交地图命令；页面投递的已锁 Escape 另验证关闭地图并释放锁。原生浏览器解锁仍独立验证地图保持打开；像素/DPR、回退、重复选择、暂停、焦点与资源回收回归全部保留。
- 首轮 **9/10** 通过，失败是旧测试依赖 TEST_BINDINGS 缺少地图 Escape，错误地预期页面收到 Escape 后仍锁定。现按生产表拆分页面 Escape 与原生解锁断言，没有放宽原生行为契约。原生 Escape 与实际 Keyboard Lock 证据仍由 37 获取。
- 最终 `pnpm check`：typecheck、lint、**243 文件 / 7305 测试**、生产 build 全通过。rubber-duck 无阻断或非阻断发现；四角度 scoped simplify 将 loader 的裸布尔参数改为具名 `manual` 选项，未引入只有两处短断言才需要的抽象。
- 文档影响：更新键盘指南的开发入口操作说明；31 历史证据及剩余 AC-18 未改写为通过。不改变冻结决策、原版事实、阶段优先级或 STATUS。
