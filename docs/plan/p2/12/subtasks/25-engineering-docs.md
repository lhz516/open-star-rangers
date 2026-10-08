---
type: plan
status: active
phase: P2
task: "12"
subtask: "25"
updated: 2026-10-08
---

# 25 — 工程约定：联合用例、失败矩阵与网络审计

**契约来源：** [spec](../spec.md) 的 S-13、AC-23 的工程约定部分。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在[工程约定](../../../../engineering/README.md)的“测试”与“本地浏览器 runner”部分记录：
  - 01 的项目归属命名约定（`*.development.spec.ts`、`*.production.spec.ts`）与其回归；
  - 联合闭环用例（06、07）与失败矩阵用例（08–10）的运行方式、项目归属与所需时间量级；
  - 网络审计（02）的采集机制、覆盖的通道、控制样本、生产允许集与开发规则、测试专用请求的声明方式，以及能力边界（结论限于候选与执行路径，不证明所有隐蔽编码不外发）；修正现有两处“实际请求审计归 P2-12”的说明，指向新内容；
  - 响应探针（03）的窗口与 50 ms 门槛只是本机验收，不是 P5 的性能结论；
  - 资源平衡辅助（04）与金丝雀（05）的用法；新增测试支持不进入生产模块图。
- 更新 `updated:`。

## 不包含

- 本地导入指南（20、22）；源码结构的呈现约定（22）；原版文档（19、24）。

## 关键文件与契约

- [工程约定](../../../../engineering/README.md)的“测试”“本地浏览器 runner”与现有的网络静态边界说明；01–10 的实现与完成证据。

## 写入范围

- `docs/engineering/README.md`：联合用例、失败矩阵、网络审计与命名约定。
- `docs/engineering/source-structure.md`：按需在测试 Worker 入口一段链接 05 新增的场景注册表与 P2-12 场景。

## 验收标准

- [x] AC-23（工程约定）：命名约定、联合与失败用例、网络审计的运行方式与能力边界、响应探针与资源平衡辅助都已记录，与实现一致。
- [x] 原有“实际请求审计归 P2-12”的说明已指向新内容。
- [x] `updated:`、相对链接与锚点有效。

## 验证方法

- 文档链接与元数据检查；与 01–10 的实现逐项核对。

## 完成证据

2026-10-08，仅文档改动（[工程约定](../../../../engineering/README.md)与[源码结构](../../../../engineering/source-structure.md)）。

- **记录内容（均按代码核对，不重复各子任务的证据）：**
  - [本地浏览器 runner](../../../../engineering/README.md#本地浏览器-runner)：新增“按文件名归属”一条（`*.development.spec.ts`、`*.production.spec.ts`，不进入 development-headed，旧用例仍用显式列表）；配置回归补上按文件名的项目归属断言（01）。
  - 生产预览回退：404 与 HTML 回退在审计下运行，以 `audit.declare` 声明并预期 404/200（07）。P2-11 测试入口一条补 `hold`、`scenarioEntryProfile`（原文写作 `scenarioProfile`，已按代码修正）、提交窗口钩子与 `TEST_ENTRY_QUERY` 的维护规则（05、06）。
  - 新增四节：
    - [P2-12 联合与失败用例](../../../../engineering/README.md#p2-12-联合与失败用例)：五个用例的项目、内容、本机耗时与聚焦命令；05 的场景注册表、`FAILURE_MATRIX`、时序场景与金丝雀；08–10 的前置、只读事务推迟提交、真实配额、`installIdbProbe`、`toggle` 监听、原生浏览器审计、resume 闸门与 `fast-refresh.ts`。
    - [网络审计](../../../../engineering/README.md#网络审计)：夹具接口、两个采集视图、`delivery` 与 `browser` 发起者、Worker 暂停与覆盖规则、生产允许集与开发规则（含声明请求的例外）、金丝雀编码、使用要点（`ready()`、页面路由与 `serve`、声明 `expect`、`withPersistentProfile` 不能附加）、控制样本与能力边界（02）。
    - [响应探针](../../../../engineering/README.md#响应探针)：安装、窗口、`adopt`、记录、`InputOrder`，以及 50 ms 门槛只是本机验收、不是 P5 结论（03）。
    - [资源平衡](../../../../engineering/README.md#资源平衡)：探针新字段、`close()` 结局、`ResourceBalance` 用法与 `audio: false`、React DOM 元素监听，以及 Playwright 主世界监听与 `settleTooling`（04、06、07、09）。
  - 两处“实际请求审计归 P2-12”（lint 的 Worker 网络规则、P2-11 AC-22 的静态网络回归）改为链接[网络审计](../../../../engineering/README.md#网络审计)。
  - 负载相关的已知现象：Vitest 一条记录 `engineering-boundaries.test.ts` 在高负载全量运行中超出 5 s；音频播放的真实隐藏用例一条记录高负载下的偶发失败。两处都要求低负载复跑确认。
  - [源码结构](../../../../engineering/source-structure.md)的测试 Worker 入口一段改为链接 [import-scenarios.test-support.ts](../../../../../src/workers/import-scenarios.test-support.ts) 注册表（注明 `top-level-throw` 由入口自身处理），并链接新的联合与失败用例一节。
- **核对：**
  - `pnpm exec playwright test --list`（端口 5175/5176）：五个 P2-12 用例文件只在各自项目，failure-input-content 20、failure-worker-cancel 14、failure-storage-lifecycle 12、两个联合文件各 2 个用例；控制样本文件在两个项目。
  - `pnpm build` 后 `OSR_E2E_DEV_PORT=5175 OSR_E2E_PREVIEW_PORT=5176 pnpm exec playwright test e2e/joint-pipeline`：4 passed（2.4 min，含服务器启动；生产文件约 1.2 min，所有窗口 0 长任务），用于填写生产联合用例的耗时；其余耗时取自 06、08–10 的证据。
  - 链接与锚点：会话内的检查脚本按 GitHub 规则生成标题锚点，核对两份文档的 529 个相对链接与锚点均有效。脚本能检出故意写错的锚点。另核对仓库 `docs/` 中链接到工程约定锚点的 1,077 个相对链接，均有效。两份文档的 `updated:` 为 2026-10-08。
- **Rubber-duck：** 4 项均采纳：生产允许集注明声明请求的例外；`TEST_ENTRY_QUERY` 只在新键或超出现有模式的取值时需要更新；测试 Worker 入口注明 `top-level-throw`；生产同文档用例改述为“一次缓存恢复后 3 次查看与试听往返”。
- **文档影响：** 本项本身即文档改动。`docs/original/`、unknowns、本地导入指南与源码结构的呈现约定不受影响；STATUS 与阶段索引无需改动。