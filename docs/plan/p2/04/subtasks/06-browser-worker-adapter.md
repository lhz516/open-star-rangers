---
type: plan
status: active
phase: P2
task: "04"
subtask: "06"
updated: 2026-10-05
---

# 06 — 浏览器 Worker 适配与构建配置

**契约来源：** [spec](../spec.md) 的 S-04，S-09 的构建部分；[作业持有者](../spec.md#作业持有者)中的 Worker 端口；技术决定 1、11；AC-11 的构建部分。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **新增 `src/platform/workers/worker-port.ts`：** 不使用 DOM 类型。在最小的 Worker 形状上实现 04 的端口：
  - Worker 形状为 `postMessage(message, transfer)`、`addEventListener`、`removeEventListener`、`terminate()`；
  - 注册 `message`、`messageerror`、`error` 三个监听；`message` 只把 `event.data` 交给持有者，另外两个只通知事件类型，不传事件对象、文本或文件名，并对 `error` 调用 `preventDefault()`；
  - `post` 原样传播同步异常；
  - `terminate()` 先移除自己注册的全部监听，再终止；可重复调用，终止后不再调用回调。
- **新增 `src/platform/workers/browser-import-worker.ts`：** 浏览器工厂。
  - 默认用 Vite 可识别的写法 `new Worker(new URL('../../workers/import-worker.ts', import.meta.url), { type: 'module' })` 创建模块 Worker；
  - 构造函数可替换，供浏览器测试载入测试入口。
- **构建配置：** [vite.config.ts](../../../../../vite.config.ts) 增加 `worker: { format: 'es' }`。页面尚未引用工厂，生产构建暂不产生 Worker chunk（spec 已说明）。
- **测试：** 新增 `src/platform/workers/worker-port.test.ts`，用基于 `EventTarget` 的假 Worker 在 Node 中覆盖：
  - 监听的注册与移除；
  - 终止的幂等；
  - 终止后丢弃事件；
  - 不转交事件对象与文本；
  - `post` 抛错的传播。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)中记录 `platform/workers/`，并说明 `browser-*.ts` 只由应用程序检查。

## 不包含

- 真实浏览器中的载入与终止观测（[09](./09-browser-worker-paths.md)、[10](./10-browser-lifecycle-failures.md)）。
- 生产预览中的 Worker、CSP 与 SWA 回退（P2-11）。

## 关键文件与契约

- **新增：** `src/platform/workers/worker-port.ts`、`src/platform/workers/browser-import-worker.ts`、`src/platform/workers/worker-port.test.ts`（尚不存在）。
- **修改：** [vite.config.ts](../../../../../vite.config.ts)。
- **实现的端口：** 04 新增的 `src/app/import/import-worker-port.ts`。先例：[browser-session-host.ts](../../../../../src/platform/browser/browser-session-host.ts) 实现 app 的 [session-host.ts](../../../../../src/app/session/session-host.ts)。

## 验收标准

- [x] S-04：适配只转交 `data` 与事件类型；`terminate()` 先移除全部监听再终止，可重复调用，终止后无回调；`post` 的同步异常原样传播。
- [x] 构建：`vite.config.ts` 以 ES 格式输出 Worker；`pnpm build` 通过；`worker-port.ts` 进入 Node 类型程序，`browser-import-worker.ts` 只在应用程序中检查。
- [x] `pnpm exec vitest run src/platform/workers`、`pnpm typecheck`、`pnpm lint` 通过；依赖清单与锁文件不变。

## 验证方法

- Node 测试：假 Worker 统计监听数，并记录 `postMessage` 与 `terminate` 调用。
- browser-testing 在 [09](./09-browser-worker-paths.md) 中执行。

## 完成证据

