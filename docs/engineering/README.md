---
type: guide
status: active
phase: P1
updated: 2026-10-02
related: [ADR-0002, ADR-0006]
---

# 工程约定

本项目代码的结构、命令与检查规则。架构决定见[总计划](../plan/master-plan.md) §4–5；本文只记录落地方式。

按 spec、goal 与 subtasks 开发的路径、审批、进度维护和 skills 入口见[Agent 任务工作流](./agent-workflow.md)。

## 环境

- Node 22（`.nvmrc`；`package.json` 要求 ≥ 22.18，以便直接运行 `.ts`），pnpm 12（`packageManager` 字段，由 corepack 提供）。
- 依赖用 `pnpm-lock.yaml` 锁定，升级经测试后合入。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 生产构建，输出到 `dist/` |
| `pnpm typecheck` | 分别用三个 tsconfig 做类型检查（见下） |
| `pnpm lint` | ESLint，包含模块边界与确定性规则 |
| `pnpm test` | Vitest 单元测试 |
| `pnpm check` | 依次运行以上四项检查，提交前使用 |

`tools/` 中的研究脚本直接用 `node tools/<脚本>.ts` 运行，见 [tools](../guides/tools.md)。

## TypeScript 配置

| 文件 | 范围 | 作用 |
|---|---|---|
| `tsconfig.base.json` | — | 共同选项：`strict`、`verbatimModuleSyntax`、`erasableSyntaxOnly`、允许 `.ts` 扩展名导入 |
| `tsconfig.core.json` | `src/core`、`src/original-data`、`src/content` | **不含 DOM 与 Node 类型**：这些纯模块一旦使用浏览器或 Node API，编译即失败 |
| `tsconfig.app.json` | `src/` 全部 | 浏览器应用（DOM、JSX、Vite 客户端类型） |
| `tsconfig.node.json` | `tools/**/*.ts`、Vite 配置、`src/**/*.test.ts` | Node 端 TypeScript；`eslint.config.js` 由 lint 覆盖，未启用 JS 类型检查 |

- `erasableSyntaxOnly` 禁止 `enum`、`namespace` 等需要转换的语法，使同一份代码既能被 Vite 打包，也能被 Node 直接运行。常量集合用 `as const` 对象代替 `enum`。
- 导入本项目模块时写出 `.ts`/`.tsx` 扩展名，Node 直接运行时需要。
- **TypeScript 固定为 6.0.x。** TypeScript 7 是原生实现，不再提供 typescript-eslint 依赖的 JavaScript API；typescript-eslint 支持 7 之后再升级。

## Lint 规则（`eslint.config.js`）

- **纯模块**（`src/core`、`src/original-data`、`src/content`）的非测试 `.ts`/`.tsx` 不得导入或 re-export React、React DOM、Zustand、Three.js、IndexedDB 封装库的包根/子路径，也不得导入 `app`、`render`、`ui`、`platform`、`workers` 的目录入口或子模块。
- **`src/core`** 不得使用 `Math.random`、`Date`、`performance.now`、定时器、`requestAnimationFrame`、`await` 或任何 `async` 函数形式。随机数来自 Core 自己的带种子生成器，时间来自 tick 计数（总计划 §5）。其他消费层仍允许宿主调度和异步。
- 类型导入必须写成 `import type`。
- 持久正/负回归在 [engineering-boundaries.test.ts](../../tools/engineering-boundaries.test.ts)，进入现有 `pnpm test`/`pnpm check`。TypeScript 样本在自有临时项目中使用仓库原配置和真实 include/exclude，ESLint 使用虚拟源与真实逻辑路径，不在生产目录留违规文件。负向必须命中目标诊断，正向须通过；空项目、ignored/parser 错误及误配预期均会失败。
- 覆盖限定为明确的静态导入、路径、宿主 API 和 async/await 语法；不承诺识别动态绕过、别名间接调用或不经 async/await 的 Promise 链。测试例外是 `.test.ts`，不扩展未来 `.test.tsx`/E2E 发现能力。

## 测试

