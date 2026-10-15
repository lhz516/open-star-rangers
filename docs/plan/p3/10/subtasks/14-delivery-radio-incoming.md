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
**依赖：** 02, 07, 13, 29。
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
- `src/core/systems/energy.test.ts`：页 5 的测试前置条件随 CB-09 更新（仅测试）。

## 验收标准

- [x] AC-04：投递、接收与回复分开；同 tick 重复写、接收前失效、覆盖/清除语义与回复的所有分支；accepted 不等于已执行，僚机未接入 AI 时不伪造确认。
- [x] AC-05（规则部分）：队列排序与 FIFO、每 tick 至多一项、门禁、回调与清空按 D-03；菜单 → 来电 → 恢复、Warp 遮盖、说话者移除、迟到回复、当前消息被清空；队列 limit/limit+1 不静默丢消息。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 多 tick 消费者测试只用 step 返回值与 projection，不靠事件累积重建状态。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [rules/radio.ts](../../../../../src/core/rules/radio.ts)（插入位置、`0x3336c`、查找 `0x3c618`、头像 `0x3c91c`、e 与播放帧）；[systems/radio.ts](../../../../../src/core/systems/radio.ts)（`queueRadio`、`queueMessage`、`queueLine`、`speakerFace`、`flushRadio`、`communications-reply` 阶段的取出、`frame-end` 末尾的通讯呈现子步与 `docking-reply` 回调）；[base-response.ts](../../../../../src/core/systems/base-response.ts)（`0x3bed0` 的码 7、9 与其他码的清除，导出 RQ2 威胁检查 `threatened`）；[communications.ts](../../../../../src/core/systems/communications.ts) 的 `deliverCommand`；[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 接入 `deliver-command`、`0x3bed0`（状态 7 的 craft 更新末尾）与 `communications-reply`；[displays.ts](../../../../../src/core/systems/displays.ts) 的 `setLeftPage`（无命令写页只在改变时发事件）、页 5 无播放时回到 0 的处理器与呈现子步。
- **AC-04：** [base-response.test.ts](../../../../../src/core/systems/base-response.test.ts) 用正式 step 逐 tick 验证停靠链：按键 tick 1 只有命令结果、`docking-requested` 与请求处理中的 `command-delivered`；tick 2 基地更新入队（队首、`docking-reply`、头像为第一次抽取 rand % 5，恰一次抽取）并在同 tick 取出；tick 3 可见（页 0→5）；20 个 1/8 秒后的 tick 83 结束、页恢复、回调使子状态 3→4、期限 = 166 + 0x200（RQ6 的形式，载入一 tick）。另覆盖：状态查询（20011 序号 1/4，`0x87c` 为 20019 序号 0/1 与 3 头像池）、同 tick 两次投递后写覆盖先写（两条 `command-delivered`、只回复码 9）、请求处理前接收者被移除则不写不发、其他非 0 码只清除不抽取、状态非 7 保留码、停放的基地照常回复、查找失败不入队但清码、头像只抽一次、威胁检查的严格半径、被毁/状态 0/友方种类不算、状态 4 与停放算、旧戳保留、无序距离算近；僚机码 3 保存多 tick 无事件、再次投递覆盖（P3-08 未接入，R-12 未验收，不伪造确认）。
- **AC-05（规则部分）：** [radio.test.ts](../../../../../src/core/systems/radio.test.ts) 与 [rules/radio.test.ts](../../../../../src/core/rules/radio.test.ts)：按到期插入、同刻 FIFO、停靠回复入队首；4,096 项通过、第 4,097 项为 `budget-exhausted`（`radio.queue`）且不丢；每 tick 至多取一项、通道忙与非到期队首阻止取出、之后阶段入队的项下一 tick 取出；可见/结束/页保存恢复（144 单位的 5+8+5）；Warp 视角 `shown: false` 不写页仍执行回调；回调只在子状态 3 生效（迟到回复不动 0、4、5），旧请求的回复推进当前等待且不核对回复者；菜单→来电（数字为 wrong-context）→恢复页 2 与菜单键；`c` 于页 5 保存 5、结束不恢复、关闭回到无条目的页 5 后同 tick 处理器设页 0，字段 13 为 2 或非驾驶舱视角时保留；说话者移除后以快照播放；清空入口的 playing（先恢复保存页再页 0、不执行回调）、loading（取消后不再开始）与页已为 0 时无页事件；`queueLine` 的无效说话者/头像越界不抽取、各类型的抽取与序号、类型 8 的 `music-step`。多 tick 断言只用 step 返回值与世界状态（`communications` 分区归 19，尚未就绪）。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（2,535 通过）；`pnpm check`（typecheck、lint、全部 Vitest、build）通过。
- **与旧验收措辞的差异：** “回复的所有分支”中 `0x3bed0` 无命令时的威胁重报（结束于 `0x3c208` 第 3 步）经协调者决定（goal 分支 fab007e8）归 15，其写入范围已加入 `base-response*.ts`；在 15 集成前该分支不执行。RQ5 的逐帧消耗按 CB-09 的累计形式实现（基准 5+8+5 于 144 单位结束）。入队到期取调用时的取样（`world.clock`，在 `mission-flow` 中仍为上一 tick 的值，C3），供 P3-11 在 `mission-flow` 入队。
- **rubber-duck：** 无阻塞问题；一项非阻塞：`queueRadio` 原用本 tick 时钟，自 `mission-flow` 调用时会偏后，已改为 `world.clock` 并加测。
- **simplify：** 合并 `hasKind` 为 `rules/radio.ts` 的单一导出，`answersCommands` 并入 `answerCommand`。未采纳：入队时存帧时长或去掉 `readyTick`（与 CB-05 的状态形状不符）、删去 `playbackFrame` 的帧序号（供 19 的 `frame`）、拆出独立的 frame-end 阶段（CB-09 定在 `frame-end` 内，阶段表不变）、`withRand` 移入共享模块（超出写入范围）。
- **文档影响：** 需更新 [Core 模块说明](../../../../engineering/modules/core.md)的阶段表第 5 行（`communications-reply` 已由 `radio.ts` 实现），不在本项写入范围，已交协调者；原版事实与 unknowns 无新增。
