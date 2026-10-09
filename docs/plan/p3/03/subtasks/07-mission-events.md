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

- [ ] AC-02（正向）：合成 SCEN 的段 2 按 01 的结构转换正确；样本覆盖多个区间、有无消息、零与非零的总结选择值、非对齐指针、无序重定位，以及多条记录引用同一触发。
- [ ] AC-02（拒绝）：生成配对非空、须为零却非零的运行时计数、未被引用的段 2 元素、+0x54 不指向元素起点、文字缺少 NUL 或超长、区间数超限，各自返回预期的 code 与结构位置，不返回部分结果。
- [ ] AC-02（Core）：`loadMission` 透传 `eventTriggers` 与声明的 `eventTrigger`；结果冻结、与输入隔离，两次载入深度相等；既有 Core 测试通过。
- [ ] AC-11（`mission` 族）与 AC-14（事件结构限值）：恰等于上限时通过，超出 1 时为 `limit-exceeded` 或 `invalid-logic-payload`。
- [ ] AC-18：Core 与 `content/` 不导入 `original-data`；诊断不回显文字或数值。
- [ ] `pnpm exec vitest run src/content src/original-data src/core src/app/resources tools/logic-check.test.ts tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成 SCEN 与合成内容；不读取原版文件。
- 受影响的 E2E 断言若有修改，在 23 中随 `pnpm test:e2e` 复核。

## 完成证据
