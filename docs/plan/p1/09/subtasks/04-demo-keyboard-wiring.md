---
type: plan
status: active
phase: P1
task: "09"
subtask: "04"
updated: 2026-10-02
---

# 04 — 演示 owner 所有权、输入区与失败呈现

**契约来源：** [Spec](../spec.md) 的 S-03 至 S-06、AC-06/08 至 AC-14，尤其 owner 输入依赖与技术决定 9–11。
**依赖：** 02, 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- owner 接收 DOM-free 源或不可用原因，装配 03 消费者并暴露只读键盘状态；hook 将真实容器连接 02 浏览器源，明确所有权交接。
- 所有获取路径负责先取得资源的回滚：登记失败且回滚成功仅键盘 unavailable，演示/面板可用；回滚失败按既有 RollbackError 信号处理，不开始运行并锁存首个清理失败。
- dispose 先使键盘源失效并逐项移除，再销毁 Session，其余桥接与渲染器继续收尾；失败汇总、原始原因与 P1-08 锁存不丢失，正常重复 dispose 幂等。
- 同一 owner 的 Restart/Exit→Start 只清键及换 run 绑定，不新增 DOM 监听。返回菜单、StrictMode、容器替换、Fast Refresh 仍先释放旧 owner 再建新 owner。
- SyntheticRenderView 的现有容器可 Tab 聚焦，点击画布/黑边也聚焦容器；有可读名称、可见焦点和 aria-describedby 绑定说明。仍保持 P1-08 进入时标题聚焦、原生按钮、无焦点陷阱。
- 英文 UI 明示合成键位，呈现 active/inactive 及 unavailable 的具体原因；unavailable/failed/context-lost 的渲染状态不阻止键盘驱动存在的会话，键盘状态不是游戏事实。

## 不包含

- 改写页面流转、原版玩法、render 状态机或 GPU/相机行为。
- 变更 Core/Runtime/Session；新依赖、全局游戏键、存储或额外调度。
- 浏览器全量证据及工程文档定稿（05/06）。

## 关键文件与契约

- **扩展现有：** [synthetic-demo-owner.ts](../../../../../src/app/composition/synthetic-demo-owner.ts)及[测试](../../../../../src/app/composition/synthetic-demo-owner.test.ts)、[use-synthetic-demo-owner.ts](../../../../../src/app/composition/use-synthetic-demo-owner.ts)。
- **扩展现有测试：** [synthetic-demo-lifecycle.test.ts](../../../../../src/app/composition/synthetic-demo-lifecycle.test.ts)，适配真实 owner 创建参数并验证锁存与源生命周期；[生命周期实现](../../../../../src/app/composition/synthetic-demo-lifecycle.ts)维持 P1-08 规则。
- **扩展现有 UI：** [SyntheticRenderView.tsx](../../../../../src/ui/render/SyntheticRenderView.tsx)、[SyntheticDemoPage.tsx](../../../../../src/ui/pages/SyntheticDemoPage.tsx)、[app.css](../../../../../src/app/app.css)。如 readonly props 接线需要，限定于[App.tsx](../../../../../src/app/App.tsx)的 DemoScreen，不改导航行为。
- 使用 02/03 新增的源/消费者；复用 [RecordingSurface](../../../../../src/render/scene/render-surface.test-support.ts)与[RollbackError](../../../../../src/app/session/rollback-error.ts)，不在 Session 里增加清理类型。

## 验收标准

- [ ] AC-11/12：输入先于 Session 释放；登记/初始化/多项撤销失败都尝试完整收尾并锁存，源先失效后保留的旧回调无法改 store、运行或 preventDefault。
- [ ] AC-06/11：同 owner Restart/Exit→Start 不增监听、轴从 0 开始；返回/替换不自动恢复旧按住值或创建第二条循环。
- [ ] AC-12：键盘 unavailable 时面板可用，原始原因保留；渲染 unavailable 时真实 Session 仍能由键盘动作驱动。
- [ ] AC-13：名称、说明、三种状态及焦点样式接线完整；进入仍聚焦标题，点击画布不会漏掉输入区焦点。
- [ ] 目标 owner/生命周期/消费者回归与 `pnpm check` 通过；AC-14 受保护模块、录制、依赖与导航行为不变。

## 验证方法

- `pnpm exec vitest run src/platform/input src/ui/game src/app/composition`。真实 owner + ControlledHost + RecordingSurface，记录键盘/Session/桥接/渲染收尾顺序。
- 注入源创建、登记、撤销和后续初始化失败，检查 RollbackError/AggregateError、cleanupFailure 锁存及后续创建被阻断；不只测最终物理监听数。
- Node 测真实装配与运行身份；React 的稀有失败文字以逐条接线审阅为证，常规 DOM/焦点及监听的真实证据留给 05 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)取得。
- 收尾按 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限于装配与输入区接线，不重构上游生命周期。

## 完成证据
