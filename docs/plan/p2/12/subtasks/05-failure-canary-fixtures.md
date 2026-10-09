---
type: plan
status: active
phase: P2
task: "12"
subtask: "05"
updated: 2026-10-08
---

# 05 — 失败与金丝雀合成场景及 Node 固定预期

**契约来源：** [spec](../spec.md) 的 S-04 与[失败矩阵](../spec.md#失败矩阵)（F-01 至 F-14 的测试接线，I-1 的固定预期）、S-06 的[金丝雀](../spec.md#网络审计)；AC-06、AC-07 的 Node 部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **失败 fixture（只由代码生成，只在测试支持中）：**
  - F-02 截断的 `.img`；F-03 描述文件有效、目录记录的 extent 越出镜像；F-04 目录计数恰等于与超出 1 的限值对，以及收紧图形份额的测试场景中 payload 预算恰等于与超出（不改生产限值）；F-05 已有的未覆盖光盘；F-06 覆盖路径齐全、大小相同、一个文件内容与固定合成目录哈希不符；
  - F-07 已有的 `models-corrupt`；F-08 被引用贴图缺失（目录匹配该坏 fixture 的哈希，先通过识别再命中引用校验），以及全包跨组依赖缺失（部分包）；
  - F-09 已有的 `content-invalid`，以及组来源身份不一致、乱序或重复组、非法消息（计划新增测试用 Worker 入口直接按协议发送违规消息）；
  - F-10 完整包但逻辑跨 Asset 前提不满足，以及 `finished` 但缺组或组不完整。
- **时序场景：** 五个阶段各一个“停在该阶段直到被终止”的场景；连续发送进度的场景；可控的恢复、提交与列出结果延迟（测试入口查询参数或 IndexedDB 探针，二选一，执行时决定）。只在测试侧控制，不改生产协议。
- **金丝雀：** 新增带金丝雀的 fixture 变体，不改变既有 fixture 的字节：
  - ASCII 金丝雀串写入转换会读取的文件；
  - 一个可证明保留到实际 payload 的唯一合成字节标记（例如索引图像像素或 SND 采样，执行时选定并证明），以及该 payload 的 SHA-256；
  - 生产尺寸文件与生产预置合成包的对应变体（07 使用）；
  - 计划新增 `e2e/support/canaries.ts`：组装文件名标记、内容串、来源指纹、manifest 身份、payload 字节标记与哈希，并提供到达证明（输入含标记、payload 含标记、缓存记录含标记）。
- **Node 固定预期（计划新增 `src/workers/failure-matrix.test.ts` 与表 `src/workers/failure-matrix.test-support.ts`）：** 对 F-01 至 F-10 的每个 fixture，在测试中写定 `{ layer, code, location, limit }` 与状态预期（依据既有错误契约与人为损坏位置），经相同作业模块（`createImportJob`、`openVerifiedSource`）断言；不用运行结果生成答案。该表导出给 08–10 在浏览器中断言同一预期。
- 测试入口与 Worker 场景按需新增选项；生产模块图不含任何新增测试支持（[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 照常通过）。

## 不包含

- 浏览器中的失败矩阵用例（08–10）与联合闭环（06、07）。
- 修改生产代码、错误码、协议或缓存记录格式。

## 关键文件与契约

- [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)、[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)、[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx)、[disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts)、[synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)、[logic-content.test-support.ts](../../../../../src/content/logic/logic-content.test-support.ts)。
- [app-entry.ts](../../../../../e2e/support/app-entry.ts)（`TestEntryOptions`）、[production-cache.ts](../../../../../e2e/support/production-cache.ts)。
- 错误契约依据：[import-host.ts](../../../../../src/workers/import-host.ts) 的层级映射、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 的协议错误、disc 与 source 的既有测试。

## 写入范围

- `src/workers/*.test-support.ts`：Worker 场景、失败与时序 fixture、预期表。
- `src/workers/failure-matrix.test.ts`：Node 固定预期。
- `src/app/app-entry.test-support.tsx`：测试入口选项。
- `src/original-data/**/*.test-support.ts`：光盘与 payload 的合成损坏。
- `src/original-data/synthetic.ts`：合成生成器的金丝雀变体。
- `src/content/**/*.test-support.ts`：逻辑内容的跨 Asset 损坏。
- `e2e/support/app-entry.ts`：测试入口选项类型。
- `e2e/support/canaries.ts`：金丝雀集合与到达证明。
- `e2e/support/production-cache.ts`：带标记的生产预置包变体。

## 验收标准

- [x] F-01 至 F-14 所需的合成 fixture 与时序场景都存在，只由代码生成；既有 fixture 的字节与既有测试结果不变。
- [x] Node：F-01 至 F-10 每个 fixture 的 layer、code、位置与限值等于测试中写定的预期；F-04 覆盖恰等于（通过）与超出 1（拒绝），并证明拒绝发生在超限读取或分配之前。
- [x] 金丝雀：内容串与 payload 字节标记的到达经测试证明（输入、payload、缓存记录）；未到达的标记不用于对应阶段。
- [x] 生产模块图不含新增测试支持；`pnpm check` 通过。

## 验证方法

- `pnpm test -- src/workers/failure-matrix.test.ts tools/engineering-boundaries.test.ts`，再运行 `pnpm check`。
- 浏览器断言由 08–10 完成；不涉及原版对照。

## 完成证据

2026-10-07，执行分支 `exec/p2-12-05`（应用分支名 `lhz516-exec-p2-12-05`），基线 `33b1f07`。

- **场景注册与 fixture（只由代码生成）：**
  - [import-scenarios.test-support.ts](../../../../../src/workers/import-scenarios.test-support.ts)：全部测试 Worker 作业场景（P2-04 至 P2-11 的原场景原样迁入，改为按名首次使用时构造）、协议脚本、各场景识别的光盘与测试入口包配置 `scenarioEntryProfile`。[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 只按 Worker `name` 分派。
  - F-01–F-10 的预期表 [failure-matrix.test-support.ts](../../../../../src/workers/failure-matrix.test-support.ts)（`FAILURE_MATRIX`，20 例：每例的 Worker 场景、文件、预先写定的 `{layer, code, location, limit}` 或组/全包/任务预期，以及持有者结局 `unchanged`/`partial-unsaved`/`complete-saved`），供 08–10 在浏览器断言同一预期。新增 fixture：F-01 改名、F-02 截去一个原始扇区、F-03 `MAIN` 目录记录的 extent 位于镜像末尾之后（[disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts) 新增可选 `outOfImage`）、F-04 根目录 1,024/1,025 条记录、F-04 图形 payload 预算 9,210/9,209（去掉布局与两个 8×8 字库的测试图形步骤，使 4×6 字库最后计费；不改生产限值）、F-06 改一字节同大小、F-08 缺贴图（白名单匹配坏光盘）与音效表缺 `sound/model-clip/01`、F-09 `mixed-identity` 与四个协议脚本、F-10 `mission-invalid`（[logic-content.test-support.ts](../../../../../src/content/logic/logic-content.test-support.ts) 的 `withPlayerWingmanOption`）；F-05、F-07、F-09 内容错误与 F-10 部分包沿用既有场景。
  - 时序：`hold-<阶段>` 五个场景（进入该阶段后文件读取不再返回，停在该阶段直到终止）、`progress-stream`；[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx) 新增 `hold` 查询参数（`commit`、`list`、`restore` 的已结算结果等测试释放），[app-entry.ts](../../../../../e2e/support/app-entry.ts) 的 `heldCacheResults`/`releaseCacheResults`。F-11、F-13、F-14 沿用既有场景与设施。
  - 既有 fixture 字节不变（新变体与可选参数），`syntheticImport` 只提取了 `fileSetOf`。
- **Node 固定预期：** [failure-matrix.test.ts](../../../../../src/workers/failure-matrix.test.ts) 经宿主、真实 `MessageChannel`、作业所有者与真实持有者（假缓存）运行每例：失败例的 layer/code/location/limit 等于表、持有者原包不变；结束例的组摘要、全包诊断、任务状态与提交与否等于表；快照与持有者摘要不含文件名标记。disc 层各例经 `openVerifiedSource` 得到相同错误。F-04：根目录超限时只读了卷描述符（16、17）与根目录扇区（由 PVD 根记录核对），恰等于时继续读取；图形预算在同一边界上，4×6 字库表短一字节的光盘在 9,209 时以 `budget-exceeded@graphics[font/hud/4x6].glyphs` 拒绝（未读字库表），9,210 时才读表并以 `invalid-payload` 失败；9,210 与 F-08 的 `sources.mappings[87]` 另以 fixture 尺寸与映射表核对假设。`hold-<阶段>` 与 `progress-stream` 各有 Node 断言。37 项通过。
- **金丝雀：** [canary.test-support.ts](../../../../../src/workers/canary.test-support.ts) 把 ASCII 串与 16 字节标记作为 `sound/fire/player` 的 8 位采样写入切片光盘（`canary` 场景，白名单匹配该光盘），并给出生产尺寸变体（写入生产白名单首个文件、先被完整哈希）。Node 证明：标记在 `.img` 中连续；转换后的 payload 含标记、哈希等于描述符指纹；`buildPackageRecord` 含 manifest 身份、来源指纹与 payload 哈希，`buildStoredPayload` 含标记；生产作业读取了含标记的扇区后以 `unsupported-version@file:/MAIN/AISTUFF.NOB` 拒绝。[canaries.ts](../../../../../e2e/support/canaries.ts) 组装文件名、内容串、字节标记、payload 哈希、来源指纹与 manifest 身份，每个标记只列已证明到达的阶段（生产导入的标记只到输入），并提供输入、payload 与（不依赖应用模块的）缓存记录到达证明；[production-cache.ts](../../../../../e2e/support/production-cache.ts) 的 `seedProductionCache` 可预置金丝雀包并返回预置的身份。
- **检查：** `pnpm check` 通过（类型、lint、Vitest 153 文件 4,568 项、构建）；`tools/engineering-boundaries.test.ts` 通过，`dist/` 中检索不到新增测试支持的任何标记。浏览器（开发项目，端口 5115/5116，临时用例已删除、未提交）：`FAILURE_MATRIX` 20 例的页面 layer/code/位置/限值与状态、五个 `hold-<阶段>` 停留并可取消、`progress-stream` 取消、`canary` 导入保存后缓存到达证明、`hold=commit` 延迟与释放，共 28 项通过；既有 import-worker、import-page、viewer-page、cache-recovery、app-shell-resources、fast-refresh、joint-resources 与 production-preview 共 56 项通过。
- **审阅：** rubber-duck 指出 F-04 预算对的拒绝点（原为最后的布局）与读取证明不在同一边界，以及表中预期依赖 payload 长度公式与映射表扫描；已改为 4×6 字库最后计费的测试图形步骤，预期写为字面量，公式与映射位置改为单独的假设核对。simplify 合并了字节查找、填充文件与 ASCII 辅助，合并场景光盘注册，预算图形表改为按需构造，matrix 文件按进程缓存；与范围外文件（import-pipeline.test.ts、resource-cache.ts、viewer-observations.ts）的重复未改。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)对测试 Worker 入口按 `name` 选择场景的说明仍成立；新增场景、失败矩阵与金丝雀的用法归 25（工程约定）。