- **实现：**
  - [worker-port.ts](../../../../../src/platform/workers/worker-port.ts) 的 `connectImportWorker(worker, events)` 在不含 DOM 类型的 `WorkerLike` 上实现 app 端口：`message` 只转交 `event.data`，`messageerror` 与 `error` 只通知事件发生，`error` 另调用 `preventDefault()`；`post` 直接调用 `postMessage`，同步异常原样传播；`terminate()` 先移除三个监听，再终止 Worker，只执行一次。
  - [browser-import-worker.ts](../../../../../src/platform/workers/browser-import-worker.ts) 的 `browserImportWorkerFactory(createWorker)` 默认用 `new Worker(new URL('../../workers/import-worker.ts', import.meta.url), { type: 'module' })`，构造函数可替换。
  - [vite.config.ts](../../../../../vite.config.ts) 增加 `worker: { format: 'es' }`。
- **测试：** [worker-port.test.ts](../../../../../src/platform/workers/worker-port.test.ts) 共 3 项，`pnpm exec vitest run src/platform/workers` 通过。基于 `EventTarget` 的假 Worker 统计监听，记录发送、移除与终止。
  - **转交：** 连接后恰好 3 个监听。`message` 只把同一个 `data` 交给回调；`messageerror` 与带 `message`/`filename` 标记的 `error` 都以无参数回调通知；`error` 事件被取消。
  - **发送：** `post` 发出 `start`；`postMessage` 抛出的 `DataCloneError` 原样传播。
  - **终止：** 日志依次为移除 `message`、`messageerror`、`error`，然后终止；监听数为 0。再次终止不重复；之后派发的三种事件都没有回调，`error` 也不再被取消。
- **变异检查：** 以下 7 项变异都使测试失败：去掉 `preventDefault`；转交事件对象；向 `messageError` 传参；先终止后移除；不移除监听；去掉幂等；吞掉 `post` 的异常。
- **类型程序：** `tsc -p tsconfig.node.json --listFilesOnly` 含 `worker-port.ts`，不含 `browser-import-worker.ts`；应用程序两者都含。`pnpm typecheck` 通过。
- **构建：**
  - `pnpm build` 通过，页面产物不变（尚未引用工厂，没有 Worker chunk）。
  - 构建探针：脚本在 `local/research/p2-04/probe-worker-build.mjs`，用与 `vite.config.ts` 相同的 `worker.format` 与 `target`，但不含只接受项目 `dist` 的合规插件，输出写到 `/tmp` 后删除。它临时以引用工厂的入口构建：Vite 识别默认箭头函数中的写法，产出独立的 `import-worker-*.js`（约 38 KB），引用改写为带 `{type:'module'}` 的 `new Worker(new URL(...))`；chunk 是 ES 模块，以宿主调用结束，不含 `fetch`、`XMLHttpRequest` 与 `importScripts`。
  - 依赖清单与锁文件没有变化。
- **检查：** `pnpm check`（92 个文件、2662 项测试、构建）、`pnpm check:original`（passed）与文档链接检查都通过。
- **Rubber-duck：** 无问题。审查者另在 Chrome 154 中独立验证：脚本 404 与模块顶层抛错都会在 `Worker` 对象上派发可取消的 `error`，`preventDefault()` 会抑制对应的页面错误；404 本身的 HTTP 诊断仍会出现，由 10 声明为预期诊断。单参数 `postMessage` 可以克隆 `Blob`/`File`。
- **Simplify：**
  - **已采纳：** 去掉冗余的标记断言（精确的调用相等已证明不转交事件内容）；精简平台条目中重复的端口契约。
  - **未采纳：**
    - 改用 Map 实现的假 Worker：本子任务要求基于 `EventTarget`，它也覆盖了真实的 `defaultPrevented` 语义；
    - 终止后释放 Worker 引用：作业结束后持有者丢弃作业，端口、Worker 与回调一起变得不可达。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的目录树加入 `platform/workers/`，“导入 Worker”一节新增平台适配，说明 `browser-*` 文件只由应用程序检查，以及 Worker 的 ES 输出与 P2-11 的接线归属。工程约定的 TypeScript 配置表仍然准确（`browser-*` 不被测试导入，因此不在 Node 程序中）；STATUS 不变。

