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
- 计划新增 `src/ui/render/` 画面组件与 hook；必要的样式文件为计划新增。

## 验收标准

- [ ] AC-05 的 idle/start/add/pause/restart/exit 可观察画面成立。
- [ ] AC-10/12/15 的状态语义、可访问名称、alert/status 角色和只读诊断成立。
- [ ] 容器尺寸/黑底与 AC-08 一致，React 不因 N 次绘制重复提交。

## 验证方法

- Node 测试状态订阅计数；浏览器按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 观察真实 DOM、按钮流程、Canvas/WebGL 像素与可访问性。
- 只用 seed 0 合成数据，记录环境、origin、viewport、DPR 和清理结果，不产生截图文件。

## 完成证据
