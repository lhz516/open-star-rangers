---
type: plan
status: active
phase: P1
task: "08"
subtask: "01"
updated: 2026-10-02
---

# 01 — 页面流转纯逻辑

**契约来源：** [spec](../spec.md) 的 S-01、AC-02、AC-14，“计划新增契约”中的页面流转状态、输入与转换规则，技术决定 1、6、8。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 DOM-free 页面流转模块：冻结快照 `{screen:'menu'|'import'|'demo', demoVisit, focusTarget:'demo-entry'|'import-entry'|'menu-heading'|null, cleanupFailure:Readonly<{cause:unknown}>|null}`，初始值 `{screen:'menu', demoVisit:0, focusTarget:null, cleanupFailure:null}`。
- 输入 `{type:'open-demo'|'open-import'|'return-to-menu'}` 与 `{type:'demo-release-failed', cause:unknown}`；纯转换函数对适用输入返回新冻结快照，对不适用组合原样返回同一对象，不执行副作用。
- 转换规则严格按 spec：锁存时 `open-demo` 不适用；进入 demo/import 时 `focusTarget=null`；demo 返回菜单的焦点为 demo-entry，已锁存时为 menu-heading；import 返回为 import-entry；首个 `demo-release-failed` 保留原始 `cause`（外壳冻结、不冻结异常），当前为 menu 时焦点改为 menu-heading；重复失败不覆盖首因、不清锁存、不抢夺后续正常导航的焦点。
- `demoVisit` 已为 `Number.MAX_SAFE_INTEGER` 时 `open-demo` 抛 `RangeError`，不生成非法状态。
- 邻接 Node 参数化测试，覆盖每个适用与不适用组合、焦点目标、`demoVisit` 递增与耗尽、Error/非 Error/null 作为 cause、冻结性与锁存后的 import 往返。

## 不包含

- React 外壳、焦点的 DOM 应用与画面组件（04）。
- owner 创建、释放与失败的产生和交付（02、03）。
- URL、history、存储或任何持久化。

## 关键文件与契约

- 计划新增 `src/app/flow/app-flow.ts`：状态与输入类型、初始状态常量、转换函数。尚不存在。
- 计划新增 `src/app/flow/app-flow.test.ts`：Node 参数化测试，使模块进入 `tsconfig.node.json` 程序。尚不存在。
- 模块不得导入 React、DOM、`ui/`、`render/` 或 `platform/`。

## 验收标准

- [ ] AC-02 的全部转换、不适用组合、焦点目标、`demoVisit` 递增与 `RangeError`、首因锁存、重复失败与冻结性断言通过。
- [ ] 模块无 DOM 引用，由测试传递导入并通过 Node 类型检查（AC-14 的本模块部分）。
- [ ] `pnpm exec vitest run src/app/flow` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Vitest 参数化表：每个 `(screen, cleanupFailure 是否为空, 输入)` 组合给出预期新状态或同一对象（`toBe`）。
- 失败记录用 `new Error`、字符串、`null` 三种 cause 各测一次；断言 `Object.isFrozen` 作用于快照与失败记录外壳，cause 不被冻结。
- 不适用浏览器测试。

## 完成证据
