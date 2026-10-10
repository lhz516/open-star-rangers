---
type: plan
status: active
phase: P3
task: "04"
subtask: "04"
updated: 2026-10-10
---

# 04 — 应用端口与平台适配器

**契约来源：** [spec](../spec.md) 的 S-05（平台部分）、[离页保护](../spec.md#离页保护)、[数据模型与契约](../spec.md#数据模型与契约)的“应用端口”行、[开发诊断](../spec.md#开发诊断)的文件保存；为 AC-07、AC-10、AC-22 提供端口。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/app/mission/mission-ports.ts`：DOM-free 的需求方端口类型（不含实现）：
  - 种子来源：返回 uint32；异常或非法值由调用者报告为开始失败。
  - 单调毫秒时钟：有限且不倒退。
  - 单次计时器：登记返回非负安全整数句柄后异步回调；取消幂等；登记失败显式抛出。
  - 离页保护：登记一份 `beforeunload` 确认，返回幂等撤销函数；登记失败回滚已取得部分后抛出。
  - 开发文件保存：以文件名与文本保存，返回成功或带原因的失败；拥有并释放 Blob、对象 URL 与临时元素。
- 计划新增浏览器实现（模块导入时无副作用，监听只在调用时安装）：
  - `src/platform/browser/browser-seed.ts`：`crypto.getRandomValues` 取一个 uint32。
  - `src/platform/browser/browser-timer.ts`：`performance.now` 与 `setTimeout`/`clearTimeout` 的单次计时器与时钟。
  - `src/platform/browser/leave-guard.ts`：在 `window` 上登记 `beforeunload`，处理器调用 `preventDefault()` 请求原生确认，不定制提示文字，不在处理器中退出、清理或导出；撤销失败抛出供调用者锁存。
  - `src/platform/files/browser-file-save.ts`：Blob、对象 URL 与临时下载元素的创建与释放；失败、完成与所有者释放都回收；不把浏览器接收下载请求报告为写盘成功。
- 每个适配器按 [keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts) 的先例，用最小 DOM-free 宿主替身做 Node 测试；只有薄的浏览器连接部分不进入 Node 程序。

## 不包含

- `AppPorts` 与生产入口的接线（09）；任务所有者对端口的使用（05）；原生 `beforeunload` 对话框的浏览器证据（10）。

## 关键文件与契约

- 计划新增：`src/app/mission/mission-ports.ts`；`src/platform/browser/browser-seed.ts`、`browser-timer.ts`、`leave-guard.ts`；`src/platform/files/browser-file-save.ts`；相邻 Node 测试。
- 参照：[browser-session-host.ts](../../../../../src/platform/browser/browser-session-host.ts) 的部分注册回滚；[keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts) 的 DOM-free 宿主模式；[platform 模块说明](../../../../engineering/modules/platform.md)。

## 写入范围

- `src/app/mission/mission-ports.ts`：计划新增的端口类型。
- `src/platform/browser/browser-seed*.ts`：种子适配器与测试。
- `src/platform/browser/browser-timer*.ts`：时钟与计时器适配器与测试。
- `src/platform/browser/leave-guard*.ts`：离页保护适配器与测试。
- `src/platform/files/browser-file-save*.ts`：文件保存适配器与测试。
- `src/platform/browser/seed*.ts`、`src/platform/browser/timer*.ts`、`src/platform/files/file-save*.ts`：DOM-free 核心与 Node 测试（边界规则不允许 browser- 前缀的文件进入 Node 程序，这类文件只保留薄连接，沿用 keyboard-source 的先例）。

## 验收标准

- [x] 端口类型 DOM-free，位于 `app/mission/`；平台实现无导入时副作用。
- [x] 种子返回 uint32，宿主异常原样抛出、不回退为固定值或宿主时间。
- [x] 计时器：句柄可为 0；取消幂等；取消后迟到的回调不执行；时钟非有限或倒退时报告错误。
- [x] 离页保护：登记一次只安装一个监听；撤销幂等；部分登记失败回滚；处理器只请求原生确认。
- [x] 文件保存：成功、失败与释放三条路径都回收对象 URL 与临时元素；失败带原因。
- [x] Node 程序与边界规则接受这些模块（只有 `browser-*` 连接部分不在 Node 程序中）；`pnpm check` 通过。

## 验证方法

- Node：`pnpm exec vitest run src/platform src/app/mission`，宿主替身记录监听、计时器、对象 URL 的取得与释放。
- 原生 `beforeunload` 对话框与下载由 10 在 Chrome 中验证；不适用原版对照。

## 完成证据

- **实现与分层：** [mission-ports.ts](../../../../../src/app/mission/mission-ports.ts) 只含类型：`SeedSource`（`() => number`，uint32）、`MonotonicClock`（`() => number`，有限且不减，否则抛出）、`OneShotTimer`（`schedule(callback, delayMs)` 返回非负安全整数句柄，0 合法，之后异步回调一次；`cancel(handle)` 幂等）、`LeaveGuard`（`() => Revoke`，`Revoke` 为幂等、失败抛出的 `() => undefined`）、`FileSave`（`save(name, text)` 与幂等 `dispose()`）及 `FileSaveResult`（`requested` 只表示浏览器接受了下载请求；`failed` 的原因为 `disposed`，或带 `error` 的 `failed`/`cleanup-failed`）。按 [keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts) 的先例拆为 DOM-free 核心与薄连接：
  - [seed.ts](../../../../../src/platform/browser/seed.ts) ↔ [browser-seed.ts](../../../../../src/platform/browser/browser-seed.ts)（`crypto`）：每次抽取一个新的单元素 `Uint32Array`，只读自己的数组，宿主异常不捕获。
  - [timer.ts](../../../../../src/platform/browser/timer.ts) ↔ [browser-timer.ts](../../../../../src/platform/browser/browser-timer.ts)（`performance.now`、`setTimeout`/`clearTimeout`）：时钟拒绝非有限值与低于已返回最大值的读数且不前移界限；计时器发放自己的句柄（从 0 起，不依赖宿主句柄形状），延迟限 0 至 2,147,483,647 ms（浏览器超出即立即触发），回调只在句柄仍存活时执行，取消先删除存活项再调用宿主，所以宿主取消抛错时错误原样抛出一次、回调也不再执行。
  - [leave-guard.ts](../../../../../src/platform/browser/leave-guard.ts)：注入 `beforeunload` 目标（浏览器为 `window`，由 09 在 `browser-ports.ts` 以 `createLeaveGuard(window)` 接线；草稿检查确认 `window` 在 DOM 类型下满足 `LeaveTarget`）。每次登记一个新监听，处理器只调用 `preventDefault()`；添加抛错时移除该监听（宿主可能已添加）后原样抛出，移除也失败则抛 `RollbackError`；撤销先使处理器失效再移除，移除失败抛出一次供锁存，之后为空操作。
  - [file-save.ts](../../../../../src/platform/files/file-save.ts) ↔ [browser-file-save.ts](../../../../../src/platform/files/browser-file-save.ts)（`URL.createObjectURL`/`revokeObjectURL`、加入 body 的隐藏 `<a download>`）：Blob（`application/octet-stream`）→ 对象 URL → 链接 → 点击，返回前按逆序移除链接、撤销 URL，各至多一次；所有者 `dispose()` 后拒绝保存且不取得任何资源，保存中途释放仍由该次保存回收。点击后立即撤销依据 URL 标准在发起下载时解析 blob URL；审阅者在 Chrome 155（macOS）以同一顺序下载 10 次均得到完整内容，原生下载仍由 10 验证。
- **写入范围：** 协调者按请求在 2a7c4af 加入 `seed*.ts`、`timer*.ts`、`file-save*.ts`：边界回归的 `isBrowserModule`（`/^browser-.*\.ts$/`）不允许任何 `browser-*` 文件（含 `browser-*.test.ts`）进入 Node 程序，原 glob 放不下需要 Node 测试的核心。
- **Node 测试**（`pnpm exec vitest run src/platform src/app/mission tools/engineering-boundaries.test.ts`：12 个文件、344 个测试通过）：
  - 导入无副作用：各核心在创建后、首次调用前不触及宿主（`draws nothing until asked`、`reads the host only when called`、`schedules nothing until asked`、`installs nothing until a registration`、`acquires nothing until a save`）；`browser-*` 只导出工厂。
  - 种子（[seed.test.ts](../../../../../src/platform/browser/seed.test.ts)）：0 与 4,294,967,295、重复值；每次一个新数组；忽略宿主返回的其他数组；宿主异常为同一对象；真实 Web Crypto 64 次均为 uint32。
  - 时钟与计时器（[timer.test.ts](../../../../../src/platform/browser/timer.test.ts)）：NaN、±Infinity、非数字报错；倒退相对最大读数报错，之后恢复；宿主异常原样；句柄 0 可取消；重复、已触发、未知与畸形句柄的取消不到达宿主；取消后宿主迟到回调不执行；取消失败抛出一次且回调不执行；登记失败原样抛出且不留存活项；回调异常交给宿主且句柄已失效。
  - 离页保护（[leave-guard.test.ts](../../../../../src/platform/browser/leave-guard.test.ts)）：每次登记恰一个监听；以 Proxy 事件确认处理器只读取并调用 `preventDefault`、不写 `returnValue`；多份登记互不影响；撤销恰移除一次；添加前/后抛错均回滚；回滚失败为含两个原因的 `RollbackError` 且监听失效；撤销失败抛出一次、监听失效。
  - 文件保存（[file-save.test.ts](../../../../../src/platform/files/file-save.test.ts)）：成功时日志为 create → attach → click → remove → revoke，Blob 内容、类型与 UTF-8 字节数正确；每次保存独立 URL；create/attach/click 各步失败只回收已取得项并返回 `failed` 与原错误，之后可重试；释放失败全部尝试并返回 `cleanup-failed`（成功请求后为 `AggregateError`，步骤失败后为 `RollbackError`）；`dispose` 幂等、之后返回 `disposed` 且不触及宿主；点击中途释放仍恰回收一次；结果均冻结。
- **工程检查：** `pnpm typecheck` 四个程序通过（DOM-free 核心与测试在 Node 程序中，`browser-*` 只在应用程序中）；`tools/engineering-boundaries.test.ts` 通过（含“Node 程序中没有 browser 模块”）；`pnpm check` 通过（212 个文件、6,467 个测试与构建）。机器负载约 66–78（并行会话）时前两次 `pnpm check` 各有 1 与 3 个无关的 CPU 密集用例超出 5 s（如 `image-payload.test.ts` 的 640×480 往返，单独运行 3.7 s 通过），负载回落后完整重跑通过。
- **rubber-duck：** 无问题（并做了上述 Chrome 下载实测）。**simplify：** 采纳计时器把回调存入存活项（取消即丢弃回调，宿主即使保留闭包也不再持有调用方作用域）；未采纳复用 Core 的 `thrownBy` 测试支持或 render 的 `attemptAll`（会让 platform 依赖 Core 测试支持与 render 层）、每个种子源复用一个数组（每次开始只抽一次，复用可能返回旧值）、新增 `browser-leave-guard.ts`（超出写入范围，09 直接传 `window`）、去掉 `FileSave.dispose`（契约要求所有者释放路径）。
- **文档影响：** 平台与 app 模块分册、工程约定由 15 统一更新（其写入范围含 `docs/engineering/**`）；本项不改文档，建议条目见 worker 报告。
