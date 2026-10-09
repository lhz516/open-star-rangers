---
type: plan
status: active
phase: P3
task: "03"
subtask: "06"
updated: 2026-10-09
---

# 06 — 共用错误码、限值名与规范 JSON

**契约来源：** [spec](../spec.md) 的 S-14、AC-14（限值名）、AC-18；[规范 payload](../spec.md#规范-payload)、[错误](../spec.md#错误)、[限值与预算](../spec.md#限值与预算)。
**依赖：** 01, 02, 03, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **限值名：** 按 01–05 记录的结构，在 `SourceLimitName` 中一次追加全部新结构所需的限值名，例如事件触发与区间、CINF 与碎片记录、AI 程序与条目、菜单项目、ANIM 帧与帧数据、爆炸表项。名称与限值的对应写进类型注释。这些限值名供 07、10–17 共用，避免多个并行行同时修改同一封闭集合。研究证明现有的通用限值名（`payloadItems`、`payloadEntryBytes`、`textBytes`）已足够表达的结构，不另起新名。
- **内容错误码：** 按 spec 的错误一节作出以下决定：
  - logic 组的新 data 角色复用 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`；
  - models 与 cockpit-hud-map 组的新 data 角色（场景设置、爆炸表、爆炸动画、星云列表、视角标签）追加 `invalid-flight-data-payload` 与 `flight-data-reference-mismatch`，`non-canonical-payload` 共用。

  在 [contract-validation.ts](../../../../../src/content/contract-validation.ts) 追加这两个错误码，在 [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的封闭列表中补上新码与新限值名。
- **规范 ASCII JSON：** 把 [logic-payload.ts](../../../../../src/content/logic/logic-payload.ts) 中与角色无关的规范编码与解码抽到计划新增的 `src/content/canonical-json.ts`。内容包括：可打印 ASCII 校验、无空白的规范输出、`reserve` 回调、在读取前检查长度上限、要求重新编码与输入逐字节相同；角色专用的读取由调用者传入。`logic-payload.ts` 改用它，输出字节与错误码不变，由现有测试证明。新模块不导入 `original-data`。
- 为新模块与新错误码编写单元测试，覆盖规范输出、非 ASCII、空白、字段顺序、`-0`、长度上限与 `reserve` 的调用时机。

## 不包含

- 各 payload 族的类型、读取器与限值常量：归 07、08、09。
- 解析器与转换：归 10–17。
- 模块分册的同步：由 22 完成；本项在完成证据中列出新增的 API、错误码与限值名。

## 关键文件与契约

- [source-error.ts](../../../../../src/original-data/source-error.ts) 的 `SourceLimitName`。
- [contract-validation.ts](../../../../../src/content/contract-validation.ts) 的 `ContentContractErrorCode`。
- [logic-payload.ts](../../../../../src/content/logic/logic-payload.ts) 的 `encodeLogicPayload`、`decodeLogicPayload`。
- 计划新增：`src/content/canonical-json.ts` 与 `src/content/canonical-json.test.ts`。

## 写入范围

- `src/original-data/source-error.ts`：追加限值名。
- `src/original-data/source-error.test.ts`：限值名的位置语法与回归。
- `src/content/contract-validation.ts`：追加两个内容错误码。
- `src/content/canonical-json.ts`：规范 ASCII JSON 编解码（新建）。
- `src/content/canonical-json.test.ts`：单元测试（新建）。
- `src/content/logic/logic-payload.ts`：改用共用模块，行为不变。
- `src/content/logic/logic-payload.test.ts`：必要时调整，证明字节不变。
- `src/workers/import-protocol.test.ts`：封闭列表补上新码与新限值名。

## 验收标准

- [ ] AC-14（限值名）：新结构所需的限值名都已在 `SourceLimitName` 中，与 01–05 的结构一一对应，并经协议读取回归。
- [ ] 两个新内容错误码已加入封闭集合与协议回归；logic 组新角色的错误码决定已写入完成证据。
- [ ] `canonical-json.ts` 的单元测试通过；`logic-payload.ts` 的既有测试不改断言即可通过，同一输入的输出字节不变。
- [ ] AC-18：`content/` 不导入 `original-data`；诊断不回显值。
- [ ] 针对性检查 `pnpm exec vitest run src/content src/original-data/source-error.test.ts src/workers/import-protocol.test.ts tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 单元测试与既有回归，如上。不涉及浏览器或原版数据。

## 完成证据
