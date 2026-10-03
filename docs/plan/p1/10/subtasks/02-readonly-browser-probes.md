---
type: plan
status: active
phase: P1
task: "10"
subtask: "02"
updated: 2026-10-03
---

# 02 — 只读观测与错误采集

**契约来源：** [Spec](../spec.md) 的 S-02、S-03、S-05；AC-03 至 AC-06、AC-09、AC-11。
**依赖：** 01。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在导航前安装测试侧探针：登记/撤销按target、callback、capture身份，rAF按句柄与交付/取消跟踪，ResizeObserver/media/context/canvas按实例归属。调用原方法并保留this、返回值、异常与传播；不伪造输入/时间/可见性、不增游戏调度。
- 区分owner输入9项、Session3项、Three.js与应用渲染登记、React根/Vite/测试自身。探针自己的键盘/可见性记录不得计入应用；rAF只在不受Playwright rAF轮询干扰的计时窗口采样。
- 复用testid读取10 Hz投影和命令身份；稳定取样从清键后首次新发布投影开始，≥3样本、跨度≥300ms。诊断每次显式Refresh，不以旧缓存判定。
- 元素截图用浏览器createImageBitmap解码，读取合成颜色像素数与mover图像位置；保持preserveDrawingBuffer:false，不改渲染器。布局预期复用现有纯函数。
- 默认采集pageerror、应用错误、失败请求/响应；仅明确favicon 404逐项记录，受控WebGL诊断白名单留06限定，不整体忽略console.error。helper失败/清理保留原因。
- 持久探针自检以测试自有节点/监听/rAF/观察器证明登记、取消、交付及撤销后归零，证实探针不吞异常或改变语义。按[简化](../../../../../.agents/skills/simplify/SKILL.md)检查当前helper。

## 不包含

不增加生产owner/world调试API、不调用内部frame/step、不在测试重造调度；不重复上游旧回调/注入故障矩阵。资源闭环属04。

## 关键文件与契约

- 只读[面板](../../../../../src/ui/dev/SyntheticDevPanel.tsx)、[输入区](../../../../../src/ui/render/SyntheticRenderView.tsx)、[布局](../../../../../src/render/viewport/viewport-layout.ts)、[外观](../../../../../src/render/synthetic/synthetic-appearance.ts)。
- 只读[键盘连接](../../../../../src/platform/input/browser-keyboard-source.ts)、[Session host](../../../../../src/platform/browser/browser-session-host.ts)、[WebGL表面](../../../../../src/render/webgl/browser-webgl-surface.ts)：按实际登记边界归属，不按全页总数。
- 计划新增 e2e/support/browser-probes.ts、e2e/support/demo-observations.ts、e2e/support/image-observations.ts、e2e/probe-contract.spec.ts；类型仅在E2E程序，不把DOM helper传递导入Node测试。

## 验收标准

- [ ] S-03/AC-05：自有测试对象的登记/交付/撤销计数真实正确，应用与测试/React/Vite可分离；finally恢复包装及自有资源。
- [ ] AC-03/06：像素解码可识别合成颜色与位置，布局预期用真实容器、DPR/设备限制；不读取Core内部或截图假数据。
- [ ] AC-04：采样记录tick/x/实际时间窗，清键后先等新投影；paused不等tick递增，running须递增。
- [ ] AC-09/11：默认错误收集能让测试失败，探针不吞异常/改变调用语义；pnpm check与探针自检实跑通过。

## 验证方法

按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)在开发/生产跑probe-contract，自有DOM正/负样本与实际应用只读交叉核对；探针rAF窗口不使用requestAnimationFrame轮询等待。使用01新增runner的聚焦选择器及pnpm check。无实机/原版要求。

## 完成证据
