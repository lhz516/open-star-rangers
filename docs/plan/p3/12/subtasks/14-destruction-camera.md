---
type: plan
status: active
phase: P3
task: "12"
subtask: "14"
updated: 2026-10-15
---

# 14 — 被毁视角相机

**契约来源：** [spec](../spec.md) 的 S-03、AC-06（Node 部分）；[被毁视角](../spec.md#被毁视角)。
**依赖：** 01, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/render/flight/presentation/destruction-camera/`（计划新增）实现：视角 0x11、子模式 8 时，从 10 提供的转换事实（发生处的座机位姿与时钟）初始化，绕第 0 行转 32°；逃生舱出现前姿态保持、按 −30 × 进入后秒数沿相机第 2 行后退；跟随逃生舱时每 tick 转向、用叉积重建轴、距离首次取当前值后每 tick 向 30 缓动四分之一。
- 退化方向按 01 的结论处理；01 未确认时该项保持 blocked，不输出 NaN 或任意朝向。
- 步首与步末相机正确区分；离开该视角回到 F1 相机；救援复位与同 ID 的新销毁序列重新初始化。
- 测试：逐 tick 与权威公式一致（误差按 f32 舍入推导）；帧内进入并退出、跟随点失效、退化方向、救援复位。

## 不包含

- 进入与结束的规则（P3-11）。
- 渲染与浏览器场景（16、25）。

## 关键文件与契约

- 计划新增：`src/render/flight/presentation/destruction-camera/`。
- 输入：10 的视角转换事实与 `followedEntityId`。

## 写入范围

- `src/render/flight/presentation/destruction-camera/**`：被毁视角相机与测试。

## 验收标准

- [ ] AC-06（Node 部分）：初始化、后退、跟随、首次距离与逐 tick 缓动满足权威公式；各边界情形不产生 NaN。
- [ ] `pnpm exec vitest run src/render/flight/presentation` 通过。

## 验证方法

- Node 序列测试。

## 完成证据
