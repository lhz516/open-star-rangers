---
type: plan
status: active
phase: P3
task: "03"
subtask: "07"
updated: 2026-10-09
---

# 07 — 任务事件的导入与 Core 透传

**契约来源：** [spec](../spec.md) 的 S-02、S-15、AC-02、AC-11（`mission` 族）、AC-14（事件限值）、AC-18；[规范 payload](../spec.md#规范-payload) 的 `mission` 行、[行为与边界](../spec.md#行为与边界)的 `loadMission` 行。
**依赖：** 01, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **内容契约（`content/logic/`）：**
  - `MissionContent` 增加 `eventTriggers`，按段内顺序；每个触发含 `ranges`，区间字段按 01 的结构类型化。消息为字节串，形状按 01 的消息单元确定。总结选择值保留来源值。
  - `MissionDeclaration` 增加 `eventTrigger`，为触发序号或 null。
  - `LOGIC_PAYLOAD_SCHEMA_VERSION` 由 1 递增为 2；`LOGIC_LIMITS` 追加事件相关的结构限值，按 01 的观测值以“2 倍，向上取整到 2 的幂”推导。
  - 读取器检查以下各项，引用错误为 `logic-reference-mismatch`，其余为 `invalid-logic-payload`：每个触发至少被一条声明引用；触发序号在范围内；僚机选项的 `eventTrigger` 为 null；文字字节为 1–255；结构限值。
  - 规范编码经 06 的共用模块。
- **解析（`original-data/formats/`）：**
  - [scen.ts](../../../../../src/original-data/formats/scen.ts) 与 [object-record.ts](../../../../../src/original-data/formats/object-record.ts) 解析段 2 的全部元素：+0x54 可以指向任一事件触发的起点，不再只限第一个。
  - 生成配对非空、未被引用的段 2 元素、+0x54 不指向元素起点、文字缺少 NUL 或超长，都按 spec 的 code 拒绝。
  - 运行时计数按 01 的结论处理：若原版重置它们，则不检查存储值；否则存储值必须为零。
- **转换：** [convert-logic.ts](../../../../../src/original-data/conversion/convert-logic.ts) 把事件触发写入任务 payload。按 P2-09 的计数规则，非 null 的 `eventTrigger` 计入 `missionReferences`，消息字节计入 `payloadBytes`；现有 logic 份额不变，若观测值超出则记录交给 19。本项不递增 `LOGIC_CONVERTER_COMPONENT`，组件由 19 统一递增。
- **Core：** [load-mission.ts](../../../../../src/core/mission/load-mission.ts) 的 `MissionSetup` 增加 `eventTriggers`，原样透传、冻结并与输入隔离。声明经展开带上 `eventTrigger`。不解释、不调度，其余结果不变。
- **合成数据与测试：**
  - [formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts) 能生成多触发、多区间、有无消息、非对齐指针与无序重定位的段 2；
  - [logic-content.test-support.ts](../../../../../src/content/logic/logic-content.test-support.ts) 生成带事件的合成任务内容；
  - 表驱动测试覆盖 AC-02 的正向与拒绝路径；
  - 读取器测试覆盖 AC-11：往返逐字节相同；缺少或多余字段、类型错误、非规范编码、超限与引用错误都按 code 拒绝；结果冻结且与输入隔离。
  - 受任务内容形状影响的既有测试与本地工具测试同步更新。

## 不包含

- 事件的规则语义与调度：归 P3-11、P3-02。
- 新的 logic 组 data 角色：归 08、15。
- 转换器组件、份额、生产包配置与切片定义：归 19。
- 模块分册：由 22 同步；本项在完成证据中列出接口变化。

## 关键文件与契约

- [logic-content.ts](../../../../../src/content/logic/logic-content.ts)、[logic-readers.ts](../../../../../src/content/logic/logic-readers.ts)、[logic-payload.ts](../../../../../src/content/logic/logic-payload.ts)。
- [scen.ts](../../../../../src/original-data/formats/scen.ts)、[object-record.ts](../../../../../src/original-data/formats/object-record.ts)、[formats.test.ts](../../../../../src/original-data/formats/formats.test.ts)。
- [convert-logic.ts](../../../../../src/original-data/conversion/convert-logic.ts)、[load-mission.ts](../../../../../src/core/mission/load-mission.ts)。
- 01 的完成证据与 [scenario](../../../../original/formats/scenario.md) 的段 2 结构。

## 写入范围

- `src/content/logic/**`：任务内容类型、读取器、限值、schema 版本与合成支持。
- `src/original-data/formats/scen.ts`：段 2 解析。
- `src/original-data/formats/object-record.ts`：+0x54 的目标判定。
- `src/original-data/formats/formats.test.ts`：解析测试。
- `src/original-data/formats/formats.test-support.ts`：合成段 2。
- `src/original-data/conversion/convert-logic.ts`：写入事件触发。
- `src/original-data/conversion/convert-logic.test.ts`：转换测试。
- `src/core/mission/**`：`MissionSetup` 透传与测试。
- `src/content/synthetic-content.test-support.ts`：合成内容包随任务形状更新。
- `src/app/resources/mission-diagnostics.test.ts`：随任务形状更新的测试数据。
- `src/ui/viewer/viewer-page.test.ts`：随任务形状更新的测试数据。
- `tools/logic-check.ts`：任务形状变化后的读取与计数。
- `tools/logic-check.test.ts`：对应测试。
- `e2e/joint-pipeline.development.spec.ts`：随任务形状更新的断言（如受影响）。
- `src/original-data/formats/scct.ts`：僚机声明加入 `eventTrigger: null`（执行中扩大）。
- `src/app/resources/resource-holder.test-support.ts`：logic payload 声明 schema 版本 2（执行中扩大）。
- `src/workers/import-job.test.ts`：合成任务的 `missionReferences` 计数（执行中扩大）。
- `src/app/import/import-pipeline.test.ts`：同一计数与份额边界用例（执行中扩大）。

## 验收标准

- [x] AC-02（正向）：合成 SCEN 的段 2 按 01 的结构转换正确；样本覆盖多个区间、有无消息、零与非零的总结选择值、非对齐指针、无序重定位，以及多条记录引用同一触发。
- [x] AC-02（拒绝）：生成配对非空、须为零却非零的运行时计数、未被引用的段 2 元素、+0x54 不指向元素起点、文字缺少 NUL 或超长、区间数超限，各自返回预期的 code 与结构位置，不返回部分结果。
- [x] AC-02（Core）：`loadMission` 透传 `eventTriggers` 与声明的 `eventTrigger`；结果冻结、与输入隔离，两次载入深度相等；既有 Core 测试通过。
- [x] AC-11（`mission` 族）与 AC-14（事件结构限值）：恰等于上限时通过，超出 1 时为 `limit-exceeded` 或 `invalid-logic-payload`。
- [x] AC-18：Core 与 `content/` 不导入 `original-data`；诊断不回显文字或数值。
- [x] `pnpm exec vitest run src/content src/original-data src/core src/app/resources tools/logic-check.test.ts tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成 SCEN 与合成内容；不读取原版文件。
- 受影响的 E2E 断言若有修改，在 23 中随 `pnpm test:e2e` 复核。

## 完成证据

- **AC-02（正向）：** [formats.test.ts](../../../../../src/original-data/formats/formats.test.ts) 的 `converts the synthetic mission field by field` 用 [formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts) 的默认合成 SCEN，含 2 个触发与 4 个区间：区间分别有 1 条、0 条与 2 条消息，总结选择值有负数、零与正数，结构位于奇数偏移、指针不对齐、重定位表逆序，记录 3 与 7 引用同一触发。`keeps every message byte from 1 to 255 and the selector extremes as stored`、`accepts a trigger without ranges` 与 `neither converts nor checks the event counters` 覆盖其余正向情形。[convert-logic.test.ts](../../../../../src/original-data/conversion/convert-logic.test.ts) 逐字段核对转换后的任务 payload 与边界值。
- **AC-02（拒绝）：** formats.test.ts 的表驱动用例逐一断言 code 与结构位置，诊断中不含 MARKER，也不返回部分结果：
  - `unsupported-payload`：生成配对指针或数量非空、记录 +0x30/+0x38 非零、负的区间或消息数、区间 +0x11–+0x13 非零、空消息、未被引用的触发、+0x54 不指向元素起点（元素内部、区间、无段 2）；
  - `invalid-payload`：未登记的指针、计数位或区间值上的重定位、消息内的重定位、越界、文字缺少 NUL；
  - `limit-exceeded`：触发数、区间数、消息数（`payloadItems`）与消息字节（`textBytes`），带限值与观测值。

  运行时计数按 01 的结论不检查。convert-logic.test.ts 确认这些失败原样传递，不产生组。
- **AC-02（Core）：** [load-mission.test.ts](../../../../../src/core/mission/load-mission.test.ts) 断言 `MissionSetup` 含 `eventTriggers`，字段顺序与内容一致；声明带 `eventTrigger`，僚机选项为 null；未经解释的值原样透传。结果深度冻结，修改输入不影响结果，两次载入深度相等；内容层错误原样传递。既有 Core 测试全部通过。
- **AC-11（`mission` 族）与 AC-14（事件限值）：** [logic-readers.test.ts](../../../../../src/content/logic/logic-readers.test.ts) 与 [logic-payload.test.ts](../../../../../src/content/logic/logic-payload.test.ts) 覆盖以下各项：
  - 往返逐字节相同，1–255 全部字节以小写 `\u` 转义并保持可打印 ASCII；
  - 拒绝缺少或多余字段、类型错误、非规范编码（大写转义、字段顺序、-0）、非有限数，以及 i32/i8 越界、NUL 或大于 255 的码位、超长、超数（`invalid-logic-payload`）；
  - 引用越界、未被引用的触发与僚机选项的触发（`logic-reference-mismatch`）；
  - schema 版本 1 与 3 为 `unsupported-payload-schema`；
  - 结果冻结并与输入隔离；每项限值恰等于上限时通过。

  formats.test.ts 的限值用例在上限通过，超出 1 时为 `limit-exceeded`。
- **计数：** convert-logic.test.ts 由解码结果独立计数，`missionReferences` 为 40（3 处 +0x54 引用）。消息加长 20 字节时只有 `payloadBytes` 增加 20；新增引用使 `missionReferences` 加 1；新增区间不改变引用数。`PRODUCTION_LOGIC_SHARE` 与 `LOGIC_CONVERTER_COMPONENT` 未改；本地观测值远低于份额，无需交 19 调整。
- **AC-18：** `content/` 与 `core/` 不导入 `original-data`（`tools/engineering-boundaries.test.ts`、ESLint）；读取器、解析器、Core 与 logic-check 的诊断和输出不回显文字或数值（各测试的 MARKER 与种子值断言）。
- **本地核对（只记计数）：** 在开发者本机基准镜像上运行 `node tools/logic-check.ts`，`passed: true`。SCEN 3019 有 1 个触发、3 个区间、每个区间 1 条消息，消息最长 57 字节，与 [scenario](../../../../original/formats/scenario.md#section-2-event-triggers-p3-03) 的观测值一致，在限值 2/8/2/128 之内。输出未写入仓库。
- **审阅：** rubber-duck 提出 1 项：嵌套的段 2 指针缺少归属与重叠检查，未采纳。spec 与 AC-02 都不要求这项检查，P2-09 的名称列表、成员数组与布局数组也未做；原版按重定位后的指针读取，现有的重定位重叠检查已保证指针字节不被当作值。simplify 采纳 4 项：直接使用 `LOGIC_LIMITS`、删去重复的边界检查、提前检查保留字节、删去冗余断言。字节串、i8 与有符号计数的通用读取应放在只读的 payload-block.ts 或 contract-validation.ts，本项不改。
- **文档影响：** 格式事实已由 01 记录，无需更改。模块分册由 22 同步。[tools.md](../../../../guides/tools.md) 中 logic-check 的 `counts`/`limits` 说明需补充事件项，已在报告中交给协调者分派。

- **检查：** `pnpm exec vitest run src/content src/original-data src/core src/app/resources tools/logic-check.test.ts tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过；`pnpm check`：158 个文件、4,824 个测试与生产构建通过。经批准扩展的写入范围：[scct.ts](../../../../../src/original-data/formats/scct.ts) 的僚机声明带 `eventTrigger: null`；[resource-holder.test-support.ts](../../../../../src/app/resources/resource-holder.test-support.ts) 的真实 logic payload 声明 schema 2；import-job 与 import-pipeline 测试的 `missionReferences` 由 37 改为 40。E2E 未修改。
- **接口变化（交 22 同步分册）：**
  - [logic-content.ts](../../../../../src/content/logic/logic-content.ts)：`LOGIC_PAYLOAD_SCHEMA_VERSION` 由 1 改为 2；新增 `EventTrigger { ranges }` 与 `EventRange { lower, upper, messages, summarySelector }`（i32、i32、字节串数组、i8）；`MissionContent` 末尾新增 `eventTriggers`；`MissionDeclaration` 在 `aiTarget` 之后新增 `eventTrigger`（触发序号或 null）。`LOGIC_LIMITS` 新增 `eventTriggers` 2、`eventRanges` 8、`eventMessages` 2、`eventMessageBytes` 128，由 SCEN 3019 的观测最大值 1、3、1、57 按“2 倍，向上取整到 2 的幂”推导，此前没有对应限值。
  - [logic-readers.ts](../../../../../src/content/logic/logic-readers.ts)：消息为 1–128 个码位、每个 1–255 的字节串；触发至少被一条声明引用、`eventTrigger` 越界、僚机选项的 `eventTrigger` 非 null 都为 `logic-reference-mismatch`；其余为 `invalid-logic-payload`。
  - [load-mission.ts](../../../../../src/core/mission/load-mission.ts)：`MissionSetup` 在 `groups` 之后新增 `eventTriggers`，原样透传、冻结并与输入隔离；声明经展开带 `eventTrigger`。
  - [scen.ts](../../../../../src/original-data/formats/scen.ts)：`ParsedScenario` 新增 `eventTriggers`；段 2 按 28 字节触发表读取全部元素，+0x54 解析为任一元素起点的序号。诊断位置为 `/triggers[i]`、`/triggers[i]/spawnPairs`、`/triggers[i]/ranges[j]`（含 `/lower`、`/upper`、`/summarySelector`、`/reserved`、`/messages`、`/messages[k]`）。[object-record.ts](../../../../../src/original-data/formats/object-record.ts) 的 +0x30/+0x38 位置由 `formation`/`formationIndex` 改名为 `spawnTrigger`/`spawnRange`，仍为 `unsupported-payload`。
  - [convert-logic.ts](../../../../../src/original-data/conversion/convert-logic.ts)：任务 payload 写入 `eventTriggers`；非 null 的 `eventTrigger` 计入 `missionReferences`，消息字节随编码计入 `payloadBytes`。`LOGIC_CONVERTER_COMPONENT` 与 `PRODUCTION_LOGIC_SHARE` 未改动。
  - [logic-check.ts](../../../../../tools/logic-check.ts)：`counts` 新增 `eventTriggerReferences`、`eventTriggers`、`eventRanges`、`eventMessages`、`eventMessageBytes`；`limits` 新增 `eventTriggers`、`eventRanges`、`eventMessages`、`eventMessageBytes`。
