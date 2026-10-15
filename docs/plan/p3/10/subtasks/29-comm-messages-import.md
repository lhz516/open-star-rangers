---
type: plan
status: active
phase: P3
task: "10"
subtask: "29"
updated: 2026-10-14
---

# 29 — 通讯消息元数据导入（P3-03 修订 2）

**契约来源：** [P3-03 spec](../../03/spec.md) 的 S-18、AC-22 与[修订 2](../../03/spec.md#修订-22026-10-14已批准)；本任务 [D-03 定稿](../spec.md#d-03-定稿已批准)第 4、6 条；S-01、AC-05。
**依赖：** 07。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **内容契约（`content/`）：** 新增 logic 组 data 角色 `comm-messages` 的类型、严格读取器与规范编码。形状为：`faceTables`（表 20011、20019、20985，各为按头像排列的子表，子表为消息数组）、`direct`（表 20983）；每条消息为 `{ present: false }` 或 `{ present: true, frameDurations }`（i32，1/8 秒，帧数 ≥ 1）；另有 `names2001`、`names2011` 两份字节串名单。结构限值在读取元素前判定，结果冻结且与输入隔离。切片定义版本 4 → 5，新增必需角色 `comm-messages` 恰为 1。
- **原版数据（`original-data/`）：**
  - 生产白名单 `PRODUCTION_CATALOG` 加入 `MAIN/COMMFACE.NOB`（大小与哈希取自基准光盘，只记录身份）。
  - 解析 COMMFACE 的头像表、子表与 20983，以及 CMOV 块的帧数与各帧首字段（时长）。结构依据 executable 的 [RQ4](../../../../original/formats/executable.md#rq4-speaker-faces-and-message-lookup--confirmed-code) 与 [RQ9](../../../../original/formats/executable.md#rq9-cmov-structure--confirmed-code-and-data)；只读取规则需要的字段，不解码图像、声音或文字。
  - COMM TABL 2001、2011 的名单进入同一 Asset。
  - 生产映射与 ID 链核验（子表与非 0 的 CMOV 恰为映射部件），限值与预算份额按 P3-03 规则由基准观测推导，logic 转换器组件递增。
  - 不读取 `COMMFAC2.NOB`。
- **Worker 与生产包：** 步骤输入、`PRODUCTION_PACKAGE` 常量、读取日志；合成光盘与合成白名单加入合成的 COMMFACE。
- **合成测试：** 正向（多头像、条目为 0、3 帧与 4 帧、128–255 字节的名单），以及拒绝路径：ID 链不一致、帧数 0、负时长、limit/limit+1、截断。另覆盖切片版本 5 的完整与缺失、版本 4 被拒，以及读取日志不含 `COMMFAC2.NOB`。合成数据只由代码生成。
- **回归：** 既有 Node 与浏览器测试的合成包升到版本 5（含 `e2e/support/`）。
- **本地核对：** 用 `tools/package-check.ts`（或其扩展）在基准镜像上得到版本 5 的 `complete` 包，计数与 RQ4 的数据（5×5、3×22、5×61、85，名单 20/19）一致；输出只含计数、哈希与限值对照，写在被忽略的 `local/research/p3-10/comm-messages/`。
- **文档：** 内容与原版数据分册、源码结构、本地导入指南（须重新导入）与工具用法；imfat 的 CMOV 一行链接 RQ9（结构已确认）。

## 不包含

- Core 对 `comm-messages` 的使用（12 接入 `CreateWorldInput`，14、15 使用）。
- CMOV 的图像、声音与文字（G-03）；`COMMFAC2.NOB`（LO，D-03 的有据偏差）。

## 关键文件与契约

- [slice-definition.ts](../../../../../src/content/slice-definition.ts)、[rule-data/](../../../../../src/content/rule-data/)（现有 `comm-menus` 等读取器的模式）、[rule-data-payload.ts](../../../../../src/content/rule-data/rule-data-payload.ts)。
- [source-catalog.ts](../../../../../src/original-data/source/source-catalog.ts)、`src/original-data/formats/`、`src/original-data/conversion/`、[production-package.ts](../../../../../src/workers/production-package.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)。
- 合成支持：[synthetic.test-support.ts](../../../../../src/original-data/synthetic.test-support.ts)、[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts)、`e2e/support/`。

## 写入范围

- `src/content/**`：新角色、读取器、切片定义与合成内容支持。
- `src/original-data/**`：白名单、解析、转换、映射、限值与合成光盘。
- `src/workers/**`：作业步骤与生产包配置。
- `src/app/resources/**`、`src/platform/storage/**`：仅限切片版本或白名单变化所需的测试与适配。
- `src/app/import/import-pipeline.test.ts`：转换器版本字面量随 logic 组件递增。
- `e2e/**`：合成包与夹具。
- `tools/package-check*.ts`、`tools/nob-check*.ts`、`tools/logic-check*.ts`、`tools/nob/**`：本地核对。
- `tools/source-check.ts`、`tools/source-check.test.ts`：`COMMFACE.NOB` 进入白名单后移出研究档案列表。
- `docs/engineering/modules/content.md`、`docs/engineering/modules/original-data.md`、`docs/engineering/modules/workers.md`、`docs/engineering/source-structure.md`、`docs/guides/local-import.md`、`docs/guides/tools.md`、`docs/original/formats/imfat.md`、`docs/original/formats/comm.md`：文档同步。
- `local/research/p3-10/comm-messages/**`：本地核对输出（被忽略）。

## 验收标准

- [x] P3-03 AC-22 的 Node 部分全部通过：正向、ID 链、拒绝、切片版本 5、白名单与读取日志。
- [x] 读取器满足 P3-03 AC-11 的通用要求：往返逐字节相同、非规范与未知字段拒绝、冻结隔离。
- [x] 本地核对得到版本 5 的 `complete` 包，计数与 RQ4 一致；仓库中没有原版的数值、文字或字节。
- [x] 文档同步，`updated:` 更新，链接有效；`pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- 先跑 `pnpm exec vitest run src/content src/original-data src/workers`，再跑 `pnpm check` 与 `pnpm test:e2e`。
- 本地 CLI 核对基准镜像，输出只在 `local/`；`pnpm check:compliance`。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **内容契约：** [comm-messages.ts](../../../../../src/content/rule-data/comm-messages.ts) 的 `readCommMessages`、`COMM_MESSAGES_LIMITS`（16 / 128 / 256 / 8 / 64 / 32，由观测 5 / 61 / 85 / 4 / 20 / 11 按“2 倍取整到 2 的幂”推导）、`COMM_FACE_TABLES`、`ABSENT_MESSAGE`；`rule-data-payload.ts` 加入第 7 个角色（schema 1）；`SLICE_DEFINITION_VERSION` 为 5，新增 `comm-messages`（logic、data、恰为 1）。AC-11：`rule-data-payload.test.ts` 的逐角色往返逐字节、冻结隔离、字段顺序/空白/-0/未知字段拒绝覆盖新角色；`rule-data-content.test.ts` 与 `rule-data-limits.test.ts` 覆盖形状拒绝（第 4 张表、0 帧、负时长、超 i32、空名等）与六项限值的 limit/limit+1。
- **原版数据：** [comm-face.ts](../../../../../src/original-data/formats/comm-face.ts) 的 `parseCommMessages`（u32 ID 表、CMOV 只读 +4/+8 与各帧头部首个 i32），[comm.ts](../../../../../src/original-data/formats/comm.ts) 的 `parseCommNames`（名单，名称数在读取第 65 个指针前判定）；`PRODUCTION_CATALOG` 加入 `MAIN/COMMFACE.NOB`（37,462,634 字节，sha256 与 manifest 一致），新指纹 `source:sha256:67391efb…`；`PRODUCTION_RULE_DATA_SOURCES.commMessages` 为 3 张头像表、20983、13 张子表、481 个 CMOV（子资源 `frames/durations`）与 COMM 2001/2011；`SOURCE_ENTRY_TYPES.data` 加入 CMOV；限值名 `commTableItems`、`commNames`；`LOGIC_CONVERTER_COMPONENT` 为 `logic-3`；`PRODUCTION_PACKAGE` 的转换器版本与指纹更新，`limits` 不变。
- **AC-22（Node）：** `comm-face.test.ts`（54 项，含 3 与 4 帧、多头像、条目 0、128–255 字节名单、ID 链六种不一致、0 帧/负帧数/负时长、帧/头像/子表/直接列表/名单/名称字节的 limit 与 limit+1、截断与重定位错误、条目大小上限）；`convert-rule-data.test.ts` 的 comm-messages ID 链（多出/缺少子表与 CMOV 部件、表指向映射之外的条目且不读取它）、CMOV 拒绝与条目上限、读取日志（每个映射条目恰读一次，`MAIN/COMMFAC2.NOB` 零读取）；`production-rule-data.test.ts`（映射 2 + 4 + 13 + 481 个部件、无 COMMFAC2）；`completeness.test.ts`（版本 5 完整、缺 `comm-messages` 为 `role-cardinality`、版本 4/3 为 `definition-version-mismatch`）；`import-job.test.ts`（生产结构合成光盘得到版本 5 完整包，读取日志不含 COMMFAC2）；`source-catalog.test.ts`（9 个文件，固定指纹）。合成数据只由代码生成（`comm-face.test-support.ts`、`generatedCommMessages` 的 4/4/5 头像分配与倒序 CMOV ID）。合成光盘的不读取填充由 1 MiB 增至 2 MiB，以容纳近 500 次小条目读取。
- **本地核对（基准镜像，输出在被忽略的 `local/research/p3-10/comm-messages/`）：** `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` 为 `passed`，版本 5 `complete`，转换器 `osr-import.graphics-4.logic-3.audio-2.models-4`；`comm-messages` 计数 faces/messages 为 20011 5/25、20019 3/66、20985 5/305，20983 为 85，存在 481，名单 20/19，与 RQ4、RX1 一致；规则数据用量 7 个 Asset、98,237 字节，份额（16、262,144）不变（`production-package.test.ts` 记录新观测）；整包 409 个 Asset、3,804,113 字节；读取共 109,785,075 字节。`tools/logic-check.ts` 同样通过。白名单不含 `COMMFAC2.NOB`，任何读取都会以 `path-not-covered` 失败，完整包即证明未读取它。仓库只记录计数、大小、哈希与条目 ID。
- **检查：** `pnpm check`（typecheck、lint、8,454 项 Vitest、build）通过；`pnpm test:e2e` 全量运行后，因生产尺寸合成光盘超过 Playwright 50 MB 缓冲上限而失败的 4 个 spec 改用 `e2e/support/app-entry.ts` 的 `chooserInput`（超限时写入测试输出目录按路径传入）后重跑全部通过（30 项），其余 216 项首轮已通过；`check:compliance` 与 `check:original` 通过。
- **审查：** rubber-duck 指出名单数量限值在读取越界指针之后才判定（已修复并加测试）、误生成的 `.eslintcache`（已删除），以及 `tools/source-check.ts` 仍把 `COMMFACE.NOB` 列为研究封包而读取两次（范围扩大后已修复：`RESEARCH_ARCHIVES` 只含 `COMMFAC2.NOB`，测试中 COMMFACE 作为覆盖封包只报告一次，`docs/guides/tools.md` 同步；基准上 `node tools/source-check.ts` 通过，9 个覆盖文件，COMMFACE 为 `verified`、COMMFAC2 为 `research`，各一次）。simplify：复用 `COMM_NOB`、共享 `ABSENT_MESSAGE`、合并解析缓存与 ID 链集合、删除孤立注释；未采纳把 CMOV 改为逐条流式读取（需改共用的步骤读取器缓存，峰值约 37 MB 仅在 logic 步骤内存在）与改用懒读取接口（与“先核验、共用读取”的既定设计冲突）。
- **文档：** content、original-data、workers 分册，source-structure，local-import（版本 5 与重新导入）、tools（包核对的通讯计数），imfat（CMOV 行链接 RQ9、COMMFACE 观测最大值），comm（§9 名单结构，已确认：代码 `0x3c7bc`/`0x3c828` 与数据）；`updated:` 已更新。STATUS 与 phase tasks 无需改动。

