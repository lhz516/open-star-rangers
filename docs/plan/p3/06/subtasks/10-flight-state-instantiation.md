---
type: plan
status: active
phase: P3
task: "06"
subtask: "10"
updated: 2026-10-09
---

# 10 — 实体飞行状态、实例化与起飞初态

**契约来源：** [spec](../spec.md) 的 S-05（最高速度）、S-07、S-08；AC-04（最高速度与初速部分）、AC-06（状态保存与抽取部分）、AC-07（合成部分）、AC-08（快照部分）；[速度与油门](../spec.md#速度与油门)、[起飞初始状态](../spec.md#起飞初始状态)；D-02、D-03 与检查点 A 定稿的形状。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **实体与玩家状态（D-02、D-03）：** 按检查点 A 的封闭形状在 `Entity`/`EntityInit` 加入 `maximumSpeed`、`lastParkedUpdateClock`、可空移动块与 `warpClock`（若 A 定为由本任务接入）；在 `PlayerState` 加入控制状态与目标引用。不加入未经定稿的字段。
- **最高速度（`0x30e0c`）：** 纯函数，覆盖 M-04 的全部已确认分支；在实例化扩展点的 `0x3060c` 位置写入。玩家分支的能量量与子系统状态在 P3-07 交付前使用实例化时的原版操作数，并以 `speedLimitStatus: 'initial-only'` 的依据标明，不伪称动态上限已就绪。
- **初始移动块（`0x2c3b0`）：** 实例化为活动时创建（模式、油门 0x80、对应初速）；恢复活动时的重建由 14 调用同一函数。
- **计时字段：** 停放更新时刻在实例化时写入；`warpClock` 的实例化抽取按[实例化](../../../../original/formats/executable.md#instantiation-p3-0203)第 12 步的位置与世界 RNG 次序，不提前或重复抽取。
- **起飞初态：** 玩家的移动块、控制状态（油门、速度辅助、自动匹配）与目标引用按 M-09 与检查点 A 定稿，不预设目标为 null。
- **快照：** 快照写入器覆盖全部新字段（映射类型强制）；逐字段的代表性改动改变规范文本。
- **测试：** 最高速度各分支与输入边界；初速；停放时刻与 Warp 计时的写入与抽取次序；起飞初态在“实例化完成”与“首次活动”两个时刻的值（首次运动由 11 覆盖）；快照覆盖。

## 不包含

- 运动阶段（11）；命令与操纵（12）；匹配与辅助（13）；停放切换与重建的调用（14）；projection（15）。
- 能量与子系统状态的变化（P3-07）。

## 关键文件与契约

- [entity-table.ts](../../../../../src/core/world/entity-table.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[spawn.ts](../../../../../src/core/systems/spawn.ts) 的实例化扩展点、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)。
- 计划新增：`src/core/rules/flight-state.ts`（最高速度、初始移动块等纯函数）及相邻测试。
- 03、05 的完成证据与检查点 A 定稿。

## 写入范围

- `src/core/world/**`：实体、玩家状态与相关测试。
- `src/core/systems/spawn*.ts`：实例化扩展点与测试。
- `src/core/rules/**`：飞行状态纯函数（新建）与测试。
- `src/core/replay/snapshot*.ts`：快照写入器与测试。

## 验收标准

- [ ] 实体与玩家状态的字段与检查点 A 的形状一致，没有开放对象或未定稿字段。
- [ ] AC-04（部分）：最高速度对每个种类与玩家分支的输入正确，上限降低与恢复按 M-04；初始移动块为模式、油门 0x80 与对应初速。
- [ ] AC-06（部分）：停放时刻与 Warp 计时的保存与抽取正确，抽取次序符合扩展点顺序。
- [ ] AC-07（合成部分）：起飞初态在两个时刻符合 M-09；目标初值有依据。
- [ ] AC-08（部分）：快照覆盖全部新状态，代表性改动改变规范文本。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 单元测试；期望由原版公式独立推导，原版参数不写进 fixture。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据
