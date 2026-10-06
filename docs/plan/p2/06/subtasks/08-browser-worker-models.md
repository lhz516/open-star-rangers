---
type: plan
status: active
phase: P2
task: "06"
subtask: "08"
updated: 2026-10-06
---

# 08 — 真实 Worker 的模型阶段浏览器验证

**契约来源：** [spec](../spec.md) 的 S-12（真实 Chromium 路线）；AC-10。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的规则，在 Playwright 的 development 项目中扩展 `e2e/import-worker.spec.ts`，使用 07 的测试专用 Worker 场景与代码生成的合成光盘：
  - **成功（`models` 场景）：** 生产作业在合成切片光盘上依次经过识别、`identified`、图形、逻辑、音频与模型阶段后结束。持有者收到并验证 `models` 组；其 Asset 数与用量（`assets`、`vertices`、`triangles`、`imagePixels`、`payloadBytes`）等于页面内由同一测试支持独立计算的 Node 期望，不在用例中写死生产数值。
  - **失败（`models-corrupt` 场景）：** 损坏的合成 MESH 使作业以 `source` 层 `invalid-payload` 失败，没有组被移交。
  - **取消：** 收到首条 `convert-models` 进度时取消：状态为 `cancelled`，Worker 终止，之后状态不再改变。
  - 现有场景（`synthetic`、`graphics`、`graphics-corrupt`、`audio` 等）只随第五个阶段与 `models` 组更新快照序列与期望，断言意图不变。
- 在用例与测试支持中写明期望值的来源；证据记录浏览器版本、项目与通过数。

## 不包含

- 模型渲染与 WebGL 断言（P2-11）；原版数据（测试只用合成数据）。
- 作业与协议实现（07）。

## 关键文件与契约

