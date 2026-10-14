---
type: plan
status: active
phase: P3
task: "10"
subtask: "14"
updated: 2026-10-14
---

# 14 — 命令投递、基地回应、无线电队列与来电页

**契约来源：** [spec](../spec.md) 的 S-03、S-04、AC-04、AC-05；[命令投递与回应](../spec.md#命令投递与回应)、[无线电队列与通讯反应](../spec.md#无线电队列与通讯反应)；D-03 定稿。
**依赖：** 02, 07, 13。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 请求处理中的命令投递（写对象 +0x184，覆盖、失效与清除按 Q-02）；基地在 Q-03 核实的调用位置读取命令码并回应 7、9，回复选择与抽取按 Q-03。
- 无线电队列：按到期排序、同刻先进先出、项目上限（超出为故障）；`communications-reply` 阶段每 tick 至多取一项，流程与逻辑通道门禁、回调时刻、来电页 5 的进入与结束（保存页与菜单/Warp 页区分）按 D-03；队列清空入口及其左页作用（供 P3-11 调用，本项只测入口）。
- 消息身份带说话者快照，说话者移除后仍可解析；事件区分投递、回复取出与回调。
- 僚机命令码 1–7 只保存，不伪造效果。

## 不包含

- 伤害与实例化中的反应（15）；停靠子状态（16）；分区就绪内容（19）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `communications-reply` 阶段与请求处理；基地回应所在的对象更新位置按 Q-03。
- 计划新增：`src/core/rules/radio.ts`（队列与通道的纯规则）、`src/core/systems/radio.ts`（阶段与入队入口）、`src/core/systems/base-response.ts`（`0x3bed0` 的通讯部分）及测试。

## 写入范围

- `src/core/rules/radio*.ts`、`src/core/systems/radio*.ts`、`src/core/systems/base-response*.ts`：计划新增。
- `src/core/systems/communications*.ts`：投递后的菜单关闭与事件。
- `src/core/systems/pipeline*.ts`：阶段与请求处理接入。
- `src/core/rules/displays*.ts`、`src/core/systems/displays*.ts`：页 5 的保存与恢复。

## 验收标准

- [ ] AC-04：投递、接收与回复分开；同 tick 重复写、接收前失效、覆盖/清除语义与回复的所有分支；accepted 不等于已执行，僚机未接入 AI 时不伪造确认。
- [ ] AC-05（规则部分）：队列排序与 FIFO、每 tick 至多一项、门禁、回调与清空按 D-03；菜单 → 来电 → 恢复、Warp 遮盖、说话者移除、迟到回复、当前消息被清空；队列 limit/limit+1 不静默丢消息。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 多 tick 消费者测试只用 step 返回值与 projection，不靠事件累积重建状态。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
