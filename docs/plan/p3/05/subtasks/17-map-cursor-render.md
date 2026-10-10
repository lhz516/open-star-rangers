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

- [ ] `MapInputGeometry` 的类型、校验与错误类别符合契约；null 与契约错误区分。
- [ ] 换算在黑边、缩放、DPR 与零尺寸下正确；光标钳制与旧位置清除正确；绘制就绪状态可读。
- [ ] 不新增 rAF、不读写 Core；`pnpm exec vitest run src/render/map` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试；真实像素读回由 27 在隔离入口完成。

## 完成证据
