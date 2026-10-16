---
type: plan
status: active
phase: P3
task: "08"
subtask: "19"
updated: 2026-10-15
---

# 19 — 僚机处理器与友伤累计

**契约来源：** [spec](../spec.md) 的 S-09、AC-07，AC-08 中友伤累计；[僚机](../spec.md#僚机)；04 的研究与 08、09 定稿。
**依赖：** 16, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-wingman.ts`：内置僚机处理器 `0x610c8` 及子处理器（编队、跟随、交战、返航、友伤后的模式变化、攻击航线 `0x63c00` 复用 16 新建的 `src/core/rules/ai-attack-pass.ts`、AICO 元素），按 04 的结论与 01 确认的各内置程序参数；接入 15 的分派。
- 友伤累计：按 09 定稿（[P3-02 CR-27](../../02/spec.md#cr-27-友伤累计的分工d-03)），写入留在 P3-10（`0x3c208` 第 1 步的 `0x38f20`，已实现于 [comm-reactions.ts](../../../../../src/core/systems/comm-reactions.ts)），本任务不写累计；实现读者 `0x38fd8` 的阈值判定（`accumulated` > AICO +0x28，等号不阻塞）与私有行为字节 b = 5，并在 P3-10 的写入上联合验证“命中 → 累计 → 愤怒”的完整链（每次伤害只累计一次）。
- 无僚机配置下没有僚机实体、控制器与回复；世界级公共状态保持合法初值。
- 测试：各行为转换的条件与边界、编队相对位置、导弹发射与锁定字节、友伤阈值的等号与跨阈值（合成累计值）、新世界与无僚机。

## 不包含

- 僚机命令（20）；停放处理器（21）；P3-10 的无线电与菜单；友伤累计的写入（P3-10，已交付）。

## 关键文件与契约

- 已有：[comm-reactions.ts](../../../../../src/core/systems/comm-reactions.ts)（P3-10 的 `0x3c208`，写入友伤累计；只读其结果，不改）。
- 计划新增：`src/core/rules/ai-wingman.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-wingman.ts`：僚机处理器（新建）。
- `src/core/rules/ai-wingman.test.ts`：测试（新建）。
- `src/core/systems/ai.ts`：接入。
- `src/core/systems/ai.test.ts`：集成测试（含友伤完整链的联合验证）。
- `src/core/systems/spawn.test.ts`：僚机安装镜像写入 +0xC4/+0x90 后的期望。

## 验收标准

- [ ] AC-07 的各项由测试覆盖；友伤累计来自原始伤害调用点且只累计一次。
- [ ] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 测试，期望由 04 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
