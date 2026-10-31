---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "19"
updated: "2026-10-30"
---

# 19 — 修复：缩放下爆炸精灵的逻辑像素取样（P3-12 AC-05、AC-13、AC-16）

**契约来源：** [spec](../spec.md) 的 S-05（不改变契约的缺陷）、AC-15，以及[技术决定](../spec.md#技术决定) 9、10；被修复的契约为 [P3-12 spec](../../12/spec.md) 的 AC-05、AC-13、AC-16 与技术决定 3、4。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来源

[11](./11-render-test-risks.md#完成证据) 在当前候选上用真实 `ExplosionSprites` 与合成帧复现（已确认，代码与浏览器读数）：缓冲宽度使设备像素中心恰在逻辑像素边上时（485、576、800、960、1066 等；640、1280 不受影响），精灵在左、上、下外边与块内边常取边前一侧，而共用的 `LOGICAL_PIXEL_GLSL` 各层取边后一侧，露出任何逻辑像素都没有的组合；下外边处插值源坐标恰为 `v1`，`texelFetch` 读到堆叠纹理中下一帧的第 0 行。这与 P3-15/13 修复的是同一类缺陷，违反 P3-12 AC-05、AC-16（逻辑像素取样）与 AC-13（帧号与透明游程）。原责任 P3-12/21。受击闪烁屏幕门在本机未违反，不在本项范围。

## 工作范围

- **先复现：** 在当前候选上以 Node 着色器规则测试或浏览器读数复现两种失败（边前取样与跨帧读取），记录根因。
- **修复：** 精灵片元改用共用的 `logicalPixel()` 决定逻辑像素，再由它求帧像素与块；网格按逻辑像素扩边，块外与帧外丢弃，不读相邻帧；深度与绘制次序不变。方向可由实现调整，但须与 `LOGICAL_PIXEL_GLSL` 的规则一致，不改原判据。
- **回归：** Node 测试覆盖边线上的取样与帧边界；浏览器中用相邻帧互不相同的合成帧，在 485、576、800、960、1066 宽逐设备像素严格比较（可为新的开发项目 E2E 用例），去掉修复后失败。不放宽判据、不加重试。
- **文档：** [render 模块说明](../../../../engineering/modules/render.md#画面合成)“已知”段：爆炸精灵改用共用规则；受击闪烁屏幕门按 11 的结论写明只在 Chrome 156 / ANGLE Metal / Apple M2 实测、其他 GPU 须复测。

## 不包含

- 受击闪烁屏幕门的修改；其他渲染层；原版对照。

## 关键文件与契约

- `src/render/flight/sprites/explosion-sprites.ts`、`sprite-rules.ts` 及其测试；`LOGICAL_PIXEL_GLSL` 的所在模块；11 的私有探针 `local/research/p3-16/render-risk/`。

## 写入范围

- `src/render/**`：精灵着色器、共用规则的复用与测试。
- `e2e/flight-sprite-scaling.development.spec.ts`：新的逐像素浏览器回归（如需要）。
- `e2e/support/flight-sprite-scaling.ts`：该回归的支持代码（如需要）。
- `docs/engineering/modules/render.md`：“已知”段。

## 验收标准

- [ ] 修复前已复现边前取样与跨帧读取，根因已记录。
- [ ] 修复后各受影响宽度的设备像素逐个符合共用规则，不读相邻帧；回归在去掉修复后失败。
- [ ] 受影响的 Vitest 文件、新增浏览器回归与 `pnpm check` 通过；没有新依赖或原版内容。
- [ ] render 模块说明已更新。

## 验证方法

- `pnpm test -- src/render`，新增用例的 `pnpm exec playwright test <spec> --project development`，再运行 `pnpm check`。

## 完成证据
