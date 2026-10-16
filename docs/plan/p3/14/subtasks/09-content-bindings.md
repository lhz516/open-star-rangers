---
type: plan
status: active
phase: P3
task: "14"
subtask: "09"
updated: 2026-10-15
---

# 09 — 同包声音绑定与输入校验

**契约来源：** [spec](../spec.md#触发表) 的 S-02、S-04、AC-02、AC-03。
**依赖：** 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 从同一包身份/代际读取 CraftTypeTable、模型 soundSlots、ExplosionTable 和 sound payload 记录，建立静态机型位序号绑定。
- 多个机型/EXPL 项共享 sound Asset 合法；空槽无声，非空缺引用/坏 schema/错类型/跨代包明确拒绝。
- EXPL 使用 lists[list - 1][item]，item 是原列表下标；事件来源已移除仍能解析种类对应声音。
- 沿用现有解析器与描述符绑定校验，不导入 original-data 或硬编码原版 locator。

## 不包含

- 不改内容 schema/转换器，不播放声音、不重新选择 EXPL；事件门禁归 15/16。

## 关键文件与契约

- 现有 [mission-input.ts](../../../../../src/app/resources/mission-input.ts)、[logic-content.ts](../../../../../src/content/logic/logic-content.ts)、[model-payload.ts](../../../../../src/content/models/model-payload.ts)可复用。
- 计划新增 `src/app/flight-audio/content.ts`、`content.test.ts` 与 `content.test-support.ts`，类型跟随该模块。

## 写入范围

- `src/app/flight-audio/content.ts`：同包绑定。
- `src/app/flight-audio/content.test.ts`：校验与引用测试。
- `src/app/flight-audio/content.test-support.ts`：仅合成内容构造。

## 验收标准

- [ ] 多对一、空槽、原列表索引、缺引用与跨代包用例通过。
- [ ] 不从来源当前 Render State 取模型；坏包不被解释为合法无声。
- [ ] 只保留所需内容副本/引用，不修改或转移调用者字节，边界与类型检查通过。

## 验证方法

- 使用现有合成模型/飞行数据支持，独立列出期望引用；`pnpm test -- src/app/flight-audio/content.test.ts`、`pnpm check`。
- 对本项调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；没有原版文件或浏览器前提。

## 完成证据
