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

- [ ] AC-08 生产入口：恰好一个模块 Worker；`identify-source` 进度的 `readBytes` 大于 0；最终报 `source/unsupported-version@file:/MAIN/AISTUFF.NOB`。
- [ ] AC-08 测试入口：依次收到 `identified`、四个以转移交出的 `group-complete` 组与 `finished`，移交字节正确。
- [ ] AC-08 终止与监听：两种入口终态后 Worker 都已终止，监听为 0；耗时与读取量已记录为观测值。
- [ ] 探针契约测试在开发与生产项目都通过；浏览器错误收集无未预期项；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 聚焦运行：
  - `pnpm test:e2e import-worker.spec.ts --project=development`；
  - `pnpm test:e2e probe-contract.spec.ts --project=development --project=production`。
- 只用代码生成的合成数据，不读取 `local/`；报告与 trace 留在被忽略的目录。

## 完成证据
