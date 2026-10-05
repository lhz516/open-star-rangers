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

- [ ] S-04：适配只转交 `data` 与事件类型；`terminate()` 先移除全部监听再终止，可重复调用，终止后无回调；`post` 的同步异常原样传播。
- [ ] 构建：`vite.config.ts` 以 ES 格式输出 Worker；`pnpm build` 通过；`worker-port.ts` 进入 Node 类型程序，`browser-import-worker.ts` 只在应用程序中检查。
- [ ] `pnpm exec vitest run src/platform/workers`、`pnpm typecheck`、`pnpm lint` 通过；依赖清单与锁文件不变。

## 验证方法

- Node 测试：假 Worker 统计监听数，并记录 `postMessage` 与 `terminate` 调用。
- browser-testing 在 [09](./09-browser-worker-paths.md) 中执行。

## 完成证据
