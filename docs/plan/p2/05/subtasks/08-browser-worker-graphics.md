---
type: plan
status: active
phase: P2
task: "05"
subtask: "08"
updated: 2026-10-05
---

# 08 — 真实 Chromium Worker 中的图形阶段

**契约来源：** [spec](../spec.md) 的 S-12 的浏览器部分；[验证策略](../spec.md#验证策略)中的 Worker 部分；AC-12。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)：** 按 Worker `name` 增加两个场景：
  - `graphics`：用 07 的注入方式，对 06 生产结构的合成光盘运行生产作业与图形步骤；
  - `graphics-corrupt`：同一光盘，但一个合成字库的表长损坏。

  不新增生产入口或调试 API；合成光盘按块读出组装为 `File`，沿用现有的 `MARKER` 隐私标记。
- **`e2e/import-worker.spec.ts`：** 在 development 项目中新增用例：
  - **成功：** 真实模块 Worker 依次发出识别进度、`identified`、`convert-graphics` 进度与 `finished`。`finished.groups` 为空；`usage` 的 `assets`、`paletteEntries`、`glyphs` 分别为 5、512、768，`payloadBytes` 等于各 payload 字节之和（由同一合成输入在页面中独立计算，或由测试支持导出的期望值核对）。
  - **转换失败：** 作业以 `source` 层 `invalid-payload` 失败，快照不含部分结果，console 与快照中没有 `MARKER`。
  - **取消：** 在收到首条 `convert-graphics` 进度时调用 `cancel()`。状态为 `cancelled`，Worker 终止，监听已移除，之后状态与通知不再变化。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)的浏览器验证说明中记录新场景；用例只在 development 项目运行，配置回归按需同步。

## 不包含

- 生产构建中的 Worker chunk、CSP 与页面接线：归 P2-11。
- 原版数据：agent 浏览器检查只用合成资源。

## 关键文件与契约

- **修改：** [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)、`e2e/import-worker.spec.ts`，必要时 [e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- **复用：** 07 的作业注入与合成光盘；P2-04 的浏览器探针与 Worker 适配。

## 验收标准

- [x] AC-12 成功、转换失败与取消三个用例都在真实 Chromium 模块 Worker 中通过。
- [x] P2-04 的既有 Worker 用例在协议版本 2 下照常通过。
- [x] `pnpm test:e2e e2e/import-worker.spec.ts --project=development` 通过；`pnpm exec vitest run tools/e2e-configuration.test.ts` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的合成数据与隔离规则运行，不读取 `local/`。证据记录命令、用例名与关键观测值（阶段序列、用量、终态）。
- 不适用原版对照。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **环境（2026-10-05）：** macOS 26.6；Playwright 1.63.0 的 development 项目，使用已安装的 Chrome 154.0.8037.98（channel `chrome`）。runner 自建的开发服务器为 `http://127.0.0.1:4173`，视口 1280×800，每个用例使用独立 context。只用代码生成的合成光盘，不读取 `local/`。
- **实现：** [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 新增两个场景：`graphics` 用 07 的生产作业（默认图形步骤）识别 `graphicsCoveredFiles()`；`graphics-corrupt` 识别 4×6 字库表少一个字节的同一光盘。[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 新增 `graphicsCoveredFiles` 与 `GRAPHICS_PAYLOAD_BYTES`（7,184，按 payload 长度公式；06 的 Node 测试独立核对用量等于实际 payload 字节之和）。[import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 的页面持有者订阅新增 `cancelAtStage`，可在指定阶段首个快照的通知中同步取消。没有修改生产代码，也没有新增生产入口或调试 API。

| 验收项 | 设置与操作 | 期望 | 观测 | 结果 |
|---|---|---|---|---|
| AC-12 成功 | `graphics` 场景，生产图形结构的合成光盘 | 识别进度 → `identified` → 图形进度 → `finished`；组为空；用量 5/512/768，`payloadBytes` 为期望值 | 去重后的快照序列为 `starting`、`running:null`、`running:identify-source`、`running:identify-source`（已识别）、`running:convert-graphics`、`finished`；`groups` 与 `takeGroups()` 为 `[]`；`usage` 为 assets 5、dependencyEdges 0、paletteEntries 512、glyphs 768、imagePixels 0，`payloadBytes` 等于页面中的 `GRAPHICS_PAYLOAD_BYTES`；`readBytes` 不减少且末值等于 `sourceReadBytes`；探针显示一个模块 Worker（`name` 为 graphics），发送 1 次，终止 1 次，监听全部移除 | passed |
| AC-12 转换失败 | `graphics-corrupt` 场景 | `source` 层 `invalid-payload`，没有部分结果 | 终态为 `{status: failed, jobId: 1, stage: convert-graphics, error: {layer: source, code: invalid-payload, location: graphics[font/hud/4x6].glyphs, limit: null}}`；`takeGroups()` 为 null；Worker 终止 | passed |
| AC-12 取消 | `graphics` 场景，订阅在首个 `convert-graphics` 快照时调用 `cancel()` | `cancelled`，Worker 终止，之后不再变化 | 日志依次为 `running:convert-graphics`、`cancelled:convert-graphics`、`cancel:true`，此前没有图形快照，此后只有帧事件；终态为 `{status: cancelled, jobId: 1, stage: convert-graphics}`；探针显示终止 1 次、监听全部移除 | passed |
| 隐私 | 三个用例 | 快照与页面/Worker console 中没有 `MARKER` | 均未出现 | passed |
| P2-04 回归 | 既有 8 个用例，协议版本 2 | 照常通过 | 通过（`synthetic` 的序列已在 07 中包含空图形阶段） | passed |

- **命令：** `pnpm test:e2e import-worker.spec.ts --project=development` 11 项通过（新增 3 项）；`pnpm exec vitest run tools/e2e-configuration.test.ts` 8 项通过；`pnpm typecheck`、`pnpm lint` 与 `pnpm check` 通过。[import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 改用同一个 `graphicsCoveredFiles` 构造合成光盘，5 项通过。
- **清理：** runner 自行启动和停止开发服务器与浏览器；没有遗留进程。报告与 trace 只在被忽略的 `test-results/`、`playwright-report/` 中。
- **Rubber-duck：** 无发现。审阅者确认：在订阅通知中取消符合同步通知契约；Worker 端口先移除监听再终止，排队的消息不会改变状态；`GRAPHICS_PAYLOAD_BYTES` 与实际字节一致；差异只涉及测试、测试支持与文档。
- **Simplify：** 本子任务只修改测试、测试支持与文档，没有实现代码，按 execute-goal 不需要代码清理。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md#导入-worker)补充两个测试场景与期望值来源；[工程约定](../../../../engineering/README.md#本地浏览器-runner)的导入 Worker 浏览器测试补充图形阶段用例与 `cancelAtStage`。配置回归不需要改动。

