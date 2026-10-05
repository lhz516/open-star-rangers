---
type: plan
status: active
phase: P2
task: "04"
subtask: "09"
updated: 2026-10-05
---

# 09 — 浏览器：Worker 探针、测试入口与正常路径

**契约来源：** [spec](../spec.md) 的 S-04、S-06，S-10 的浏览器部分；[验证策略](../spec.md#验证策略)中的浏览器验证；技术决定 12；AC-08。
**依赖：** 06, 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **测试 Worker 入口：** 新增 `src/workers/import-worker.test-support.ts`，与生产入口共用宿主，作业来自 07 的合成导入测试支持。
  - 场景由 Worker 的 `name` 选项选择（Worker 内为 `self.name`），不新增查询参数；
  - 本子任务提供 `synthetic` 场景：合成白名单识别后发送四个组；
  - [10](./10-browser-lifecycle-failures.md) 再加入其他场景。
- **探针：** 扩展 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)：
  - 包装 `Worker` 构造函数与 `terminate`，记录每个 Worker 的身份、类型、入口路径、是否终止及终止次数；
  - 把注册在 Worker 对象上的监听归入单独的分组；
  - 快照新增 `workers`。

  扩展 [probe-contract.spec.ts](../../../../../e2e/probe-contract.spec.ts)，证明包装后的 Worker 仍能正常收发消息、终止，并能载入模块。
- **浏览器测试：** 新增 `e2e/import-worker.spec.ts`，并在 [playwright.config.ts](../../../../../playwright.config.ts) 中让生产项目忽略它。
  - 页面内动态导入 `/src/…` 模块，用 07 的测试支持生成名称含 `MARKER` 的合成 `File`；
  - 经 06 的浏览器工厂与 04、05 的持有者运行。
- **生产入口：** 合成 CloneCD 不含覆盖文件时：
  - 恰好创建一个模块 Worker；
  - 收到 `readBytes` 大于 0 的 `identify-source` 进度；
  - 最终报 `source/unsupported-version@file:/MAIN/AISTUFF.NOB`。
- **测试入口：**
  - 合成镜像含 8 个覆盖文件，大小与生产白名单相同、内容由代码生成，外加不读取的填充文件；
  - 依次收到 `identified`、四个 `group-complete` 组与 `finished`；
  - `takeGroups` 返回的字节与合成值相等。
- **终止与观测：**
  - 两种入口在终态后，探针显示 Worker 已终止一次、其监听为 0；
  - 用 annotation 记录 Worker 中的识别耗时与读取量，只作观测值，不作阈值。
