---
type: plan
status: active
phase: P3
task: "05"
subtask: "17"
updated: 2026-10-10
---

# 17 — 地图几何与自绘光标（render）

**契约来源：** [spec](../spec.md) 的[战略地图输入](../spec.md#战略地图输入)“几何来源”“可见光标”“位置与换算”，[数据模型与契约](../spec.md#数据模型与契约)的 `MapInputGeometry` 与“地图光标”行，[涉及模块](../spec.md#涉及模块)的 render，技术决定 9；S-11 的呈现部分；AC-12 的呈现部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `MapInputGeometry`（`src/render/map/`）：逻辑画面 `screen { width, height }`、逻辑主地图连续边界 `mainMap { left, top, right, bottom }`、当前 CSS 像素的 `ViewportFrame`；不可呈现时为 null（“地图输入未就绪”）。校验：全部有限，主地图宽高严格为正且位于画面内；左上/右下分别归一化为 (0,0)/(1,1)，不混用最后整数像素的索引。NaN、越界或颠倒的几何报告为输入呈现契约错误，不当作正常未就绪。由呈现所有者提供，供绘制与输入共用的只读端口；不从 Core 世界矩形或 `LayoutPayload` 推导像素矩形。
- **换算（DOM-free）：** 归一化位置 `{ right, down }` ∈ [0,1] 与元素客户区像素之间的双向换算，扣除 `ViewportFrame` 的黑边偏移（复用 [viewport-layout.ts](../../../../../src/render/viewport/viewport-layout.ts)）；resize、全屏与 DPR 变化保留归一化位置，不额外乘一次 DPR；零尺寸视为停用。
- **自绘光标：** DOM-free 的光标模型给出绘制矩形与需清除的旧矩形；浏览器绘制（`browser-*` 命名）在既有会话帧中读取只读位置与几何并绘制项目光标，边缘与四角钳制，移动后清除旧位置；报告绘制是否就绪，未就绪时调用方不得隐藏系统指针。不另开 rAF，不经 React 高频 store，不承担地图规则；外观为项目光标，不声称是原版指针。
- Node 测试：几何校验与错误、换算（黑边、缩放、DPR、零尺寸）、钳制与清除矩形。

## 不包含

- 地图输入的资格、Pointer Lock、命令与队列（22）；原版地图布局、生产几何提供与光标在地图画面中的合成（P3-13）。

## 关键文件与契约

- [viewport-layout.ts](../../../../../src/render/viewport/viewport-layout.ts)（`ViewportFrame`）；[layout-payload.ts](../../../../../src/content/graphics/layout-payload.ts)（没有地图矩形，不推测）。
- 计划新增：`src/render/map/` 下的几何、换算、光标模型、浏览器绘制及测试。

## 写入范围

- `src/render/map/**`

## 验收标准

- [x] `MapInputGeometry` 的类型、校验与错误类别符合契约；null 与契约错误区分。
- [x] 换算在黑边、缩放、DPR 与零尺寸下正确；光标钳制与旧位置清除正确；绘制就绪状态可读。
- [x] 不新增 rAF、不读写 Core；`pnpm exec vitest run src/render/map` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试；真实像素读回由 27 在隔离入口完成。

## 完成证据

2026-10-10，worker `exec-p3-05-17`（基于认领提交 `fdbda62b`）。

- **几何与契约错误：** [map-input-geometry.ts](../../../../../src/render/map/map-input-geometry.ts) 定义 `MapInputGeometry`（逻辑 `screen`、连续边界 `mainMap`、复用 [viewport-layout.ts](../../../../../src/render/viewport/viewport-layout.ts) 的 CSS `ViewportFrame`）与只读端口 `MapInputGeometryPort`。`checkMapInputGeometry` 对 null 与零尺寸 frame 返回 null（未就绪/停用），对契约违例抛 `MapInputGeometryError`，带稳定 `code`（`non-finite`、`non-positive`、`inverted`、`outside-screen`）与字段 `path`；零尺寸 frame 也先校验画面与地图。测试逐字段覆盖 NaN/±∞、零与负尺寸、颠倒、越出画面，并确认贴合画面边缘的地图有效。
- **换算（DOM-free，不含 DPR）：** `mapPositionAt`/`containerPointOf` 在容器内容框 CSS 像素与归一化 `{ right, down }` 之间双向换算，先扣 frame 的黑边偏移；连续左/上边为 0、右/下边为 1，最后一个整数像素的左上角是 319/320 而不是 1。测试覆盖左右黑边与上下黑边的点落在地图外、多种容器尺寸（含竖屏与非整数比例）下位置往返不变、DPR 1/1.25/1.5/2/3 的 frame 不改变换算结果（不再乘一次 DPR）。另有 `insideMap`（含边，NaN 为否）、`clampMapPosition`（非有限抛 RangeError）与 `moveMapPosition`（CSS 像素位移，宿主单位由调用方先换算，见文档影响）。
- **K 起点辅助函数：** `mapStartPosition(mainMap)` 按定稿公式（自画面原点量起的列 ⌊(W−1)/2⌋、行 ⌊(H−1)/2⌋，钳制到主地图像素后取像素中心）计算，不含生产值；非整数边或空地图抛 RangeError。测试以合成地图覆盖偏离原点、原点、奇偶宽高、起点钳到首列首行、单像素地图，并验证按像素量化落回同一像素。生产接线由 26 完成。
- **光标模型与绘制：** [map-cursor.ts](../../../../../src/render/map/map-cursor.ts) 的 `mapCursorShape` 给出项目十字光标（`MAP_CURSOR_STYLE`，不声称原版外观）的填充矩形与外包矩形：中心像素钳入主地图，两条奇数宽的条按主地图裁剪，四边四角裁剪一致。`createMapCursorDrawer` 经 `MapCursorCanvas` 部件在调用方的会话帧中读取几何与位置端口并绘制：frame 变化只移动画布，缓冲尺寸（frame × 有上限的 DPR）变化才 resize 并重画，位置变化先清除旧外包矩形再填充，未变化不调用画布；位置为 null 时清除光标但仍就绪。`ready` 只在画布显示时为真（几何可呈现且主地图覆盖缓冲像素），未就绪即隐藏画布；几何契约错误、非有限位置或画布失败时先隐藏、`ready` 为假再抛出，画布失败后下次绘制 resize 并整幅重画。测试用逐像素的假画布断言绘制、移动后旧像素被清除、resize 与 DPR（含上限与非法值）、几何消失与恢复、零尺寸、失败恢复与 dispose。[browser-map-cursor.ts](../../../../../src/render/map/browser-map-cursor.ts) 只创建不接收指针事件、对辅助技术隐藏的 2D 画布并实现部件；没有 2D 上下文时抛出且不留画布。
- **边界：** 本项代码没有 rAF、定时器、React 或 Core 导入；`pnpm exec vitest run tools/engineering-boundaries.test.ts` 通过（95 项，含 render 层不调度、DOM-free 模块进入 Node 程序、`browser-*` 不进入 Node 程序）。
- **检查：** `pnpm exec vitest run src/render/map`：2 个文件 92 项通过。`pnpm typecheck`、`pnpm exec eslint src/render/map` 通过。`pnpm check`：审阅修正前 231 个文件 7054 项通过并构建成功；修正与 simplify 后再跑，231 个文件 7062 项通过并构建成功，没有超时。临时去掉失败恢复的修正时，三项失败恢复用例失败，恢复后通过。
- **Rubber-duck 审阅：** 一次，针对本项全部新文件。采纳两项：画布 clear/fill 失败后 `#drawn` 已更新导致重试时误报就绪，改为失败时作废缓冲与已画状态，下次 resize 重画，并补三项失败恢复测试；偶数条宽在右/下边被多裁一像素，改为以中心像素为中心的奇数条宽，并补 1/1.5/2/3/4 倍下四角裁剪一致的测试。另确认 K 起点公式与绝对坐标换算无误；相对位移须由 22 先把宿主报告单位换算为 CSS 像素。
- **Simplify：** 采纳：`mapCursorShape` 复用 `clampMapPosition` 做有限性校验；`ready` 由画布是否显示推导，去掉独立标志。未采纳：逐像素假画布换成调用记录（像素级才能证明旧位置被清除）；浏览器适配器暂无导入者（由 22/25/27 接线）；每帧重复计算 `mapBufferArea`、重建形状与校验数组（每帧开销很小，换可读性不值）；把 `mapStartPosition` 移到 26 的策略文件（协调者指示可随换算放在此处，26 只接入生产值）；DPR 归一化与 viewport-layout 共用（须改写入范围外的 `viewport-layout.ts`）。
- **文档影响：** 本项只写 `src/render/map/**`，文档交 32：[工程约定](../../../../engineering/README.md#渲染表面与视口)的“渲染表面与视口”应列入 `src/render/map/` 的 DOM-free 模块、`browser-map-cursor.ts` 与目标回归 `pnpm exec vitest run src/render/map`；[render 模块文档](../../../../engineering/modules/render.md)若列模块清单也应同步。原版事实与未知项不变。
