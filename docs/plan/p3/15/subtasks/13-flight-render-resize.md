---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "13"
updated: "2026-10-30"
---

# 13 — 飞行画面缩放取样失败的定位与修复（修复项）

**契约来源：** [spec](../spec.md) 的 S-09、AC-10（`pnpm test:e2e` 通过，失败须修复并重跑）；被测契约为 [P3-12 spec](../../12/spec.md) 的 AC-05、AC-16（缩小后的画面是同一逻辑画面，每个设备像素显示其中心所在的逻辑像素）。处置依据见 [goal 执行记录](../goal.md#执行记录) 2026-10-30“修复项 13”。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 定位 [flight-render.development.spec.ts](../../../../../e2e/flight-render.development.spec.ts) 第 63 行用例的间歇失败：窗口缩到 520 宽（缓冲 485×364，缩放 0.7578125）后，2–12 个设备像素没有显示其中心所在的逻辑像素，而是显示上下或左右相邻一格的颜色（协调者的临时探针：逻辑坐标 x 259、377–383，y 191–192 一带，旁边是驾驶舱叠加的红/黄色，失配色为蓝色系）。[P3-14/29](../../14/subtasks/29-full-e2e-remediation.md#完成证据) 已确认它在 P3-13 的提交上同样失败，P3-12/P3-13 当时在 Chrome 155 上通过，本机 Chrome 已升到 156。
- 先查明是哪一个图层（星云、星点、尘埃、三维模型、效果，或驾驶舱/叠加的合成）没有按“设备像素中心 → 逻辑像素”的取样，或者是浏览器合成（画布缩放、`image-rendering`）引入的偏移；用可重复的证据（逐层关闭、读回中间结果或单元测试）说明根因。
- 按根因修复：
  - 若产品某层违反 P3-12 AC-05/AC-16：在该层的渲染代码中修复，补单元或浏览器回归，保持其他验收不变；这是对 P3-12 交付的修复，记入其模块说明的已知问题或交接。
  - 若是测试对某层的假设错误（该层按契约本就不是逻辑像素取样），或是浏览器在 Chrome 156 上不可控的取样差异：修正测试判据，使其只对契约规定的内容做逐像素断言，并写明依据；不得用笼统容差掩盖产品缺陷。
- 修复后该用例单独连续 10 次通过；顺带复核 [map-picture.development.spec.ts](../../../../../e2e/map-picture.development.spec.ts) 第 211 行（完整套件高负载下失败一次、单独 3/3 通过）是否有对负载敏感的时间窗口，只记录结论，必要时另报。

## 不包含

- 与本失败无关的渲染或驾驶舱改动；改变任何原版对照结论。

## 关键文件与契约

- `src/render/flight/**`（星云 `nebula/`、星点 `starfield/` 等以 `texelFetch(floor(texel))` 取逻辑像素）、`src/render/cockpit/**`、`src/render/flight/composition/logical-screen.ts`；[render 模块说明](../../../../engineering/modules/render.md)。

## 写入范围

- `e2e/flight-render.development.spec.ts`：测试判据（仅在根因证明测试有误时）。
- `e2e/support/flight-pictures.ts`：读回辅助（如需）。
- `src/render/flight/**`：产品修复与单元测试（仅在根因为产品缺陷时）。
- `src/render/cockpit/**`：同上。
- `docs/engineering/modules/render.md`：已知问题或交接说明。
- `local/research/p3-15/flight-render/**`：私有探针与读数。

## 验收标准

- [ ] 根因有可重复的证据，并说明是产品缺陷、测试假设错误还是浏览器取样差异。
- [ ] 按根因修复后，`flight-render.development.spec.ts:63` 单独连续 10 次通过，其余 `flight-render.development` 与 `flight-render.production` 用例通过；没有用笼统容差掩盖产品缺陷。
- [ ] `pnpm check` 通过；文档与修复一致；`map-picture.development.spec.ts:211` 的复核结论已记录。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：`pnpm test:e2e e2e/flight-render.development.spec.ts --project=development --repeat-each=10`（或单独用例），以及 `e2e/flight-render.production.spec.ts --project=production`；修复的产品代码有单元测试；`pnpm check`。

## 完成证据
