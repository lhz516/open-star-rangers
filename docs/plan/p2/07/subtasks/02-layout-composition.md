---
type: plan
status: active
phase: P2
task: "07"
subtask: "02"
updated: 2026-10-05
---

# 02 — 布局合成

**契约来源：** [spec](../spec.md) 的 S-02，S-09 的 content 层；[布局合成](../spec.md#布局合成)、[错误码](../spec.md#错误码)；技术决定 2；AC-02。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **纯合成函数（`src/content/graphics/`）：** 输入布局 payload、恰好覆盖其引用的图像 payload，以及按 P2-05 展开函数要求的调色板；输出 `{ width, height, rgba }`，尺寸等于画幅，`rgba` 为非预乘 RGBA：
  - 初始全部为 (0, 0, 0, 0)；
  - 按数组顺序处理元素：经 [expand-image.ts](../../../../../src/content/graphics/expand-image.ts) 的 `expandImage` 取色；要求 x + 宽 ≤ 画幅宽、y + 高 ≤ 画幅高；只把 alpha 255 的像素写到 (x + 列, y + 行)；
  - 同一布局可以混用绑定不同调色板的图像；
  - 每次返回调用者独占的新缓冲，不修改输入；不读写 DOM 或 GPU，不缩放。
- **错误：** 元素按实际尺寸越出画幅 → 新增 content 层 code `layout-out-of-frame`（追加到 [contract-validation.ts](../../../../../src/content/contract-validation.ts) 的封闭联合）；提供的图像缺少、多出或与引用不符 → `binding-mismatch`；调色板问题沿用 `expandImage` 的 code。诊断只含 Asset ID 与结构路径。
- **测试：** 非对称合成图像：一张 raw、一张含透明段的 RLE（形状来自 P2-05 的图像 payload）、一张绑定第二个调色板的 raw；放在不同位置，含贴住右下边缘（x + 宽 = 画幅宽）与互相重叠。逐像素与独立计算的期望比较；重复调用逐字节相同、缓冲不同；上列每种失败。
- **文档：** 源码结构“图形 payload”一节记录合成规则、输入与 `layout-out-of-frame`。

## 不包含

- 布局 payload 的格式：归 [01](./01-layout-payload.md)。
- 渲染消费、窗口缩放与设备像素比：归 P2-11 与 `render/`。
- 与原版截图的比较：归 [08](./08-cockpit-palette-research.md) 与 [15](./15-local-composite-check.md)。

## 关键文件与契约

- **计划新增：** `src/content/graphics/` 下的合成模块与相邻测试（尚不存在），可与 01 的布局模块同文件。
- **修改：** [contract-validation.ts](../../../../../src/content/contract-validation.ts)（追加 `layout-out-of-frame`）。
- **复用：** `expandImage`、`readImagePayload`、`readPalettePayload`。

## 验收标准

- [x] AC-02：输出尺寸等于画幅；每个像素符合“按顺序叠放、不透明覆盖、透明不改变下层、未覆盖为 (0, 0, 0, 0)”；颜色等于各图像按其绑定展开的结果；重复调用逐字节相同、返回新缓冲、不修改输入。
- [x] 越出画幅报 `layout-out-of-frame`；图像缺少、多出或不符报 `binding-mismatch`；调色板问题沿用 P2-05 的 code。
- [x] 项目中没有第二份展开或合成逻辑；新模块不导入 `original-data`、DOM、Node 或 Three.js。
- [x] `pnpm typecheck`、`pnpm lint` 与聚焦测试通过；源码结构已更新。

## 验证方法

- `pnpm test -- src/content/graphics/`；期望由测试中逐像素的直接计算得出，不调用被测函数本身。
- 不涉及浏览器或原版数据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

2026-10-05：

- **实现：** [compose-layout.ts](../../../../../src/content/graphics/compose-layout.ts) 的 `composeLayout(layout, images, palettes, path)`。
  - **绑定：** 先核对 `images` 恰为 `layoutImages(layout)`、`palettes` 恰为这些图像引用的调色板，否则 `binding-mismatch`（位置分别为 `images`、`palettes`）。
  - **逐元素处理：** 按数组顺序，每个元素只拿到自己引用的调色板，经 `expandImage` 展开；然后按实际尺寸核对画幅，越出报 `layout-out-of-frame@<path>.elements[<i>]`；最后只写入 alpha 255 的像素。
  - **结果：** 冻结的 `{ width, height, rgba }`，缓冲为新分配。
  - **错误码：** [contract-validation.ts](../../../../../src/content/contract-validation.ts) 追加 `layout-out-of-frame`；[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的类型完备记录随之加入该 code，协议本身不变。
- **测试：** `pnpm exec vitest run src/content/graphics` 通过，8 个文件、195 项。[compose-layout.test.ts](../../../../../src/content/graphics/compose-layout.test.ts) 使用三张非对称图像：A 为 raw 不透明；B 带透明段的掩码，即 RLE 解码后的形状；C 为绑定第二个调色板的 raw。它们放在 8×6 画幅中：A、B 重叠，B、C 重叠，C 贴住右下边缘（x + 宽 = 8，y + 高 = 6）。
  - **逐像素期望：** 由测试内独立的直接计算得出，不调用被测函数或 `expandImage`；另有手算的重叠、透明与未覆盖像素断言；颠倒绘制顺序后结果随之改变。
  - **nearest 元素：** 区域与单独 `expandImage` 的结果相同。
  - **确定性：** 重复调用逐字节相同，缓冲不同，结果冻结，输入的索引、掩码与调色板不变；修改返回缓冲不影响下次结果。
  - **拒绝：** 右边或下边越出 1 像素、前面的元素越界、自定义 `path`，都报 `layout-out-of-frame`；图像缺少、多出或被替换，调色板缺少、多出或被替换，都报 `binding-mismatch`；调色板索引越界保持 `palette-index-out-of-range@images[image/synthetic-c].indices`；两类错误并存时，由第一个失败的元素决定。
- **边界：** 合成只经 `expandImage` 取色，项目中没有第二份展开或合成逻辑；新模块只导入 `content/` 内的模块。
- **工程：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过，124 个文件、3698 项，构建成功。
- **审查：**
  - **rubber-duck：** 指出一项非阻塞问题：原实现先核对全部元素的画幅，再展开，与 spec 的逐元素顺序不一致。已改为每个元素展开后立即核对，并补充两类错误并存时的顺序测试。
  - **simplify：**
    - 已采纳：`packMask`、`set16`、`setText` 统一放在 [graphics.test-support.ts](../../../../../src/content/graphics/graphics.test-support.ts)，`image-payload.test.ts` 改为导入，断言不变。
    - 未采纳：逐像素 `subarray` 复制（每像素一次分配）；以字面量替代独立期望（本子任务要求直接计算）；把展开并入合成（spec 要求经 `expandImage`，不得有第二份展开逻辑）；为单一使用者抽取通用绑定 helper。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的目录树与“图形 payload”一节加入布局合成的输入、规则、错误与结果；工程约定与工具指南不受影响，不涉及原版事实或 STATUS。
