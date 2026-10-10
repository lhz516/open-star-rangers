---
type: plan
status: active
phase: P3
task: "04"
subtask: "08"
updated: 2026-10-10
---

# 08 — replay 核对工具

**契约来源：** [spec](../spec.md) 的 S-08 与 [replay 核对工具](../spec.md#replay-核对工具)，数据模型的“replay 核对报告”；AC-16（Node 部分）。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `tools/replay-check.ts`：`node tools/replay-check.ts <录制.json> <CloneCD 文件组>`。
  1. 读取前检查文件字节上限，以同一句柄有界读取，文件在读取中变化或超限都拒绝；上限由 `ReplayRecord`/`ReplayResult`、`CORE_LIMITS`、字段长度与 JSON 编码最坏开销推导并固化，依据与精确数值写入工具说明与 [工具指南](../../../../guides/tools.md) 的交接（指南由 15 编写）。不先无界读取或解析。
  2. 校验顶层恰为 `{ record, result }`；expected 结果经 Core 公开校验边界验证后才执行重放。
  3. 复用 P3-03 新增的 `tools/package-check.ts` 的整包导入路径（`createImportJob` 转换整个文件组，保留全部组并调用 `validatePackage`）；需要时把该路径提取为两者共用的 helper，`package-check` 的行为与输出不变、其测试照常通过。不照搬 [logic-check.ts](../../../../../tools/logic-check.ts) 只检 logic 组的实现。按任务引用的 Asset ID 解码三份逻辑数据；内容身份取自实际验证结果，不从录制构造。
  4. `replayRecord` 重放，`compareReplayResults` 比较；版本、身份或 setupHash 不符一律拒绝，不改写记录或忽略差异。
  5. 输出固定形状 JSON 报告 `{ format: 'osr-replay-check', version: 1, passed, error, identity, mission, setupHash, finalTick, events, checkpoints, comparison }`；提前失败时未取得的字段为 null；通过退出 0，核对失败 1，用法错误 2。错误码为封闭集合：usage、read-failed、file-too-large、invalid-recording、content-failed、replay-failed、replay-mismatch、internal-error；location 为固定阶段或受约束的结构路径。报告不含名称、坐标、原始事件、宿主路径或异常原文。
- CLI 始终使用生产来源白名单。导出可注入导入作业与来源配置的核对函数，供 Node 测试与 10 的 E2E 使用合成光盘；不从记录选择白名单，测试配置不进入 CLI 参数。
- 随实现编写 `tools/replay-check.test.ts`：用 01 的可开始合成场景与 `createRecordingSession` 产生合成录制。

## 不包含

- 浏览器导出（07、09）与下载后的 E2E 核对（10）；真实内容核对（14）；工具指南的正文（15）。

## 关键文件与契约

- 计划新增：`tools/replay-check.ts`、`tools/replay-check.test.ts`。
- 复用：P3-03 的 [package-check.ts](../../../../../tools/package-check.ts)（整包导入与核对）；参照：[logic-check.ts](../../../../../tools/logic-check.ts)、[node-byte-source.ts](../../../../../tools/node-byte-source.ts)。
- 只读消费：[replay.ts](../../../../../src/core/replay/replay.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[completeness.ts](../../../../../src/content/completeness.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)。

## 写入范围

- `tools/replay-check.ts`：计划新增的工具。
- `tools/replay-check.test.ts`：计划新增的测试。
- `tools/package-check.ts`：仅在提取共用整包导入 helper 时修改，行为不变。
- `tools/package-check.test.ts`：同上，只做必要的导入调整。

## 验收标准

- [x] AC-16（Node）：合成录制经核对函数与同一合成光盘重放一致，报告 `passed: true`、退出码 0。
- [x] AC-16（Node）：文件超限（limit/limit+1）、读取中增长、顶层坏形状、坏 expected、版本/身份/setupHash 不符、结果分歧各以对应错误码失败，未取得字段为 null；未改写导出 JSON。
- [x] CLI：用法错误退出 2；I/O 失败与未知来源（合成盘对生产白名单）非零退出并输出同形状报告；意外异常为 internal-error。
- [x] 报告不含原版内容、名称、坐标、宿主路径或异常原文。
- [x] `pnpm exec vitest run tools/replay-check.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node：合成光盘、合成录制与篡改变体；CLI 以子进程或 `main(argv)` 检查输出与退出码。
- 真实内容的 CLI 成功路径由 14 取得；不适用浏览器。

## 完成证据

- **实现：** [replay-check.ts](../../../../../tools/replay-check.ts) 导出 `runReplayCheck(录制路径, 光盘路径, { catalog?, job? })`（供 Node 测试与 10 注入合成白名单或导入作业；不从录制选择，也不是 CLI 参数）、`exitCode(report)`、`main(argv)`（无注入入口，始终用生产作业与生产白名单）、`RECORDING_MAX_BYTES`、`recordingSizeBound()` 与 `LONGEST_RECORDING_PARTS`。顺序：同一句柄有界读取 → UTF-8/JSON 与顶层恰为 `{ record, result }` → `replayRecord(record, null)` 以 Core 公开入口先验证整份记录（该入口先验完记录才读 content，所以合法记录止于 `content`）→ `compareReplayResults(result, result)` 验证 expected → `importPackage` 整包转换并 `validatePackage` → 身份取自验证结果，按任务引用的 Asset ID 解码三份逻辑数据 → `replayRecord` → `compareReplayResults`。导出 JSON 不被改写（测试比较核对前后字节）。
- **共用 helper：** [package-check.ts](../../../../../tools/package-check.ts) 提取并导出 `importPackage`（打开文件组、运行作业、保留全部组、`validatePackage`）、`InputReadError` 与 `ImportedPackage`，`runPackageCheck` 改用它；输出不变，[package-check.test.ts](../../../../../tools/package-check.test.ts) 未改动，8 项通过。
- **文件上限（交接 15 的工具指南）：** `RECORDING_MAX_BYTES = 225,969,791` 字节，为任何 Core 接受、内容身份为生产导入作业形状的录制 `JSON.stringify` 后 UTF-8 字节数的上界：信封（记录头、空列表与结果的 finalTick）1,621 + 131,072 tick × 124 + 262,144 命令 × 107 + 524,288 事件 × 336 + 131,073 检查点 × 42（各项为最长条目加一个分隔符；计数即 `CORE_LIMITS` 的录制容量）。最长取值：有限数字 25 字符（符号、`0.`、5 个零、17 位有效数字；非负 24）、安全整数 16 位、tick 6 位、producer 每个 UTF-16 码元 6 字节（`\u` 转义）、任务为 128 字符 Asset ID、内容身份为生产转换器版本与 SHA-256 manifest/source 指纹；命令与事件按全部变体取最长（映射类型使新变体不加样本就不能编译）。测试把常量钉在推导上，并以 Core 读取器验证各样本合法；上限低于 V8 最长字符串。依据与数值也在工具的用法说明（stderr）中。读取前 fstat 检查上限，至多读入 size+1 字节，前后 `stat({ bigint: true })` 的 size、mtimeNs、ctimeNs 不同即拒绝；FIFO 以 O_NONBLOCK 打开不等待，非普通文件不读。
- **错误码与位置：** 封闭集合 usage（`argv`）、read-failed（`recording`、`recording.changed`、`disc[i]`、`disc`）、file-too-large（`recording`）、invalid-recording（`recording.json`、`recording`、`record…`、`result…`，以及世界创建结合内容才校验的 `record.run…`）、content-failed（导入阶段名如 `identify-source`、首个包诊断路径如 `groups[3].roles.warp-sound`、`content…`）、replay-failed（`record.content`、`record.mission`、`record.setupHash`、`record.ticks[k]`、Core 故障 `replay`）、replay-mismatch（`comparison`）、internal-error（所在阶段）。报告字段：mission/setupHash 在记录验证后、finalTick/events/checkpoints 在 expected 验证后、identity（`contentIdentityKey`）在整包验证后填入，其余为 null；passed 仅在 comparison 为 match 时为 true；退出码 0/1/2。
- **测试：** [replay-check.test.ts](../../../../../tools/replay-check.test.ts) 用 01 的 `mission-startable`（`scenarioFiles` 写出 CloneCD 文件组，`scenarioSource`+`catalogFor` 为合成白名单，`MISSION_SCENARIOS`/`IMPORT_SCENARIOS` 取结局与作业）与 `createRecordingSession`（生产难度 19、僚机 0、40 tick、间隔 8，含 object-instantiated 与 command-result 事件）。覆盖：通过（`passed: true`、`exitCode` 0、文件未变；注入作业同样通过）；limit 的稀疏文件通过闸门后为 `recording.json`、limit+1 为 file-too-large 且零次读取；读取中增长、缩短、同长覆盖并恢复 size/mtime（ctime 变化）均为 `recording.changed`；缺失文件与目录；坏 UTF-8、非 JSON、数组、null、缺 result、多字段；版本、rulesVersion、坏 setupHash、越界轴、额外字段（导入前失败，字段全 null）；坏 expected 四种（mission/setupHash 已填、计数 null）；身份、任务、setupHash 不符为 replay-failed；run 的 seed/难度类型/奇数步长/其他战役组/非 19/僚机越界为 `record.run…` 的 invalid-recording；检查点、事件、长度分歧为 replay-mismatch 且 comparison 正确、文件未变；`mission-partial` 包不完整；默认生产白名单拒绝合成盘（`identify-source`）；光盘文件缺失（`disc[1]`）与打开后变化（`disc`）；`job-throws` 为 internal-error 且无异常原文。CLI：`[]`、单参数、`--help` 退出 2 且输出全 null 同形状报告并在 stderr 给出上限；缺失录制退出 1；合成盘对生产白名单退出 1（`identify-source`）；子进程运行脚本退出 2。每份报告检查固定键序、错误码属封闭集合，且不含文件名标记、临时目录、异常标记；意外异常经 `runReplayCheck` 的同一归类测试（CLI 无注入入口）。
- **检查：** `pnpm exec vitest run tools/replay-check.test.ts tools/package-check.test.ts` 54 项通过（约 2.5 s，含 226 MB 稀疏文件读取）；`pnpm check` 通过（214 个文件 6,518 项测试、四个 TypeScript 程序、ESLint、构建）。Node v22.22.0。测试不读取 `local/` 或原版内容；真实内容的 CLI 成功路径归 14。
- **rubber-duck：** 采纳三项：仅比较 size/mtimeMs 会漏掉同长覆盖，改为 bigint 的 size、mtimeNs、ctimeNs 并加测试；`replayRecord(record, null)` 不校验 run 的取值（Core 只在世界创建时结合内容校验），故把 `record.run…` 归为 invalid-recording 并说明 mission/setupHash 的取得时机；注入任意作业时上限的身份假设不成立，在 `ReplayCheckOptions` 写明注入作业须与生产作业同样转换。其建议的 Core 记录预检入口与身份长度上限属 Core 契约修订，超出本子任务范围，未做。
- **simplify：** 采纳：去掉多余的 `PackageImportOptions` 别名、报告字段合为一个 `ReportFields` 类型、测试复用 `roundTrip`、CLI 断言去掉重复解析。未采纳：把解码/上限推导/错误归类下沉到 Core 或 app（超出写入范围，需修订契约）；每例共用转换结果（总耗时约 2.5 s，逐例真实转换更贴近验收）；并行 `openAsBlob`（会改变多文件失败时报告的序号）；用文件打开注入替代 `vi.mock`（会扩大导出接口）。
- **文档影响：** 工具指南中的用法、上限、错误码与退出码由 15 撰写（数值见上）；`docs/guides/tools.md` 中 package-check 的说明与 `runPackageCheck(paths, { catalog })` 用法仍准确，其余维护文档无需更新。

