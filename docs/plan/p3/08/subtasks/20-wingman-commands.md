---
type: plan
status: active
phase: P3
task: "08"
subtask: "20"
updated: 2026-10-14
---

# 20 — 僚机命令

**契约来源：** [spec](../spec.md) 的 S-10、AC-08；[僚机命令](../spec.md#僚机命令)；04 的研究与 08、09 定稿。
**依赖：** 19, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-commands.ts`：`0x61f20` 对码 1–7 的效果、拒绝与查询，由活动（`0x610c8`）与停放（`0x62250`）两条路径调用。
- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的请求处理接入僚机命令请求（消息 0x100），写入待处理命令单槽；覆盖、同 tick 重复、消费前僚机或目标失效与玩家换目标按 08 定稿。
- 按 08 定稿发出僚机命令的结果与回复事实（与菜单的 `command-result` 分开），在原版回复位置交出，跨 tick 关联不读已移除实体；[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts) 如需同步，在此完成。
- 测试：在既有 `TickContext`/`RequestQueue` 上模拟投递，经真实请求处理与 AI 消费；不增加生产注入 API，测试不作为标准 replay 证据。

## 不包含

- 菜单与回复队列（P3-10）；正式 replay 的菜单命令验证（P3-10 联合）。

## 关键文件与契约

- 已有：[pipeline.ts](../../../../../src/core/systems/pipeline.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)。
- 计划新增：`src/core/rules/ai-commands.ts` 及其测试、`src/core/systems/ai-commands.test.ts`（契约测试）。

## 写入范围

- `src/core/rules/ai-commands.ts`：命令效果（新建）。
- `src/core/rules/ai-commands.test.ts`：测试（新建）。
- `src/core/systems/ai-commands.test.ts`：请求到消费的契约测试（新建）。
- `src/core/systems/pipeline.ts`：请求处理。
- `src/core/systems/ai.ts`：消费时机。
- `src/core/contracts/domain-events.ts`：事件（按 08 定稿）。
- `src/core/replay/compare.ts`：事件字段。
- `src/app/runtime/game-event-bus.ts`：事件类型清单。

## 验收标准

- [ ] AC-08 的各项由契约测试覆盖；菜单结果与僚机事实分开，不对未消费的命令伪造成功。
- [ ] `pnpm exec vitest run src/core src/app/runtime` 通过。

## 验证方法

- Node 契约测试，期望由 04 的记录独立推导；完成证据注明它不是生产菜单或标准录制的验证。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
