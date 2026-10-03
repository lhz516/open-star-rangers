---
type: plan
status: active
phase: P1
task: "06"
subtask: "09"
updated: 2026-10-02
---

# 09 — 完整 UI 指令闭环最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-08、AC-01 至 AC-15、技术决定 1–9 与“不包含”范围。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 10。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项核对 spec→goal 覆盖→实际实现→01–08 完成证据，并复核以下不变量：
  - 入队不显示成功；持续事实只来自 projection。
  - 结果按 owner+runId+commandId 关联，取消与 unconfirmed 区分清楚。
  - 采样为 10 Hz，关键边界即时发布；没有第二条循环或定时器。
  - store 不保存世界、RenderFrame 或事件历史。
- 运行最终 `pnpm check`；确认 P1-01 至 P1-05 的既有测试没有被删除、跳过或放宽，Core、Runtime、Session、平台宿主与 replay 格式未改。
- 复核前提：P1-05 的 08 已 completed 且证据完整。
- 复核 08 的浏览器证据齐全（实际 hidden、提交计数、StrictMode、卸载/再挂载、HMR、键盘、诊断），且临时编辑与探针已清理。
- 检查依赖与范围：只新增 Zustand（MIT），锁文件同步；无 Playwright/DOM runner、`.test.tsx` 发现范围、云/部署配置、存储或原版内容。
- 检查文档：[工程约定](../../../../engineering/README.md)、[源码结构指南](../../../../engineering/source-structure.md)与[阶段索引](../../tasks.md)与最终实现一致，链接与 front matter 有效。
- 按 [ADR-0014](../../../../decisions/ADR-0014-status-summary-only.md) 不更新 STATUS 退出项；完整证据留给 P1 阶段评审。
- 本项只做验证与文档对齐，不写功能代码。发现缺口时新增稳定新 ID 的修复项，插在本项前并加入依赖。

## 不包含

- 新功能、P1-07/08/09/10 交付或 P1 阶段退出判定。
- push、云资源或部署；无实现改动时不执行 simplify。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与 01–08 子任务文档。
- 01–07 交付的 `src/ui/`、`src/app/composition/`、[App.tsx](../../../../../src/app/App.tsx)，以及只读核验的 [Core](../../../../../src/core/synthetic/synthetic-scene.ts)、[Session](../../../../../src/app/session/synthetic-session.ts) 与 [replay](../../../../../src/core/synthetic/synthetic-replay.ts)。
- [package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml)。

## 验收标准

- [x] 全部 8 个 S 与 15 个 AC 都有当前有效的完整证据，不以文档 accepted 或部分子任务冒充完成。
- [x] `pnpm check` 通过，上游回归未被删除、跳过或放宽；受保护模块与格式未改。
- [x] 命令反馈、采样、运行/owner 隔离与清理不变量一致，无乐观成功或第二条循环。
- [x] 浏览器证据齐全，没有用模拟结果填补实际 hidden 或 HMR 缺口。
- [x] 依赖许可、锁文件、范围、隐私与文档检查通过，临时资源已清理。
- [x] STATUS 退出项未修改，联合回归与阶段判定留给 P1-10 和 P1 阶段评审。

## 验证方法

- `pnpm check`；逐项核对 S/AC 与 01–08 的测试、审阅和浏览器结果；检查文档链接、元数据及 tracker 与 subtask 文件一一对应。
- 只读审阅本 goal 的提交文件，与并行工作分开；浏览器证据使用 08 已取得的记录，缺失则本项不能通过。

## 完成证据

