---
type: plan
status: active
phase: P3
task: "12"
subtask: "16"
updated: 2026-10-15
---

# 16 — Render State 消费、相机投影与画面合成

**契约来源：** [spec](../spec.md) 的 S-02、S-03、S-12、AC-04、AC-05、AC-16；[Render State 的消费](../spec.md#render-state-的消费)、[相机、投影与视口](../spec.md#相机投影与视口)、[画面合成与 P3-13 接口](../spec.md#画面合成与-p3-13-接口)。
**依赖：** 01, 03, 10, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/scene/` 与 `src/render/flight/composition/`：
  - 插值：同 ID、同放置序号时位置线性、姿态在正确手性的渲染坐标中做旋转插值；新 ID、放置序号变化、视角或子模式切换、观察或跟随对象切换、Warp 序号变化与 run 变化都不跨界插值；暂停与 0 tick 帧只重画。
  - 可见集合：按 Render State 与 Q-10；`map-marker` 不画；观察实体在 F1 与 Warp 中不画；被毁源与源释放的显隐按 10 的字段。
  - 相机与投影：F1 与 Warp 的显示相机；被毁视角取 14 的相机；视口、视场、投影中心、取整与近远裁剪按 Q-01，在 640×480 逻辑画面中表示；坐标转换按 Q-13。
  - 合成：逻辑画面到绘制缓冲的等比变换；按 Q-03 定稿的层次；供 P3-13 登记层的接口（逻辑变换、视角与子模式、当前 Render State、最新 projection）。
- 把场景与合成接入 15 的渲染器。
- 测试：插值与折叠边界、可见集合、合成点的逻辑屏幕坐标与原版公式一致、窗口与像素比变化不改变逻辑投影、测试层在指定逻辑位置绘制。

## 不包含

- 光照、受击闪烁、星云、效果、精灵、闪光与隧道（17 至 22）。

## 关键文件与契约

- 计划新增：`src/render/flight/scene/`、`src/render/flight/composition/`。
- 输入：15 的渲染器、14 的被毁视角相机、10 的 Render State 字段。

## 写入范围

- `src/render/flight/scene/**`：插值、可见集合、相机与投影。
- `src/render/flight/composition/**`：逻辑画面、层次与 P3-13 接口。
- `src/render/flight/renderer/**`：接入场景与合成。

## 验收标准

- [ ] AC-04：插值、折叠与可见集合的每项断言通过；0 tick 帧不推进。
- [ ] AC-05：视口、视场、投影中心、取整与近远裁剪等于 Q-01；合成点坐标与原版公式一致；窗口与像素比变化不改变逻辑投影与可见对象。
- [ ] AC-16：等比变换（最多一设备像素的取整差）、层次与测试层通过。
- [ ] `pnpm exec vitest run src/render/flight` 通过。

## 验证方法

- Node 测试（记录表面）；浏览器部分由 25 验证。

## 完成证据
