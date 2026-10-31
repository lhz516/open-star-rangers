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

- `src/render/**`：精灵着色器、共用规则的复用与测试（实际改动：`sprites/explosion-sprites.ts` 及其测试、新增浏览器测试支持 `sprites/sprite-scaling.test-support.ts`、`composition/logical-screen.ts` 新增 `logicalQuadCorners`）。
- `e2e/flight-sprite-scaling.development.spec.ts`：新的逐像素浏览器回归（如需要）。
- `e2e/support/flight-sprite-scaling.ts`：该回归的支持代码（如需要）。
- `docs/engineering/modules/render.md`：“已知”段。

## 验收标准

- [x] 修复前已复现边前取样与跨帧读取，根因已记录。
- [x] 修复后各受影响宽度的设备像素逐个符合共用规则，不读相邻帧；回归在去掉修复后失败。
- [x] 受影响的 Vitest 文件、新增浏览器回归与 `pnpm check` 通过；没有新依赖或原版内容。
- [x] render 模块说明已更新。

## 验证方法

- `pnpm test -- src/render`，新增用例的 `pnpm exec playwright test <spec> --project development`，再运行 `pnpm check`。

## 完成证据

- **2026-10-30（worker `exec-p3-16-19`，基于 `1bf33105`）：** 本机 Chrome 156.0.8078.74（headless）、ANGLE Metal / Apple M2，开发端口 5157、预览 5158。私有日志在 `local/research/p3-16/sprite-19/`，只用合成内容。
- **复现与根因（已确认，浏览器读数与代码）：**
  - **复现：** 先写好新的浏览器回归，在未改的候选上运行，5 个宽度全部失败。不在边线上的设备像素全部相符；在边线上的不合处，485、576、800、960、1066 宽依次为 2,762、5,391、18,467、35,231、3,777 处。显示中间帧时，读到下一帧（第 2 帧）像素的依次为 112、192、771、1,860、160 处。
  - **根因：** 旧片元以插值的源坐标 `vSource` 取整求帧像素，块区的外边则由光栅化覆盖决定。设备像素中心恰在逻辑像素边上时，取哪一侧取决于插值误差和光栅化规则，常取边前一侧；`LOGICAL_PIXEL_GLSL` 各层一律取边后一侧。下外边被覆盖时，插值源坐标恰为 `v1`，`texelFetch` 读到堆叠纹理中下一帧的第 0 行。
- **修复（`src/render/flight/sprites/explosion-sprites.ts`）：**
  - **取样：** 片元改用共用的 `logicalPixel()`（材质加 `logicalBuffer` uniform，以 `setLogicalBuffer` 设置，取代 `bufferHeight`）。每个四边形的平直属性 `place`（左、上、s、该帧首行）与新增的 `blocks`（保留块的逻辑矩形，右、下端不含）在四角相同。不在块区内的逻辑像素丢弃；帧像素为 (逻辑像素 − 左上) ÷ s，加上该帧首行，因此只在所示帧内取。
  - **网格：** 四边形比块区每边多一个逻辑像素，用新的共用 `logicalQuadCorners`（`logicalQuad` 也改用它）。
  - **不变：** 深度仍取块左上逻辑像素所在的设备像素（与 `blockDepthPixel` 相同），绘制次序不变。
- **回归：**
  - **Node（`explosion-sprites.test.ts`）：** 断言片元含共用规则与整数取样表达式。在 485/576/800/960/1066 宽、s = 1–3，块的左、内、右、下边与上边落在边线上，逐设备像素按片元的整数运算求值：结果等于边后一侧的逻辑像素所在块的帧像素，帧行不越出所示帧，四边形覆盖每个取到的像素中心。另验证被裁剪精灵的 `place`、`blocks` 与四角，并更新原有属性与 uniform 断言。
  - **浏览器（`e2e/flight-sprite-scaling.development.spec.ts`）：**
    - **装置：** 新增开发项目用例。支持代码为 `e2e/support/flight-sprite-scaling.ts`（期望值按共用规则独立算出，不用渲染模块），浏览器端装置为 `src/render/flight/sprites/sprite-scaling.test-support.ts`（真实 `ExplosionSprites`，9 × 9 合成帧共 3 帧、各不透明像素调色板索引互异，显示第 1 帧）。
    - **覆盖：** 每宽 252 个精灵（1066 宽只有一条可用边行，为 132 个）：块边、外边与内边落在边线上；每种 s 另有 4 个分别在左、右、上、下被裁剪的精灵（按复审意见补充）。读取块区外 4 个设备像素以内的每个设备像素，严格比较。
    - **结果：** 修复后 5 个宽度全部为 0 处不合。读取设备像素依次为 136,349、168,532、265,958、348,626、217,518 个，其中在边线上的 10,957、35,638、93,060、191,054、9,632 个。
    - **去掉修复：** 只把 `explosion-sprites.ts` 换回 `HEAD` 版本，同一回归 5 个宽度全部失败：边线上不合 2,857、5,599、19,076、36,528、3,969 处，读到下一帧 112、206、771、1,913、160 处。之后已恢复修复。
    - **判据：** 无重试，未放宽。
- **检查：**
  - `pnpm exec vitest run src/render/flight/sprites`：36 个用例通过。
  - `pnpm exec playwright test e2e/flight-sprite-scaling.development.spec.ts e2e/flight-scenes.development.spec.ts --project development`：15 个用例通过。
  - `pnpm check`：类型检查、ESLint、Vitest 447 个文件 11,932 个用例、构建全部通过。有一次运行中 `tools/engineering-boundaries.test.ts` 的一个用例 5 s 超时；当时共享机器负载均值约 73，单独重跑与再次 `pnpm check` 均通过。
  - 没有新依赖，没有原版内容。
- **复审（rubber-duck）：** 无阻断问题。核实了：负数整数除法不会出现；平直属性是精确整数；夹到 639/479 不会多画；深度与次序不变；四边形扩边不改变块外像素；左、右、上、下与内边都有覆盖；帧步进与投影都有守卫。非阻断意见“被裁剪精灵未经取样验证”已采纳，补了上述 4 个裁剪位置，期望值独立应用整块裁剪规则（FC8）。
- **simplify：**
  - **已采纳：** 把扩边四角提为共用的 `logicalQuadCorners`；`#place` 的属性写入改为按角重复，去掉每帧的临时数组；读数比较直接沿用放置对象。
  - **未采纳：** 单元测试与浏览器装置的建立代码合并（两者需要不同）；删掉 Node 着色器规则测试（本项要求）；不合像素的分类计数（失败时用于判别）。
  - **复核：** 采纳后上述检查重新通过。
- **文档影响：**
  - **已更新** [render 模块说明](../../../../engineering/modules/render.md#画面合成)：“已知”段写明爆炸精灵改用共用规则、修复与回归；受击闪烁屏幕门仍用浮点除法，只在 Chrome 156 / ANGLE Metal / Apple M2 实测，其他 GPU 须按 11 的探针复测。另补“测试支持”中的新装置与 `logicalQuadCorners`。
  - **建议协调者更新：** [工程约定](../../../../engineering/README.md) 飞行渲染浏览器用例一节（约第 199 行）补列新用例及其聚焦运行命令。该文件不在本项写入范围。
  - **无需改动：** `docs/original/`、unknowns、ADR 与 spec，因为没有新的原版事实或冻结决定。

