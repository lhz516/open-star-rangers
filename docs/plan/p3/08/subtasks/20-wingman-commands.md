---
type: plan
status: active
phase: P3
task: "08"
subtask: "20"
updated: 2026-10-15
---

# 20 — 僚机命令

**契约来源：** [spec](../spec.md) 的 S-10、AC-08；[僚机命令](../spec.md#僚机命令)；04 的研究与 08、09 定稿。
**依赖：** 19, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-commands.ts`：`0x61f20` 对码 1–7 的效果、拒绝与查询，由活动（`0x610c8`）与停放（`0x62250`）两条路径调用。
- 僚机命令请求（消息 0x100）由 P3-10 的 `deliver-command`（[P3-02 CB-08](../../02/spec.md)）在请求处理中写入待处理命令单槽，已实现；本子任务只实现僚机对单槽的消费（活动 `0x614a8`、停放 `0x61f20`）、结果事实与经 P3-10 `queueLine` 的回复，并按 [CR-28](../../02/spec.md#cr-28-僚机命令与回复的接口d-03) 承担菜单到回复的联合测试；覆盖、同 tick 重复、消费前僚机或目标失效与玩家换目标按 08 定稿。
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
- `src/core/replay/compare.test.ts`：停放码 4 的回复线号（同码 3，WB4、CR-22）。

## 验收标准

- [x] AC-08 的各项由契约测试覆盖；菜单结果与僚机事实分开，不对未消费的命令伪造成功。
- [x] `pnpm exec vitest run src/core src/app/runtime` 通过。

## 验证方法

- Node 契约测试，期望由 04 的记录独立推导；完成证据注明它不是生产菜单或标准录制的验证。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：** [ai-commands.ts](../../../../../src/core/rules/ai-commands.ts) 的 `consumeActiveCommand`（`0x614a8`，WB3）与 `consumeParkedCommand`（`0x61f20`，WB4，停放码 4 同码 3、码 2 不改状态）：阻塞待处理（活动：无玩家或累计值 > AICO +0x28；停放：只看累计值）时保留单槽、不回复、无事实；消费时按码执行效果，经回调请求回复线号，清除单槽，返回事实字段。玩家、PT、目的地与船体都在消费时读取。[ai.ts](../../../../../src/core/systems/ai.ts) 把两个消费者接入 19 的 `WingmanCall.consumeCommand`（第 2 步，周期行为之前）与 21 的 `ParkedCall.consumeCommand`，回复调用 P3-10 的 `queueLine`（CB-06），随后发出 `wingman-command-consumed`（CR-22；同一僚机依次为 `radio-queued`、事实）。`queueLine` 直接从世界 RNG 抽取，所以僚机处理器由“每次调用一个 RandStream、调用后回写”改为与停放处理器相同的逐次抽取（`worldRand`），使回复的抽取落在原版位置；既有的 ai、ai-wingman、ai-parked 测试不变而通过（抽取序列相同）。`domain-events.ts`、`compare.ts`、`game-event-bus.ts` 的事件与字段已由 08 交付，未改动形状。
- **修正 12 的回复表：** `WINGMAN_REPLIES` 的停放码 4 原为 `{ applied: 0x14, refused: null }`，与 WB4（码 4 等同码 3，回复 0xE）及 P3-02 CR-22 的结果映射（停放列“同码 3”）矛盾，会使比较器拒绝正确的停放码 4 事实；改为 `{ applied: 0xe, refused: null }`，[compare.test.ts](../../../../../src/core/replay/compare.test.ts) 的对应一行同步（协调者批准的写入范围扩展）。
- **规则测试：** [ai-commands.test.ts](../../../../../src/core/rules/ai-commands.test.ts)（19 项），期望按 WB3/WB4 的表独立写出，每个结果另以 `isWingmanCommandReply` 校验：活动的阻塞（无玩家、阈值以上；等号执行）、码 1（解除“勿攻击”；缺失、已移除、`0x206c07f` 的种类与僚机自身被拒）、码 2（无种类检查、b 不变；无 PT 或为僚机被拒）、3、4（applied/fallback）、5、6（无目的地 0x15）、7（船体百分比 49/50/79/80/100/−1 的边界）、8、9、0xFFFFFFFF；停放的阈值阻塞且无玩家仍消费、码 1 无种类检查、码 2 只确认、码 3/4 相同且无玩家时 `replyLine` 为 null 不回复、码 5（第一个基地，含停放基地）、码 6（缺玩家或目的地 0x15）、≥ 8；回复先于清除；消费者本身不抽取。
- **契约与联合测试：** [ai-commands.test.ts](../../../../../src/core/systems/ai-commands.test.ts)（18 项）。(1) 内部请求替身：在真实 tick 的 `RequestQueue` 上于请求处理前投递 `deliver-command`（只作机制证据，不是 replay 录制）：同 tick 两条后写覆盖、只消费最后一条且只一次、`radio-queued` 紧接其前；投递给已移除的僚机被丢弃、存入后僚机被移除则无事实。(2) 回复抽取的位置：孪生世界对比——活动重装在同一调用中消费，回复取该调用的第一次抽取，总抽取数恰多 1；停放步的回复先于投放、搜索与末尾抽取，同样多 1（把僚机改回调用后回写的 RandStream 时此测试失败，已验证）；停放码 3/4 无玩家：一条 `refused`/null 事实、无 `radio-queued`、单槽清除，停放步照常继续（抽取数与 AI 状态与无命令时相同）。(3) 菜单链：菜单命令后僚机被移除无事实无回复；玩家的真实命中经 P3-07 伤害入口与 P3-10 的 `0x38f20` 累计（3 + 1 = 阈值时命令执行；再 +1 后命令保留 150 tick、无事实无回复、僚机愤怒；窗口结束后一次新命中使累计重置为 1，命令随即以 0xE 执行并结束愤怒）；基地接收者由 P3-10 回复、无僚机事实；无僚机配置时没有僚机类别与事实。(4) 联合录制：以正常 `TickInput` 的菜单命令（合成菜单另加 '8' → 码 8）录制一次运行：活动码 1（投递后下一 tick 玩家换目标，消费攻击新目标）、2、4、5、7、8、同批两条（3 后 7，只消费 7）、3；基地状态；地图选目的地后活动码 6 → Warp 离场 → 停放；停放码 7、2、8、6、4、3、5、1。核对每条事实恰一次、晚于投递、与同 tick 的 `command-delivered` 对应、结果与线号合法；每条事实前紧接 20985 表、僚机头像的 `radio-queued`，索引符合 WB5 的抽取；菜单 tick 每条命令恰一个 `command-result`、消费 tick 没有；各码在快照中的效果（目标、模式、“勿攻击”、目的地与船体百分比的状态线）；然后经 JSON 往返以未修改的 `replayRecord` 重放，结果相同且 `compareReplayResults` 一致。这不是生产菜单的浏览器闭环（P3-15），也不是原版对照。
- **检查：** `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；`pnpm exec vitest run src/core src/app/runtime`：3,702 通过，3 项失败均为 [31](./31-long-test-timeouts.md) 处理的超时（budget.test.ts 1 项、snapshot.test.ts 2 项），单独以 `--testTimeout=60000` 重跑 28/28 通过；`pnpm check` 在测试阶段只因同样 3 项超时失败（10,001 通过）。
- **rubber-duck：** 未发现阻断问题（两表、结果、事件次序与 `worldRand` 与 WB3/WB4、CR-22、CR-28 一致）；三项覆盖缺口（回复抽取位置、安装时消费、停放码 3/4 无玩家经真实封装）已补测试并通过。
- **simplify：** 联合录制改为单游标调度并只在需要读的 tick 取快照；`resolve` 返回 null 并删去包装函数；测试改用 `randValues`。跳过：把 `resolve`、`frames` 等合并到 ai-wingman.ts、ai-parked.ts、create-world.test-support.ts（不在写入范围）；把基地与解释器也改为 `worldRand`（改变本子任务之外的路径）；规则中的线号常量与 `WINGMAN_REPLIES` 由测试的 `isWingmanCommandReply` 校验相连，未合成一张表。
- **文档影响：** 无需更新。原版事实未变（WB1–WB6 已记录）；engineering 与 guides 不描述这些接缝，core.md 的僚机处理器与接缝由 [28](./28-docs-handoff.md) 承担；建议 28 一并记下：命令消费者在 ai.ts 接入、回复经 `queueLine`、僚机与停放处理器逐次抽取 RNG 的原因，以及 12 的停放码 4 修正。
