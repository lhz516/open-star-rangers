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
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：另供内容。
- `e2e/support/**`：合成包含两份输入（如需要）。
- `src/original-data/conversion/production-rule-data.test-support.ts`：合成生产规则数据改为能通过创建时检查的内容（读取器的边界样本留在 `src/content`）。

## 验收标准

- [x] AC-02：包解码 → Runtime 创建 → Core → replay 另供内容的两份输入接通，无缺省回退。
- [x] 每类坏值在建世界前以结构化错误拒绝；上界 9 通过、10 拒绝；8 项僚机菜单不被误拒。
- [x] setupHash 绑定规范内容；修改原输入不影响世界。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core src/app src/ui tools`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 合成内容的 limit/limit+1、拒绝与别名测试；期望独立推导，不读原版 fixture。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **接线（三份输入，D-01 ⑨）：**
  - Core：[rule-data.ts](../../../../../src/core/world/rule-data.ts) 的 `RULE_DATA_FIELDS` 在 `aiPrograms` 之后加入 `commMenus`、`baseRepairItems`、`commMessages`，`CONTENT_INPUT_FIELDS` 与 `ReplayContent` 随之覆盖，Runtime 与会话的规格字段也随之覆盖。三项按 `{ id, content }` 严格读取（字段白名单；`data/` ID；`original-import` 只接受 `data/comm-menus`、`data/base-repair-items`、`data/comm-messages`；内容读取器的 `ContentContractError` 原样传出），读取结果冻结，`RuleDataInputs` 保存完整内容。[create-world.ts](../../../../../src/core/world/create-world.ts) 的 `CreateWorldInput` 加入三项。
  - app：[mission-input.ts](../../../../../src/app/resources/mission-input.ts) 的 `ruleDataInputs` 从 `logic` 组解码三个 Asset，缺少时留空，由世界创建在输入位置拒绝；任务所有者经展开自动传入，不填默认值。
  - replay-check 与浏览器 replay 经 `ruleDataInputs` 和 `CONTENT_INPUT_FIELDS` 自动覆盖，[replay-check.ts](../../../../../tools/replay-check.ts) 与 e2e support 不需改动。
- **语义检查与静态规则数据：** 新增 [comm-input.ts](../../../../../src/core/world/comm-input.ts)，按 CB-01 的次序做检查 1–5，然后生成 `WorldRuleData.communications`（菜单原始键与值、11 个服务选择值、按表/头像/序号的消息帧时长，以及按 `NameReference` 查表的名称序号 `nameIndexOf`）。各检查：
  - 检查 1：键为第 1 字节，至少 2 字节；命令项键为 1–9；退出键折叠后为 `x`。命令码不另行拒绝：CB-04/CB-08 允许任何 u32 ≥ 1，读取器保证 0 恰在最后一项。这是子任务“命令码在已支持语义内”在 D-01 定稿下的含义。
  - 检查 2：上界由 `spawn.queue` 中 `postsRequests` 的各项累计（记录 × 请求、编组请求 × 成员、所选僚机）。掩码含位 14、20–25 时拒绝；只计上界 > 0 的类别。
  - 检查 3：选择值 0–18、33、34。
  - 检查 4：玩家记录 at54 ≥ 0。
  - 检查 5：消息元数据不另拒绝。
  - 名称序号：候选名、名称池、20 个机型名（craft-info 记录 `name`）与 `none`（空串），按字节相等取第一个位置。
  - 所有错误都是结构路径加固定原因，不回显导入值。
- **setupHash：** [setup-hash.ts](../../../../../src/core/world/setup-hash.ts) 在 `aiPrograms` 之后依次写入三项的 ID 与完整内容。
- **测试：**
  - [comm-input.test.ts](../../../../../src/core/world/comm-input.test.ts)，23 项，覆盖以下几组：
    - 读取、ID、生产门禁、读取器错误、冻结与输入别名隔离；
    - 规则数据的期望值，以及名称序号的首匹配、大小写敏感与 null；
    - 检查 1 的各类坏值（三张命令表、类别退出、TABL 2009），`x`/`X`、重复键、任意命令码，8 项僚机菜单与超过 9 项的命令菜单不被拒；
    - 检查 2：基地 9 通过、10 拒绝；记录与编组相加 9/10；僚机只在选中时计入；不投递的项不计；显示类别 9 通过、10 拒绝；运行时构造种类位逐一拒绝；检查 1 先于检查 2；
    - 检查 3（18/33/34 通过，19/24/31 拒绝，32 为读取器错误）、检查 4（只拒绝玩家的负值）、检查 5。
  - [create-world.test.ts](../../../../../src/core/world/create-world.test.ts)：三项的 ID、键、文字、命令码、掩码、选择值、帧时长、条目、名单的变化都改变 setupHash，且互不相同；setupHash 与键序无关。
  - [replay.test.ts](../../../../../src/core/replay/replay.test.ts)：另供内容的变化在 `record.setupHash` 被拒；缺少字段与检查 1 的错误位于 `content.` 路径。
  - [mission-input.test.ts](../../../../../src/app/resources/mission-input.test.ts)：三项的解码与缺省留空。
  - [replay-check.test.ts](../../../../../tools/replay-check.test.ts) 的输入加入三项。
  - 期望值都由合成内容独立推导，不读原版 fixture。
- **合成包（协调者批准扩大写入范围，`84f3b8d2`）：** [production-rule-data.test-support.ts](../../../../../src/original-data/conversion/production-rule-data.test-support.ts) 原有的菜单键非数字、选择值含 31、玩家 at54 为 −100，按 CB-01 会被拒绝。现改为：命令项键为其位置、退出键为 `x`；选择值 19–31 改为 18；玩家 at54 为 1000。`src/content` 中读取器的边界样本不变。
- **验证（基线 `84f3b8d2`）：**
  - `pnpm check` 通过：283 个文件，8,562 项，生产构建成功。`pnpm check:compliance` 通过。
  - 受影响的 e2e 共 43 项通过（端口 5136/5137）：`mission-flow`（开发、生产）、`browser-replay`、`keyboard-input.development`、`map-input.development`、`joint-pipeline.development`、`production-preview`、`webgl-unavailable`。
- **rubber-duck：** 没有发现问题；确认命令码按 CB-04/CB-08 不另行拒绝的解读成立。
- **simplify：**
  - 采纳：`whole()` 读取改用 `keyof PRODUCTION_RULE_DATA`，`debrisParameters` 也经它读取；`kindsOf` 改为不分配数组的 `instancesIn`；`MAX_GENERATED_KEYS` 不再导出；去掉 setupHash 中多余的类型断言；测试辅助去掉布尔参数并改为循环。
  - 未采纳：
    - 与 `instantiableRecords` 共用逐项展开：需要改 spawn-schedule.ts，超出写入范围。
    - 把检查 3、4 移到读取器或 `checkCraftInfo`：CB-01 把它们定为 Core 的创建检查，读取器契约不变。
    - 静态数据与 `inputs` 去重：CB-01 定稿了 `CommunicationsRuleData` 的形状。
    - 让 `src/content` 的样本对世界有效：协调者选择保留读取器样本。
- **文档影响：** 交 27 统一更新：
  - [core.md](../../../../engineering/modules/core.md)：创建输入、`WorldRuleData.communications`、检查 1–5；
  - [content.md](../../../../engineering/modules/content.md) 第 250–264 行：规则数据输入表加入三项；
  - [app.md](../../../../engineering/modules/app.md) 第 19、69、114 行：字段列表与 `ruleDataInputs` 的角色；
  - [source-structure.md](../../../../engineering/source-structure.md)：新增 `world/comm-input.ts`。

  没有新的原版事实，`docs/original/` 与 U 项不变。
