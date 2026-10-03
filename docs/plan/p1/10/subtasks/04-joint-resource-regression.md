---
type: plan
status: active
phase: P1
task: "10"
subtask: "04"
updated: 2026-10-03
---

# 04 — 键盘与会话、GPU同轮资源回归

**契约来源：** [Spec](../spec.md) 的 S-03；AC-05、AC-11。
**依赖：** 02。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 开发StrictMode与生产各3次菜单→演示→菜单，同一回合中移动/N并同时读输入、Session、渲染与GPU；不是分别跑几张截图后拼接为联合证据。
- 每次进入只有一个owner级keydown/keyup对、9项输入与3项Session生命周期登记；刷新渲染诊断，绘制mover/marker两kind后采GPU基线。用同样预热动作跨visit比较，并在同ownerRestart/Exit→Start后核对监听不增/GPU无增长。
- 正常running纯计时观测窗口rAF最大待交付≤1；Return后owner资源净0，旧画布断开，扩展可用时旧context lost。记录扩展能力；缺失不能冒称lost证据通过。
- 渲染listener/ResizeObserver/media与Three.js内部监听按实例配平，排除React根/Vite/测试自身。跨owner新源注册前旧组已释放，真实新按键只有一结果。不可见订阅/旧回调边界引用现有Node测试，不直接调用retained生产callback写状态。
- 按[简化](../../../../../.agents/skills/simplify/SKILL.md)清理本用例与必要helper扩展。

## 不包含

不重做20/50压力、故障注入或HMR；不强制失效context来掩盖释放失败，不修改owner/Session/GPU实现。

## 关键文件与契约

- 计划新增 e2e/joint-resources.spec.ts；使用02 browser-probes/demo-observations。
- 只读[owner](../../../../../src/app/composition/synthetic-demo-owner.ts)、[hook](../../../../../src/app/composition/use-synthetic-demo-owner.ts)、[生命周期](../../../../../src/app/composition/synthetic-demo-lifecycle.ts)。
- 只读[源管理](../../../../../src/platform/input/keyboard-source.ts)、[host](../../../../../src/platform/browser/browser-session-host.ts)、[表面](../../../../../src/render/webgl/browser-webgl-surface.ts)、[渲染器](../../../../../src/render/synthetic/synthetic-renderer.ts)。

## 验收标准

- [ ] AC-05：两种构建各3轮移动/N菜单往返同步取得rAF≤1、输入9/Session3、渲染配平、净0证据。
- [ ] AC-05：同owner换run监听不增长，预热后的GPU三项无增长，旧canvas断开且扩展可用时context lost。
- [ ] AC-11：探针无权威状态写入，旧组释放先于新组，任何余留/清理错误非零，不以页面未崩替代。
- [ ] pnpm check及两种构建该用例实跑通过，计时窗口排除测试rAF，所有自有资源收尾。

## 验证方法

按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)运行持久用例；保存每轮owner/目标/回调/句柄及GPU表，正常进/出和同owner换run对照。Node既有[owner测试](../../../../../src/app/composition/synthetic-demo-owner.test.ts)等只引用其订阅/旧通知证据，不重复穷举。无原版或实机性能要求。

## 完成证据
