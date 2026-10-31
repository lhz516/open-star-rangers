---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "11"
updated: "2026-10-30"
---

# 11 — 渲染与测试已知风险的复现

**契约来源：** [spec](../spec.md) 的 S-05、AC-15、[技术决定](../spec.md#技术决定) 9 与 10。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **map-picture 测试：** 对 `map-picture.development.spec.ts:211` 在 [P3-15/13](../../15/subtasks/13-flight-render-resize.md#完成证据) 中记为“对负载敏感”的两处判断做聚焦复现：单独运行与高负载下多次运行，读源码与断言。判断失败是测试判断问题还是产品违反原判据。
- **渲染取样：** 对[render 模块说明](../../../../engineering/modules/render.md)中爆炸精灵与受击闪烁屏幕门在缩放下仍用旧取样的风险，按 [P3-12 spec](../../12/spec.md) 的 AC-05、AC-16 判断缩放下边界像素的差异是否违反原判据。必要时用合成内容在若干缩放比下聚焦复现。
- **结论：**
  - 确认违反原判据的，交协调者新增修复项（写明原责任与 AC）；
  - 不违反的，写明依据与适用条件，作为交接的已知风险；
  - 不因旧报告写“留给所有者”而自动放行。

## 不包含

- 本项内修改产品代码或测试（由修复项执行）；全量 E2E（09）。

## 关键文件与契约

- [map-picture.development.spec.ts](../../../../../e2e/map-picture.development.spec.ts)、`src/render/flight/sprites/`、`src/render/flight/composition/`、[render 模块说明](../../../../engineering/modules/render.md)。

## 写入范围

- `dist/**`：聚焦运行的构建（被忽略）。
- `test-results/**`、`playwright-report/**`：聚焦运行的输出（被忽略）。
- `local/research/p3-16/render-risk/**`：复现记录与截图（被忽略）。

## 验收标准

- [ ] AC-15：两项风险各有基于当前候选的复现记录与结论（违反原判据 / 不违反，及其依据）。
- [ ] 违反原判据的项已交修复，或写明不违反的依据与适用条件；没有自动放行。

## 验证方法

- `pnpm build` 后以 `pnpm exec playwright test e2e/map-picture.development.spec.ts --project development --repeat-each N` 聚焦运行；Node 中按逻辑像素规则核对；按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成内容取证。

## 完成证据
