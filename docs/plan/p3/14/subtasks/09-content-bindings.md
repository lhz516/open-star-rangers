---
type: plan
status: active
phase: P3
task: "14"
subtask: "09"
updated: 2026-10-17
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

- [x] 多对一、空槽、原列表索引、缺引用与跨代包用例通过。
- [x] 不从来源当前 Render State 取模型；坏包不被解释为合法无声。
- [x] 只保留所需内容副本/引用，不修改或转移调用者字节，边界与类型检查通过。

## 验证方法

- 使用现有合成模型/飞行数据支持，独立列出期望引用；`pnpm test -- src/app/flight-audio/content.test.ts`、`pnpm check`。
- 对本项调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；没有原版文件或浏览器前提。

## 完成证据

- **实现：** [content.ts](../../../../../src/app/flight-audio/content.ts) 的 `bindFlightSounds(held, bound)` 先核对 holder 包完整、代际等于 `bound.generation`、内容身份及 logic/models/audio 三组 manifest 身份都等于 `bound.identity`，否则抛 `FlightSoundPackageError`（`incomplete`/`generation`/`identity`）。之后：
  - 用 `missionInput` 取任务引用的 CraftTypeTable，用 `modelInputs`（`readModelPayload` + `checkModelBinding`）解码其模型；
  - 用 `decodeFlightDataPayload` 严格解码唯一的 `explosion-table`；
  - 对每个非空槽与 EXPL 声音核对 audio 组中的 sound 描述符、schema 2 的 payload 记录与 `readSoundPayload`。

  缺失为 `binding-mismatch`（路径指到槽、EXPL 记录或表项），schema 不符为 `unsupported-payload-schema`，坏字节为 `invalid-sound-payload`，模型/爆炸表的解码错误保持原码并置于 `<group>[<Asset ID>]` 下。结果是冻结的纯数据，只含 Asset ID 与位序号：
  - `craft`：按位序号 0–31 索引，无表项为 null；
  - `explosions[list - 1][item]`：item 为原列表下标；
  - `sounds`：升序去重。

  `craftSounds(content, kindBit)` 只按位序号解析，不读 Render State，对非 0–31 的值（如掩码 0x80）抛 RangeError；`explosionSound` 对表外选择抛 RangeError。不导入 original-data，不含原版 locator。
- **测试：** `pnpm exec vitest run src/app/flight-audio` 通过，共 14 项。[content.test.ts](../../../../../src/app/flight-audio/content.test.ts) 用 [content.test-support.ts](../../../../../src/app/flight-audio/content.test-support.ts) 的合成包，期望引用逐项写成字面值。覆盖：
  - 多对一：种类 0/1 共用模型，两个模型与 EXPL 共用 kill 声音；列表 1 的项 0、2 同声、项 1 异声。
  - 空槽：全空槽与部分空槽为 null，与无表项的种类区分。
  - 位序号与掩码：0x80 被拒绝。
  - 引用错误：缺槽声音、缺 EXPL 声音、缺模型、缺爆炸表、缺 audio 组；sound schema 1、非 sound 字节；模型与爆炸表坏字节。
  - 跨代与外包：代际不同、内容身份不同、包不完整，以及外包 audio 组。
  - 所有权：调用者字节未变、未分离，结果深冻结且可 JSON 往返。
  - 生产形状：`mission-startable` 合成场景的生产转换包整体可绑定，全部声音都在其 audio 组。
- **检查：** `pnpm typecheck`、`pnpm exec eslint src/app/flight-audio` 通过；`pnpm check` 通过（TypeScript、ESLint、全部 Vitest、生产构建）。
- **Rubber-duck：** 对照 S-02、AC-02、触发表与 A-02 审阅完整 diff，无问题。
- **Simplify：** 四个角度的审阅后已采纳：
  - logic 组不再读取 payload 记录；
  - audio 描述符改为按 ID 的 Map；
  - 合成排序改用 `compareText`；
  - 测试改用类型收窄。

  未采纳：
  - 改用 `ruleDataInputs(...).explosions`：它会解码无关的规则数据，使声音绑定因不用的内容失败。
  - 复用 platform 测试支持的 sound 构造：会产生跨层导入。
  - 把 `explosion-table` 的单角色读取导出到 mission-input.ts：属写入范围外，留作建议。
- **文档影响：** [app 分册](../../../../engineering/modules/app.md)尚无飞行音效一节，`src/app/flight-audio/` 的模块说明按计划由 27 统一写入。本项不改动原版事实、unknowns 或工程约定。
