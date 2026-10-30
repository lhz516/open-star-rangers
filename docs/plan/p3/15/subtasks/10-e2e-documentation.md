---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "10"
updated: "2026-10-30"
---

# 10 — 联合验证回归的工程文档

**契约来源：** [spec](../spec.md) 的 S-09、[验证策略](../spec.md#验证策略)；AC-10 的文档部分。
**依赖：** 01、02、03、04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [工程约定](../../../../../docs/engineering/README.md) 的 Playwright 回归说明中增加 P3-15 一条：四个新用例文件的项目归属、所用变体包与观察来源、真实隐藏对未锁屏桌面的要求、聚焦运行命令，以及“只声明同一运行时 replay 一致、警告用例不代替人耳判定”的限度；链接本任务 subtask 证据。
- 更新文档的 `updated` 日期。

## 不包含

- 修改用例或产品代码；状态与阶段摘要（只由协调者维护）。

## 关键文件与契约

- [docs/engineering/README.md](../../../../../docs/engineering/README.md)。

## 写入范围

- `docs/engineering/README.md`：P3-15 回归说明。

## 验收标准

- [x] 说明与 01–04 的实际用例、命令和限制一致；相对链接与元数据检查通过。

## 验证方法

- 文档审阅；链接检查；命令与 `playwright.config.ts` 的项目匹配规则核对。

## 完成证据

- **2026-10-30（worker exec/p3-15-10）：**
  - **改动：** [工程约定](../../../../engineering/README.md#本地浏览器-runner)的本地浏览器 runner 中，在 P3-14 条目之后新增 “P3-15 联合闭环、生命周期与警告回归” 一条，链接 01–04 的完成证据；`updated` 改为 2026-10-30。内容包括：
    - 四个用例文件的项目归属；
    - `jointLoopPackage('success' | 'failure')` 的构造与开发/生产两种预置（`seedTestEntryPackage` 与 `seedProductionCache`），`replayJointLoop` 的 `{ match: true }` 重放；
    - joint-lifecycle.ts 与 joint-warning.ts 的支持函数；
    - 各用例的观察来源：开发事件日志与录制，对比生产只读属性、只读 UI store 与无开发诊断的断言；
    - 真实隐藏对 headed 本机 Chrome 与未锁屏桌面的要求，不以模拟可见性替代；
    - 限度：只声明同一运行时的重放一致；警告用例不代替 P3-14 V-06 的人耳判定；只用合成内容；
    - 两条聚焦运行命令。
  - **与代码核对：** 逐项对照四个 spec、`e2e/support/{joint-loop,joint-lifecycle,joint-warning,native-lifecycle,ai-wingman,production-cache}.ts` 与 `package.json` 的 `test:e2e`（先构建）。
    - `playwright.config.ts` 中，development 项目忽略 `*.production.spec.ts`，production 项目忽略 `*.development.spec.ts`，development-headed 只匹配 `native-lifecycle.spec.ts`，所以两条命令选中的文件与项目一致。
    - 原生隐藏一例属于 development 项目，自行以 `nativeBrowser` 启动 headed 浏览器。
    - 四个文件的超时均为 600 s。
  - **检查：**
    - 两个改动文件的相对链接、锚点与 front matter `updated` 检查通过：`local/research/p3-15/doc-check/links.py`，0 个问题。用一个不存在的锚点做负对照，确认检查会报错。
    - `git diff --check` 通过。
    - 纯文档改动，不需要构建。
  - **rubber-duck（code-review 子代理，对照代码）：** 指出三处措辞错误，均已采纳：
    1. 警告包是独立变体，只替换任务、机型信息与 AI 程序，不是 joint-loop 包加 AI 程序。
    2. 暂停/继续与地图中 tick 继续只属于成功一例，失败一例核对救援保持。
    3. 四个被替换的 payload 都经 `withPayloads` 重新标识。
  - **文档影响：** 只需更新工程约定这一处；不涉及原版事实、ADR 与 STATUS。
