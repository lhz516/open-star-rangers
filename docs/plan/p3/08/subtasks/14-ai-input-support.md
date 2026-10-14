---
type: plan
status: active
phase: P3
task: "08"
subtask: "14"
updated: 2026-10-14
---

# 14 — AI 输入与支持范围

**契约来源：** [spec](../spec.md) 的 S-03、AC-02；[AI 输入与可达性](../spec.md#ai-输入与可达性)；08 定稿的支持范围与检查规则。
**依赖：** 12, 13。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [rule-data.ts](../../../../../src/core/world/rule-data.ts) 扩展 `aiPrograms` 的静态规则数据：载入变换（+0x08 为 0 取 0x380、+0x2C 为 ±0 取 1.0）、DFPG 平方阈值、支持范围内脚本的结构，以及关键字表；内容结构检查仍由读取器完成。
- 计划新增 `src/core/rules/ai-support.ts`：按 D-01 定稿的规则，对选定配置（含五个名单项与无僚机）保守求出支持范围（记录、DFPG、内置处理器身份、脚本与操作码），覆盖选择 flag、直接安装、重装、晚到与动态创建；未映射的处理器身份或未支持的操作码以带路径的 `CoreInputError` 拒绝。
- 计划新增 `src/core/rules/ai-parameters.ts`：创建时不采样 RNG 地校验支持范围内参数的语法、关键字、随机区间支持集、除数与索引（例如 AICO 元素索引）。
- [create-world.ts](../../../../../src/core/world/create-world.ts) 调用上述检查；setupHash 覆盖完整内容（含新表）；调用者此后修改输入对象不影响世界。
- 测试：完全/部分匹配、内置回退、各名单项与无僚机、不可达项不要求语义、可达未支持项的拒绝路径、别名与 hash；期望独立推导。

## 不包含

- 程序选择的运行时抽取与安装（15）；解释器（16）。

## 关键文件与契约

- 已有：[rule-data.ts](../../../../../src/core/world/rule-data.ts)、[create-world.ts](../../../../../src/core/world/create-world.ts)、[create-world.test-support.ts](../../../../../src/core/world/create-world.test-support.ts)。
- 计划新增：`src/core/rules/ai-support.ts`、`src/core/rules/ai-parameters.ts` 及其测试。

## 写入范围

- `src/core/world/rule-data.ts`：静态 AI 数据。
- `src/core/world/rule-data.test.ts`：输入测试。
- `src/core/world/create-world.ts`：创建时检查。
- `src/core/world/create-world.test.ts`：创建测试。
- `src/core/world/create-world.test-support.ts`：合成 AI 输入。
- `src/core/rules/ai-support.ts`：支持范围（新建）。
- `src/core/rules/ai-support.test.ts`：测试（新建）。
- `src/core/rules/ai-parameters.ts`：参数检查（新建）。
- `src/core/rules/ai-parameters.test.ts`：测试（新建）。

## 验收标准

- [ ] AC-02：完整内容的结构检查保持；支持范围的语义校验与拒绝路径、错误类型正确；AI 检查本身不采样 RNG；五个名单项与无僚机都可创建世界。
- [ ] setupHash 覆盖完整 AI 内容；别名变更不影响世界。
- [ ] `pnpm exec vitest run src/core` 通过。

## 验证方法

- 合成内容的可达性、拒绝与 hash 测试；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