- **方法与文档：**
  - 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 准备合成数据与清理；
  - 在[工程约定](../../../../engineering/README.md#本地浏览器-runner)中记录：Worker 测试只在开发项目运行、探针的 Worker 记录与聚焦命令。

## 不包含

- 主页面响应、取消、重试、失败与释放（[10](./10-browser-lifecycle-failures.md)）。
- 生产预览、真实 StrictMode 与 Fast Refresh（P2-11）。

## 关键文件与契约

- **新增：** `src/workers/import-worker.test-support.ts`、`e2e/import-worker.spec.ts`（尚不存在）。
- **修改：** [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[probe-contract.spec.ts](../../../../../e2e/probe-contract.spec.ts)、[playwright.config.ts](../../../../../playwright.config.ts)、[工程约定](../../../../engineering/README.md)。
- **复用：**
  - 浏览器工厂：06 的 `browser-import-worker.ts`；
  - 合成导入测试支持：07 的 `synthetic-import.test-support.ts`；
  - 先例：[browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts) 在开发服务器中动态导入模块。

## 验收标准

- [x] AC-08 生产入口：恰好一个模块 Worker；`identify-source` 进度的 `readBytes` 大于 0；最终报 `source/unsupported-version@file:/MAIN/AISTUFF.NOB`。
- [x] AC-08 测试入口：依次收到 `identified`、四个以转移交出的 `group-complete` 组与 `finished`，移交字节正确。
- [x] AC-08 终止与监听：两种入口终态后 Worker 都已终止，监听为 0；耗时与读取量已记录为观测值。
- [x] 探针契约测试在开发与生产项目都通过；浏览器错误收集无未预期项；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 聚焦运行：
  - `pnpm test:e2e import-worker.spec.ts --project=development`；
  - `pnpm test:e2e probe-contract.spec.ts --project=development --project=production`。
- 只用代码生成的合成数据，不读取 `local/`；报告与 trace 留在被忽略的目录。

## 完成证据

浏览器环境：已安装的 Chrome（Playwright channel `chrome`，headless）、macOS、视口 1280×800、开发服务器 `http://127.0.0.1:4173`、生产预览 `http://127.0.0.1:4174`。每个用例使用隔离 context，只用页面内代码生成的合成数据。

| 验收项 | 设置与操作 | 预期 | 观察到的证据 | 结果 |
|---|---|---|---|---|
| AC-08 生产入口 | 页面内生成含一个 4096 字节合成文件、不含覆盖文件的 CloneCD，文件名含 `PRIVATE-MARKER`；经默认的 `browserImportWorkerFactory()` 与持有者运行 | 恰好一个模块 Worker；`identify-source` 进度 `readBytes` > 0；最终报 `source/unsupported-version@file:/MAIN/AISTUFF.NOB` | 探针：唯一的 Worker 入口为 `/src/workers/import-worker.ts`，由 Vite 的 Worker 转换生成，类型 `module`，发送 1 次，终止 1 次。进度单调不减，最后为 10,175 字节。快照依次为 `starting`、`running`…、`failed`，错误与预期一致 | passed |
| AC-08 测试入口 | 页面内生成 8 个覆盖文件，路径与大小逐项等于 `PRODUCTION_CATALOG`，内容由代码生成，外加 1 MiB 填充；工厂换成 `new Worker('/src/workers/import-worker.test-support.ts', { type: 'module', name: 'synthetic' })` | 依次收到 `identified`、四个以转移交出的 `group-complete` 组与 `finished`；移交字节正确 | 识别之后快照依次为 `running:0`–`running:4`，然后是 `finished:4`；版本为 `synthetic-browser`，四组都是 `group-complete` 且无诊断。Worker 内的作业在结束前确认发送过的 payload 视图都已失效（否则作业失败），`takeGroups` 的四组与按同一指纹重新生成的字节逐一相等。识别前的最后一次进度等于 `usage.sourceReadBytes`。探针：入口为测试入口，名称 `synthetic`，非 Vite 转换，发送 1 次，终止 1 次 | passed |
| AC-08 终止与观测 | 两种入口到达终态后读取探针 | Worker 已终止一次，监听为 0；耗时与读取量只作观测值 | 两个用例的 Worker 都只终止 1 次；注册在 Worker 上的 `message`、`messageerror`、`error` 都已移除。annotation 观测值：生产入口读取 10,175 字节，发送 `start` 后 3 ms 失败；测试入口读取 17,255,041 字节，发送 `start` 后 182 ms 完成识别 | passed |
| 探针契约 | 开发与生产项目中，用 Blob URL 创建模块 Worker（脚本使用 `import.meta`），收发一条消息并终止两次 | 包装后行为不变 | 回复为 `{ doubled: 42, module: 'string' }`；`instanceof` 与原型不变；记录为 `module`、`probe-worker`、发送 1 次、终止 2 次；Worker 监听全部移除 | passed |

- **实现：**
  - [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 与生产入口共用宿主，由 `self.name` 选择场景；未知场景在模块顶层抛错。`synthetic` 场景的作业做三件事：
    - 用 `syntheticOpen(productionSizedFiles(), 'synthetic-browser')` 识别；
    - 发送 `boundGroups`；
    - 结束前确认发送过的 payload 视图都已失效。
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 新增 `generatedContent`、`productionSizedFiles` 与 `syntheticOpen`。
  - [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)：
    - 用 Proxy 包装 `Worker` 构造函数，保持原型与 `instanceof`；
    - 包装 `postMessage` 与 `terminate`，只计次数；
    - Worker 上的监听归入 `worker` 分组；记录不持有 Worker 引用；`restore()` 全部还原。
  - [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 在页面内动态导入 `/src/…` 模块，经平台工厂与持有者运行；[playwright.config.ts](../../../../../playwright.config.ts) 的生产项目忽略它。
  - [probe-contract.spec.ts](../../../../../e2e/probe-contract.spec.ts) 新增 Worker 契约用例。
- **浏览器变异：** 以下 4 项变异都使本 spec 失败：
  - 宿主不转移 payload：Worker 内的检查使作业失败；
  - 探针不计终止；
  - 适配不移除监听；
  - 持有者不保留完整的组。
- **检查：**
  - 聚焦运行通过：`pnpm test:e2e import-worker.spec.ts --project=development`（2 项），以及 `probe-contract.spec.ts` 的开发与生产项目（8 项）。
  - 完整的 `pnpm test:e2e` 通过：3 个项目共 25 项，浏览器错误收集无未预期项。其间一次运行因 4173 端口仍被前一次运行占用而未能启动服务器，之后端口已无监听，重跑即通过；这是环境冲突，不是测试失败。
  - `pnpm check`（93 个文件、2669 项测试、构建）、`pnpm typecheck`、`pnpm lint`、`pnpm check:original`（passed）都通过。
- **Rubber-duck：**
  - **阻塞问题：** 8 个生产尺寸文件的检查是自证的，同一个辅助函数既生成光盘又生成白名单。已在浏览器测试中把生成的路径与大小直接与 `PRODUCTION_CATALOG` 比较。
  - **非阻塞，均已采纳：**
    - 探针记录 URL 是否经 Vite 的 Worker 转换，生产入口断言为是，测试入口断言为否；
    - 探针记录每个 Worker 的发送次数（不保留内容），供 10 证明从未发送 `start`；
    - 生产入口的观测改为从发送 `start` 起计时，与测试入口一致。
  - **审查确认：** Proxy 保持了 `new.target`、原型与 `instanceof`；Worker 内的失效检查足以证明转移；观测值只是 annotation；生产构建不含测试入口。
- **Simplify：**
  - **已采纳：** Worker 记录改为 `WeakMap` 加不含 Worker 引用的数组，终止的 Worker 不会被探针保留。
  - **未采纳：**
    - 预先算好的合成白名单：Worker 内哈希约 0.2 s，可接受；
    - 把 `runImport` 移到 e2e 支持：10 的取消与释放流程不同，到时再定；
    - 改掉 `load<Module>` 写法：与 `browser-replay.spec.ts` 的写法等价；
    - 精简 README：与同节其他条目的粒度一致。
- **清理：** 服务器与浏览器都由 Playwright runner 自行启动和关闭；报告与 trace 留在被忽略的 `playwright-report/`、`test-results/`；构建探针输出已删除。
- **文档影响：**
  - [工程约定](../../../../engineering/README.md#本地浏览器-runner)新增“导入 Worker 浏览器测试”：只在开发项目运行、探针的 Worker 记录与聚焦命令。
  - [源码结构](../../../../engineering/source-structure.md)的测试支持新增 `syntheticOpen`、`productionSizedFiles` 与测试 Worker 入口。
  - STATUS 不变。

