---
type: plan
status: active
phase: P3
task: "13"
subtask: "12"
updated: 2026-10-28
---

# 12 — Core 驾驶舱只读事实

**契约来源：** [spec](../spec.md#共享契约修订d-01) 的 S-01，AC-01/09/12。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 输出已有 statusDisplay.blink、标签 threatStamp、速度满刻度/机型引用、目标变体与必要运动事实。
- 字段来自真实权威状态，不重复写入 blink、不遍历全部 Render State 来补可见信息；不新增未确认规则。
- 补齐读取、null/无玩家/目标离场、救援和切页测试；序列化/规则版本只按 D-01 的实际影响处理。

## 不包含

不加入消息队列、SNIP、显示随机或 HUD 几何；FA-01/FA-02 的 P3-14 改动仍由其负责。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)、[combat.ts](../../../../../src/core/projections/combat.ts)、[map.ts](../../../../../src/core/projections/map.ts)。
- [player-state.ts](../../../../../src/core/world/player-state.ts)、[displays.ts](../../../../../src/core/systems/displays.ts) 作为只读事实来源。

## 写入范围

- `src/core/projections/*.ts`：类型、生产者和测试。
- `src/core/replay/*.ts`：仅 D-01 必需的版本/验证同步及不变性测试。
- `docs/engineering/modules/core.md`：读模型 API 与交接。
- `src/core/systems/displays.ts`、`src/core/systems/energy.ts`、`src/core/systems/damage.ts`、`src/core/systems/weapons.ts`、`src/core/systems/spawn.ts`、`src/core/systems/rescue.ts`：CK-01/CK-02 的写入次序与计数（08 增补）。
- `src/core/systems/*.test.ts`：上述系统的测试（08 增补）。
- `src/core/rules/displays.ts`、`src/core/rules/displays.test.ts`：CR-10 次序更正（08 增补）。
- `src/core/world/player-state.ts`、`src/core/world/player-state.test.ts`、`src/core/world/map-rule-data.ts`、`src/core/world/map-rule-data.test.ts`：状态字段与地图规则数据（08 增补）。
- `docs/original/formats/executable.md`、`docs/original/formats/hud.md`：仅记录 CK-02 写入分支与 `indicatorRates.row3` 初值的核对结论（08 增补）。
- `src/core/rules/radar.ts`、`src/core/rules/radar.test.ts`：`RadarContact.position` 的生成（12 的范围请求）。
- `src/core/rules/damage.ts`、`src/core/rules/damage.test.ts`：护盾吸收区分旁路以计能量页重画（12 的范围请求）。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`、`docs/guides/tools.md`：规则版本两位数带来的录制字节上限同步（12 的范围请求）。

## 验收标准

- [x] 字段正确、深冻结脱离世界；重复 projection 不改变状态/RNG。
- [x] 类型 0 与动态 maximumSpeed、无玩家与 false、目标缺失与无效内容不混同。
- [x] 规则回归和当前版本 replay 通过，不支持版本明确拒绝。

## 验证方法

`pnpm test -- src/core/projections src/core/replay`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限只读事实，不改系统次序。

## 完成证据

- **实现（CK-01 至 CK-05）：** `PlayerState.statusDisplay` 增加 `phaseFlipped`（初值 true）与 `rebuilds`，[systems/displays.ts](../../../../../src/core/systems/displays.ts) 的状态页步改为先在 `phaseFlipped` 或 `redraw` 时以当前相位写字段 1、5、8 并计数，再判定闪烁计时；新增 `energyPageRedraws`，计数点为实例化与救援、每次到期的玩家能量更新、被接受的档位键、护盾吸收的伤害（`absorbByShield` 改为返回 `{ hullDamage, taken }`，绕过不计）与每次炮击；计数超过安全整数为 `budget-exhausted`。projection 增加 CK-03 的全部字段（`RadarContact.position` 由 [radar.ts](../../../../../src/core/rules/radar.ts) 与 `offset` 同一读取；`ballistics` 用 `weaponRange`；`indicatorRates` 按 `0x21cf8`；`MapRuleData.sectors`）。`RULES_VERSION` 9 → 10，快照格式 8 → 9，replay 格式仍为 3；`RECORDING_MAX_BYTES` 随规则版本多一位改为 534,251,136（[tools.md](../../../../guides/tools.md) 同步）。
- **关卡核对（DC-13，只读静态分析，私有副本已删除）：** `0x30c60` 只在两条吸收分支对种类 1 置 +0x44，子系统 4 的绕过先返回；`0x30b20`/`0x30bc0` 只在新档位被接受时置位；`0x3071c` 在每次到期更新末尾置位；`0x30cec` 对种类 1 每次调用置位；`0x30d94` 与 `0x39820` 不置位（已确认，代码），记入 [hud §4.4](../../../../original/formats/hud.md#44-left-display-type-6) 与 executable D3。`0x21cf8` 两个分支都不成立（以及没有移动块）时返回 +0.0（已确认，代码），记入 [movement stage](../../../../original/formats/executable.md#movement-stage-and-integration-p3-0601)。
- **测试：** `pnpm test -- src/core/projections src/core/replay` 通过；`pnpm check` 通过（397 个测试文件、10,887 项测试、生产构建）。关键断言：D9 次序的翻转/写入/`redraw` 同 tick 连写两次、切页/字段 10 = 2/离开仪表视角期间待写并在恢复后以当时相位写入；各计数写入点与不计的分支（拒绝的档位键、换页、停靠、绕过、门禁、非玩家）；`recordMaximumSpeed` 与动态 `maximumSpeed` 分开，`indicatorRates` 的耦合、单次 f32 舍入与 +0 缺省；目标 `model`/`craftAt08` 对标记、导弹与种类 19 的取值；projection 深冻结、脱离世界、重复读取不改快照哈希与 RNG；快照规范文本与哈希包含新状态、版本为 9/10；四个 replay 的玩法摘要在排除三项新键后与改动前相同（CK-01 在这些运行中不改变规则结果），旧版本记录照常被拒绝。
- **Rubber-duck：** code-review 代理以 rubber-duck 角色审阅完整改动：误删的 energy.test `it.each` 已恢复；player-state 注释误称救援写 `redraw` 已更正（P3-02 的 CK-01 由协调者同步更正）；未发现正确性问题。Simplify：只读事实与计数点无可复用的既有辅助函数，未改动系统次序。
- **文档影响：** 更新 [core.md](../../../../engineering/modules/core.md)（玩家状态、projection、版本、交接）、tools.md、hud.md 与 executable.md；STATUS 与 tasks.md 无须改动。私有输出：`local/research/p3-13/12-core-hud/`（反汇编清单与检查日志）。
