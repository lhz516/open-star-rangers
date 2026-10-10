---
type: plan
status: active
phase: P3
task: "07"
subtask: "34"
updated: 2026-10-10
---

# 34 — 追踪导弹所需的 AI 程序输入

**契约来源：** [spec](../spec.md) 的 S-02、S-05、AC-02、AC-07；P3-02 spec 的 [CR-01](../../02/spec.md#cr-01-世界创建输入与静态规则数据d-01)（世界创建输入与静态规则数据）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（共享转向模块）、[CR-14](../../02/spec.md#cr-14-容量快照与版本d-01)；[executable 的 H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)。
**依赖：** 12, 32, 33。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在执行中新增本项（2026-10-10，依用户对新增解除阻塞子任务的预先授权，不需审阅）。32 发现：追踪导弹的程序读取内置 AI 程序记录 1、2 的 +0x14（更新周期）、+0x24（角度）与 +0x2C（饱和值），即 32 的 `SteeringProgram`。这些值来自导入内容 `data/ai-programs` 的 `builtInPrograms`（[ai-programs.ts](../../../../../src/content/rule-data/ai-programs.ts)），但 CR-01 的世界创建输入与 `WorldRuleData` 都没有 AI 程序，Core 拿不到。原版数值不能写进代码。20 的写入范围只有 `missiles.ts`，因此在 20 之前由本项补上输入。

## 工作范围

- **契约修订（依用户的预先授权，取推荐方案并记录）：** 在 P3-02 spec 的 CR-01 中增加 AI 程序输入。
  - 推荐方案：`CreateWorldInput`、录制入口与 `ReplayContent` 增加顶层的 `aiPrograms`（同一已验证资源包中 `data/ai-programs` 的规范内容，按内容读取器读取），与其他规则输入并列。setupHash 覆盖该输入的规范文本，Asset ID 按 CR-01 的规则校验。
  - `WorldRuleData` 只提取导弹追踪需要的内置程序记录 1、2 的三个字段，复制为有界纯数据，并在世界创建时校验：+0x14 为非负 i32，记录 1、2 存在，角度与饱和值是有限 f32。不合格时以 CR-01 的错误类型拒绝，不建世界。
  - P3-08 以后在同一输入上扩展 AI 所需的其余部分，不另建输入。
  - 是否影响快照格式或 `RULES_VERSION` 按 CR-14 判断：静态输入不进入快照；规则版本已为本 goal 递增过一次，沿用。
  - 修订、理由与被排除的方案写入 P3-02 spec 的审批节，注明“依用户 2026-10-09/10 的预先授权”。
- **实现：** 在 [create-world.ts](../../../../../src/core/world/create-world.ts)、[rule-data.ts](../../../../../src/core/world/rule-data.ts)、setupHash、replay 与录制入口中接入新输入，并给 32 的 `SteeringProgram` 提供来自世界的数据（只读的规则数据访问，不改 32 的规则函数）。P3-04 的调用者经 33 建立的 `CONTENT_INPUT_FIELDS` 路径取得该输入；若仍需改动 App 的任务输入或测试辅助，在写入范围内完成。
- **炮寿命的语义检查（17 的建议）：** 在同一组 CR-01 语义检查中拒绝可实例化武器的负的炮 +0x24（寿命）。否则 Core 只会在首次回调时故障；原版按 u32 回绕为遥远的到期，项目不复现。在 CR-01 中补一句并加拒绝测试。
- **测试：** 合法输入；缺失、重复或错引用的 Asset，记录 1、2 缺失，负的周期，非有限的角度或饱和值，每类都被拒绝且不建世界。调用者事后修改对象不影响世界。规范输入的代表字段变化会改变 setupHash 的规范文本。更新受输入形状影响的既有测试与测试辅助。

## 不包含

- 导弹的对象更新与追踪接线（20）；AI 机体的程序与行为（P3-08）。
- 修改内容契约、导入链或转换器版本。

## 关键文件与契约

- [ai-programs.ts](../../../../../src/content/rule-data/ai-programs.ts)（`builtInPrograms`）；32 的 [steering.ts](../../../../../src/core/rules/steering.ts)（`SteeringProgram`）；12 的规则数据与 CR-01 的检查；33 的 `CONTENT_INPUT_FIELDS` 与 `instantiableModelIds`。

## 写入范围

- `docs/plan/p3/02/spec.md`：CR-01（及受影响时 CR-14）的 AI 程序输入修订与审批记录。
- `src/core/world/create-world.ts`、`src/core/world/create-world.test.ts`、`src/core/world/create-world.test-support.ts`：新输入与拒绝测试。
- `src/core/world/rule-data.ts`、`src/core/world/rule-data.test.ts`：提取与校验。
- `src/core/world/setup-hash.ts`：setupHash 的规范文本。
- `src/core/world/world-state.ts`：静态规则数据的引用。
- `src/core/replay/replay.ts`、`src/core/replay/replay.test.ts`、`src/core/replay/replay.test-support.ts`、`src/core/replay/recording.test.ts`：`ReplayContent` 与录制入口。
- `src/app/**`：P3-04 的任务输入与测试辅助对新输入的接入（若 33 的路径未自动覆盖）。

## 验收标准

- [ ] P3-02 spec 的 CR-01 写明 AI 程序输入、提取的字段、校验与 setupHash 覆盖，并有依预先授权的审批记录。
- [ ] 世界创建接受合格输入，并拒绝缺失、错引用、记录缺失与语义坏值，不建半个世界；调用者事后修改对象不影响世界。
- [ ] 32 的 `SteeringProgram` 可从世界的静态规则数据取得；没有写死的原版数值。
- [ ] 负的炮 +0x24 在世界创建时被拒绝，CR-01 已写明。
- [ ] P3-04 的世界创建、录制与 replay 调用者传入该输入；`pnpm check` 通过。

## 验证方法

- Node 测试：合成的 AI 程序内容（[rule-data.test-support.ts](../../../../../src/content/rule-data/rule-data.test-support.ts)），期望独立推导；`pnpm check`。

## 完成证据
