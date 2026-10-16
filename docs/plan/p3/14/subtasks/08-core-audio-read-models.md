---
type: plan
status: active
phase: P3
task: "14"
subtask: "08"
updated: 2026-10-15
---

# 08 — Core 音效所需只读输出

**契约来源：** [spec](../spec.md#共享契约修订p3-02) 的 S-04、S-06、AC-03、AC-05、AC-08、AC-13。
**依赖：** 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现获批 ThreatWarnings：not-implemented/ready、missileAimed/craftAttacking，读取武器锁定而非 AI 模式；位序号与掩码显式转换。
- 只补 06 批准的活动、状态、真实运动量或事件快照，覆盖无玩家、未就绪、停放/待移除、同帧来源消失和非连续放置。
- 必要的事件/录制结构变更同步校验、比较器、版本/预算与测试替身；纯投影变更不无故升级规则。

## 不包含

- 不实现 AI、地图/停靠规则，不增加播放状态、相机、RNG 抽取或采样内容；不读 DOM。

## 关键文件与契约

- 现有 [combat.ts](../../../../../src/core/projections/combat.ts)、[projection.ts](../../../../../src/core/projections/projection.ts)、[render-state.ts](../../../../../src/core/projections/render-state.ts)及 [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)。
- 现有 core/replay 校验与快照；新增辅助文件如确需由 06 的精确交接清单限定，不建立统一 schema。

## 写入范围

- `src/core/**/*.ts`：保守覆盖只读输出、必要生产点/版本及其受影响测试；不授权其他规则功能。
- `src/app/runtime/*.test*.ts`：必要事件 fixture 同步。
- `src/app/session/*.test*.ts`：必要读模型 fixture 同步。
- `docs/engineering/modules/core.md`：新增 API 与版本说明。

## 验收标准

- [ ] warnings 的目标/武器锁定条件、未就绪/无玩家均正确，输出冻结且脱离内部对象。
- [ ] 重复读取不改变世界、RNG、事件与哈希；新增事件带足够快照，不靠当前实体查找。
- [ ] 版本、读取器、比较器和旧记录拒绝与获批变化一致；相关测试及 pnpm check 通过。

## 验证方法

- 合成世界的正反边界、连续读取、旧版本与 JSON 往返；先 `pnpm test -- src/core/projections src/core/contracts src/core/replay`，再 `pnpm check`。
- 对本项实现调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，范围仅限本项输出与回归；不作浏览器或原版运行验收。

## 完成证据
