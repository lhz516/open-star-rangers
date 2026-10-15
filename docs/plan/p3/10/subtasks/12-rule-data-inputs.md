---
type: plan
status: active
phase: P3
task: "10"
subtask: "12"
updated: 2026-10-14
---

# 12 — 规则数据输入与创建时语义检查

**契约来源：** [spec](../spec.md) 的 S-01、AC-02；[规则输入与读模型边界](../spec.md#规则输入与读模型边界)、[通讯菜单](../spec.md#通讯菜单)的“按键与可达性检查”。
**依赖：** 01, 05, 11, 29。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `CreateWorldInput` 加入 `commMenus`、`baseRepairItems` 与 `commMessages`（29 交付的 `comm-messages`，[D-03](../spec.md#d-03-定稿已批准) 第 4 条：名称序号在创建时由名单与任务对象名逐字节比较得出，受 setupHash 绑定）三份 `LogicAssetInput`，沿用严格解码、字段白名单、ID/身份核对与冻结副本；同步 `CONTENT_INPUT_FIELDS`、Core 的 `RuleDataInputs` 与 setupHash。
- 创建时语义检查（结构化 `CoreInputError`，不建半个世界，先预算后分配）：
  - 菜单：数据键文本足够长，命令项键可由 `select-number`（1–9）与 `communications close`（折叠后的 `x`）表达，命令码在已支持语义内，退出键与零值项相符；保留首匹配次序，不擅自去重；
  - 类别数与各类别对象数的保守上界（按有效僚机配置、声明/编组展开、延迟与条件生成、运行时构造）均 ≤ 9，退出项不计；上界不能证明有限时拒绝；
  - 服务项：所读选择值及其组展开能由已支持规则处理（不能越界读写 19 项子系统），按 05 的结论拒绝非法容量/除数。
- app 与工具接线：[mission-input.ts](../../../../../src/app/resources/mission-input.ts) 的 `ruleDataInputs`、[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 的运行创建、[replay-check.ts](../../../../../tools/replay-check.ts) 与 e2e 的合成包；不得旁路 `validatePackage`，不为旧调用者填默认数据。
- 合成测试覆盖：类别/对象上界 9 通过与 10 拒绝；8 项的僚机命令菜单不被误拒；每类坏值；别名与输入修改隔离；规范文本代表字段变化改变 setupHash。

## 不包含

- 菜单与服务规则本身（13、17）；内容契约与导入链（不改）。

## 关键文件与契约

- [create-world.ts](../../../../../src/core/world/create-world.ts)、[rule-data.ts](../../../../../src/core/world/rule-data.ts)、[setup-hash.ts](../../../../../src/core/world/setup-hash.ts)、[setup-check.ts](../../../../../src/core/world/setup-check.ts) 的生成范围检查。
- 计划新增：`src/core/world/comm-input.ts`（菜单与服务项的语义检查）及测试。
- 内容读取器 [comm-menus.ts](../../../../../src/content/rule-data/comm-menus.ts)、[base-repair-items.ts](../../../../../src/content/rule-data/base-repair-items.ts) 与 [rule-data.test-support.ts](../../../../../src/content/rule-data/rule-data.test-support.ts) 只读复用。

## 写入范围

- `src/core/world/create-world*.ts`、`src/core/world/rule-data*.ts`、`src/core/world/setup-hash*.ts`、`src/core/world/setup-check*.ts`：输入、哈希与检查。
- `src/core/world/comm-input.ts`、`src/core/world/comm-input.test.ts`：计划新增。
- `src/core/replay/replay*.ts`：`ReplayContent` 的另供内容。
- `src/app/resources/mission-input*.ts`、`src/app/mission/mission-owner*.ts`、`src/app/mission/mission.test-support.ts`、`src/app/runtime/game-runtime.test-support.ts`、`src/app/session/game-session.test-support.ts`：运行创建与测试辅助。
- `tools/replay-check*.ts`：另供内容。
- `e2e/support/**`：合成包含两份输入（如需要）。

## 验收标准

- [ ] AC-02：包解码 → Runtime 创建 → Core → replay 另供内容的两份输入接通，无缺省回退。
- [ ] 每类坏值在建世界前以结构化错误拒绝；上界 9 通过、10 拒绝；8 项僚机菜单不被误拒。
- [ ] setupHash 绑定规范内容；修改原输入不影响世界。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core src/app src/ui tools`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 合成内容的 limit/limit+1、拒绝与别名测试；期望独立推导，不读原版 fixture。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
