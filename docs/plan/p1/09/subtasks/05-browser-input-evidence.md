---
type: plan
status: active
phase: P1
task: "09"
subtask: "05"
updated: 2026-10-02
---

# 05 — 键盘闭环、输入隔离与生命周期浏览器证据

**契约来源：** [Spec](../spec.md) 的 S-03 至 S-07、AC-08 至 AC-13 及浏览器验证策略。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)执行实际页面验证，不写功能/修复或新 E2E runner；发现缺口归回责任项或新增修复项。
- 核对可复用服务器的项目与 origin，否则启动自有服务器；生产预览为当前代码构建。使用已有 Chromium、隔离 profile/context、种子 0 合成演示，不操作用户数据。
- 在开发及生产预览验证 AC-08/09/13：可信按键、焦点、投影、接受/拒绝反馈、defaultPrevented、scrollY、原生按钮/Tab、可读名称与说明。
- 开发环境验证真实 hidden→visible；生产预览至少验证元素失焦。仅窗口 blur/focus 仍 visible 的原生路径有界尝试，受限时保留准确限制及 02/03 的逻辑/接线证据，不能记为浏览器 passed。
- 开发环境至少 3 次菜单往返、StrictMode、一次真实新 owner Fast Refresh；同 owner Restart/Exit→Start 不加监听；生产预览至少往返一次。探针按目标与回调身份区分源、Session、React 委托及自身。
- 执行者在 browser-testing 观察外安排可还原的 HMR 临时编辑，确认真实重建；还原后核对工作树，不把临时变更作为交付。
- 失败 UI 中 unavailable 的数据/文字接线按 04 Node 测试与代码审阅标明证据层次，不伪造浏览器故障或以无控制台错误代替验收。

## 不包含

- 功能修复、永久测试脚本、浏览器下载、Playwright 配置/依赖或新报告文件。
- 跨浏览器/系统快捷键、原版对照、GPU 全量联合回归、云/部署。

## 关键文件与契约

- [Spec 验收表](../spec.md#验收标准)、01–04 交付与证据；本文件“完成证据”承载全部浏览器结果。
- [浏览器入口指南](../../../../engineering/README.md#已验证的-cdp-自动化路线)规定真实可见性路线；普通 connectOverCDP 页签切换不保证 hidden。
- [开发面板](../../../../../src/ui/dev/SyntheticDevPanel.tsx)投影采样为 100 ms；x 文本保留三位小数，Node 精确一致性属于 03。

## 验收标准

- [ ] AC-08：左右分别按住 ≥1 s 方向正确；松开先等新 tick 投影，再跨 ≥300 ms 至少三次样本 tick 增加/x 不变；N/X/X 为接受/接受/拒绝；P 暂停继续不恢复旧轴。
- [ ] AC-09：普通绑定 keydown/keyup 被拦截且不滚动；放行规则符合 Spec；按钮、菜单/导入页无游戏键效果，Enter/Space、Tab/Shift+Tab 正常。
- [ ] AC-10：实际 hidden 时自动暂停，visible 后仍暂停，显式 P 后无新方向按下仍不移动；repeat=true 不恢复，新按下才移动；生产元素失焦停止轴且 Session 仍 running。
- [ ] AC-11：唯一 keydown/keyup 对、所有旧源监听撤销平衡，菜单无应用源监听；一次 N 一个新命令结果；Restart/Exit→Start 不增 DOM 监听；StrictMode/HMR 证据完整。
- [ ] AC-13：开发/生产可访问性与可见焦点证据完整，状态正确；AC-12 的稀有文字分开记录为 Node/审阅证据。
- [ ] 每项标明 passed/failed/blocked，必需证据缺失保持未通过；自建资源、探针、profile 与临时编辑全部清理。

## 验证方法

- 现有 `pnpm dev`；`pnpm build` 后 `pnpm preview`。不指定可能已占用的端口，不停止用户拥有的服务器或浏览器。
- 初始探针只观察登记/撤销、defaultPrevented、原生可见性与焦点，不改世界、事件传播或浏览器 getter；重复按键须确认 repeat=true。
- 每项记录“验收项/设置操作/预期/观察证据/结果”，附版本、OS、视口、origin、隔离方式、错误与清理结果。300 ms 从新投影发布后的稳定样本窗口算，不取松键前旧值。
- 真实 hidden 按已验证 headed CDP 双目标路线执行；合成 visibilitychange、BFCache 或强制生命周期不能替代。
- 此项无实现改动，不调用 simplify；若代码随后因修复改变，受影响浏览器证据需在最终状态重验。

## 完成证据
