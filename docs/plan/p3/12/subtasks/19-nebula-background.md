---
type: plan
status: active
phase: P3
task: "12"
subtask: "19"
updated: 2026-10-17
---

# 19 — 星云背景

**契约来源：** [spec](../spec.md) 的 S-06、AC-09；[星云背景](../spec.md#星云背景)；Q-04。
**依赖：** 04, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/nebula/`：每个运行在经校验的 `NebulaBackgrounds.images` 原列表中用表现随机源均匀选起点，取连续 6 项回绕并保留重复；空列表拒绝，短列表按同一规则。
- 六个方向、屏幕位置、镜像与转置读法、取整、可见判定与清除按 Q-04 在逻辑画面中实现；DATA 直接显示、不透明、最近邻放大。
- 星云固定按开启绘制，不读取或提供 `DETAIL`（BACKGROUND DETAIL）设置（[星云背景](../spec.md#星云背景)，用户 2026-10-17 决定）。
- 导出供 23 接入的 pass；测试用方向不对称的合成图案断言读法与位置，覆盖首尾、短列表、重复与空列表。

## 不包含

- 接入与浏览器读回（23、25）；截图对照（26）。

## 关键文件与契约

- 现有：[flight-data-content.ts](../../../../../src/content/flight/flight-data-content.ts) 的 `NebulaBackgrounds`。
- 计划新增：`src/render/flight/nebula/`。

## 写入范围

- `src/render/flight/nebula/**`：星云 pass 与测试。

## 验收标准

- [x] AC-09（Node 部分）：选取、回绕、读法、位置与清除的断言通过；生产 15 项不硬编码；没有背景细节开关。
- [x] `pnpm exec vitest run src/render/flight/nebula` 通过。

## 验证方法

- Node 测试。

## 完成证据

- **实现（`src/render/flight/nebula/`）：**
  - `nebula-selection.ts`：`selectNebulaImages(nebula, random)` 用表现随机源取起点，对 rand 值做拒绝抽样（≥ 最大的列表长度整数倍时重抽），使每个起点精确等概率（技术决定 8）；取连续 6 项、回绕、保留重复；空列表按 `ContentContractError` 拒绝且不抽取；列表长度只取自内容。
  - `nebula-placement.ts`：NB1 的六个 f32 方向；NB3 的可见判定 F(R2·A) ≥ K（相等也画）、sx = chop(320 + xA·(320 ÷ S))、sy = chop(320 − (320 ÷ S)·yA − 80)（约 567.155 的比例、中心行 240，F1 中也如此，不用三维投影）与 θ = F(atan2(yB − yC, xB − xC))。
  - `nebula-blit.ts`：NB4 的 45 行旋转表、象限归一化（镜像与转置标志）、两条嵌套 Bresenham 线（对角步在两处写同一源像素）与裁剪 0 ≤ x < 640、1 ≤ y ≤ 视口底边（第 0 行永不写）；常数用可执行文件自己的 f64/f32 值。
  - `nebula-layer.ts`：`createNebulaLayer({ cache, images, palettes })` 返回 `nebula` 槽的 `FlightLayer`，供 23 经 `FlightRunRender.addLayer` 接入：每帧用世界的绘制相机行（与三维同一相机）定位，取最后一个可见槽（正交行下最多一个可见，NB3），按当前视角的视口底边（F1 为 315，0x11 为 479）把 blit 结果写入 183×183 的逻辑像素足迹纹理，再以逻辑相机按最近邻放大绘制；不透明、按 DATA 直接显示（要求 128×128、`direct`、无掩码，经 `expandImage`）；不做深度测试也不写深度。资源（`NEBULA_GPU_PLAN`：33,489 texel、4 顶点、6 索引）全部来自运行的 GPU 缓存。
  - 清除（NB5）：每次写入都在中心 ±91 内（测试断言），落在下一帧 ±100 的清除方块之内；合成每帧从黑色开始，等价于原版的清除，因此不另设清除 pass。
  - 没有 BACKGROUND DETAIL 设置：输入只有缓存、图像与调色板（用户 2026-10-17 决定）。
- **测试（30 项，`pnpm exec vitest run src/render/flight/nebula` 通过）：** 选取（首尾、回绕、短列表、单项、重复、7 与 15 项、拒绝抽样的均匀计数、空列表与非法 rand 拒绝）；方向与可见锥（约 37.57°、等号可见）、位置比例与中心 240、横滚角、六个槽各自居中、4,000 组随机旋转下最多一个可见；旋转表、象限标志与夹取；每个角度都是真旋转而非镜像（容差 4 像素，镜像对照 > 60）、θ = −π/2 按存储方向显示、轴对齐读全部 16,384 个源像素而 45° 读 91×91、无空洞、范围 ±91、裁剪（第 0 行、底边行、左右边）；图层用四象限不对称的合成图案读回实际像素（恒等相机下存储左上角在屏幕右上）、各槽对应各自图像、F1 底边 315 与被毁视角 479 的裁剪、第 0 行、不可见与无世界时不绘制、只在定位变化时重填、重复图像、输入校验与资源计数。
- **对照：** 与 04 留在本地的独立 Python 转写（`local/research/p3-12/nebula-flash/tools/nebula_blit.py`）比较 4,008 组模板（一整圈 4,001 个角度、象限边界与裁剪情形），写入序列与旋转表逐项相同；简化后复核仍相同。比较输出只在会话目录，未入库。
- **浏览器（临时、未入库）：** 在 Vite（端口 5159）+ Playwright 的真实 WebGL2 中，按逻辑相机绘制图层的 pass 并读回，缩放 1、1.5、2 下足迹内 33,489 个逻辑像素与 CPU 足迹 0 个不一致，无 GL 错误；浏览器读回的验收仍归 25。
- **检查：** `pnpm check` 通过（358 个测试文件、10,336 项测试与生产构建）。
- **rubber-duck：** 无阻塞或非阻塞问题（确认绘制相机、单槽、清除等价、均匀抽样与重填键的设计）。
- **simplify：** 采纳：裁剪改用 `LOGICAL_WIDTH`、± 常数改为取负、A 的投影复用同一函数、逐像素复制不再分配子数组、重填状态改为一个键、测试相机辅助合并为 `nebula.test-support.ts` 并改用 `IDENTITY_ROWS`。未采纳：与 `explosion-selection.ts` 共享 rand 校验需要改写入范围外的文件；空列表拒绝与 `checkPresentationContent` 同一做法，保留。
- **文档影响：** 原版事实与 U-018 无新增或变化；`docs/engineering/` 与 `docs/guides/` 目前没有列出 `src/render/flight/` 的子目录（15 已把相关过时处交 28），建议 28 在源码结构/渲染文档中加入 `nebula/` 及其接入点（`createNebulaLayer`、`selectNebulaImages`、`NEBULA_GPU_PLAN`）。

