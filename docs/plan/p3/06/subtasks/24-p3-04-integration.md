---
type: plan
status: active
phase: P3
task: "06"
subtask: "24"
updated: 2026-10-10
---

# 24 — 正式 Runtime/Session 与界面接入 P3-06 契约（合并 P3-04 后的修复）

**契约来源：** [spec](../spec.md) 的 S-02、S-08、AC-01、AC-08；D-01（世界创建输入 `craftInfo`）、D-05（`flight` 分区）、D-06（领域事件）；goal [前提](../goal.md#代码现状与前提)中“P3-04：09 执行时若已接入，09 同时更新其调用者，并按 browser-testing 运行既有合成会话回归”。
**依赖：** 09、12、13、14、15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在执行中新增本项（2026-10-10，依用户对新增修复子任务的预先授权，不需审阅）。09 执行时 P3-04 尚未接入正式 Core；之后 P3-04 快进进入 main，协调者把 main 合并进本分支（`854cfdb2`）。合并后 `pnpm check` 的类型检查有四处失败，都在 P3-04 的调用者中：

- `src/app/mission/mission-owner.ts`：`GameRunSpec` 缺少必需的 `craftInfo`；
- `src/app/runtime/game-event-bus.ts`：`EVENT_TYPES` 未列出 `speed-assist-toggled`、`speed-matched`、`speed-assist-released`、`object-left-world`；
- `src/ui/dev/event-log.ts`：`fieldsOf` 未覆盖这四个事件；
- `src/ui/game/game-session-bridge.ts`：读取已拆分的 `flight.readiness`（现为 `{ motion, combat }`）。

## 工作范围

- **世界创建输入：** 任务所有者与诊断按 D-01 从同一个已验证的资源包读取 `data/craft-info`（与三份逻辑 Asset 同包，经 `decodeRuleDataPayload`），作为 `craftInfo` 传给会话；缺失或解码错误按既有的启动失败路径报告，不回显导入值。任务资格检查若需要同样的输入，一并更新。
- **事件：** 事件总线列出四个新事件；开发事件日志为它们给出固定次序的主要字段。
- **会话桥与界面：** 关键事实改用 `flight.motion` 与 `flight.combat` 的就绪状态（或运动组的就绪），保持“只在事实变化时发布”的语义；不在界面中声明尚未接入的玩法已完成。
- **测试与 e2e：** 更新受影响的 app/ui 单元测试、合成资源包与 e2e 夹具（例如 `e2e/browser-replay.spec.ts` 的 `ReplayContent` 需要 `craftInfo`），使用合成数据，不读原版文件。
- **浏览器回归：** 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行受影响的既有合成会话回归（任务流程、replay、诊断），至少覆盖从任务开始到飞行、退出，以及浏览器 replay。
- **文档：** 同步 [app](../../../../engineering/modules/app.md) 与 [ui](../../../../engineering/modules/ui.md) 模块说明中受影响的段落；Core 分册与源码结构归 19，不在本项。

## 不包含

- Core 契约本身的改动（09–15 已定）；新的玩法、绑定或界面（P3-05、P3-13）。
- Core 分册与源码结构指南（19）。

## 关键文件与契约

- `src/app/mission/mission-owner.ts`、`src/app/resources/mission-input.ts`、`src/app/mission/mission-eligibility*.ts`、`src/app/session/game-session.ts`、`src/app/runtime/game-runtime.ts`、`src/app/runtime/game-event-bus.ts`、`src/ui/dev/event-log.ts`、`src/ui/game/game-session-bridge.ts`。
- `src/content/rule-data/rule-data-payload.ts`、`src/content/slice-definition.ts`；09 的 `src/core/world/craft-info-input.ts`。

## 写入范围

- `src/app/**`、`src/ui/**`：调用者、事件、会话桥及其测试与 test-support。
- `e2e/**`：受影响的规格与夹具。
- `docs/engineering/modules/app.md`、`docs/engineering/modules/ui.md`：受影响段落。
- `src/original-data/conversion/production-rule-data.test-support.ts`：使生产结构的合成 craft-info 满足 Core 的语义检查（2026-10-10 协调者按 scope-request 加入）。
- `src/workers/mission-scenarios.test.ts`：世界创建输入加入 `craftInfo`（同上）。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：replay 内容从同一已验证资源包读取 `data/craft-info`，事件样本表列出四个新事件（同上）。
- `docs/engineering/README.md`：正式会话 `start` 输入的说明（同上）。

## 验收标准

- [x] `pnpm check` 通过（类型检查、ESLint、全部 Vitest、构建）。
- [x] 任务开始从同一资源包读取 `craftInfo`；缺失或损坏的 craft-info 有确定的启动失败反馈，并有测试。
- [x] 事件总线与开发事件日志覆盖四个新事件；会话桥使用拆分后的 `flight` 分区，并有测试。
- [x] 按 browser-testing 运行的受影响 e2e 回归通过（列出命令与结果），或记录无法运行的项与原因。
- [x] 改动文档的 `updated:`、链接与锚点有效；不读原版文件。

## 验证方法

- `pnpm check`；受影响的 `pnpm test:e2e` 规格（按 browser-testing 的端口与环境约定）。
- 文档链接与 front matter 检查。

## 完成证据

- **2026-10-10（worker，认领提交 90c9bfb3；按协调者要求变基到 5f984561，即 19 集成与写入范围扩大之后）：**
  - **世界创建输入（S-02、D-01）：** [mission-input.ts](../../../../../src/app/resources/mission-input.ts) 新增 `craftInfoInput(logic)`：取 `logic` 组唯一的 `craft-info` Asset，以同包的 `decodeRuleDataPayload` 解码，解码错误位于 `logic[<Asset ID>].<path>`，组中没有时为 undefined；与 `missionInput` 共用一个清单与 payload 读取器。[任务所有者](../../../../../src/app/mission/mission-owner.ts)在创建时从绑定包的同一 `logic` 组解码一次（诊断与开始资格不读它），开始时把它作为 `craftInfo` 放进运行规格；解码失败在每次开始时为 `rejected`（类别 `content`），与世界创建的拒绝同路，留在开始配置页、会话保持 idle、不登记离页保护。Runtime 与会话的规格字段加入 `craftInfo`，原样交给 `createWorld`/`createRecordingSession`。
  - **事件与界面（S-08、D-05、D-06）：** [game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts) 的 `EVENT_TYPES` 列出四个新事件；投递元数据不变（只有命令自己的 `command-result` 带 commandId）。[event-log.ts](../../../../../src/ui/dev/event-log.ts) 的固定字段次序：`speed-assist-toggled` 为 commandIndex、enabled；`speed-matched` 为 targetEntityId、origin，再按变体为 commandIndex 或 speedDifferenceExceeded；`speed-assist-released` 无字段；`object-left-world` 为 entityId、kindBit、source。[会话桥](../../../../../src/ui/game/game-session-bridge.ts)的关键事实以 `flight.motion.readiness` 与 `flight.combat.readiness` 分别比较，运动组内读数变化仍按 100 ms 采样发布。
  - **夹具与调用者（协调者扩大的写入范围）：** [production-rule-data.test-support.ts](../../../../../src/original-data/conversion/production-rule-data.test-support.ts) 的生产结构合成 craft-info 每条记录 +0x0C 为 250（原为 -1，Core 的语义检查在 `input.craftInfo.content.craft[0].at0C` 拒绝全部任务场景；格式测试的 `defaultCraftInfo()` 不变）；[mission-scenarios.test.ts](../../../../../src/workers/mission-scenarios.test.ts) 与 [replay-check.ts](../../../../../tools/replay-check.ts) 从同一已验证包解码 craft-info（replay-check 的失败位置为 `content.craftInfo…`），`LONGEST_EVENTS` 加入四个事件（最长事件仍为 `object-instantiated`，`RECORDING_MAX_BYTES` 不变，钉住推导的测试通过）；replay-check 测试的“另一规则版本”改为 `RULES_VERSION + 1`（`RULES_VERSION` 已为 2，合并后该用例原本即失败），脚本加入速度辅助开关。
  - **测试：**
    - [mission-input.test.ts](../../../../../src/app/resources/mission-input.test.ts)：解码出同组 craft-info 的冻结内容；坏 payload 的错误在 `logic[data/craft-info].payload` 且不影响 `missionInput`；没有该 Asset 时为 undefined。
    - [mission-owner.test.ts](../../../../../src/app/mission/mission-owner.test.ts)（经 [mission.test-support.ts](../../../../../src/app/mission/mission.test-support.ts) 的 `craftInfoJob` 改写 `mission-startable` 包，组保持完整）：Core 拒绝的 craft-info（+0x0C 为 0.5）在两种选择下都是 `rejected`，`{ kind: 'core-input', path: 'input.craftInfo.content.craft[0].at0C', reason: … }`；不能解码的 craft-info（下一 payload schema 版本）为 `{ kind: 'content', path: 'logic[data/craft-info].descriptor.payloadIdentity.schemaVersion', … }`；两者每次开始抽一个种子、无帧请求、无离页保护、会话 idle。缺少 craft-info 的包因切片要求（role-cardinality `…roles.craft-info`）为 `package-incomplete`，主菜单不提供开始。改写 craft-info 内容后 setupHash 随之改变（运行使用绑定包的 craft-info）。
    - [game-runtime.test.ts](../../../../../src/app/runtime/game-runtime.test.ts)：缺 `craftInfo` 字段为 `spec.craftInfo`/`is required`；值为 undefined 时 Core 在 `input.craftInfo` 拒绝；Core 的语义拒绝原样抛出。[game-runtime-input.test.ts](../../../../../src/app/runtime/game-runtime-input.test.ts)：有自动开火时提交的速度开关，其结果带提交 ID、`speed-assist-toggled` 为 null。
    - [game-event-bus.test.ts](../../../../../src/app/runtime/game-event-bus.test.ts)：`on()` 接受四个新类型并按类型过滤；[event-log.test.ts](../../../../../src/ui/dev/event-log.test.ts)：四个事件（含两个 `speed-matched` 变体与 source 为 null）的字段与次序；[game-session-bridge.test.ts](../../../../../src/ui/game/game-session-bridge.test.ts)：运动组或战斗组的就绪变化在帧末立即发布，运动组内的新读数不提前发布。
    - [mission-diagnostics.test.ts](../../../../../src/ui/dev/mission-diagnostics.test.ts)：玩家在第 2 个 tick 生效后提交全部命令变体，`speed`（increase）与 `select-number` 为 accepted，`confirm-selection`（无目标的手动匹配）为 ignored/`no-target`，其余为 not-implemented。
  - **检查：** `npx tsc -p tsconfig.{core,app,node,e2e}.json --noEmit` 全部通过；`pnpm check` 通过（226 个测试文件、6,815 个测试、ESLint、构建）；`git diff --check` 通过；`node tools/compliance/cli.ts compliance` 与 `original` 均 passed、0 个发现；本地链接检查（`node local/research/p3-02/pipeline/check-links.ts` 对 app.md、ui.md、README 与本文件：352 处，0 失败）。
  - **浏览器回归（browser-testing，Chromium 155，macOS，端口 5172/5173/5174）：**

    | 项 | 设置/操作 | 期望 | 观察 | 结果 |
    |---|---|---|---|---|
    | 全部 e2e | `OSR_E2E_DEV_PORT=5172 OSR_E2E_PREVIEW_PORT=5173 pnpm test:e2e` | 全部通过 | 196 passed（12.6 min），含 development、production 与 development-headed | passed |
    | 任务流程 | mission-flow.development/production、interaction-render、joint-resources、fast-refresh、app-shell-resources | 资格、开始到飞行、暂停/菜单/重开/返回、诊断与录制下载，创建拒绝留在开始页 | 全部通过；下载的录制经 `runReplayCheck` 在 Node 重放一致 | passed |
    | 隐藏/恢复 | native-lifecycle（有头 Chromium，真实标签切换） | 隐藏暂停、可见后仍暂停、显式继续不补跑 | hidden→visible×3，出发保持在 tick 0，暂停于 tick 10，继续后首帧 1 tick | passed |
    | 浏览器 replay | browser-replay（带 `craftInfo` 的 `ReplayContent`，脚本含速度开关） | 浏览器与 Node 结果一致，异版本/身份记录被拒 | 一致，事件含 `speed-assist-toggled` | passed |
    | 简化后复跑 | `npx playwright test --project=development` mission-flow.development 与 browser-replay | 通过 | 7 passed | passed |
    | 事件日志 | 开发服务器 5174 的测试入口导入 `mission-startable` 合成盘，僚机 0（名单第 1 项）、种子 257，进入飞行后在诊断面板提交 `speed`/`toggle-auto-match` 与 `match-target` | 结果与新事件显示主要字段 | `command-result … accepted`，随后 `speed-assist-toggled · commandIndex=0 · enabled=false`；手动匹配 `ignored · no-target`；刷新状态显示 setupHash `f70ba39ec6084efa`（与 replay-check 的同包结果一致）；控制台只有 favicon 404 | passed |

    合成盘由 `scenarioFiles('mission-startable')` 生成，未读原版文件；临时盘、浏览器页与 5174 服务器已清理，三个端口均已释放。
  - **rubber-duck：** 无阻塞意见；两条非阻塞意见都已采纳：缺少 craft-info 在所有者一层的行为（完整包不可能缺少，主菜单为 `package-incomplete`；Runtime 一层另测 undefined）与 Runtime 中速度事件的 commandId 为 null。
  - **simplify：** 采纳：`CraftInfoChange` 改为 `'missing' | 'next-schema' | { at0C }` 并去掉强制转换；`missionHolder`/`openMission` 的参数改名 `source`；replay-check 的 `LONGEST_SOURCE` 共享；replay-check 测试的脚本改为显式分支。未采纳：测试与工具改用 `missionInput`/`craftInfoInput`（mission-scenarios 与 replay-check 的测试有意独立解码，replay-check 的错误位置与唯一性规则不同）；把两次清单读取合并（每次进入任务画面一次，代价可忽略）；在抽种子前检查 craft-info（与世界创建的拒绝一致，每次尝试抽一个种子）；会话桥每帧的关键事实对象（原有实现）。
  - **文档影响：** 已更新 [app 模块说明](../../../../engineering/modules/app.md)（Runtime 规格的 `craftInfo`、事件类型与投递 ID、所有者的创建与开始、任务载入诊断一节的 `craftInfoInput`）、[ui 模块说明](../../../../engineering/modules/ui.md)（会话桥的关键事实、事件日志的字段次序）与[工程约定](../../../../engineering/README.md)（会话 `start` 的运行规格）。[工具指南](../../../../guides/tools.md)的录制重放核对一节归 07 的写入范围，按协调者安排在 07 之后修改（见 worker 报告）。Core 分册归 19；STATUS 与阶段索引不需改动；没有新的原版事实。
