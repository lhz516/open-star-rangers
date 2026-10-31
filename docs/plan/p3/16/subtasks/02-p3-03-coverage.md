---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "02"
updated: "2026-10-30"
---

# 02 — P3-03 覆盖映射

**契约来源：** [spec](../spec.md) 的 S-02、AC-02、[技术决定](../spec.md#技术决定) 8。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对 [P3-03 spec](../../03/spec.md) 的 S-18 与 AC-22（修订 2）在 [P3-10/29](../../10/subtasks/29-comm-messages-import.md#完成证据) 中的完成证据，以及 S-19 与 AC-23（修订 3）在 [P3-08/13](../../08/subtasks/13-ai-static-data-import.md#完成证据) 中的证据。核对时逐条对照 AC 的正向、拒绝、版本与缓存、真实镜像各部分。
- **证据完整时：** 在 [P3-03 goal](../../03/goal.md#验收覆盖) 的覆盖表补四行，实现与验证列指向交付任务的子任务；并在其执行记录加一条说明：修订由交付任务实现，P3-03 goal 不重新打开，本次只补映射。不改 P3-03 的子任务、依赖、状态或历史证据。
- **证据不完整时：** 不补对应行，在本文档写明缺口、原责任与恢复条件，交 16。

## 不包含

- 重做 AC-22、AC-23 的测试或本地核对；修改 P3-03 spec。

## 关键文件与契约

- [P3-03 goal](../../03/goal.md)；[tools/task-state.ts](../../../../../tools/task-state.ts) 的 `coveredIds` 只读覆盖表第一列的 S/AC 编号。

## 写入范围

- `docs/plan/p3/03/goal.md`：只加四行覆盖映射与一条执行记录，并更新 `updated:`。

## 验收标准

- [x] AC-02：四项的交付证据已核对，结论逐项写明。
- [x] AC-02：P3-03 goal 的差异只有四行映射、一条执行记录与日期；`node tools/task-state.ts p3/03` 为 `done`，或缺口已列为问题。
- [x] 链接与锚点可解析。

## 验证方法

- `git --no-pager diff docs/plan/p3/03/goal.md`；`node tools/task-state.ts p3/03`；链接检查。

## 完成证据

- **核对基准：** 认领提交 `b1209001`。P3-03 spec 的 S-18、AC-22（修订 2）与 S-19、AC-23（修订 3，含“P3-08 的修订：AI 解析数据”一节的核验 1–6）逐条对照交付子任务的完成证据；两个交付行在各自 goal 中均为 `completed`（[P3-10 goal](../../10/goal.md#子任务跟踪) 的 29、[P3-08 goal](../../08/goal.md#子任务跟踪) 的 13）。只读核对，没有重跑测试（本子任务不包含）；抽查了证据引用的测试文件仍在当前树中（`comm-face.test.ts`、`ai.test.ts`、`convert-rule-data.test.ts` 的 COMMFAC2 零读取断言、`completeness.test.ts`、`rule-data-payload.test.ts` 的 `unsupported-payload-schema`、`converter-version.test.ts`、`resource-holder-cache.test.ts`）。
- **S-18 — 完整：** [P3-10/29](../../10/subtasks/29-comm-messages-import.md#完成证据) 由三张头像表、子表、20983 与所引 CMOV 的帧数和帧时长，加 COMM 2001/2011 名单生成 logic 组的 `data/comm-messages`；CMOV 只读帧数与帧头的时长，`COMMFAC2.NOB` 不在白名单、零读取。
- **AC-22 — 完整：**
  - 正向：`comm-face.test.ts` 与 `convert-rule-data.test.ts` 覆盖多头像、3/4 帧、条目 0（`ABSENT_MESSAGE`，即 `present: false`）与含 128–255 字节的名单。
  - ID 链与拒绝：子表与 CMOV 部件的多出、缺少与映射外条目为 `subresource-mismatch`；0 帧、负帧数、负时长、各限值的 limit/limit+1、截断与重定位错误按 code 拒绝。
  - 切片：当时的版本 5 完整、缺 `comm-messages` 为 `role-cardinality`（不完整）、版本 4/3 为 `definition-version-mismatch`。此后 P3-09 与 P3-10 的修订 2 合并为版本 6，修订 3 保持 6，修订 4 递增为 7；`completeness.test.ts` 仍对旧版本逐一断言 `definition-version-mismatch`，属契约的后续演进，不是缺口。
  - 白名单与读取：`PRODUCTION_CATALOG` 含 `MAIN/COMMFACE.NOB`；读取日志每个映射条目恰一次、`COMMFAC2.NOB` 零读取。
  - 本地核对：package-check 为 `passed`、版本 5 `complete`，计数与 RQ4、RX1 一致，只记计数与哈希；`pnpm check`、`pnpm test:e2e`（含 4 个改用路径传入的 spec 重跑）、`check:compliance`、`check:original` 通过。
- **S-19 — 完整：** [P3-08/13](../../08/subtasks/13-ai-static-data-import.md#完成证据) 把四张关键字表按地址次序并入 `data/ai-programs`（payload schema 2），表与操作码的对应和折叠函数为 schema 常量；`setupHash` 覆盖新表，完整内容交给 Core。
- **AC-23 — 不完整（一项拒绝证据缺失），不补覆盖行：**
  - 正向：4 张表 3/6/2/3 项，第一与第四张共享名称目标，名称区域起于奇数偏移，多项指向同一名称，值含负值、`0x7fffffff` 与 `-0x80000000`；解析、合成 LE 读取与端到端转换一致，payload 往返逐字节相同。完整。
  - 拒绝：值字、终止项与跨字的 fixup（多出），缺少 fixup，目标对象不符，加法与 16 位源类型（LE 读取器 `invalid-payload`），缺终止项与终止项值非零，名称目标不在区域起点、映射名称区域未被引用（`subresource-mismatch`），缺 NUL 与多余字节，表内折叠重复；四项限值的 limit 通过、limit+1 拒绝，解析器与转换器各一组。
  - 版本与缓存：schema 1 为 `unsupported-payload-schema`；`logic-4` 与新的 `ConverterVersion` 有断言；旧版本包不恢复、当前版本包可恢复。完整。
  - 真实镜像：package-check 报告 3/6/5/3 项、14 个名称、111 字节与 `keywordTables` 摘要，与不共用产品代码的独立 LE fixup 解码一致；只记计数与哈希。完整。
  - **缺口：** spec 修订 3 的核验 2 要求表区域内的 fixup 全部为“源类型 7、内部引用、目标对象 4、16 位目标偏移”，“类型不同为 `unsupported-payload`”，AC-23 的拒绝项包括“类型不符”。P3-08/13 的“与 spec 的一处差别”写明转换器不区分目标偏移的宽度：[le-executable.ts](../../../../../src/original-data/formats/le-executable.ts) 按 flags 的 0x10 位读取 16 或 32 位目标偏移，但 `RegionFixup` 不带宽度，32 位目标偏移的 fixup 会被接受，没有对应的拒绝测试。真实镜像的 17 个 fixup 都是 16 位目标偏移（独立解码），所以生产数据不受影响；缺的是合同要求的拒绝证据。P3-08 goal 2026-10-15 的执行记录写明协调者接受了这项偏差，但按本任务 spec [技术决定 7](../spec.md#技术决定)，授权不能豁免必需证据，所以不能据此算作完整。
  - **原责任：** P3-08/13（P3-03 修订 3 的实现方）。
  - **恢复条件（二选一，交 16 按 S-05 处理）：** (a) 有界修复：`RegionFixup` 暴露目标偏移宽度，关键字表（以及采用同一核验的内置表 `0x1762f8`，若其契约同样要求）对 32 位目标偏移报 `unsupported-payload`，加合成拒绝测试；完成后补 AC-23 一行与对应执行记录，`node tools/task-state.ts p3/03` 应为 `done`。(b) 用户或其授权的协调者修订 P3-03 spec，把目标偏移宽度移出必需拒绝项（理由：两种编码载入结果相同、真实镜像已由独立解码确认），修订获批后补 AC-23 一行。
- **P3-03 goal 的修改：** `git --no-pager diff docs/plan/p3/03/goal.md` 只有：`updated:` 由 2026-10-09 改为 2026-10-30；覆盖表在 S-17 后加 S-18、S-19，在 AC-21 后加 AC-22，实现与验证列指向 P3-10/29、P3-08/13；AC-23 按上条缺口不加；执行记录末尾加一条“补覆盖映射（P3-16/02）”，写明三行与 AC-23 的缺口。子任务、依赖、状态、审批与历史证据未动。
- **路由：** 修改前 `node tools/task-state.ts p3/03` 为 `generate-goal`（缺 S-18、S-19、AC-22、AC-23）；只补三行后为 `generate-goal`，只报告缺 AC-23（四行都补时曾为 `done (terminal)`，证明 `coveredIds` 只差这一项）。
- **链接：** 用一次性脚本（未提交）解析两份改动文档中的全部相对链接与锚点（按 GitHub 标题 slug 规则），全部可解析。
- **rubber-duck：** 一项阻塞——AC-23 的 16 位目标偏移拒绝缺少证据，协调者的接受不能豁免必需证据（本任务 spec 技术决定 7）；已采纳，AC-23 行撤回，缺口如上。一项非阻塞——切片定义版本的历史写错；已更正为 5 → 6（合并）→ 6（修订 3）→ 7（修订 4）。其余确认：P3-03 goal 的差异只限允许的修改，S-18、S-19、AC-22 的证据充分。
- **文档影响：** 只改计划文档，无代码，不需要 simplify；STATUS、阶段索引与其他文档的说明不受影响（P3-03 在阶段索引中的导航与状态描述由 16 汇总时一并审阅）。