- 单元测试与源码放在同一目录，命名为 `*.test.ts`，用 Vitest 在 Node 环境运行。
- **测试不得读取原版文件。** 原版格式的测试数据由 `src/original-data/synthetic.ts` 在代码中生成；用原版文件做的完整性检查放在 `tools/nob-check.ts`，只在本地运行。
- 驾驶舱字体目录的读取属于 `src/original-data/payloads.ts`，CLI 只负责调度与报告；合成样本覆盖目录顺序与空目录。
- Ghidra 编译器规范补丁另有标准库 `unittest` 测试：`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`，验证 XML 结构变换、备份与幂等性。
- 工程边界回归还启动隔离的预期失败 Vitest 进程，断言其命中真正的失败检查并非零退出；该失败是测试输入，正常测试命令仍须成功。临时项目复制实际配置、链接已安装依赖，结束由 finally 清理，不读取 `local/` 或真实 Ghidra。
- 快速只跑边界回归：`pnpm exec vitest run tools/engineering-boundaries.test.ts`。不要用测试数量代替覆盖证明；当前证据见 [P1-01 subtasks](../plan/p1/01/goal.md#子任务跟踪)。

## 合成 Runtime

- [synthetic-runtime.ts](../../src/app/synthetic-runtime.ts) 是 P1 合成运行入口，契约见 [P1-04 spec](../plan/p1/04/spec.md)。它不是原版玩法，也尚未接入页面或浏览器帧循环。
- 调用者向 `frame(nowMs)` 提供单调不减的毫秒时间戳；首帧只锚定。只在 Runtime 内推进 Core；时钟和 Event Bus 的内部发布入口不能交给消费者。
- `setInput` 保存连续轴，`submitCommand` 返回 Runtime commandId；它不同于 Core entityId。命令结果在整帧模拟结束后通知，持续事实从 `uiProjection`/`renderFrame` 读取。
- `on`/`onAny` 仅接收同步、返回 undefined 的回调。监听器抛错前的副作用不会回滚；帧末 `listener-failed` 不意味着 tick 未提交，不可重试已完成 tick。Core `faulted` 后禁止模拟和输入，读取与订阅清理仍可用；恢复会话属于 P1-05。
- 录制默认关闭；创建时传 `recording: {checkpointInterval}` 开启，`exportRecording()` 返回 P1-03 格式的冻结记录/结果，关闭时为 null。较大间隔仅减少检查点，不减少逐 tick 输入和事件；没有有界内存或自动持久化。
- 故障帧已经成功的 tick 和事件保留在录制中，但该帧通知不投递。因此故障导出仍可 replay 一致，却不是 Event Bus 投递日志。测试用真实合成 Core；故障测试只在 Vitest 创建边界注入 step 前异常，不向生产接口加入测试后门。
- owner 可在 frame/事件批次之外显式调用 `resetClock`（丢弃全部宿主时间进度）、`clearIntent`（清轴/队列并返回冻结 FIFO ID）、`foldRenderState`（previous=current、alpha=0）和 `clearSubscriptions`。faulted 也可收尾，但不解除故障；批次内调用抛 reentrant-call。它们不改 Core、RNG、ID 分配或录制；没有调用时裸 Runtime 行为不变。
- 针对性检查使用 `pnpm exec vitest run src/app`；完整检查仍为 `pnpm check`。没有新浏览器/原版操作流程，不需要额外 guides。

## 会话端口与错误

- [session-host.ts](../../src/app/session-host.ts) 是 app 的 DOM-free 调度/生命周期端口。回调在请求返回非负安全整数句柄之后异步交付（0 合法）；注册失败由宿主回收未交给 owner 的部分资源。取消和所有通知均同步返回 undefined。
- [session-errors.ts](../../src/app/session-errors.ts) 定义会话参数、状态及执行失败，不替代 Runtime 错误。执行失败保存有序 runtime/scheduler/consumer/cleanup/control 原因，冻结副本与条目但不冻结原异常；onError 不接受 Promise。
- [browser-session-host.ts](../../src/platform/browser-session-host.ts) 在 platform 提供真实 rAF 与 visibilitychange/pagehide/pageshow，无导入副作用或独立循环。每份订阅拥有三个监听，撤销逐项尝试且幂等，部分注册失败先回滚再抛错。只用 app 的 DOM 类型检查；不要导入当前 Node 测试程序或给 Core 加 DOM。
- [synthetic-session.ts](../../src/app/synthetic-session.ts) 的 `createSyntheticSession(options,host,onError)` 创建 idle controller，配置复制/验证后只订阅一次宿主。`control` 独立处理 start/pause/resume/restart/exit/dispose；唯一请求凭证按运行与请求身份隔离，0 句柄合法。SessionRun 没有 frame/step/world/publish；结束后读写/注册拒绝，faulted 最后状态仍可读。
- 暂停/隐藏时清瞬时意图、折叠呈现并停止循环；pagehide 独立阻断，返回可见不自动继续。显式 resume 首回调重新锚定，保留最新呈现，不补跑后台时长。`onFrame` 包含真实 projection/render/report，暂停静止通知 report=null。owner 必须 dispose 后再创建，不靠全局单例；当前不接生产页面或 React/HMR。
- rAF、同步控制及宿主通知各构成一个通知边界。域/帧消费者的控制、宿主通知与故障按 FIFO 在当前批次后处理；静止帧也不递归控制。状态通知允许为新运行接线，禁止控制；取消/错误/清理仅允许读取或取消订阅。新增订阅下一批生效，取消立即生效。
- `onCommandsCancelled` 的冻结 FIFO ID 及 reason 是会话反馈，不是 Core 拒绝或 replay 数据。转换通知按取消→暂停静止帧→适用收尾→状态→错误出口排序。`ownCleanup` 同步逆序收尾、至多尝试一次，release 即时移除/执行；释放后的 token 不再保有 owner/run/cleanup。release 失败只置 `cleanupFailed` 并同步抛错，不主动停止运行；后续 start/restart 均被阻断，exit/dispose 仍可执行。error 只保留最近错误，不是历史日志。
- 调用者自身同步操作失败直接抛出；同一同步边界内排队控制的失败单独在末尾交 onError，不合并或重报，排队 resume/start 的请求错误也保留其排队来源。异步边界汇总错误一次，剩余消费者/独立清理仍继续。Runtime listener-failed 提升为 consumer 故障，nowMs/read/request/cancel 为 scheduler；cancel 另置 cleanupFailed，实际迟到回调仍无效。Core faulted 为 runtime，资源/订阅释放为 cleanup。
- 故障保留最后成功 Core/recording 与折叠视图，停止调度并释放运行消费者/资源；无清理失败可 restart，清理失败只能结束并重建 owner。Runtime.frame 抛错不发成功形状帧。onError 抛错时也停止原本健康的循环，以 AggregateError 保留会话错、出口错及后续独立清理错，不重复调用出口。
- recording 使用 P1-03 原格式；wall-clock、runId、暂停/取消都不入记录。间隔 1/4 跨 pause/hidden/resume 的成功 tick 输入、事件与 checkpoint 用真实 replay/独立裸 Runtime 对照；故障前缀仍可导出，restart 记录从 tick 0 重建，旧冻结导出不变。Node 仅证明同版本同运行时一致，真实 Chromium 生命周期证据另见 P1-05 的 03/07。
