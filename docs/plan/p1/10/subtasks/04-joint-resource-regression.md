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

- [x] AC-05：两种构建各3轮移动/N菜单往返同步取得rAF≤1、输入9/Session3、渲染配平、净0证据。
- [x] AC-05：同owner换run监听不增长，预热后的GPU三项无增长，旧canvas断开且扩展可用时context lost。
- [x] AC-11：探针无权威状态写入，旧组释放先于新组，任何余留/清理错误非零，不以页面未崩替代。
- [x] pnpm check及两种构建该用例实跑通过，计时窗口排除测试rAF，所有自有资源收尾。

## 验证方法

按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)运行持久用例；保存每轮owner/目标/回调/句柄及GPU表，正常进/出和同owner换run对照。Node既有[owner测试](../../../../../src/app/composition/synthetic-demo-owner.test.ts)等只引用其订阅/旧通知证据，不重复穷举。无原版或实机性能要求。

## 完成证据

- 2026-10-03：[joint-resources](../../../../../e2e/joint-resources.spec.ts)开发/生产2/2通过（每项完整3轮），Chrome154/macOS、4173/4174、1280×800/DPR1。每轮同回合可信Right移动与N接受，随后Restart和Exit→Start各再N接受，最后返回菜单；9次owner运行预热/每构建，未重跑上游20/50压力。
- 每轮严格组成：键盘9、Session3、render6（Three的creationerror/lost/restored与应用lost/restored及resolution change），唯一view keydown/keyup target、一项active ResizeObserver。每次run切换前后完整target/callback/capture身份集合相同；原生rAF的纯定时窗口最大1且有真实交付，菜单窗口pending/maximum/requested/delivered/cancelled全0。
- GPU在实际两kind绘制后为`2 geometries / 0 textures / 1 program`，各轮及同owner两种run切换后再预热完全相等。菜单owner级所有listener有真实removedAt、observer targets空、canvas断开；旧组最大撤销序号小于新组最小登记序号。React/Vite/test独立排除，未知other应用登记与菜单基线完全一致。
- 两构建每轮累计context lost为1/1、2/2、3/3，扩展缺失0，取得本机真实释放证据。未来缺可选扩展时输出具体未支持数量及`context-loss-capability` annotation，不冒称该context lost；已支持context逐个断言lost。
- rubber-duck要求消除条件context断言的静默空集合、建议render精确组成；已逐项记录能力并断言每个支持的context、pin render6。没有把可选扩展改为Spec之外强制前提，本机全支持证据明确。simplify限定本用例及probe新增addedAt字段，把key目标同一性改为Set，继续复用02/03helper。
- `pnpm check`通过（47文件/1192测试、type/lint/build）。旧回调/不可见订阅由既有[owner测试](../../../../../src/app/composition/synthetic-demo-owner.test.ts)、[lifecycle测试](../../../../../src/app/composition/synthetic-demo-lifecycle.test.ts)支持；不调用retained生产callback、不修改Core或调度。工程/键位/架构文档仍准确，本项只补联合证据，没有原版事实/ADR/阶段结论；自有runner资源收尾，附件在ignored目录。
