---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "05"
updated: "2026-10-30"
---

# 05 — 真实数据候选核对

**契约来源：** [spec](../spec.md) 的 S-03、AC-06、[数据模型与契约](../spec.md#数据模型与契约)中“真实数据候选核对结果”一行、[技术决定](../spec.md#技术决定) 2。
**依赖：** 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **运行：** `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，报告写入 `local/research/p3-16/package-check/`。
- **核对报告形状：** `format: 'osr-package-check'`、`version: 1`、`passed: true`、`error: null`、`package.status: 'complete'`；各角色计数与限值通过，`loadMission` 不抛错，退出码 0。
- **还原完整 `ContentIdentity`：** 字段为 `schemaVersion`、`sliceId`、`sliceDefinitionVersion`、`converterVersion`、`manifestIdentity` 与 `origin`（`original-import` 加 `sourceFingerprint`）。来源是报告的 `package` 字段、当前内容常量与报告的来源指纹。与 P3-15/07 的私有记录比对完整值；历史全值无法恢复时如实记录，不用截断哈希证明相同。
- **候选关系：** 04 的修复只改 Core 规则，不改转换输出；本核对的身份适用于最终候选。若之后有改动影响转换器，由协调者按 spec 重做本项。

## 不包含

- 新增 CLI 字段或 schema；真实内容的玩法运行（06）。

## 关键文件与契约

- [package-check.ts](../../../../../tools/package-check.ts) 的 `PackageCheckReport`；[content-identity.ts](../../../../../src/content/content-identity.ts)；[P3-15/07](../../15/subtasks/07-real-content-runs.md#完成证据)。

## 写入范围

- `local/research/p3-16/package-check/**`：报告与比对的私有输出。

## 验收标准

- [x] AC-06：报告满足上述成功形状，退出码 0。
- [x] AC-06：完整 `ContentIdentity` 已记录并与 P3-15/07 比对；有差异或无法恢复时明确记录。
- [x] 被跟踪的证据只含身份、计数、哈希与结论，没有原版内容。

## 验证方法

- 运行命令并检查 JSON 字段；记录命令、退出码与报告文件的 SHA-256。

## 完成证据

**2026-10-30（worker，基于认领提交 9a3b21f2，受跟踪树干净）**

- **候选：** 提交 `9a3b21f2d5ede9c09c556b95f11acd78bf79870c`，`src` 树 `f1f159dd9cc6a202d9242bac38bc3696dfe02491`；包含 04 的 Core 修复（2500ceef）与 18 的关键字表修正宽度拒绝（1b46f0aa）。运行前 `git status --porcelain` 为空；Node v22.22.0。
- **命令：** `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，标准输出写入私有报告，退出码 0，标准错误为空；报告 15499 字节，SHA-256 `8319edb80d889b65db870d4eb99a6ce17d2446354bad892e584be9974b0914f9`。
- **成功形状：** `format: 'osr-package-check'`、`version: 1`、`passed: true`、`error: null`；来源识别为 `star-rangers-1995-cd`；`package.status: 'complete'`，4 组共 411 个 Asset（logic 10、models 266、cockpit-hud-map 106、audio 29）；22 个角色报告；65 项限值全部 `observed ≤ limit`（工具对超限以 `limit-exceeded` 结束，`error` 为空即无超限）；`loadMission` 在 mission 角色检查中调用，未抛错（否则 `error` 非空、`passed` 为假）。读入总量 109832115 字节。
- **完整 `ContentIdentity`：** 由报告的 `package` 字段、`identity.fingerprint` 与当前常量（`CONTENT_SCHEMA_VERSION`、`SLICE_ID`）经 `readContentIdentity` 还原；报告的切片定义版本与转换器版本分别等于当前 `SLICE_DEFINITION_VERSION` 与 `PRODUCTION_CONVERTER_VERSION`：
  - `schemaVersion: 1`
  - `sliceId: 'classic-p2-slice'`
  - `sliceDefinitionVersion: 7`
  - `converterVersion: 'osr-import.graphics-6.logic-4.audio-2.models-4'`
  - `manifestIdentity: 'manifest:sha256:b0ea7efdd14a5d30b465a7d3d4cb2eb2c1e49537128dd86e63a4ad37800aabac'`
  - `origin: { type: 'original-import', sourceFingerprint: 'source:sha256:67391efbb13ceda3e264f18ae0905d1ba39909ef36b002491ffa33076a35ddeb' }`
- **与 P3-15/07 比对：** 历史完整值可恢复：P3-15/07 私有目录中 `s1`、`f3`、`f3-restart` 三份录制的 `record.content` 是完整对象，三份 `replay-check` 报告的 `identity` 是完整的 `contentIdentityKey`。私有脚本以完整值比较：三份录制经 `readContentIdentity` 后与当前身份逐字段相同，三个身份键与当前 `contentIdentityKey` 相同。结论：当前候选的内容身份与 P3-15/07 **相同**（完整值比较，未用截断哈希）。manifest 身份覆盖每个 Asset 的描述、依赖、载荷身份（字节数与指纹）和来源状态（[manifest-identity.ts](../../../../../src/content/manifest-identity.ts)），所以相同也说明 04、18 未改变真实转换输出，与 18 报告的“有效输出不变、`ConverterVersion` 不升级”一致。
- **候选关系：** 本身份适用于提交 9a3b21f2 的转换路径。进行中的 19 只改 `src/render`，不触及转换；之后若有改动影响转换器，由协调者按 spec 重做本项。本项不实例化、不运行真实内容玩法（属 06）。
- **私有材料：** 被忽略的 `local/research/p3-16/package-check/`：报告、退出码、候选提交、运行前树状态、Node 版本、身份还原与比对脚本及其输出（`identity-comparison.json`）和说明。被跟踪证据只有身份、计数、哈希与结论。
- **复核：** rubber-duck 按 S-03/AC-06 复核本证据与私有文件：数字、哈希、计数与身份来源一致，完整值比较成立，未发现问题。
- **检查与文档影响：** 无实现代码改动，不需要 simplify 与 `pnpm check`。文档影响：只有本文件；工具指南、工程约定与原版记录都无需更新（工具用法未变，没有新的原版事实）。
