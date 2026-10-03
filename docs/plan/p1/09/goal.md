---
type: plan
status: accepted
phase: P1
task: "09"
updated: 2026-10-03
related: [ADR-0004, ADR-0012, ADR-0015]
---

# P1-09：最小键盘适配与输入隔离 — Goal

## 目标与来源

实现用户于 2026-10-02 批准的 [Spec](./spec.md) 的 S-01 至 S-07、AC-01 至 AC-16：合成画面获得焦点时，将键盘轴、marker 命令和 P 控制分别送入现有通道；暂停、失焦、隐藏和运行替换均清键，旧重复事件不能恢复移动；监听随 owner 释放，失败保留原因并沿用清理锁存。独立键位文档必须按审阅修订对齐。本文件不重新定义行为，也不批准执行。

## 代码现状与前提

- **当前输入出口：** [Core](../../../../src/core/synthetic/synthetic-scene.ts) 已定义 `MoveInput {moveX}`、两个 marker 命令与域事件；[Session](../../../../src/app/session/synthetic-session.ts) 只有 running/open 通知边界接受输入。暂停清 Runtime 意图，页面恢复可见不自动继续；不得在状态/取消/错误/清理通知或新运行 attach 中补发输入。
- **已有 UI 通道：** [运行绑定](../../../../src/ui/game/synthetic-session-bridge.ts)尚无 `setInput`；[命令反馈](../../../../src/ui/game/synthetic-command-feedback.ts)已有 pending/accepted/rejected/cancelled/unconfirmed；[控制与可用性](../../../../src/ui/game/synthetic-game-controls.ts)已有 pause/resume 分流；[store](../../../../src/ui/game/synthetic-game-store.ts)尚无 `input` 错误操作。03 复用这些通道，不新建队列。
- **已有装配：** [owner](../../../../src/app/composition/synthetic-demo-owner.ts)拥有会话、桥接与渲染器并记录首个清理失败；[hook](../../../../src/app/composition/use-synthetic-demo-owner.ts)按容器创建 owner；[演示生命周期](../../../../src/app/composition/synthetic-demo-lifecycle.ts)保证先释放后创建及失败锁存。[演示页](../../../../src/ui/pages/SyntheticDemoPage.tsx)进入时聚焦标题，[画面容器](../../../../src/ui/render/SyntheticRenderView.tsx)尚不可聚焦。
- **计划新增而非现有实现：** `src/platform/input/keyboard-input.ts` 与邻接测试（纯事件/状态/源端口）；`keyboard-source.ts` 与邻接测试（生产监听生命周期与资格逻辑）；`browser-keyboard-source.ts`（薄 DOM 连接）；`src/ui/game/synthetic-keyboard-input.ts` 与邻接测试（合成映射及会话消费者）。具体职责由 01–03 限定，不建立全局 schema 或通用引擎。
- **测试设施：** 复用 [ControlledHost](../../../../src/app/session/synthetic-session.test-support.ts)、[RecordingSurface](../../../../src/render/scene/render-surface.test-support.ts)、[TestClock/真实桥接测试](../../../../src/ui/game/synthetic-ui.test-support.ts)，以及 owner/生命周期现有测试。Node 程序不含 DOM；浏览器连接不被 `.test.ts` 导入，不引入 jsdom、Playwright 或新依赖。

### 跨任务与环境前提

