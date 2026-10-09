---
type: plan
status: active
phase: P3
task: "03"
subtask: "08"
updated: 2026-10-09
---

# 08 — 规则数据的 payload 契约

**契约来源：** [spec](../spec.md) 的 S-03 至 S-08（logic 组角色）、AC-11、AC-14（结构限值）、AC-18；[字段处理规则](../spec.md#字段处理规则)、[Asset 与角色](../spec.md#asset-与角色)、[规范 payload](../spec.md#规范-payload)。
**依赖：** 02, 03, 04, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在计划新增的 `src/content/rule-data/` 中，为 logic 组的 6 个新 data 角色定义类型、限值常量、读取器、规范编码、字节解码入口与描述符绑定检查：
  - `craft-info`：`hitDamageScale`，`guns` 与 `missiles` 按源序号排列，`craft` 恰为 20 项且下标为种类位，`missileBodies`；字段类型按 02；
  - `debris-parameters`：`byCraftType` 恰为 20 项，每项为 96 字节记录的数组，嵌套浮点数组按 02；
  - `ai-programs`：`groupTriple`、`programs`、`entries`、`builtInPrograms`；ID 链转为 `entries` 序号，代码指针为不透明的代码标识（LE 对象与对象内偏移），类型按 03；
  - `comm-menus`：5 张菜单，键名按已确认的选择条件命名，项目字段按 04；
  - `base-repair-items`：11 个 `subsystemSelectors`，值域按 04；
  - `flight-messages`：7 条字节串，键名按已确认的发送者与触发命名。
- 字段命名遵循字段处理规则 2：含义未确认的用中性名，类型注释链接源位置与 U 项。零值按规则 3 处理，只有原版代码确认 0 表示“缺省或不存在”时才记为 null。规范数据中除代码标识外，不含条目 ID、文件偏移、`flags` 或 locator。
- 每个族的 payload schema 版本初始为 1；编码经 06 的共用模块。读取器在读取元素前检查结构限值，限值按研究观测值以“2 倍，向上取整到 2 的幂”推导；格式规定的固定数目（20 个种类位、5 张菜单、7 条消息等）作为格式规则检查。
- 错误码复用 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`。绑定检查要求 kind 为 `data`、角色正确、没有依赖。
- 用代码生成的合成内容编写单元测试：往返逐字节相同；缺少或多余字段、类型错误、非规范编码（空白、字段顺序、`-0`）、非有限数、超限、值域外与引用错误都按 code 拒绝；结果冻结且与输入隔离。

## 不包含

- 原版解析：归 10、11、12。
- 来源映射、转换与包装配：归 15、19。
- 规则语义：归 P3-06 至 P3-10。
- 模块分册：由 22 同步。

## 关键文件与契约

- [logic-content.ts](../../../../../src/content/logic/logic-content.ts)（只读）：`RuleInputs` 的先例。
- 06 新增的 `src/content/canonical-json.ts`；[contract-validation.ts](../../../../../src/content/contract-validation.ts)（只读）。
- 02、03、04 的完成证据，以及 `docs/original/formats/craft.md`、`ai.md`、`comm.md`、[hud](../../../../original/formats/hud.md)、[executable](../../../../original/formats/executable.md)。
- 计划新增：`src/content/rule-data/` 下各族的模块、测试与合成支持。

## 写入范围

- `src/content/rule-data/**`：6 个 payload 族的类型、限值、读取器、编码、测试与合成支持（新建）。

## 验收标准

- [ ] AC-11（6 个族）：往返逐字节相同；各类坏输入按 code 拒绝；结果冻结且与输入隔离；字节解码入口拒绝描述符与 payload 不一致的输入。
- [ ] AC-14（结构限值）：每个限值恰等于上限时通过，超出 1 时拒绝；推导所用的观测值写入完成证据。
- [ ] 字段名与类型符合字段处理规则，类型注释链接源位置与 U 项；没有规则解释或默认值。
- [ ] AC-18：`content/rule-data/` 不导入 `original-data`，测试不读取文件，合成值不来自原版。
- [ ] `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 单元测试，使用代码生成的合成内容。不涉及浏览器或原版数据。

## 完成证据
