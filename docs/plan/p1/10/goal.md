---
type: plan
status: accepted
phase: P1
task: "10"
updated: 2026-10-03
related: [ADR-0002, ADR-0006, ADR-0008, ADR-0009, ADR-0012, ADR-0015]
---

# P1-10：浏览器集成与回归冒烟 — Goal

## 目标与来源

实现用户于 2026-10-03 批准的 [Spec](./spec.md) 的 S-01 至 S-06、AC-01 至 AC-12：把开发/生产合成闭环、同轮资源与浏览器 replay 固化为可重复本地命令，并取得 runner 自身真实执行证据。不重新实现上游系统，不重复仍有效的人工矩阵，不声明 P1 退出。本文件不重新定义契约。

## 代码现状与前提

- [package.json](../../../../package.json)已有 typecheck/lint/Vitest/build，没有 Playwright/E2E。[Vite](../../../../vite.config.ts)只发现 src/tools 的 .test.ts；[Node tsconfig](../../../../tsconfig.node.json)无 DOM。01 新建独立 E2E 类型程序，不扩展纯模块/Node 的环境或 Vitest 发现。
- [App](../../../../src/app/App.tsx)与 [hook](../../../../src/app/composition/use-synthetic-demo-owner.ts)已拥有页面/owner 生命周期；[输入区](../../../../src/ui/render/SyntheticRenderView.tsx)已有名称、说明、tabIndex与键盘状态。[面板](../../../../src/ui/dev/SyntheticDevPanel.tsx)可读 phase/run-id/tick/mover/marker/results 及按需渲染诊断，投影10 Hz、非整数文本保留3位。测试优先使用现有DOM入口，不新增生产调试API。
- [owner](../../../../src/app/composition/synthetic-demo-owner.ts)种子0、默认60 Hz、录制关闭；[Session](../../../../src/app/session/synthetic-session.ts)是唯一调度/控制权威；[浏览器host](../../../../src/platform/browser/browser-session-host.ts)拥有3项生命周期监听，[keyboard source](../../../../src/platform/input/keyboard-source.ts)拥有9项输入登记。Restart/Exit→Start保留owner，返回菜单释放owner。
- [渲染器](../../../../src/render/synthetic/synthetic-renderer.ts)提供drawnTick/draws/entities/gpu/layout；[布局函数](../../../../src/render/viewport/viewport-layout.ts)与[合成外观](../../../../src/render/synthetic/synthetic-appearance.ts)可只读复用。真实像素与GPU基线不能由Canvas存在或Node替身代替。
- [replay](../../../../src/core/synthetic/synthetic-replay.ts)已有 SyntheticReplayRecord/Result 和生产 replay/比较器；[Session录制测试](../../../../src/app/session/synthetic-session-replay.test.ts)已有seed0/50 Hz、interval1的4个成功tick输入。05只补浏览器执行，不向App开启录制。
- **计划新增：** playwright.config.ts、tsconfig.e2e.json、e2e/下的用例和support；tools/e2e-configuration.test.ts只验证runner接入/失败传播。各文件职责在子任务限定；默认不改生产源码。

### 跨任务与环境前提

