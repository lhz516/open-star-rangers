---
type: plan
status: active
phase: P3
task: "08"
subtask: "16"
updated: 2026-10-14
---

# 16 — 解释器与脚本

**契约来源：** [spec](../spec.md) 的 S-05、AC-04、AC-17（执行预算）；[解释器与脚本](../spec.md#解释器与脚本)；02 的研究与 08 定稿。
**依赖：** 15, 17, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-script.ts`：脚本载入、参数解析（区间、随机符号、缩放、关键字查值、可选值）与世界级解析缓存的使用计数；释放与最后释放后的重新解析；解析的抽取发生在原版载入时刻。
- 计划新增 `src/core/rules/ai-interpreter.ts`：表程序处理器 `0x64cb8`：安装路径 `0x64b54`、状态机 `0x64d58`（空/单/多项列表）、执行器 `0x5f4f4` 与支持范围内每个操作码；驾驶、目标与开火类操作码调用 17、18 的原语，不另写规则。
- 执行实例（游标、等待、返回栈）每个对象私有；按 08 定稿的指令步、栈与缓存预算，超限锁存 `CoreFaultError`，不靠宿主时间、不静默截断或额外让出；错误与事件不回显参数原文。
- `src/core/systems/ai.ts`（15 新建）中接入表程序处理器。
- 测试：每个可达状态转换与操作码的独立期望；两个对象共享解析、不共享执行状态；换脚本、安装、停放、被毁、移除的引用平衡；参数边界；预算的 limit 与 limit + 1。

## 不包含

- 驾驶、目标与开火原语（17、18）；僚机与停放处理器（19、21）。

## 关键文件与契约

- 计划新增：`src/core/rules/ai-script.ts`、`src/core/rules/ai-interpreter.ts` 及其测试。
- 已有内容类型：[ai-programs.ts](../../../../../src/content/rule-data/ai-programs.ts) 的 `AiScriptEntry`、`AiParameterEntry`。

## 写入范围

- `src/core/rules/ai-script.ts`：载入与解析（新建）。
- `src/core/rules/ai-script.test.ts`：测试（新建）。
- `src/core/rules/ai-interpreter.ts`：解释器与操作码（新建）。
- `src/core/rules/ai-interpreter.test.ts`：测试（新建）。
- `src/core/systems/ai.ts`：接入。
- `src/core/systems/ai.test.ts`：集成测试。

## 验收标准

- [ ] AC-04 的各项由独立期望的测试覆盖；若聚合原版条目计数，附等价依据。
- [ ] AC-17 的执行预算部分：循环或递归脚本不能使 tick 卡住，超限故障锁存且不发布部分结果。
- [ ] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 规则、缓存与生命周期测试，期望由 02 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
