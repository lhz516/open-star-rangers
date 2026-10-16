---
type: plan
status: active
phase: P3
task: "12"
subtask: "18"
updated: 2026-10-15
---

# 18 — 第 2 列表的受击闪烁

**契约来源：** [spec](../spec.md) 的 S-05、AC-08；[模型、光照与第 2 列表](../spec.md#模型光照与第-2-列表)；Q-05。
**依赖：** 05, 10, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/shimmer/`：`image/hit-shimmer` 的存储索引作为逐纹素阈值，显示色来自模型第 2 列表部件的纹理；尺寸与行序不符在开始前拒绝；由 `hitShimmerStart` 与任务时钟按已确认公式生成不透明度图（0xFF、0x7F、0）与结束时刻。
- 种类 `0x383` 每个对象一份，`0xf9c7c` 共用 16 步；Q-05 的玩家与非玩家、被毁视角、`inWarp`、重复命中与同 tick 切换分支逐项实现，未确认的分支不预写为关闭；0x7F 的呈现按 Q-05，若有屏幕空间图案则按逻辑像素网格生成。
- 导出供 23 接入的 pass；测试覆盖条带边界、各共享步、结束时刻与每个分支。

## 不包含

- 屏幕闪光（21）。
- 接入与浏览器读回（23、25）。

## 关键文件与契约

- 计划新增：`src/render/flight/shimmer/`。
- 输入：17 的光照 pass；10 的 `inWarp`。

## 写入范围

- `src/render/flight/shimmer/**`：受击闪烁 pass 与测试。

## 验收标准

- [ ] AC-08（Node 部分）：阈值与显示色分开消费；条带、共享步、结束时刻与 Q-05 的每个分支都有断言。
- [ ] `pnpm exec vitest run src/render/flight/shimmer` 通过。

## 验证方法

- Node 测试。

## 完成证据
