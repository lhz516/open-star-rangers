---
type: plan
status: active
phase: P2
task: "11"
subtask: "23"
updated: 2026-10-06
---

# 23 — 本地真实数据的导入与持有核对（Node）

**契约来源：** [spec](../spec.md) 的 AC-20（识别、四组完整、全包 `complete`、任务可载入 Core、全包校验耗时），以及验证策略的“实机与原版对照”。场景构建归 [17](./17-local-real-data-check.md)。
**依赖：** 03, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本 `local/research/p2-11/`，在开发者机器的 Node 中运行，不打开浏览器：
  - 用与 Worker 相同的作业模块（生产 `createImportJob` 与宿主），经作业持有者处理 `local/StarRang/cd/` 的基准镜像；
  - 把结果交给应用的资源持有者，缓存用伪造实现，预期包配置为生产配置；
  - 断言：识别出版本，四组都完整，全包 `complete`，伪造缓存收到一次以包预算的提交，任务可载入 Core；
  - 记录作业与全包校验的耗时。
- 证据只记状态、计数与耗时，不含原版画面、文字、声音或字节。
- 脚本可以引用 `src/` 的生产模块与测试支持，但输出只留在 `local/`。

## 不包含

- 查看渲染的场景构建（17）；浏览器中的真实数据导入（19，由用户完成）；原版保真对照（P2-12）。

## 关键文件与契约

- 计划新增被忽略的 `local/research/p2-11/` 脚本。
- 复用：[import-job.ts](../../../../../src/workers/import-job.ts) 的 `createImportJob`、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)、02–04 的持有者与诊断、01 的生产包配置；参照 P2-06 的本地基准脚本做法。

## 验收标准

- [x] AC-20（导入部分）：识别出版本，四组完整，全包 `complete`，以包预算提交，任务可载入 Core；记录了作业与全包校验的耗时。
- [x] 证据只含状态、计数与耗时；仓库中没有本地输出。

## 验证方法

- 在本机运行脚本，记录命令、退出码与结果摘要。
- 不修改 `src/` 时不需要 simplify；若为通过核对修改了实现，记录并修正。按 execute-goal 做 rubber-duck 审阅脚本与证据。

## 完成证据

- **脚本：** 被忽略的 `local/research/p2-11/import-check.ts`（同目录的 `tsconfig.json` 供类型检查），输出 `import-check.json` 与 `.log` 也只在 `local/`：
  - **作业：** 与 [import-worker.ts](../../../../../src/workers/import-worker.ts) 相同，以 `runImportHost(…, createImportJob())` 作为 Worker 一端，经 MessageChannel 连接 `connectImportWorker` 与 `createImportJobOwner`，处理 `local/StarRang/cd/` 的 CloneCD 基准镜像（四个文件）。
  - **持有：** 用 `createResourceHolder` 与 `PRODUCTION_PACKAGE`，以 `acceptImport` 接收作业，与导入页面的交接相同。
  - **缓存：** 伪造实现记录每次调用。提交时先运行真实缓存写入前的纯检查（[resource-cache-records.ts](../../../../../src/platform/storage/resource-cache-records.ts) 的输入读取、组顺序、存储需求与以所给预算计费），再列出已提交的条目。不涉及 IndexedDB。
  - **断言：**
    - 作业 `finished`；版本 ID 等于生产目录；来源指纹等于生产配置，且等于生产目录的指纹；
    - 四组都 `complete`，全包 `complete`，`ConverterVersion` 与来源都等于生产配置；
    - 恰好一次提交，所用预算就是 `PRODUCTION_PACKAGE.limits`，并通过写入前检查；资源包状态为 `saved`（`via: commit`）；
    - 任务载入 Core（`loaded`），解析出至少一个模型且都在已持有的模型组中；空间检查以包预算的 `payloadBytes` 询问；没有报告错误。
- **运行：** `node local/research/p2-11/import-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,cue,img,sub}`（Node v22.22.0，本机）。修正后连续 4 次，退出码均为 0，结果 `PASS`。
  - **组与资源：** logic 3、models 44、cockpit-hud-map 90、audio 18，共 155 个 Asset。
  - **提交：** 4 组 155 个 payload，payload 1,493,013 字节（包预算 11,943,936），元数据估计 187,138 字节。缓存调用为列表 1 次、提交 1 次、空间检查 1 次，空间检查结果 `unknown`（伪造实现）。
  - **任务：** 9 个声明、3 个编组、3 个出生区域、5 个僚机选项、19 个名字；阵营为玩家 1、友方 2、敌方 4、无 2。7 个声明与 5 个僚机选项有模型，共解析出 5 个模型，都在模型组中。
  - **耗时（4 次）：**
    - 作业从 `start` 到结束 269–360 ms，不含读入文件与真实 Worker 的启动；
    - `acceptImport` 的同步部分 33–38 ms，含全包校验、任务载入 Core 与伪造缓存的写入前检查，不含提交完成后的回调与 IndexedDB；
    - 单独的全包校验（`validatePackage`，5 次的中位数）12.4–13.9 ms。
  - **负向：** 只给 `.cue` 时，作业以 `failed` 结束，脚本立即输出 `FAIL` 并以退出码 1 结束，不会挂起。
- **未修改 `src/`：** 不需要 simplify。仓库中没有本地输出，`git status` 只显示本文件与 goal。场景构建的核对归 [17](./17-local-real-data-check.md)。
- **Rubber-duck：** 2 个阻塞问题与 3 个非阻塞问题，均已修正并重跑：
  - **阻塞：**
    - 版本只记录未断言（来源指纹不含版本 ID）：改为断言等于生产目录的版本 ID；
    - 快照有资源包而 `current()` 为 null 时会跳过后续断言：两者分别断言。
  - **非阻塞：**
    - 模型全部存在的检查在没有模型时空真：要求至少一个；
    - `start` 被拒绝时会挂起：先订阅，被拒绝时立即结束；
    - `acceptMs` 易被误读：改名为 `acceptSyncMs`，并注明所含内容。
  - **保留：** 预算以对象同一性比较，比按值比较更严格；持有者按约定直接传入配置的预算。