| 前提 | 当前证据与执行前核对 |
|---|---|
| P1-05 会话边界及生命周期 | [tracker](../05/goal.md#子任务跟踪)全部 completed；[08 最终证据](../05/subtasks/08-final-alignment.md#完成证据)及 [07 真实可见性证据](../05/subtasks/07-browser-lifecycle-evidence.md#完成证据)。执行前须仍为 done，不能用 Node 信号代替真实 hidden |
| P1-06 桥接与指令反馈 | [tracker](../06/goal.md#子任务跟踪)全部 completed；[09 最终证据](../06/subtasks/09-final-alignment.md#完成证据)覆盖 store、当前运行身份和接受/拒绝反馈 |
| P1-08 菜单、owner 与恢复 | [tracker](../08/goal.md#子任务跟踪)全部 completed；[06 最终证据](../08/subtasks/06-final-browser-alignment.md#完成证据)覆盖菜单往返、StrictMode/HMR、先释放后创建及清理失败信号 |
| 工具链与检查 | 使用[工程约定](../../../engineering/README.md)规定的 Node/pnpm，现有 `pnpm exec vitest run …`、`pnpm check`、`pnpm dev`、`pnpm preview`。不因规划安装或升级依赖 |
| 浏览器能力 | 05 执行时发现可用工具，使用本机已有 Chromium 与隔离 profile/context；真实 hidden 按[已验证 CDP 路线](../../../engineering/README.md#已验证的-cdp-自动化路线)。缺能力时按 browser-testing 尝试有界替代入口，必需证据缺失则阻塞，不下载浏览器/新增 runner |

原版记录只读引用[键位表](../../../original/input/key-map.md)与 [U-011/U-012](../../../original/unknowns.md)。无原版对照、跨系统快捷键验证、存储或云前提；方向键与 N/X 是合成绑定，不能冒充原版规则。独立[键位文档](../../../engineering/keyboard-input.md)仍有旧规则，唯一执行契约是获批 Spec；06 按 AC-15 同步。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 03、06 | 03：五行映射测试；06：独立文档对齐；07：审批边界核对 |
| S-02 | 01 | 01：规范化、分类、按住表 Node 测试；03：真实运行输入；07：汇总 |
| S-03 | 03 | 03：轴/命令/控制及错误测试；05：页面反馈；07：汇总 |
| S-04 | 02、04 | 02：资格和默认行为；05：焦点/拦截/按钮隔离；07：汇总 |
| S-05 | 01、03、04 | 01、03、04：清键和身份测试；05：实际失焦/隐藏；07：汇总 |
| S-06 | 02、04 | 02：真实监听管理故障；04：owner 释放/锁存；05：唯一监听；07：汇总 |
| S-07 | 05、06 | 各实现子任务自带 Node 测试；05：浏览器证据；06：文档；07：工程与全覆盖 |
| AC-01 | 01、03 | 01：生产规范化/分类；03：映射；06：与键位表逐项核对 |
| AC-02 | 01、03 | 01：双键/重复/释放；03：真实 Session 与逐 tick 参考 Core 相等 |
| AC-03 | 03 | 03：pending、接受/拒绝、取消/unconfirmed；05：N/X 页面路径 |
| AC-04 | 03 | 03：P 的实时可用性、pagehide 及错误；05：显式暂停/继续 |
| AC-05 | 01、02、03 | 01、02、03：释放与拦截分离的矩阵；05：浏览器放行/接线核对 |
| AC-06 | 03 | 03、04：通知边界与清键；05：暂停后无旧轴 |
| AC-07 | 01、02、03 | 02：真实资格/信号逻辑；03：两种隐藏顺序、旧 run 与无新 focusin 恢复 |
| AC-08 | 04 | 05：开发/生产移动、稳定采样、N/X/P；07：证据有效性 |
| AC-09 | 02、03、04 | 05：开发/生产 defaultPrevented、scrollY、原生控件与页面隔离 |
| AC-10 | 02、03、04 | 03：清键逻辑；05：开发真实 hidden、生产元素失焦及窗口路径限制 |
| AC-11 | 02、04 | 02、04：幂等/顺序；05：往返、StrictMode/HMR、同 owner Restart/Exit→Start |
| AC-12 | 02、03、04 | 02：生产登记/撤销注入；03：input 错误；04：所有权/锁存/旧回调；05：稀有文案接线审阅 |
| AC-13 | 04 | 05：两种构建的 DOM、可访问性和焦点；04/05：unavailable 数据/文案审阅 |
| AC-14 | 01–04 | 06：相对任务源码起点的边界检查；07：最终完整差异 |
| AC-15 | 06 | 06：规则、原版声明、链接/元数据；07：完整对齐 |
| AC-16 | — | 01–04：各自 `pnpm check`；05：实际构建；07：最终 `pnpm check` |

每项最终由 07 核验；局部证据不代替整项验收。

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-keyboard-input-contract.md](./subtasks/01-keyboard-input-contract.md) | — | completed |
| [02-browser-keyboard-source.md](./subtasks/02-browser-keyboard-source.md) | 01 | completed |
| [03-session-keyboard-actions.md](./subtasks/03-session-keyboard-actions.md) | 01 | completed |
| [04-demo-keyboard-wiring.md](./subtasks/04-demo-keyboard-wiring.md) | 02, 03 | completed |
| [05-browser-input-evidence.md](./subtasks/05-browser-input-evidence.md) | 04 | pending |
| [06-keyboard-docs-alignment.md](./subtasks/06-keyboard-docs-alignment.md) | 05 | pending |
| [07-final-alignment.md](./subtasks/07-final-alignment.md) | 01, 02, 03, 04, 05, 06 | pending |

02 与 03 共用 01 的端口，彼此没有实现前提；04 汇合，05 在实际页面取证，06 根据实现与证据定稿文档。最后一行始终只做最终核验并依赖所有其他子任务；新增修复使用新 ID、插在最后一行之前并加入其依赖，不重编号。

## 执行记录

## 审批

**2026-10-02 用户批准本 Goal。** 用户明确写明“approve the goal and commit”，批准当前 7 个子任务、依赖关系及 S-01 至 S-07、AC-01 至 AC-16 的覆盖，并授权提交本轮规划文档。status 为 accepted，不表示实现完成，也不授权本轮开始执行、push 或部署；所有子任务仍为 pending。
