---
type: plan
status: active
phase: P3
task: "05"
subtask: "14"
updated: 2026-10-10
---

# 14 — 平台全屏、Keyboard Lock 与平台族

**契约来源：** [spec](../spec.md) 的[全屏与 Keyboard Lock](../spec.md#全屏与-keyboard-lock)、[Alt+F4 风险提示](../spec.md#altf4-风险提示)（平台族判定）、[数据模型与契约](../spec.md#数据模型与契约)的“全屏与 Keyboard Lock 端口”“能力申请状态与错误”“平台族”行；S-12、S-13 的平台部分；AC-14、AC-15 的平台部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 DOM-free 的 `src/platform/browser/fullscreen.ts`：分别报告 Fullscreen 与 Keyboard Lock 是否支持；在调用方的用户手势中同步发起文档级全屏请求（不等待异步操作后再请求）；锁定给定的非空 `code` 列表（禁止无参数“锁全部键”，拒绝 Escape、Tab、Meta 与 F12）；解除锁定；只退出由本端口进入且仍拥有的 API 全屏，不关闭用户自行切换的浏览器全屏；以 `fullscreenchange`/`fullscreenerror` 与实际全屏元素报告状态。Promise 完成不等于真实全屏，状态以实际元素为准。
- 失败以稳定原因类别报告；注册原子、可撤销，撤销后旧回调不投递。
- 计划新增 `src/platform/browser/platform-family.ts`：由宿主读取的 `userAgentData.platform`（优先）或 `navigator.platform` 判定 `macos`、`windows`、`linux` 或 `unknown`，纯函数可在 Node 测试。
- 计划新增浏览器连接 `browser-fullscreen.ts`、`browser-platform-family.ts`。
- Node 测试：支持判定组合、请求成功/失败/部分成功（全屏成功而锁键失败）、锁键清单校验、只退出自有全屏、撤销后静默、平台字符串判定表。

## 不包含

- 何时请求与锁定、申请代次与关闭屏障（21）；开始按钮与全屏按钮（23、25）；Alt+F4 提示的显示决定（23）。

## 关键文件与契约

- 参照 [leave-guard.ts](../../../../../src/platform/browser/leave-guard.ts) 与 [timer.ts](../../../../../src/platform/browser/timer.ts) 的“DOM-free 核心 + 薄浏览器连接”拆分。
- 计划新增：`fullscreen.ts`、`fullscreen.test.ts`、`browser-fullscreen.ts`、`platform-family.ts`、`platform-family.test.ts`、`browser-platform-family.ts`。

## 写入范围

- `src/platform/browser/fullscreen.ts`、`src/platform/browser/fullscreen.test.ts`、`src/platform/browser/browser-fullscreen.ts`
- `src/platform/browser/platform-family.ts`、`src/platform/browser/platform-family.test.ts`、`src/platform/browser/browser-platform-family.ts`

## 验收标准

- [x] 全屏与锁键的支持、请求、状态与失败分别报告；锁键清单非空且排除 Escape、Tab、Meta、F12；只退出自有全屏。
- [x] 平台族判定覆盖 macOS、Windows、Linux 与无法判定。
- [x] Node 测试通过（`pnpm exec vitest run src/platform/browser`）；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 假宿主测试；真实 Chrome 的全屏与锁键由 28、30 验证。

## 完成证据

- **全屏与锁键端口：** [fullscreen.ts](../../../../../src/platform/browser/fullscreen.ts) 的 `createFullscreenPort(host)` 只依赖注入的宿主（DOM-free，经 Node 程序检查），提供：
  - `support()` 分别报告 `fullscreen` 与 `keyboardLock`；`read()` 报告 `{ fullscreen, owned, keyboardLocked }`，`fullscreen` 只看实际全屏元素是否为文档根元素，promise 完成不算。
  - `connect(sink)` 恰一次，原子注册 `fullscreenchange`/`fullscreenerror`（部分失败先回滚，回滚失败为 `RollbackError`）；释放先使回调失效再逐项移除并聚合错误。释放后不再投递信号，`requestFullscreen`/`lockKeys` 为 `disposed` 且不调用宿主；`exitFullscreen`/`unlockKeys` 仍可执行，此前的申请仍会落定，供 21 撤销迟到的成功。
  - `requestFullscreen()` 在调用内同步调用宿主（不先等待任何异步操作），以落定后的实际元素判定：`fullscreen`，或失败类别 `unsupported`、`rejected`、`not-entered`（promise 成功但实际不是全屏）、`failed`（宿主抛错）、`disposed`；结果不 reject、不带宿主错误。根元素已全屏时不再请求，也不改变归属。
  - 归属只在本端口自己的申请成功且根元素实际全屏时取得；任何时候观察到根元素不再是全屏元素即失去。`exitFullscreen()` 只对仍拥有的全屏调用宿主（否则为 `not-owned`），并发退出共用同一个进行中的 promise，只有落定后实际已退出才报 `exited`，否则为 `not-exited`/`rejected`/`failed`。浏览器连接只请求/退出 API 全屏，不触及用户自行切换的浏览器全屏（该状态没有全屏元素，因而不被拥有）。
  - `lockKeys(codes)` 先同步校验：空列表、无参数、空字符串及 `Escape`、`Tab`、`MetaLeft`、`MetaRight`、`OSLeft`、`OSRight`（旧称）、`F12` 抛 `RangeError` 且不调用宿主；传给宿主冻结副本。失败按宿主错误 `name` 分类：`denied`（NotAllowedError）、`unavailable`（InvalidStateError）、`invalid-codes`（InvalidAccessError）、`superseded`（AbortError，或成功后已被更晚的锁定/解除取代）、`failed`、`unsupported`、`disposed`。`unlockKeys()` 只在本端口有未结或生效的锁定时调用宿主；宿主抛错原样抛出并保留锁定记录。
- **浏览器连接：** [browser-fullscreen.ts](../../../../../src/platform/browser/browser-fullscreen.ts) 的 `createBrowserFullscreen()` 以 `document.documentElement` 为目标（文档级，菜单替换游戏子元素时项目状态与退出控件仍在），在 `document` 上监听，Keyboard Lock 经 `navigator.keyboard`（DOM 库没有该类型，本地声明结构）。只由应用程序检查，不进入 Node 程序。
- **平台族：** [platform-family.ts](../../../../../src/platform/browser/platform-family.ts) 的纯函数 `classifyPlatformFamily({ userAgentDataPlatform, platform })` 优先取非空的 `userAgentData.platform`，否则取 `navigator.platform`：`mac`、`windows`、`linux`，其余与无报告为 `other`。取值按 spec [数据模型与契约](../spec.md#数据模型与契约)“平台族”行（`'mac'`、`'windows'`、`'linux'`、`'other'`），而非本文件工作范围的 `macos`/`unknown` 写法；`other` 即“无法判定”。[browser-platform-family.ts](../../../../../src/platform/browser/browser-platform-family.ts) 的 `readBrowserPlatformFamily()` 读取二者，不缓存、不持久化。
- **测试：** [fullscreen.test.ts](../../../../../src/platform/browser/fullscreen.test.ts)（受控假宿主，逐个落定 promise 并按浏览器次序发事件）覆盖支持的四种组合与不支持时不调用宿主、同步请求、实际元素判定（含事件先于 promise 及 promise 成功但未全屏）、拒绝/宿主抛错只给类别、他人在申请未结时进入全屏且本申请随后失败时不取得归属、全屏成功而锁键失败（`denied`，状态为全屏、未锁键）、只退出自有全屏（用户退出后他人再进入、未经事件观察的退出）、退出未确认与并发退出、退出未结时再申请、锁键清单校验（每个禁用 code、空列表、无参数、空字符串）、冻结副本、只解除自己的锁、被取代、错误名分类表（含不可读的 name）、解除抛错保留记录、注册原子与回滚、释放后静默（即使移除抛错）与迟到落定。[platform-family.test.ts](../../../../../src/platform/browser/platform-family.test.ts) 为 23 行判定表（macOS/Windows/Linux/Chrome OS/Android/Unknown、`navigator.platform` 各值、空/空白/非字符串回退、无报告）。
- **检查：** `pnpm exec vitest run src/platform/browser` 通过（5 个文件 86 项）；`pnpm typecheck`、`pnpm exec eslint src/platform/browser` 与 `tools/engineering-boundaries.test.ts`（95 项）通过；`pnpm check` 通过（228 个文件 6902 项测试，构建成功，本次无超时）。
- **Rubber-duck：** 一次审阅提出三项，均已处理：(1) 申请未结时他人的 `fullscreenchange` 曾可使本端口取得归属，申请随后失败也不撤销——改为只由本端口自己的申请成功取得归属，并加回归测试；(2) 根元素已全屏时曾先检查支持而报 `unsupported`——调换顺序并测试；(3) 宿主错误的 `name` 读取可能抛错——改为受保护读取并测试，三个探测函数在宿主接口中注明为不抛错的读取。
- **Simplify：** 四个角度审阅后采用：错误名分类改为与 [resource-cache-contract.ts](../../../../../src/platform/storage/resource-cache-contract.ts) 的 `classifyHostError` 同形的 `switch` 与受保护读取；三个失败结果工厂合并为一个泛型 `failed`；浏览器连接在 Keyboard Lock 缺失时解除也抛错而不是静默成功。未采用：抽取 `keyboard-source.ts` 的 `drain`、`resource-cache-contract.ts` 的 `hostErrorName` 与测试的 deferred 共享（均为其他模块的私有实现，超出写入范围）；删除无参数锁键测试（它覆盖非数组的独立路径）；把锁键代次移交 21、全屏退出时把 `keyboardLocked` 报为假（Keyboard Lock 按序执行锁定与解除，解除也撤销此前迟到成功的锁定；`keyboardLocked` 如实报告申请状态，文档注明浏览器只在全屏时应用）。
- **文档影响：** [platform 模块说明](../../../../engineering/modules/platform.md)需增加全屏与 Keyboard Lock 端口、平台族一节，[源码结构指南](../../../../engineering/source-structure.md)的 `platform/browser/` 目录树需列出四个新文件；二者在 32 的写入范围内，已在 worker 报告中交由协调者转 32，本项未改。其他文档仍准确。
