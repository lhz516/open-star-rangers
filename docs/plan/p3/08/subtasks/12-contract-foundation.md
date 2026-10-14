---
type: plan
status: active
phase: P3
task: "08"
subtask: "12"
updated: 2026-10-14
---

# 12 — 契约基础

**契约来源：** [spec](../spec.md) 的 S-01、AC-01、AC-11；[共享契约修订](../spec.md#共享契约修订p3-02)；08 定稿的 [P3-02 修订](../../02/spec.md)。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 的定稿实现共享形状，不实现规则：
  - [entity-table.ts](../../../../../src/core/world/entity-table.ts)：`AiMode` 扩展、AI 控制器的封闭联合、待处理命令单槽，实体校验与复制；
  - [world-state.ts](../../../../../src/core/world/world-state.ts)：脚本解析缓存、执行实例、友伤累计、对象集合与可见性历史的状态及新世界初值；
  - [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)：D-01 定稿的新事件与原因；
  - [pipeline.ts](../../../../../src/core/systems/pipeline.ts)：`Request` 联合加入新请求的形状（处理器由各规则子任务接入，未接入的请求类型不能被投递）；
  - [limits.ts](../../../../../src/core/contracts/limits.ts)：定稿的预算及推导注释；
  - [snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)：新状态的写入与新事件的字段表；
  - [rules-version.ts](../../../../../src/core/replay/rules-version.ts)：`RULES_VERSION` 相对实现时的当前值递增一次，快照格式按状态形状递增；此后本 goal 内的规则变化沿用这一版本；
  - [game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts)：`EVENT_TYPES` 同步新事件。
- 测试：形状校验、快照写入与冻结、比较器字段、旧规则版本 replay 拒绝；更新随已批准变化而改变的旧断言，保留纯度、原子拒绝与冻结不变量。

## 不包含

- 任何 AI 规则（14 起）；内容导入（13）。

## 关键文件与契约

- 见工作范围中的现有文件；全部为已有文件，测试与源码相邻。

## 写入范围

- `src/core/world/entity-table.ts`：控制器与模式。
- `src/core/world/entity-table.test.ts`：形状与复制测试。
- `src/core/world/world-state.ts`：世界级 AI 状态。
- `src/core/contracts/domain-events.ts`：新事件。
- `src/core/contracts/domain-events.test.ts`：事件测试。
- `src/core/contracts/limits.ts`：预算。
- `src/core/contracts/limits.test.ts`：预算测试。
- `src/core/systems/pipeline.ts`：请求联合。
- `src/core/replay/snapshot.ts`：快照写入。
- `src/core/replay/snapshot.test.ts`：快照测试。
- `src/core/replay/compare.ts`：事件字段表。
- `src/core/replay/compare.test.ts`：比较测试。
- `src/core/replay/rules-version.ts`：版本递增。
- `src/core/replay/replay.test.ts`：旧版本拒绝。
- `src/app/runtime/game-event-bus.ts`：事件类型清单。
- `src/app/runtime/game-event-bus.test.ts`：清单测试。

## 验收标准

- [ ] AC-01 的类型、校验、序列化、比较器一致；版本按实际变化递增；旧规则的 replay 拒绝且不执行。
- [ ] 新状态都进入快照，无开放字段；既有不变量的测试通过。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 受影响测试文件先跑，再跑上列命令；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