| 前提 | 完成依据与执行前核对 |
|---|---|
| P1-03 replay | [tracker](../03/goal.md#子任务跟踪)及[最终证据](../03/subtasks/07-final-alignment.md#完成证据)；本轮路由done，执行前仍须保持完成 |
| P1-08 页面/资源 | [tracker](../08/goal.md#子任务跟踪)及[最终浏览器证据](../08/subtasks/06-final-browser-alignment.md#完成证据)；本轮路由done，其P1-05/06/07前提与证据直接复用 |
| P1-09 输入 | [tracker](../09/goal.md#子任务跟踪)、[浏览器证据](../09/subtasks/05-browser-input-evidence.md#完成证据)及[最终对齐](../09/subtasks/07-final-alignment.md#完成证据)；本轮路由done，五键/清键/旧回调与HMR细项不重复 |
| 工具链/锁 | [工程约定](../../../engineering/README.md)的Node22/pnpm12/TS6；项目依赖已在多文档根锁的第二文档，无修复工作。01新增开发依赖时正常更新锁并验证frozen安装，不升级原工具链、不放宽供应链策略 |
| 本地浏览器与桌面 | 执行时提供已有兼容Chrome/Chromium、普通WebGL2和headed原生hidden能力；历史Chrome154/macOS证据不是新runner通过证明。按[CDP路线](../../../engineering/README.md#已验证的-cdp-自动化路线)取得本轮hidden，缺能力不能skip成绿、不下载浏览器 |
| P1-12共享表面 | 无任务先后前提，但package/锁/Vite等共同文件顺序编辑，不并行覆盖或引入合规工具 |

无原版文件、真实设备/系统快捷键保真、用户存储、云或CI前提；全部用代码合成内容。HMR/窗口/DPR/故障历史证据有效性由07核对，失效只补相关检查。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 01：配置/类型/lint/frozen与bootstrap；07、08：完整入口实跑 |
| S-02 | 03、06 | 03：两种构建交互/像素/缩放；06：hidden与降级 |
| S-03 | 02、04 | 02：只读探针有效性；04：同轮计数/往返/GPU；08：汇总 |
| S-04 | 05 | 05：生产replay精确相等/偏差/格式拒绝 |
| S-05 | 01、02、06 | 01：失败传播；02：诊断/隔离；06：能力缺失与降级；07：退出与收尾 |
| S-06 | 07 | 07：自动/复用/失效映射、工程与结构文档；08：全覆盖 |
| AC-01 | 01 | 01：实际bootstrap、配置发现、frozen；07：完整3项目运行 |
| AC-02 | 03 | 03：开发/生产原生控件、DOM/ARIA/焦点及页面隔离 |
| AC-03 | 02、03 | 03：左右各≥1s、N/X/X、像素≥9与±3、结果身份 |
| AC-04 | 02、03 | 03：P/按钮/失焦/换run，首次新投影后≥3样本跨≥300ms |
| AC-05 | 02、04 | 04：各3次菜单往返、rAF≤1、9+3登记/释放、GPU与旧画布；07：Node旧回调证据适用性 |
| AC-06 | 02、03 | 03：1280×800→480×900、布局/缓冲≤1px、可见与唯一动作 |
| AC-07 | 05 | 05：同版本Node/浏览器events/checkpoints与真实比较器 |
| AC-08 | 06 | 06：开发headed真实hidden/visible、暂停、旧repeat与新按下 |
| AC-09 | 02、06 | 02：默认错误采集；06：独立禁用WebGL仍经Core与可重进；07：全部正常场景 |
| AC-10 | 07 | 07：历史证据版本/相关差异核对及仅失效项补测 |
| AC-11 | 01、02、06 | 01、06：受控失败退出；02：不干扰探针；07：产物/diff/收尾；08：边界 |
| AC-12 | 07 | 07：pnpm check与新命令、文档及清理；08：最终状态全覆盖 |

每项最终由08核验；工具接入通过不等于浏览器验收通过。

## 子任务跟踪

状态只在此维护：pending / in-progress / blocked / completed。依赖项全部 completed 后才能开始；证据写在相应subtask，不在阶段索引重复。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-local-e2e-runner.md](./subtasks/01-local-e2e-runner.md) | — | completed |
| [02-readonly-browser-probes.md](./subtasks/02-readonly-browser-probes.md) | 01 | completed |
| [03-interaction-render-smoke.md](./subtasks/03-interaction-render-smoke.md) | 02 | completed |
| [04-joint-resource-regression.md](./subtasks/04-joint-resource-regression.md) | 02 | completed |
| [05-browser-replay.md](./subtasks/05-browser-replay.md) | 01 | completed |
| [06-native-lifecycle-fallback.md](./subtasks/06-native-lifecycle-fallback.md) | 02 | completed |
| [07-evidence-docs-alignment.md](./subtasks/07-evidence-docs-alignment.md) | 01, 02, 03, 04, 05, 06 | completed |
| [08-final-alignment.md](./subtasks/08-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07 | pending |

03/04/06共同依赖02的观测能力，不互相依赖；05只需01的runner。共享helper仍须顺序编辑。最后一行仅验证，依赖所有其他子任务；新增修复用新ID插在最终验证前，不改已有ID。

## 执行记录

## 审批

用户于 2026-10-03 明确批准本 Goal 的完整执行计划（8 个子任务），并要求本地提交 P1-10/P1-12 规划文档。Goal 批准不代表实现完成；本轮所有子任务仍为 pending，不开始执行，不授权 push或部署。