- 2026-10-02，在 `34ce452` 加上本项的文档修改之上核验。
- **前提：** P1-05 的 08 已 completed（`8fb36e8`），证据覆盖其 AC-01 至 AC-14。
- **工程：** `pnpm install --frozen-lockfile` 通过；`pnpm check` 通过（三个 TypeScript 程序、ESLint、34 个测试文件 / 668 项测试、Vite 生产构建）。
- **上游与受保护模块：** 自 `8fb36e8` 以来，`src/core`、`src/app/runtime`、`src/app/session`、`src/platform`、`src/original-data`、`src/main.tsx`、`tools`，以及 Vite/TS/ESLint 配置均无改动。没有修改或删除任何既有测试文件，全仓没有 `.skip`、`.only`、`.todo`。P1-03 的 replay 格式与版本不变。
- **覆盖：** spec 的 23 个 S/AC 都映射到验收框已全部勾选的子任务：
  - S-01 {01,07}、S-02 {02,03,04}、S-03 {03}、S-04 {03,04}、S-05 {02,04}、S-06 {07}、S-07 {02,04,06,07}、S-08 {01,05,06}
  - AC-01 {01,02,06,07,08}、AC-02 {02}、AC-03 {02,03,04,08}、AC-04 {03,08}、AC-05 {03,08}、AC-06 {03}、AC-07 {04,05}、AC-08 {04,10}、AC-09 {03,04,06,08}、AC-10 {02,04,08}、AC-11 {01,07,08}、AC-12 {02,06,08}、AC-13 {07,08}、AC-14 {05}、AC-15 {01}
  - AC-08 已经 10 更正为真实 Runtime 的两条互斥故障路径（窄范围契约放宽，已提请用户确认），04 的真实 Core 注入测试与 01 的 store 原子转换测试覆盖更正后的全部要求。
- **不变量：**
  - 入队不显示成功：pending 只在拿到 commandId 后加入；accepted/rejected 只来自 Core 域事件。
  - 持续事实只来自投影：marker 始终读帧末投影。
  - 结果按 owner + runId + commandId 关联：桥接单会话生命周期、binding 注销、settle 只结算仍在 pending 中的命令。
  - 取消（Session 原 reason）与 unconfirmed（session-failed）分开表示。
  - 10 Hz 采样只在现有 onFrame 中进行，关键边界即时发布；新增代码没有 rAF、interval 或 timeout。
  - store 只保存 status、投影、pending、至多 10 项结果与两类错误，不保存世界、RenderFrame 或事件历史。
- **浏览器：** 08 已在真实 Chromium 154 取得 AC-01、03、04、05、09、10、11、12、13 的证据：
  - 实际 hidden→visible 与显式恢复，走已验证的 CDP 路线。
  - Profiler 提交计数。
  - StrictMode、面板与桥接 HMR、卸载/再挂载，以及旧回调重放。
  - 键盘操作与注入失败的诊断。
  - 没有用模拟结果填补 hidden 或 HMR；临时编辑与探针都已还原，自有浏览器、Vite 与临时文件都已清理。
- **依赖与范围：**
  - 依赖：只新增 zustand ^5.0.15（MIT，React 为可选 peer），锁文件只有其条目。
  - 未新增 Playwright、DOM 测试框架、`.test.tsx` 发现范围、云或部署配置、存储或原版内容；仓库没有二进制或 `local/` 文件。
  - 边界：纯模块没有 React/Zustand 导入；`src/ui` 不导入 app 装配；面板只取得只读 reader 与 dispatch。
- **文档：**
  - 本项修正[阶段索引](../../tasks.md)§2 的过期表述：原文仍称 UI 桥接尚未完成，现改为“UI projection 桥接与 React 指令闭环已由 P1-06 交付，渲染器尚未完成”。
  - [工程约定](../../../../engineering/README.md)的 UI 一节与浏览器工具约束、[源码结构指南](../../../../engineering/source-structure.md)与最终实现一致。
  - 16 篇相关文档的 290 个本地链接与锚点、空白与 updated 日期检查通过；`node tools/task-state.ts p1/06` 无结构或覆盖问题。
- **STATUS：** 按 [ADR-0014](../../../../decisions/ADR-0014-status-summary-only.md) 只更新“下一步”：P1-05、P1-06 已完成，P1-07 与 P1-09 可分别规划，之后由 P1-08 装配菜单。没有新增或勾选退出项；P1 联合回归（P1-10）与阶段退出判定留给后续任务和 P1 阶段评审。
- **rubber-duck：** 指出两项阻断：
  - AC-08 字面要求一次真实故障同时产生两类结果，而真实 Runtime 不可能做到：按执行规则新增修复项 10，如实更正，不在本项内改契约。
  - 阶段索引仍称 UI 桥接未完成：已在本项修正。
  - 其余（无乐观成功、投影为准、身份关联、取消与 unconfirmed 区分、采样无额外循环、store 内容、依赖方向、浏览器证据）均无问题。
  - 两项都处理后重跑了检查，未重复同一审查。本项只做验证与文档，不执行 simplify。
