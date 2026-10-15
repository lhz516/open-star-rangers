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
- `docs/engineering/modules/content.md`、`docs/engineering/modules/original-data.md`、`docs/engineering/modules/workers.md`、`docs/engineering/source-structure.md`、`docs/guides/local-import.md`、`docs/guides/tools.md`、`docs/original/formats/imfat.md`、`docs/original/formats/comm.md`：文档同步。
- `local/research/p3-10/comm-messages/**`：本地核对输出（被忽略）。

## 验收标准

- [ ] P3-03 AC-22 的 Node 部分全部通过：正向、ID 链、拒绝、切片版本 5、白名单与读取日志。
- [ ] 读取器满足 P3-03 AC-11 的通用要求：往返逐字节相同、非规范与未知字段拒绝、冻结隔离。
- [ ] 本地核对得到版本 5 的 `complete` 包，计数与 RQ4 一致；仓库中没有原版的数值、文字或字节。
- [ ] 文档同步，`updated:` 更新，链接有效；`pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- 先跑 `pnpm exec vitest run src/content src/original-data src/workers`，再跑 `pnpm check` 与 `pnpm test:e2e`。
- 本地 CLI 核对基准镜像，输出只在 `local/`；`pnpm check:compliance`。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
