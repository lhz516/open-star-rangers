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

- 计划新增 `src/render/platform/browser-webgl-surface.ts`、浏览器测试支持及必要 CSS/组件样式。
- 复用 [WebGLRenderer](../../../../../package.json) 依赖和 [browser-session-host](../../../../../src/platform/browser/browser-session-host.ts) 的既有生命周期边界。

## 验收标准

- [ ] AC-08 的 4:3、黑边、容器尺寸和截图像素成立。
- [ ] AC-09 的 DPR 监听重建、尺寸设置和撤销计数成立。
- [ ] AC-10/12 的 unavailable、context loss/restore 反馈和会话隔离成立。
- [ ] AC-13/14 的资源释放、最佳努力上下文丢弃、回滚和无旧通知成立。

## 验证方法

- Node 用端口替身覆盖 WebGL 创建、绘制、上下文与扩展存在/缺失；浏览器按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 使用隔离合成场景。
- 截图 Buffer 转 base64 后在页面内 `createImageBitmap` 采样；记录 CSS 尺寸、DPR、绘制缓冲和 GPU 当前 info，不保存截图。

## 完成证据
