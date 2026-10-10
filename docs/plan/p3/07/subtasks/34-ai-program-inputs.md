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
- `tools/replay-check.test.ts`：手工构造的 `CreateWorldInput` 加入 `aiPrograms`。
- `docs/engineering/modules/app.md`：`ruleDataInputs` 解码的 Asset 加入 `ai-programs`。

## 验收标准

- [x] P3-02 spec 的 CR-01 写明 AI 程序输入、提取的字段、校验与 setupHash 覆盖，并有依预先授权的审批记录。
- [x] 世界创建接受合格输入，并拒绝缺失、错引用、记录缺失与语义坏值，不建半个世界；调用者事后修改对象不影响世界。
- [x] 32 的 `SteeringProgram` 可从世界的静态规则数据取得；没有写死的原版数值。
- [x] 负的炮 +0x24 在世界创建时被拒绝，CR-01 已写明。
- [x] P3-04 的世界创建、录制与 replay 调用者传入该输入；`pnpm check` 通过。

## 验证方法

- Node 测试：合成的 AI 程序内容（[rule-data.test-support.ts](../../../../../src/content/rule-data/rule-data.test-support.ts)），期望独立推导；`pnpm check`。

## 完成证据

- **2026-10-10，worker（应用会话分支 `p3-07-34-worker`），基于认领提交 `59563ef`，提交前快进到协调者的 `362f4fb`（其间只有计划文档）：**
  - **契约修订（[P3-02 spec 的 CR-01](../../02/spec.md#cr-01-世界创建输入与静态规则数据d-01)，依预先授权取 34 的推荐方案）：** 输入改为六项，新增 `aiPrograms: { id, content }`（`logic` 组角色 `ai-programs` 的 `data/ai-programs`，`readAiPrograms` 严格读取，Asset ID 同其他 `data` 输入：须为 `data/`，`original-import` 只收生产 ID）；七份规则输入与逻辑 Asset 同包；P3-08 在同一输入上扩展。检查 5 增加可达炮的 +0x24（弹丸寿命，H2）非负；新增检查 6：内置记录 1、2 存在且 +0x14 非负（i32 与有限 f32 由内容读取器保证），不论运行装备什么都检查（是否追踪取决于发射时的锁定）。静态规则数据增加记录 1、2 的三个字段（按记录号）。setupHash 表增加 `aiPrograms`：ID 与完整内容。CR-14 不改：静态输入不进快照，沿用本 goal 已递增的快照格式版本与 `RULES_VERSION`，replay 记录形状不变。[审批节](../../02/spec.md#审批)新增“2026-10-10 修订（P3-07 的子任务 34…）”：范围、起因、授权出处（P3-07 goal 审批节与用户 2026-10-10 的原话）、所选方案与理由、六个被排除的方案（调用者先提取字段、并入已有输入、写死原版数值、按可达性才要求记录、setupHash 只覆盖三字段、允许负寿命并回绕）。
  - **实现：**
    - [rule-data.ts](../../../../../src/core/world/rule-data.ts)：`RULE_DATA_FIELDS` 末尾加 `aiPrograms`（因而进入 Core 的 `CONTENT_INPUT_FIELDS`、Runtime 与会话的规格字段、replay 的内容字段）；`PRODUCTION_RULE_DATA.aiPrograms = 'data/ai-programs'`；`RuleDataInputs.aiPrograms` 为读取结果（冻结、与输入脱离）；`WorldRuleData.homingPrograms: HomingPrograms`（`{ 1, 2 }` → 32 的 `SteeringProgram`，冻结的 `{ at14, at24, at2C }` 副本）；`buildRuleData` 对可达炮拒绝负的 +0x24（`input.craftInfo.content.guns[i].at24`），最后由 `homingPrograms` 校验并复制（记录缺失在 `input.aiPrograms.content.builtInPrograms`，负周期在 `…builtInPrograms[n].at14`，均为 `CoreInputError`）。
    - [create-world.ts](../../../../../src/core/world/create-world.ts)：`CreateWorldInput.aiPrograms`；[setup-hash.ts](../../../../../src/core/world/setup-hash.ts)：按成员定型的 `AiPrograms` 写出器（全局、表程序、`AiEntry` 两种变体、内置程序含 handler），接在 `models` 之后；`world-state.ts` 与 `replay.ts` 不需改动（`ruleData` 的类型与 `CONTENT_INPUT_FIELDS` 自动覆盖）。
    - App：[mission-input.ts](../../../../../src/app/resources/mission-input.ts) 的 `ruleDataInputs` 以 `decodeRuleDataPayload` 解码 `logic` 组的 `ai-programs`（缺少时为 undefined，由 Core 在 `input.aiPrograms` 拒绝）；[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 的 `PackageContent` 由 `keyof RuleDataInputs` 推导；`tools/replay-check.ts` 展开 `ruleDataInputs`，不需改动；[replay-check.test.ts](../../../../../tools/replay-check.test.ts) 的手工输入加入 `aiPrograms`（协调者批准的范围）。
    - 没有写死的原版数值：Core 只从输入复制；测试用 [create-world.test-support.ts](../../../../../src/core/world/create-world.test-support.ts) 的 `aiProgramsContent()`（合成：三条内置记录，记录 1 为 16/30/0.75，记录 2 为 0/2.5/1）。
  - **测试：**
    - [rule-data.test.ts](../../../../../src/core/world/rule-data.test.ts)：读取结果等于合成内容并深度冻结；事后修改输入（记录 1 的 +0x14、记录 2 的 +0x24、全局字段）不改变世界；六个字段缺一即拒绝，`aiPrograms.id` 缺失、非 `data/` 与格式错误；`original-import` 只收生产 ID；内容读取器错误（错引用的参数项）保留 `ContentContractError`；`homingPrograms` 为 `{1: 16/30/0.75, 2: 0/2.5/1}`，经 `programRecord('heat-seeker')`、`programRecord('homing')` 取到对应记录；记录 1、2 缺失（只剩两条、零条，以及没有导弹挂点的运行）被拒绝，多于三条可接受；记录 1、2 的负周期（−1、−2³¹）被拒绝，记录 0 的负周期接受，2³¹−1 接受，2³¹ 由读取器拒绝；±∞、NaN 与非 f32 的角度或饱和值由读取器拒绝；可达炮的 +0x24 为 −1、−2³¹ 被拒绝，0 与正值接受，未挂载的炮不读。
    - [create-world.test.ts](../../../../../src/core/world/create-world.test.ts)：setupHash 随 `aiPrograms` 的 ID、记录 1/2 的三个字段、规则尚未读取的字段（记录 0 的 +0x28、handler、多一条记录、全局、表程序、脚本参数）各自改变且互不相同；键序不影响。
    - [replay.test.ts](../../../../../src/core/replay/replay.test.ts)：同一身份下改动 AI 程序内容或 ID 在 `record.setupHash` 拒绝；缺 `aiPrograms` 在 `content.aiPrograms`；负周期在 `content.aiPrograms.content.builtInPrograms[2].at14`。[recording.test.ts](../../../../../src/core/replay/recording.test.ts)：录制入口缺 `aiPrograms` 在 `input.aiPrograms` 拒绝，记录不含 `ai-programs`。
    - [mission-input.test.ts](../../../../../src/app/resources/mission-input.test.ts)：解码 `data/ai-programs`；包缺该 Asset 或缺 `logic` 组时为 undefined。[mission-owner.test.ts](../../../../../src/app/mission/mission-owner.test.ts)：AI 程序不能解码时两种选择都是 `rejected`，路径 `logic[data/ai-programs].descriptor.payloadIdentity.schemaVersion`。
    - 变异检查：暂时去掉负周期与负寿命两项检查，对应的两项测试失败；恢复后通过。
  - **检查：** `pnpm check` 通过（259 个测试文件、7,788 个测试、ESLint、构建）。第一次完整运行时机器负载约 30（其他 worker 并行），三项与本项无关的测试超时（`snapshot.test.ts` 的规范文本遍历 6.3 s/5 s，`engineering-boundaries`，`image-payload`）；单独重跑通过（该快照测试在基线 2.3 s，含本项改动整文件 4 s），第二次完整运行全部通过。simplify 与写完证据后再跑 `pnpm check` 时负载约 100，四项 CPU 密集的测试超过 5 s 的默认时限（同上两项与 `import-job`、`replay` 各一项，单独重跑只有快照遍历仍超时）；随后 `pnpm typecheck`、`pnpm lint`、`pnpm vitest run --testTimeout=60000`（259 个文件、7,788 个测试全部通过）与 `pnpm build` 分别通过。`git diff --check` 通过；`node tools/compliance/cli.ts compliance` 与 `original` 均 passed、0 个发现；本地链接检查（本文件、P3-02 spec、app.md：217 处，0 失败）。
  - **浏览器回归（browser-testing，Chromium，端口 5202/5203）：** `pnpm build` 后 `OSR_E2E_DEV_PORT=5202 OSR_E2E_PREVIEW_PORT=5203 npx playwright test e2e/browser-replay.spec.ts e2e/mission-flow.development.spec.ts e2e/mission-flow.production.spec.ts`：8 passed（54 s）。浏览器 replay 与 Node 一致（`worldInput` 含 `aiPrograms`，内容字段取自 `CONTENT_INPUT_FIELDS`）；开发与生产流程经 App 的 `ruleDataInputs` 解码合成包的 `ai-programs` 后开始、暂停、重开与返回，录制下载在 Node 重放一致。合成内容由测试入口生成，未读原版文件；服务器由 Playwright 启停。（运行于快进到 `362f4fb` 之前；其间只有计划文档。）
  - **rubber-duck：** 无阻塞与非阻塞问题（核对了 CR-01 与代码的一致、写出器覆盖 `AiPrograms` 全部成员、冻结与脱离、所有构造输入的调用者、炮 +0x24 检查的位置与可达范围、测试是否证明其所述）。
  - **simplify：** 采纳：`PackageContent` 由 `keyof RuleDataInputs` 推导，以后新增与运行无关的规则输入不必改任务所有者。未采纳：用 `programRecord` 生成记录号（`HomingPrograms` 的键已由类型与 `programRecord` 的返回类型绑定，记录号是 H5 的事实）；不复制三字段、改为运行时读输入（契约要求复制为静态规则数据，消费者是 20）；不在世界中保留完整 AI 内容（与 `debrisParameters` 一致，P3-08 将读取，体积很小）；改用通用递归规范写出器（按成员定型的写出器是项目的既定做法，类型变化时编译失败）；`contentOf` 保持显式字段（12 的既定决定）。
  - **文档影响：** 已更新 [app 模块说明](../../../../engineering/modules/app.md)（`ruleDataInputs` 解码 `logic` 组的 AI 程序）与 P3-02 spec 的 CR-01 和审批节。[工具指南](../../../../guides/tools.md)只泛称“规则数据输入”，不需改动。Core 分册与源码结构（`createWorld` 的六项规则输入、`homingPrograms`）归 28。没有新的原版事实：记录号与字段含义已在 [executable 的 H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked) 与 [ai.md §3.3](../../../../original/formats/ai.md#33-built-in-program-table-0x1762f8)，炮 +0x24 的到期在 H2。
  - **交接给 20：** 追踪程序的记录取 `world.ruleData.homingPrograms[programRecord(missile.program)]`（`SteeringProgram`，已校验：周期为非负 i32，角度与饱和值为有限 f32），不改 32 的规则函数。负的炮 +0x24 已在创建时拒绝，17 的弹丸计时不再因此故障。

