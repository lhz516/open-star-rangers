---
type: plan
status: active
phase: P3
task: "02"
subtask: "08"
updated: 2026-10-09
---

# 08 — 正式快照、哈希、录制、replay 与比较

**契约来源：** [spec](../spec.md) 的 S-08；AC-11、AC-12；[快照、哈希与 replay](../spec.md#快照哈希与-replay)、[持久化与兼容](../spec.md#持久化与兼容)、技术决定 9、10。
**依赖：** 07。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **快照：** `snapshot()` 返回深度冻结的 `{ format: 'osr-game-snapshot', version: 1, rulesVersion: 1, state }`。`state` 包含：完整内容身份、任务 Asset、`setupHash`、原始难度、组、槽位、僚机、种子、每 tick 单位数；tick、时钟、RNG 状态、下一个实体 ID；实体与各种类表的次序；生成队列与开关、缺省后的运行记录及别名关系、声明与编组的计数和当前对象关联、名称占用；任务状态与玩家状态。静态 `MissionSetup` 不复制。故障锁存后拒绝快照。不提供从快照恢复世界。
- **规范文本与状态哈希：** 用 04 的写入器按规范字段次序序列化；实体按 ID 排序，有语义的列表保留次序；状态哈希为 16 位小写十六进制。
- **录制：** 录制会话的行为与世界相同，另记录每个成功 tick 实际交给 `step` 的规范输入、全部事件与检查点：tick 0、`checkpointInterval` 的每个正整数倍与最后一个 tick（去重）；零 tick 录制也有 tick 0 检查点。导出深度冻结且脱离世界。预计超出录制容量时在执行下一 tick 前拒绝，世界与录制不变；故障后导出报告失败，不输出貌似完整的前缀。
- **replay 记录：** `{ format: 'osr-game-replay', version: 1, rulesVersion: 1, producer, content, mission, setupHash, run, checkpointInterval, ticks }`；`content` 为完整 `ContentIdentity`，用 `contentIdentityKey` 比较；`producer` 为非空、有长度上限的应用版本标识，只作诊断；`run` 为含默认值的有效配置；`ticks` 为稠密数组。
- **replay：** 先校验整份记录与输入边界，再在独立世界中执行；未知格式或版本、`rulesVersion` 不符、内容身份或 `setupHash` 不同、任务或配置不同、字段不合法或超限都抛出 `CoreInputError`，不返回部分结果。结果为 `{ events, checkpoints, finalTick }`。
- **比较：** 校验 expected 与 actual 后返回 `{ match: true }` 或 `{ match: false, tick, kind }`，`kind` 为 `events`、`checkpoint` 或 `length`；规则按 spec：共有 tick 内先比事件再比检查点；较短运行末帧单独附加的尾检查点不误判；共有部分一致而长度不同时在较短运行的首个缺失 tick 报告 `length`。只报告最早可观测分歧。
- **版本：** `rulesVersion` 由代码持有；在 Core 模块说明（11）中写明何时必须递增。
- **测试：** 快照逐字段代表性变更改变规范文本（不宣称哈希无碰撞）；字段插入次序无关；JSON 往返后 replay 的事件与全部检查点相同；零 tick、末 tick 去重、间隔大于 1、超限前原子拒绝与故障导出；篡改输入后的分歧定位，以及无可观测影响时不强求分歧；未知版本、坏 expected/actual、同一内容身份但改了 setup、错任务或配置、超限记录均被拒绝；固定的一组种子证明随机分支被使用。

## 不包含

- replay 文件的下载、保存与浏览器录制（P3-04）；存档与恢复（P4）。
- 合成快照与 replay 格式（保持不变）。

## 关键文件与契约

- [synthetic-replay.ts](../../../../../src/core/synthetic/synthetic-replay.ts)：比较算法可借鉴，但不复用为正式格式，也不从正式模块导入。
- [content-identity.ts](../../../../../src/content/content-identity.ts)：`contentIdentityKey`。
- 04 的规范文本与上限；05、07 的世界状态。
- 计划新增：`src/core/replay/snapshot.ts`、`recording.ts`、`replay.ts`、`compare.ts` 及相邻测试（文件名可调整，职责不变）。

## 写入范围

- `src/core/replay/**`：快照、录制、replay 与比较及测试（新建）。
- `src/core/world/**`：为快照暴露内部状态的只读访问（如需要）。

## 验收标准

- [ ] AC-11：快照规范文本包含全部可影响未来结果的状态；逐字段变更的测试通过；插入次序无关；语义列表次序保留；转义与哈希格式符合契约。
- [ ] AC-12：JSON 往返后 replay 一致；录制边界与原子拒绝；比较报告最早可观测的 events/checkpoint/length 分歧；各类无效记录与伪造 setup 被拒绝且不输出成功前缀；种子集覆盖随机分支。
- [ ] 故障锁存后快照与录制导出按契约拒绝。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- Vitest 单元测试（Node，合成逻辑内容与固定种子集）；内容身份与 setup 的绑定用伪造的同身份不同 setup 测试。
- 不涉及浏览器或原版对照。

## 完成证据
