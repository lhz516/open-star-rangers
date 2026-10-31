---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "24"
updated: "2026-10-31"
---

# 24 — 受击闪烁屏幕门改用共用的逻辑像素规则

**契约来源：** [spec](../spec.md) 的 S-05、AC-15，[审批](../spec.md#审批)修订 1；[P3-12 spec](../../12/spec.md) 的 AC-05、AC-16 与技术决定 3、4。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来源

[11](./11-render-test-risks.md#完成证据) 确认屏幕门在缩放比 ≥ 1 时以浮点除法取逻辑像素的 (x & 3, y & 3)，只在 Chrome 156 / ANGLE Metal / Apple M2 上实测与共用规则一致；其他 GPU 可能在边线上取另一侧。[19](./19-explosion-sprite-sampling.md#完成证据) 已把爆炸精灵改到共用规则。

## 工作范围

- 屏幕门片元改用 `LOGICAL_PIXEL_GLSL` 的 `logicalPixel()` 求逻辑像素与门格；窄于 640 时的已批准设备网格差异保持不变。不改其他层或原判据。
- 回归：Node 着色器规则测试覆盖边线；浏览器中在 485/576/800/960/1066 宽逐设备像素严格比较（可仿照 19 的 `flight-sprite-scaling` 用例），去掉修复后应仍通过的部分与必须失败的部分分别写明（本机 GPU 原本一致时，以 Node 规则测试证明修复前的实现依赖浮点除法）。
- 更新 [render 模块说明](../../../../engineering/modules/render.md#画面合成)的“已知”段与 [engineering README](../../../../engineering/README.md) 的飞行渲染用例清单。

## 不包含

- 其他渲染层；原版对照。

## 关键文件与契约

- `src/render/flight/shimmer/`、`src/render/flight/composition/logical-screen.ts`；19 的回归 `e2e/flight-sprite-scaling.development.spec.ts`。

## 写入范围

- `src/render/flight/shimmer/**`：屏幕门着色器与测试。
- `src/render/flight/composition/**`：只在复用共用规则需要时修改。
- `e2e/flight-shimmer-scaling.development.spec.ts`、`e2e/support/flight-shimmer-scaling.ts`：新的浏览器回归。
- `docs/engineering/modules/render.md`、`docs/engineering/README.md`：相应说明。

## 验收标准

- [ ] 屏幕门用共用规则取逻辑像素；各受影响宽度逐设备像素符合共用规则；窄缓冲的已批准差异不变。
- [ ] Node 规则测试与浏览器回归通过，`pnpm check` 通过；没有新依赖。
- [ ] 文档已更新。

## 验证方法

- `pnpm test -- src/render`、新用例的 `pnpm exec playwright test <spec> --project development`、`pnpm check`。

## 完成证据
