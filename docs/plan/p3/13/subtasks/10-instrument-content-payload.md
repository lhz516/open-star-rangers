---
type: plan
status: active
phase: P3
task: "13"
subtask: "10"
updated: 2026-10-25
---

# 10 — 仪表调度规范内容

**契约来源：** [spec](../spec.md#内容输入与校验) 的 S-01，AC-02/05。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 实现仪表/元素调度 payload 的编码、严格读取、schema 与预算，slot/layout 身份、顺序、矩形、间隔与图像引用完整。
- 保留 slot 7 的无图像/类型 8，不修改 LayoutPayload 的最小元素约束来凑数据；不含原版指针或 last-draw 状态。
- 提供合成 payload 支持；新 schema 的读取/坏输入与不可变所有权测试同项完成。

## 不包含

不读取原版文件，不接 Worker/版本清单（11），不绘制仪表。

## 关键文件与契约

- 现有 [map-geometry-payload.ts](../../../../../src/content/hud/map-geometry-payload.ts)、[layout-payload.ts](../../../../../src/content/graphics/layout-payload.ts)。
- 计划新增 `src/content/hud/instruments-payload.ts`、同名 `.test.ts`、`instruments.test-support.ts`，最终名称以 D-01 为准。

## 写入范围

- `src/content/hud/instruments-payload.ts`：计划新增规范内容。
- `src/content/hud/instruments-payload.test.ts`：合成正反例。
- `src/content/hud/instruments.test-support.ts`：计划新增共享夹具。

## 验收标准

- [ ] 正常 round-trip、零图像布局、顺序与矩形单位保持。
- [ ] 截断、未知参数、重复/缺失引用、计数/字节超限均明确失败，分配前检查。
- [ ] 不含原版内容、运行指针或可变跨消费者别名。

## 验证方法

文件落地后 `pnpm test -- src/content/hud/instruments-payload.test.ts`、`pnpm check`；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 限定本 payload，不抽象通用 schema 框架。

## 完成证据
