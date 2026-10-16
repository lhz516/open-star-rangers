---
type: plan
status: active
phase: P3
task: "12"
subtask: "20"
updated: 2026-10-15
---

# 20 — 弹丸、导弹与碎片的绘制

**契约来源：** [spec](../spec.md) 的 S-07、AC-10；[弹丸、导弹与碎片](../spec.md#弹丸导弹与碎片)；Q-07、Q-08。
**依赖：** 05, 13, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/objects/`：
  - 弹丸：`projectile` 选择器所指 RENS 记录的程序几何；导弹：对应导弹类型的机身与 TEX 10377 元素（只用第 0 个旋转映射）；放置、朝向、受光、颜色与跨接缝插值按 Q-07。
  - 判别值 3 碎片：源模型第 1 列表的原序号部件，逃生舱绘制部件 0–2；判别值 1、2 碎片（来自 13）：TEX 10151 的程序形状与 MODL 10383 第 1 列表部件；放置、自转轴与光照按 Q-08。
  - 记录或部件序号越界按内容/契约错误处理，不替代外观。
- 导出供 23 接入的 pass；测试覆盖每种外观来源、序号越界与 Q-07、Q-08 的分支。

## 不包含

- 爆炸精灵（21）。
- 接入与浏览器读回（23、25）。

## 关键文件与契约

- 现有：[effect-payload.ts](../../../../../src/content/effects/effect-payload.ts)、[viewer-effects.ts](../../../../../src/render/viewer/viewer-effects.ts)（`fanTriangles`、`effectViews` 可复用）。
- 计划新增：`src/render/flight/objects/`。

## 写入范围

- `src/render/flight/objects/**`：弹丸、导弹与碎片 pass 与测试。

## 验收标准

- [ ] AC-10（Node 部分）：各外观来源与 Q-07、Q-08 的断言通过；越界引用报错。
- [ ] `pnpm exec vitest run src/render/flight/objects` 通过。

## 验证方法

- Node 测试；合成内容来自 [effects.test-support.ts](../../../../../src/content/effects/effects.test-support.ts)。

## 完成证据