- 修改 `e2e/import-worker.spec.ts`；必要时调整 [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 的场景，生产代码不新增调试 API。
- 复用 [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的光盘与期望用量，以及 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的隔离与清理规则。

## 验收标准

- [x] AC-10：成功时持有者收到并验证 `models` 组，Asset 数与用量等于 Node 侧期望。
- [x] AC-10：损坏的合成 MESH 使作业以 `source` 层 `invalid-payload` 失败，且没有组被移交。
- [x] AC-10：收到首条 `convert-models` 进度时取消，状态为 `cancelled`、Worker 终止，之后状态不变。
- [x] 现有浏览器用例全部通过；`pnpm test:e2e e2e/import-worker.spec.ts --project=development` 通过，`pnpm test:e2e` 全部项目通过。

## 验证方法

- `pnpm test:e2e e2e/import-worker.spec.ts --project=development`，随后运行全部项目确认没有回归。
- 按 browser-testing 的结果表记录场景、操作、期望、观察与结果；只用合成数据，不使用原版文件。
- 本子任务只改测试；若需要改生产代码，先回到 07 或新增修复子任务。

## 完成证据

- **环境（2026-10-06）：** macOS 26.6，Playwright 1.63.0，使用已安装的 Chrome 154.0.8037.98（channel `chrome`）。runner 自建开发服务器，视口 1280×800，每个用例使用独立 context。只用代码生成的合成切片光盘，不读取 `local/`。
- **实现：** 只改 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts)，没有修改生产代码或测试 Worker 场景（`models`、`models-corrupt` 已由 07 提供）。
  - `Covered` 新增 `slice` 与 `slice-corrupt`，由页面内的 `sliceCoveredFiles({ corruptMesh })` 生成光盘。
  - 页面持有者的 `createPort` 包一层端口事件，把收到的每条 `group` 消息与清单记入 `received` 后原样转交。这样不在 Worker 上新增监听，探针的监听计数不变。之所以需要这一层，是因为持有者对不完整组的摘要只有状态与诊断（`assets: null`）。
  - Node 期望 `nodeSliceRun()` 在 Playwright 的 Node 进程中，以同一测试支持对同一光盘（`syntheticImport(sliceCoveredFiles(), 'synthetic-models')`，与 Worker 场景的版本 ID 相同）运行同一 `createImportJob`，收集发送的组与用量。用例中没有写死生产数值。

| 验收项 | 设置与操作 | 期望 | 观测 | 结果 |
|---|---|---|---|---|
| AC-10 成功 | `models` 场景，合成切片光盘 | 识别 → `identified` → 图形 → 逻辑 → 音频 → 模型 → `finished`；持有者验证 `models` 组；Asset 数与用量等于 Node 期望 | 去重后的快照序列依次为 `starting`、`running:null`、识别（未识别/已识别）、`convert-graphics`、`convert-logic`、`convert-audio`、`convert-models`、`finished`。持有者摘要：`logic` 完整（3）；`models` 不完整，诊断等于 Node 对其发送组的 `validateGroup`（8 个 `source-not-ready` 纹理，以及 `roles.debris`、`roles.missile`、`roles.projectile` 的 `role-cardinality`）；`audio` 完整（18）。收到的组依次为 logic、models、audio，`models` 清单与 Node 的完全相等，共 36 个 Asset（= 1 + `MODEL_TEXTURE_USAGE.assets` + `PRODUCTION_MODEL_USAGE.assets`）。`usage` 与 Node 用量相等（assets 61、payloadBytes 16,712、vertices 31、triangles 11、imagePixels 120）。另外，assets 与 payloadBytes 等于测试支持的图形、音频与模型用量加上收到的逻辑 Asset，vertices 与 triangles 等于 `PRODUCTION_MODEL_USAGE`，imagePixels 等于 `GRAPHICS_CONVERSION_USAGE`。`readBytes` 不减少，末值等于 `sourceReadBytes`。`takeGroups()` 只含 logic 与 audio。探针显示一个 `models` Worker，发送 1 次、终止 1 次 | passed |
| AC-10 转换失败 | `models-corrupt` 场景，共用四边形网格损坏 | `source` 层 `invalid-payload`；没有组被移交 | 终态为 `{status: failed, jobId: 1, stage: convert-models, error: {layer: source, code: invalid-payload, location: models[model/base-1].parts[0][1].mesh, limit: null}}`。`received` 为空（持有者没有收到任何 `group` 消息），`takeGroups()` 为 null。Worker 发送 1 次、终止 1 次 | passed |
| AC-10 取消 | `models` 场景；订阅在首个 `convert-models` 快照时调用 `cancel()` | `cancelled`，Worker 终止，之后不再变化 | 日志依次为 `running:convert-models`、`cancelled:convert-models`、`cancel:true`，此前出现过 `running:convert-audio`，此后只有帧事件（`framesAfter` 等待 3 帧）。终态为 `{status: cancelled, jobId: 1, stage: convert-models}`。`received` 为空，`takeGroups()` 为 null。探针显示一个模块 Worker，终止 1 次，3 个监听全部移除 | passed |
| 隐私 | 三个新用例 | 快照与页面/Worker console 中没有 `MARKER` | 均未出现 | passed |
| 回归 | 既有用例（`synthetic`、`graphics`、`graphics-corrupt`、`audio`、图形取消、生命周期与失败场景） | 照常通过 | 通过；序列已在 07 中包含模型阶段 | passed |

- **命令：** `pnpm test:e2e e2e/import-worker.spec.ts --project=development` 15 项通过（新增 3 项）。`pnpm test:e2e` 全部项目 61 项通过（development 48、production 12、development-headed 1）。`pnpm exec vitest run tools/e2e-configuration.test.ts` 9 项通过；`pnpm typecheck` 与 `pnpm lint` 通过。
- **清理：** runner 自行启动和停止开发服务器、预览服务器与浏览器，没有遗留进程。报告与 trace 只在被忽略的 `test-results/`、`playwright-report/` 中。
- **Rubber-duck：** 三项发现，均已修复。
  1. 与 Node 用量的比较共享被测实现，`assets` 与 `payloadBytes` 缺少独立来源。现保留相等断言作为跨环境一致性检查，另按测试支持的布局用量与收到的逻辑清单推导这两项。
  2. 没有核对 `models` 组的 Asset 数。现通过端口层的 `received` 记录比较完整清单，并按测试支持核对 Asset 数。
  3. 失败用例中 `takeGroups()` 为 null 在失败后恒成立，无法证明没有组被发送。现断言 `received` 为空，取消用例同样补上。
  审阅者确认取消用例的日志切片与顺序正确，`framesAfter` 使“之后只有帧事件”不会空成立。
- **Simplify：** 本子任务只修改浏览器测试与文档，没有实现代码。按 execute-goal，simplify 只用于实现代码，因此不运行（与 P2-05/08 相同）。
- **文档影响：** [工程约定](../../../../engineering/README.md#本地浏览器-runner)的导入 Worker 浏览器测试新增模型阶段条目，记录 `received` 端口记录、Node 对照与期望来源。[源码结构](../../../../engineering/source-structure.md#导入-worker)已在 07 记录两个场景，无需改动。
