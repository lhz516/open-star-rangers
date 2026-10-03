---
type: plan
status: active
phase: P1
task: "07"
subtask: "04"
updated: 2026-10-02
---

# 04 — WebGL 浏览器表面与尺寸生命周期

**契约来源：** [spec](../spec.md) 的 S-04–S-07、AC-04、AC-08–AC-10、AC-12–AC-14。
**依赖：** 02, 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 创建 WebGL 2 `WebGLRenderer` 表面和 4:3 黑边容器；用 ResizeObserver 处理尺寸，用可重建 resolution media query 处理纯 DPR 变化。
- 注册顺序遵守 Three.js 内部 context listener 先于应用 listener；处理 unavailable、context-lost、restore 和最佳努力 `WEBGL_lose_context`。
- 在销毁时先撤观察器/应用监听，再释放材质/几何/renderer，最后移除画布；清理错误显式汇总。

## 不包含

- 不接入 owner 或 React 页面（05–06）。
- 不把 WebGL 不可用伪造为成功；不要求真实设备矩阵或跨浏览器性能。

## 关键文件与契约

- 新增 [webgl-surface.ts](../../../../../src/render/webgl/webgl-surface.ts)（DOM-free 生命周期，Node 测试 [webgl-surface.test.ts](../../../../../src/render/webgl/webgl-surface.test.ts)）、[browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts)（浏览器工厂，仅由应用类型程序检查）与共享清理辅助 [cleanup.ts](../../../../../src/render/scene/cleanup.ts)。实施时用 `render/webgl/` 代替计划中的 `render/platform/`，避免与顶层 platform 模块混淆；画面容器 CSS 属于 06 的 React 组件。
- 复用 [WebGLRenderer](../../../../../package.json) 依赖和 [browser-session-host](../../../../../src/platform/browser/browser-session-host.ts) 的既有生命周期边界。

## 验收标准

- [x] AC-08 的 4:3、黑边、容器尺寸和截图像素成立。
- [x] AC-09 的 DPR 监听重建、尺寸设置和撤销计数成立。
- [x] AC-10/12 的 unavailable、context loss/restore 反馈和会话隔离成立。
- [x] AC-13/14 的资源释放、最佳努力上下文丢弃、回滚和无旧通知成立。

## 验证方法

- Node 用端口替身覆盖 WebGL 创建、绘制、上下文与扩展存在/缺失；浏览器按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 使用隔离合成场景。
- 截图 Buffer 转 base64 后在页面内 `createImageBitmap` 采样；记录 CSS 尺寸、DPR、绘制缓冲和 GPU 当前 info，不保存截图。

## 完成证据

- **实现：** 浏览器工厂先建带 `role=img` 与可读名称的画布，在受保护的事务中构造 `WebGLRenderer({canvas, antialias:false})`（仅 WebGL 2，不回退），读取 `min(MAX_VIEWPORT_DIMS[0], MAX_VIEWPORT_DIMS[1], MAX_RENDERBUFFER_SIZE)` 与可选 `WEBGL_lose_context`，成功后才把画布放进容器；失败时释放渲染器、丢弃可能已取得的上下文并移除画布。DOM-free 表面在 `connect` 中依次登记应用上下文监听（晚于 Three.js 自身监听）、当前 DPR 的 `(resolution: <d>dppx)` 查询与容器内容盒观察；每次 DPR 变化撤销旧查询、按新值登记并以最近尺寸报告一次；`setLayout` 精确设置缓冲（`setDrawingBufferSize(bw,bh,1)`）并绝对定位画布或隐藏；GPU 统计每次读取当前 `renderer.info`。
- **Node：** 8 个表面测试覆盖登记顺序、重复 connect 拒绝、DPR 查询逐次替换与登记/撤销数相等、缓冲与定位、GPU 统计不缓存、释放顺序（撤销监听/观察 → `renderer.dispose` → `loseContext` → 移除画布，断开后强制丢失不再报告）、扩展缺失时跳过丢弃仍移除画布、各步失败均尝试并汇总、未连接即释放。渲染器层的状态与释放顺序见 03。
- **真实 Chrome（表面层）：** 本机 Chrome 154.0.8037.95 / macOS，临时 profile + CDP，自有 Vite `http://127.0.0.1:5173`，在页面内放置 800×400 黑色临时容器并动态导入表面与渲染器（不改应用代码，结束移除）。DPR 1：缓冲 533×400，画布矩形 (133.5, 0, 533, 400) 与布局公式一致；截图解码采样左右黑边 (2,200)/(797,200) 为 #000000，帧内四角内缩点为 #102040（背景色）。DPR 1→2→1.5→3→1：缓冲 533×400 → 1066×800 → 800×600 → 1066×800（3 限为 2）→ 533×400，每次 draws 恰好 +1，CSS 帧不变；释放后 resolution 查询登记 5 次、撤销 5 次。`WEBGL_lose_context.loseContext()` 后状态 context-lost、draws 不变；`restoreContext()` 后回到 ready 且 draws +1。dispose 后画布脱离容器、`isContextLost()=true`、容器内 0 个画布；无页面错误或控制台错误。另以 `--disable-webgl --disable-webgl2 --disable-3d-apis` 启动的隔离 Chrome 确认 `getContext('webgl2'/'webgl')` 均为 null，工厂抛出 Three.js 的建立上下文错误，容器内 0 个画布。整页容器尺寸、StrictMode/Fast Refresh、页面 unavailable/context-lost 显示与 GPU 基线在 06/08 取证。
- **工具偏差：** 本机 Chrome 只改 CDP `deviceScaleFactor` 时不派发 `MediaQueryList.change`，需每次再交替发送 `Emulation.setEmulatedMedia` 的 `'screen'`/`''` 触发重新求值（由 Chrome 自己派发真实事件，非合成事件），已记入 goal 执行记录与[工程约定](../../../../engineering/README.md#已验证的-cdp-自动化路线)。
- **检查：** `pnpm exec vitest run src/render tools/engineering-boundaries.test.ts` 378/378；`pnpm check` 通过（39 个测试文件/1018 个测试、构建；页面尚未导入 Three.js，体积不变）。
- **审阅：** rubber-duck 仅指出 `WebGLRenderer` 构造在回滚事务之外，已移入并在失败时丢弃可能取得的上下文；simplify 采纳统一清理辅助、单一撤销列表与去除多余别名，未采纳跨模块监听注册表、类型私有化与闭包作用域调整（收益可忽略）。
- **文档影响：** [源码结构指南](../../../../engineering/source-structure.md#当前目录) 列入 `render/webgl/` 与 `scene/cleanup.ts`；工程约定补充 CDP DPR 仿真路线。
