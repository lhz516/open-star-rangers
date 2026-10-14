---
type: plan
status: active
phase: P3
task: "08"
subtask: "22"
updated: 2026-10-14
---

# 22 — Xpon 与 b 键

**契约来源：** [spec](../spec.md) 的 S-02（`b` 的绑定）、S-12、AC-10；[Xpon 与 `b`](../spec.md#xpon-与-b)；06 的研究与 08、09 定稿。
**依赖：** 09, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/systems/xpon.ts`：种类 `0x4000` 的回调 `0x3897c`，接入 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `updateObject`。
- 若 09 批准纳入 `b`：
  - Core：[tick-input.ts](../../../../../src/core/contracts/tick-input.ts) 加入 08 定稿的命令，[commands.ts](../../../../../src/core/systems/commands.ts) 判定门禁与原因，请求处理以 `0x38780` 的规则创建无声明来源的种类 `0x4000` 对象（[spawn.ts](../../../../../src/core/systems/spawn.ts) 的实例化辅助、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts) 的来源形状），`lastParkedUpdateClock` 取创建时钟；
  - 输入：[bindings.ts](../../../../../src/ui/game-input/bindings.ts) 按 P3-05 修订的绑定表加入 `KeyB`，经现有输入源、清键与菜单捕获；同步[键位文档](../../../../engineering/keyboard-input.md)。
- 若不纳入：完成证据记录 09 的批准与依据，不改命令与绑定。
- 测试：Xpon 回调；`b` 的门禁、次数、初值、事件、容量与生命周期；绑定的修饰键、重复、上下文与清键。浏览器触发归 24。

## 不包含

- 迷雾与 Xpon 的视野（P3-09）；`transponder-created` 音效（P3-14）。

## 关键文件与契约

- 已有：见工作范围中的链接。
- 计划新增：`src/core/systems/xpon.ts` 及其测试。

## 写入范围

- `src/core/systems/xpon.ts`：Xpon 回调（新建）。
- `src/core/systems/xpon.test.ts`：测试（新建）。
- `src/core/systems/pipeline.ts`：回调接入与创建请求。
- `src/core/systems/commands.ts`：`b` 的判定。
- `src/core/systems/commands.test.ts`：测试。
- `src/core/systems/spawn.ts`：动态创建的实例化辅助。
- `src/core/contracts/tick-input.ts`：命令。
- `src/core/contracts/tick-input.test.ts`：测试。
- `src/core/contracts/domain-events.ts`：无声明来源的形状。
- `src/ui/game-input/**`：绑定与输入测试。
- `docs/engineering/keyboard-input.md`：绑定说明。

## 验收标准

- [ ] AC-10 的 Node 部分由测试覆盖；纳入或排除 `b` 都有 09 的批准与依据。
- [ ] `pnpm check` 通过。

## 验证方法

- Node 规则与绑定、Runtime 集成测试，期望由 06 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
