---
type: plan
status: active
phase: P1
task: "10"
subtask: "02"
updated: 2026-10-10
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

- 只读[面板](../../../../engineering/source-structure.md#r7-演示页面开发面板与画面)、[输入区](../../../../engineering/source-structure.md#r7-演示页面开发面板与画面)、[布局](../../../../../src/render/viewport/viewport-layout.ts)、[外观](../../../../engineering/source-structure.md#r2-合成渲染)。
- 只读[键盘连接](../../../../../src/platform/input/browser-keyboard-source.ts)、[Session host](../../../../../src/platform/browser/browser-session-host.ts)、[WebGL表面](../../../../../src/render/webgl/browser-webgl-surface.ts)：按实际登记边界归属，不按全页总数。
- 计划新增 e2e/support/browser-probes.ts、e2e/support/demo-observations.ts、e2e/support/image-observations.ts、e2e/probe-contract.spec.ts；类型仅在E2E程序，不把DOM helper传递导入Node测试。

## 验收标准

- [x] S-03/AC-05：自有测试对象的登记/交付/撤销计数真实正确，应用与测试/React/Vite可分离；finally恢复包装及自有资源。
- [x] AC-03/06：像素解码可识别合成颜色与位置，布局预期用真实容器、DPR/设备限制；不读取Core内部或截图假数据。
- [x] AC-04：采样记录tick/x/实际时间窗，清键后先等新投影；paused不等tick递增，running须递增。
- [x] AC-09/11：默认错误收集能让测试失败，探针不吞异常/改变调用语义；pnpm check与探针自检实跑通过。

## 验证方法

按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)在开发/生产跑probe-contract，自有DOM正/负样本与实际应用只读交叉核对；探针rAF窗口不使用requestAnimationFrame轮询等待。使用01新增runner的聚焦选择器及pnpm check。无实机/原版要求。

## 完成证据

- 2026-10-03：新增 [browser-probes](../../../../../e2e/support/browser-probes.ts)、[默认错误fixture](../../../../../e2e/support/browser-test.ts)、[DOM/采样](../../../../engineering/source-structure.md#r8-e2e-演示观察)、[截图/布局](../../../../../e2e/support/image-observations.ts)及[探针契约](../../../../../e2e/probe-contract.spec.ts)。所有探针仅在测试context内包装宿主方法；不进入App、不改变Core、时钟、输入或visibility。
- `pnpm test:e2e probe-contract.spec.ts --project=development --project=production`：6/6真实通过，Chrome154/macOS、4173/4174、1280×800/DPR1。自有节点验证相同callback/capture去重、错误capture不撤销、once仅执行一次、this不变、无效receiver原生TypeError、rAF取消/交付与ResizeObserver归零；restore后新登记不再被记录。
- 应用只读交叉核对：mover实际色像素≥9、marker为0，真实CSS容器与设备限制计算布局误差≤1px；首个新投影后4样本跨≥360ms，tick增加而x不变。每次显式刷新diagnostics，真实running窗口rAF最大1；9项键盘/3项Session的具体type组成均精确断言。菜单后应用监听、observer、pending帧归零，旧canvas断开，扩展可用时context lost。
- 默认fixture收集console/pageerror/HTTP/requestfailed和UI错误；独立child page生成受控console、宿主异步异常和404，错误原因均保留，child finally关闭。只有favicon404逐项记录，WebGL白名单尚只供06使用。最初404样本被Vite SPA fallback返回200，改为`Accept: application/javascript`取得真正404，不以伪造响应代替。
- `pnpm check`通过（47文件/1192测试、四类型程序、lint、build）；源产物仍index-BWtf9nnJ.js。rubber-duck非阻塞建议已补：React/Vite独立分类、每类listener具体组成、canvas能力/释放与restore自检；共享生命周期类型按现有owner中Session先于input的真实登记顺序归属（注释及type断言限定该前提），不新增生产marker。simplify限定本项5个新文件，错误采集抽出供自检复用，未增不必要公共接口。
- 文档影响检查：工程命令/类型边界与生产架构仍准确，没有新的原版事实/ADR/阶段结论；helper职责证据写本项，完整使用与覆盖映射由07补齐。fixture恢复包装，runner关闭自有浏览器/服务器；合成附件只在ignored目录。
