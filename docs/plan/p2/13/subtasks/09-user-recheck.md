---
type: plan
status: active
phase: P2
task: "13"
subtask: "09"
updated: 2026-10-08
---

# 09 — 用户在最终候选上的复核

**契约来源：** [spec](../spec.md) 的 S-03、AC-06 与 AC-12；技术决定 4。由 [01 的问题 P-1](./01-candidate-evidence-map.md#问题ac-12) 引出，按 goal 的[代码现状与前提](../goal.md#代码现状与前提)由协调者新增。
**依赖：** 无。
**执行方式：** 需用户：在真实机器上用本地生产预览与 Chrome 导入自己的光盘，确认导入、缓存恢复与模型、SNIP 帧的查看。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 由用户本人在真实机器上手工完成，agent 不代替：按[本地导入指南的用户实机核对](../../../../guides/local-import.md#用户实机核对)，用本地生产预览（`pnpm build` 后 `pnpm preview`，带拟定 CSP）与 Chrome，经真实界面导入自己的基准 CCD/IMG。
- 只重做 [P-1](./01-candidate-evidence-map.md#问题ac-12) 中受影响的部分：
  1. 识别出版本，依次出现 `Complete resources, viewable`、`Saved in this browser`、`Mission loads into Core`；
  2. 同源、同一 profile 刷新后经 `Open saved resources` 恢复成功，任务再次可载入；
  3. 在查看器中打开玩家、一种敌机与基地模型，以及至少一个 SNIP 帧，没有错误；
  4. 记录页面显示的作业、保存与恢复耗时，Chrome 完整版本与日期。
- 试听与其余查看类别沿用 [P2-11/19](../../11/subtasks/19-user-real-machine-check.md#完成证据)，不重做。
- agent 的工作：确认用户所用检出的构建输入与最终候选一致，准备命令与清单，记录用户给出的结论。用户未完成前本子任务保持 `in-progress` 或 `blocked`，执行记录写明等待用户。

## 不包含

- agent 浏览器验证或自动 E2E 中使用原版数据；原版保真判定。
- 修改代码、指南或其他任务的记录。

## 关键文件与契约

- [本地导入指南](../../../../guides/local-import.md#用户实机核对)；[P2-11 AC-21](../../11/spec.md#验收标准)。
- 最终候选以 [05](./05-real-data-candidate.md) 记录的提交、构建指纹（预期 `ec5af1f5…f690`）与 `ContentIdentity` 为准。用户所用的提交与 `f925d21` 之间不得有构建输入差异；若之后有修复改变了生产输出，须在新的候选上重做。

## 写入范围

- 无（只写本文档）。

## 验收标准

- [x] 用户确认上述 4 项，记录日期、Chrome 完整版本、所用提交、各项结论与三项耗时。
- [x] 所用提交的构建输入与最终候选一致（或其构建指纹等于 05 的记录）。
- [x] 证据不含原版画面、文字或声音；截图（如有）只留在 `local/`。

## 验证方法

- 用户手工核对；agent 只记录结论，并以 `git diff` 核对构建输入。不涉及代码改动，不需要 simplify；按 execute-goal 做 rubber-duck 审阅证据是否覆盖 P-1 的每一项。

## 完成证据

- **核对人与日期：** 用户本人，2026-10-08，在自己的机器上按[本地导入指南](../../../../guides/local-import.md#用户实机核对)完成；agent 未参与浏览器操作，也未接触用户的原版数据。
- **构建与环境：**
  - 协调者在协调检出（提交 `2158020`）中运行 `pnpm build`，再以 `vite preview --port 4173 --strictPort` 提供本地生产预览。构建输出只写在该检出被忽略的 `dist/` 中，与各 worker 工作树无关；预览在核对后已停止。
  - `git diff --name-only f925d21 2158020` 在 `docs/`、`.agents/` 与 `AGENTS.md` 之外没有差异，构建输入与最终候选相同。入口 chunk `index-aXSeUMy4.js` 的 SHA-256 前缀 `42178e76a9e2` 与 [02](./02-engineering-checks.md#完成证据) 记录的一致；入口代码中的生产 `ConverterVersion` 为 `osr-import.graphics-3.logic-1.audio-1.models-3`。构建指纹与 `ContentIdentity` 以 [05](./05-real-data-candidate.md) 的记录为准，由 08 核对。
  - 核对前 `curl -I` 得到页面与导入 Worker 均为 200，并带拟定 CSP。
  - 浏览器：Chrome 154.0.8037.98（Official Build）(arm64)，由用户报告。
- **用户原话与解释边界：** 用户先回复“import 400ms, save 30ms, reload 30ms. no errors.”，随后在协调者的两次追问中：
  - 选择“Yes — all of those were confirmed”：导入后与刷新恢复后都出现 `Mission loads into Core`，并在查看器中打开了玩家、敌机与基地模型以及至少一个 SNIP 帧；
  - 选择“Yes — version identified and all three statuses appeared in order”：导入后识别出版本，并依次出现 `Complete resources, viewable`、`Saved in this browser`、`Mission loads into Core`。

  据此逐项：
  1. 导入：识别出版本，三种状态依次出现（第二次追问）；
  2. 同源刷新后经 `Open saved resources` 恢复并校验成功，任务再次可载入（耗时与第一次追问）；
  3. 玩家、敌机、基地模型与 SNIP 帧打开，无错误（“no errors”与第一次追问）；
  4. 页面显示的耗时：作业约 400 ms，保存 30 ms，恢复并校验 30 ms。

  没有报告任何错误 code。用户未说明所开敌机与 SNIP 帧的具体条目。
- **结论：** P-1 的恢复条件满足；P2-11 AC-21 受影响的部分在最终候选上有用户核对，试听沿用 [P2-11/19](../../11/subtasks/19-user-real-machine-check.md#完成证据)。
- **内容边界：** 证据只有文字结论、耗时与版本号，不含原版画面、文字、声音、截图或文件名；用户未提交截图。
- **Rubber-duck：** 一次审阅。阻塞问题：初稿把耗时与“no errors”当作版本识别与三种状态依次出现的依据，证据不足；已向用户追问并取得明确确认，现逐项写明各结论的来源。其余结论（构建输入相同、内容边界、构建指纹与 `ContentIdentity` 交 05/08 核对）审阅认可。
- **文档影响：** 无需修改。本地导入指南的核对清单与本次步骤一致；STATUS 与阶段索引的修改由 07 的建议统一处理。
