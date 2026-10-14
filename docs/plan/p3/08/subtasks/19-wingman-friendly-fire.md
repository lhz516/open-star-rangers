---
type: plan
status: active
phase: P3
task: "08"
subtask: "19"
updated: 2026-10-14
---

# 19 — 僚机处理器与友伤累计

**契约来源：** [spec](../spec.md) 的 S-09、AC-07，AC-08 中友伤累计；[僚机](../spec.md#僚机)；04 的研究与 08、09 定稿。
**依赖：** 16, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-wingman.ts`：内置僚机处理器 `0x610c8` 及子处理器（编队、跟随、交战、返航、友伤后的模式变化、`0x63c00` 的随机插值、AICO 元素），按 04 的结论与 01 确认的各内置程序参数；接入 15 的分派。
- 友伤累计：按 09 定稿在 [damage.ts](../../../../../src/core/systems/damage.ts) 的 `0x3c208` 原版调用点写入累计与窗口（原始伤害、攻击者分类、严格比较），每次伤害只累计一次；其余通讯反应仍归 P3-10。
- 无僚机配置下没有僚机实体、控制器与回复；世界级公共状态保持合法初值。
- 测试：各行为转换的条件与边界、编队相对位置、导弹发射与锁定字节、友伤窗口的等号与跨阈值、新世界与无僚机。

## 不包含

- 僚机命令（20）；停放处理器（21）；P3-10 的无线电与菜单。

## 关键文件与契约

- 已有：[damage.ts](../../../../../src/core/systems/damage.ts)。
- 计划新增：`src/core/rules/ai-wingman.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-wingman.ts`：僚机处理器（新建）。
- `src/core/rules/ai-wingman.test.ts`：测试（新建）。
- `src/core/systems/damage.ts`：友伤累计调用点。
- `src/core/systems/damage.test.ts`：测试。
- `src/core/systems/ai.ts`：接入。
- `src/core/systems/ai.test.ts`：集成测试。

## 验收标准

- [ ] AC-07 的各项由测试覆盖；友伤累计来自原始伤害调用点且只累计一次。
- [ ] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 测试，期望由 04 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
