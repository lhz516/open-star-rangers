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

- [ ] 字段正确、深冻结脱离世界；重复 projection 不改变状态/RNG。
- [ ] 类型 0 与动态 maximumSpeed、无玩家与 false、目标缺失与无效内容不混同。
- [ ] 规则回归和当前版本 replay 通过，不支持版本明确拒绝。

## 验证方法

`pnpm test -- src/core/projections src/core/replay`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限只读事实，不改系统次序。

## 完成证据
