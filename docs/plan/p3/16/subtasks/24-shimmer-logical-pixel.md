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

- [x] 屏幕门用共用规则取逻辑像素；各受影响宽度逐设备像素符合共用规则；窄缓冲的已批准差异不变。
- [x] Node 规则测试与浏览器回归通过，`pnpm check` 通过；没有新依赖。
- [x] 文档已更新。

## 验证方法

- `pnpm test -- src/render`、新用例的 `pnpm exec playwright test <spec> --project development`、`pnpm check`。

## 完成证据

- **2026-10-31（worker `exec-p3-16-24`，基于 `01f02be7`）：** 本机 Chrome（headless）、ANGLE Metal / Apple M2，开发端口 5172、预览 5173。私有日志在 `local/research/p3-16/shimmer-24/`，只用合成内容。
- **修复（`src/render/flight/shimmer/hit-shimmer-layer.ts`）：** 片元改为 `ivec2 pixel = logicalBuffer.x < 640 ? ivec2(gl_FragCoord.x, float(logicalBuffer.y) - gl_FragCoord.y) : logicalPixel();`，门格仍为 (pixel.x & 3, pixel.y & 3)。材质的 `logical`（每门格设备像素数与缓冲高）换成共用的 `logicalBuffer`（`logicalBufferUniform`），每次绘制照旧在 `onBeforeRender` 上传本帧缓冲尺寸。窄于 640 的分支与旧式 ⌊(d + ½) ÷ 1⌋ 对每个设备像素相同（行自顶向下），已批准的设备网格差异不变。其他层与 `composition/` 未改。
- **修复前依赖浮点除法（已确认，Node 规则测试）：** 旧式为 float32 的 ⌊(d + ½) ÷ max(W ÷ 640, 1)⌋。边线上的精确商是整数，GLSL ES 3.00 §4.5.1 允许除法有 2.5 ULP 误差，许可范围内的结果向下取整会落在相邻两格，0x7F 门正好一画一不画。按宽度数边线设备行列：485、576（设备网格）为 0，800 为 280，960 为 560，1066 为 4。另有一处与 GPU 无关：1066 宽时最下设备行（799）的中心恰为逻辑 480，正确舍入的旧式取第 480 行的门格，共用规则夹到第 479 行。
- **回归：**
  - **Node（`hit-shimmer-layer.test.ts`）：**
    - **片元：** 断言片元含 `LOGICAL_PIXEL_GLSL`、上述取格行与门格表达式，且不再有 `/ logical.x`。
    - **整数求值：** 在 298、485、576、640、800、960、1066、1280、1600 宽两轴的每个设备像素按片元的整数运算求值。窄于 640 时等于设备像素；否则满足 x·W ≤ (d + ½)·640 < (x + 1)·W（边上取后者，越出画面时夹到最后一格）。
    - **旧式：** 用 float32 仿真证明上一条的依赖。
    - **原有断言：** uniform 断言改为 `logicalBuffer`。
    - **结果：** 换回 `HEAD` 的层文件后 3 个用例失败，修复后 8 个全部通过。
  - **浏览器（`e2e/flight-shimmer-scaling.development.spec.ts`）：**
    - **装置：** 支持代码为 `e2e/support/flight-shimmer-scaling.ts`，期望值按共用规则独立算出，窄于 640 时按设备像素，不用渲染模块。浏览器端装置为 `src/render/flight/shimmer/shimmer-scaling.test-support.ts`：真实 `HitShimmerLayer` 与伪 `HitShimmer` 的绘制项，一个合成外壳经逻辑相机覆盖整个游戏图像并多出画面，阈值统一，带位置 0 与 3 分别给不透明度 0xFF 与 0x7F。
    - **比较：** 读回每个设备像素是否绘制，严格比较。0xFF 须全画，同时验证覆盖。
    - **结果：** 修复后 485、576、800、960、1066 宽全部为 0 处不合。读取设备像素依次为 353,080、497,664、960,000、1,382,400、1,705,600 个（两种不透明度合计），不小于 640 宽时在边线上的依次为 345,600、768,000、7,456 个。
    - **分支可辨：** 485、576 宽时，共用规则与设备网格的期望依次在 88,270、124,416 个像素上不同，所以回归能发现窄缓冲被误改为共用规则。
    - **去掉修复：** 只把 `hit-shimmer-layer.ts` 换回 `HEAD` 版本，485、576、800、960 在本机 GPU 上仍通过（与 [11](./11-render-test-risks.md#完成证据) 一致）。1066 宽失败：边线上不合 1,066 处，全部在最下设备行 799、0x7F，即上述第 480 行与第 479 行的差。之后已恢复修复。
    - **判据：** 无重试，未放宽。
- **检查：**
  - **单元测试：** `pnpm exec vitest run src/render` 共 1,343 个用例通过；简化后 `pnpm exec vitest run src/render/flight/shimmer` 57 个通过。
  - **浏览器：** `pnpm exec playwright test e2e/flight-shimmer-scaling.development.spec.ts e2e/flight-sprite-scaling.development.spec.ts e2e/flight-scenes.development.spec.ts --project development` 共 20 个用例通过。
  - **全量：** `pnpm check` 包括类型检查、ESLint、Vitest（447 个文件、11,937 个用例）与构建，简化前后各跑一次，均通过。
  - **其他：** 没有新依赖，没有原版内容。
- **复审（rubber-duck）：** 无阻断问题，也无非阻断意见。核实了：窄缓冲分支与旧式逐像素相同；three.js 把 `Vector2` 上传到 `ivec2` 正确；装置的覆盖、绕向与期望独立。
- **simplify：**
  - **已采纳：**
    - 规则测试改为直接检验区间不等式，去掉重复公式。
    - e2e 支持代码按轴预先算好门格、共用规则格与边线标记。
    - 装置的带位置列表不再导出，读数去掉未用的 `band`。
    - 合并重复的类型导入。
  - **未采纳：**
    - 与 19 共用 e2e 规则函数、浏览器装置样板：需改 19 的文件，超出写入范围。
    - 在 `LOGICAL_PIXEL_GLSL` 中拆出 `devicePixel()`：会改动所有层的着色器文本，窄缓冲分支本身是屏幕门独有的已批准差异。
    - 删掉旧式 float32 仿真：本项明确要求。
    - 去掉片元文本断言与分类计数：用于防漂移与失败时判别。
    - 每次绘制上传 uniform：沿用原模式。
  - **复核：** 采纳后上述检查重新通过。
- **文档影响：**
  - **已更新** [render 模块说明](../../../../engineering/modules/render.md#画面合成)：“已知”段改写为屏幕门的修复、旧式依赖与浏览器回归；“测试支持”补新装置。
  - **已更新** [工程约定](../../../../engineering/README.md)：飞行渲染浏览器用例一节补新用例与聚焦运行命令。
  - **无需改动：** `docs/original/`、unknowns、ADR 与 spec，因为没有新的原版事实或冻结决定。

