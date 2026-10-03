---
type: plan
status: active
phase: P1
task: "07"
subtask: "06"
updated: 2026-10-02
---

# 06 — React 画面与渲染诊断

**契约来源：** [spec](../spec.md) 的 S-08、AC-05、AC-08、AC-10、AC-12、AC-15。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增合成画面 React 容器、可读 Canvas 名称、状态/错误提示和纯黑 4:3 容器；与现有面板共存，不按绘制帧提交 React 更新。
- 以只读 `getSnapshot`/`subscribe` 或等价 selector 读取渲染状态与诊断；显示 drawnTick、draws、entities、layout、GPU 当前统计。
- 在 App 与现有开发面板完成接线，明确 synthetic demo 标注；维护 StrictMode effect 清理。

## 不包含

- 不新增游戏键盘、正式菜单、HUD/MFD、原版素材或存储。
- 不在 browser-testing 中修改应用源码；临时 Profiler/HMR 由执行回合准备并还原。

## 关键文件与契约

- [App.tsx](../../../../../src/app/App.tsx)、[SyntheticDevPanel.tsx](../../../../../src/ui/dev/SyntheticDevPanel.tsx)。
- 新增 [SyntheticRenderView.tsx](../../../../../src/ui/render/SyntheticRenderView.tsx)（样式内联，无单独样式文件或 hook）；修改 [SyntheticDevPanel.tsx](../../../../../src/ui/dev/SyntheticDevPanel.tsx) 与 [App.tsx](../../../../../src/app/App.tsx)。

## 验收标准

- [x] AC-05 的 idle/start/add/pause/restart/exit 可观察画面成立。
- [x] AC-10/12/15 的状态语义、可访问名称、alert/status 角色和只读诊断成立。
- [x] 容器尺寸/黑底与 AC-08 一致，React 不因 N 次绘制重复提交。

## 验证方法

- Node 测试状态订阅计数；浏览器按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 观察真实 DOM、按钮流程、Canvas/WebGL 像素与可访问性。
- 只用 seed 0 合成数据，记录环境、origin、viewport、DPR 和清理结果，不产生截图文件。

## 完成证据

- **实现：** 画面组件渲染英文合成标注、一个 React 不渲染子节点的容器（内容盒宽 100%、高 `clamp(240px, 70vh, 720px)`、无内边距/边框、相对定位、裁剪、`#000`），以及一行状态文字：`useSyncExternalStore(renderer.subscribe, renderer.getSnapshot)`，ready/context-lost/准备中/disposed 为 `role=status`，unavailable/failed 为 `role=alert` 并附原错误名与消息。开发面板新增必填只读 `renderer` 与“Renderer diagnostics”区：挂载、点击“Refresh diagnostics”（原生按钮，可用鼠标/键盘）或渲染器更换时读取一次快照，显示 state、run、drawn tick、draws、entity objects、GPU 三项与布局。App 把容器 ref 交给 owner hook，并把渲染器交给画面与面板；去掉重复的面板加载占位。
- **浏览器（本机 Chrome 154 / macOS，自有 Vite `http://127.0.0.1:5173`，临时 profile + CDP，视口 1280×800、DPR 1，种子 0）：** StrictMode 首次挂载后容器内 1 个画布；容器计算宽 1249 px 等于父内容宽、高 560 px（70vh），背景 `rgb(0, 0, 0)`；画布 746×560 位于容器内 (251.5, 0)，缓冲 746×560，`role=img` 且有可读名称；状态 “Renderer ready.” 为 `role=status`、`data-state=ready`；合成标注可见。元素截图解码统计：idle 只有背景 #102040 与黑边；Start 后出现 #ffd040 mover 像素 814 个；Add marker 后出现 #40ff7f（与 #40ff80 差 1）212 个 ≥ 9；诊断刷新显示 run 1、2 个实体对象、GPU 2 geometries/0 textures/1 program（两种材质共用一个程序）。无页面或控制台错误。完整 AC-05/08/10/12/14/15 流程（暂停截图、restart、exit、unavailable 页面、上下文丢失、Profiler 与 Fast Refresh）在 08 取证。
- **检查：** `pnpm check` 通过（39 个测试文件/1026 个测试、构建）。
- **审阅：** rubber-duck 无发现（确认容器无 React 子节点、StrictMode 清理先于重建、`NO_RENDERER` 稳定、诊断区按渲染器更换收敛）；simplify 采纳状态文字单一标记、去掉重复加载占位、状态文案只描述渲染本身，未采纳把面板的 `describeError` 抽出共享（画面告警刻意只显示一行摘要）。
- **文档影响：** [工程约定](../../../../engineering/README.md#ui-投影与指令反馈) 与[源码结构指南](../../../../engineering/source-structure.md#当前目录) 已列入画面组件、面板渲染诊断与容器 CSS。
