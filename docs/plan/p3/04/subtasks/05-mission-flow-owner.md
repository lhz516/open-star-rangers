---
type: plan
status: active
phase: P3
task: "04"
subtask: "05"
updated: 2026-10-10
---

# 05 — 任务流程与任务所有者

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-05，[应用流程](../spec.md#应用流程)、[开始资格](../spec.md#开始资格)、[任务开始配置](../spec.md#任务开始配置)、[衔接占位](../spec.md#衔接占位)、[任务菜单、暂停与退出](../spec.md#任务菜单暂停与退出)、[消费者接线与释放](../spec.md#消费者接线与释放)、[离页保护](../spec.md#离页保护)；AC-05（所有者部分）、AC-07、AC-08（Node）、AC-09、AC-10（Node）。
**依赖：** 01, 03, 04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **任务输入：** 把 [mission-diagnostics.ts](../../../../../src/app/resources/mission-diagnostics.ts) 中解码三份逻辑 Asset 的逻辑提取为与诊断共用的 helper（计划新增 `src/app/resources/mission-input.ts`），诊断行为与输出不变；任务所有者用它从同一代资源包取得 `CreateWorldInput` 的 Asset 部分，不从另一代补齐。
- **开始资格**（计划新增 `src/app/mission/mission-eligibility.ts`）：由持有者快照推导可开始或各原因（没有包、部分包附组状态、诊断 `not-attempted`/`failed` 附类别路径原因、清理锁存）；缓存 listed/saved、作业 finished 都不能代替；完整但未保存/保存失败可开始。
- **流程状态机**（计划新增 `src/app/mission/mission-flow.ts`）：介绍、配置、出发、飞行、任务菜单、故障或停止；与会话状态对应；配置页预选规则（首次名单第 1 项；同一内容身份下保持上次成功确认的选择，含无僚机；新身份或页面重载重置；未确认编辑不覆盖）。
- **任务所有者**（计划新增 `src/app/mission/mission-owner.ts`）：
  - 绑定 holder 实例、generation 与完整内容身份；打开与确认时都重读 `current()`；代际变化时拒绝开始。
  - 原子开始：同步校验、取种子（端口失败即开始失败，不回退）、创建唯一运行；重复点击与迟到回调不能再创建；Core 创建错误留在配置页显示类别、路径与原因；会话、消费者或离页登记失败回滚，回滚失败锁存。
  - G-02/1 与 G-02/2 占位：所有者持有一个单次计时器，以单调时钟核对累计可见时间（3,000 ms）；hidden/pagehide 时保留剩余时长并撤销计时器，恢复后继续；提前回调不提前完成；按钮与 Enter/Space/Esc 的跳过意图只接受一次；出发结束以当前 ownerId 与 runId 的完成凭证调用会话 `complete-departure`；计时器登记、取消或时钟失败显式报告，取消失败锁存，不跳过占位、不启动运行。
  - 任务菜单：只在 running/paused 打开，先确认暂停成功；继续须关闭菜单并成功 resume，失败留在菜单显示原因；其他 phase 不开放。
  - 重开：exit 成功并完成必要收尾后回到介绍；清理失败不进入新流程，只允许返回菜单。返回菜单：先失效并尝试释放所有者。
  - 两级所有权：运行级消费者登记（按注册逆序、至多一次释放，不迁移到新运行）；所有者级资源登记（跨运行保留）；释放顺序为输入与计时器失效 → 会话 → UI 桥接与诊断 → 离页保护 → 画面与音频等；每项都尝试，失败汇总；异步关闭资源按关闭屏障登记，在确认关闭前禁止重建。本任务只登记本任务实际接入的资源，不创建音频或空媒体适配器。
  - 离页保护：在 transition/running/paused/stopped/faulted 登记一份，exit/dispose 撤销；介绍、配置与菜单不登记；登记失败阻止开始并回滚，撤销失败锁存。
  - 录制选项由所有者选项提供（开发 `{ producer, checkpointInterval: 32 }`，生产 null），所有者不读取构建模式。
- **任务槽位**（计划新增 `src/app/composition/mission-slot.ts`）：每个应用实例一个；ownerId 递增；先关闭旧所有者再创建新所有者；清理失败在本应用实例内锁存，之后不再创建；与查看器锁存独立。
- **资源包替换与销毁顺序：** 所有者订阅 `beforeReplace`，同步失效并释放，返回菜单且附原因；监听抛错不否决替换，槽位先锁存。提供 DOM-free 的应用级收尾顺序 helper（先释放任务槽位，再销毁 holder），供 09 在 React 接线中使用并在 Node 中测试，不依赖 `ResourceHolder.dispose()` 发出通知。
- 计划新增 Node 测试支持：由 01 的合成组组装持有者与资源包（复用 [resource-holder.test-support.ts](../../../../../src/app/resources/resource-holder.test-support.ts)，含 P3-03 对它的扩展），供本项与 07、09 的测试使用。资格只依据持有者的全包判定与任务诊断，不硬编码组或角色清单，因此随切片定义版本变化自动适用。

## 不包含

- React 页面、`App` 接线、端口生产实现与测试入口（09、04）；UI store 与桥接（06）；开发诊断（07）。
- 原生 `beforeunload` 对话框与浏览器流程证据（10）；运行中衔接（P3-10、P3-11）。

## 关键文件与契约

- 计划新增：`src/app/mission/mission-eligibility.ts`、`mission-flow.ts`、`mission-owner.ts`、`mission.test-support.ts` 及相邻测试；`src/app/composition/mission-slot.ts` 及测试；`src/app/resources/mission-input.ts`。
- [mission-diagnostics.ts](../../../../../src/app/resources/mission-diagnostics.ts)：提取共用解码，行为不变。
- [resource-holder.ts](../../../../../src/app/resources/resource-holder.ts)：只读消费 `current()`、`getSnapshot()`、`beforeReplace`；不改其销毁语义。
- 03 的 `src/app/session/game-session.ts`；04 的 `src/app/mission/mission-ports.ts`。
- 参照：[synthetic-demo-lifecycle.ts](../../../../../src/app/composition/synthetic-demo-lifecycle.ts) 的槽位与锁存；[viewer-owner.ts](../../../../../src/app/viewer/viewer-owner.ts) 的关闭屏障。

## 写入范围

- `src/app/mission/**`：流程、资格、所有者、测试支持与测试（不改 04 定稿的端口语义）。
- `src/app/composition/mission-slot*.ts`：任务槽位与测试。
- `src/app/resources/mission-input*.ts`：共用解码 helper 与测试。
- `src/app/resources/mission-diagnostics.ts`：改为使用共用 helper。
- `src/app/resources/mission-diagnostics.test.ts`：保持既有断言，必要时补充。

## 验收标准

- [x] AC-07：开始 → 介绍 → 配置 → 出发 → 运行 → 重开 → 返回；2,999 ms 可见时间不自然结束、3,000 ms 后下次回调可结束；隐藏/离页不计入；所有结束路径至多一次；默认、无僚机、5 个索引与保留选择正确；每次实际创建尝试只抽一次种子，允许重复值，错误不回退；失败原子回滚；新运行 tick 0 且无旧意图。
- [x] AC-05（所有者部分）：自然结束、跳过、隐藏/离页、重开与释放交错时不启动旧运行；隐藏后返回可见仍要求显式继续；计时器与时钟故障可见，取消失败锁存。
- [x] AC-08（Node）：五类资格结果正确；`loaded` 只允许进入配置，`createWorld` 失败留在配置；打开与确认之间代际变化被拒绝，不混合 Asset。
- [x] AC-09：运行级消费者逆序、至多一次释放且不迁移；所有者按规定顺序释放，失败仍尝试独立项并锁存；分别验证 `beforeReplace` 路径与 holder 销毁路径（收尾顺序 helper 先释放任务）；替换后没有旧运行或回调；缓存状态变化不重建运行。
- [x] AC-10（Node）：每个有运行的 phase 恰有一份离页登记，exit/dispose 后为零；登记失败回滚。
- [x] 任务诊断的既有测试不改断言通过；`pnpm exec vitest run src/app` 与 `pnpm check` 通过。

## 验证方法

- Node：真实会话与 Runtime、合成任务包、可控计时器、时钟与种子端口替身；部分初始化与释放失败的替身。
- 浏览器验证由 10、11 完成；不适用原版对照。

## 完成证据

- **实现：**
  - [mission-input.ts](../../../../../src/app/resources/mission-input.ts)：`missionInput(logic)` 原样迁自 [mission-diagnostics.ts](../../../../../src/app/resources/mission-diagnostics.ts)（按任务引用的 Asset ID 解码三份逻辑 Asset，解码错误路径 `logic[<Asset ID>].<path>`）；诊断改用它，另导出 `missionFailureOf(error)`（`CoreInputError`/`ContentContractError` → `{ kind, path, reason }`），诊断与所有者的开始拒绝共用这一分类。诊断的既有断言未改动并全部通过。
  - [mission-eligibility.ts](../../../../../src/app/mission/mission-eligibility.ts)：`missionEligibility(holderSnapshot, slotLatch)` 依次给出 `cleanup-failed`、`no-package`、`package-incomplete`（非完整组与全包诊断，后者覆盖组都完整但缺跨组依赖的情形）、`mission-not-attempted`、`mission-failed`（类别、路径、原因）或 `eligible`（附 generation）；只读全包判定、任务诊断与槽位锁存，不读缓存列表、缓存状态或作业结果。
  - [mission-flow.ts](../../../../../src/app/mission/mission-flow.ts)：纯状态机 `nextMissionFlow`（intro、config、departure、flight、menu、ended；不适用的输入返回同一对象），`FLOW_SESSION_PHASES`（各位置对应的会话 phase），`preselectWingman`（首次为名单第 1 项；同一完整内容身份键保持上次成功开始的选择，含无僚机；新身份或新槽位重置）。`MissionStartFailure`：`package-changed`、`cleanup-failed`、`seed`、`rejected`（Core 的类别、路径、原因）、`assembly`（`session`/`consumer`/`leave-guard`，附 `rolledBack`）。
  - [mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)：`createMissionOwner(setup, link)`。打开时要求资格为 `eligible`，否则抛 `MissionUnavailableError` 且不取得任何资源；绑定 holder、generation 与 `contentIdentityKey`，从该代包解码一次三份 Asset 与 `MissionSetup`（配置页数据：任务、组与槽位、难度 19、按名单次序的 `{ index, nameCandidates }`）。确认开始时重读 `current()` 的 generation 与身份，不符即 `package-changed`、不抽种子；之后抽一次种子（异常或非 uint32 即失败，不回退）、以 `initialTransition { gap: 'G-02/2', variant }` 启动会话、按登记顺序 `attachRun`、登记一份离页保护，任一步失败经 `exit` 回滚，回滚失败（含离页适配器自身的 `RollbackError` 或无撤销函数）锁存一个含全部原因的 `RollbackError`；成功才确认选择并进入出发占位。占位：一个单次计时器，以单调时钟累计会话报告的可见时间（`environmentVisible`，含 pagehide 阻断）至 `PLACEHOLDER_MS` 3,000；提前回调只排余量；隐藏时扣除已过时间并撤销计时器；每个占位有 id，跳过须指名当前占位且只接受一次，迟到回调以 token 作废；计时器登记、取消或时钟失败使占位 `failed`（可见并报告，不再结束），取消失败另锁存；出发结束以当前 runId 发 `complete-departure`。任务菜单只在 flight 打开且先确认暂停，`continueFromMenu` 须 resume 成功才关闭菜单，菜单中的 `resume`/`pause` 不适用。重开：`exit` 后撤销离页保护，任何收尾失败汇总锁存并进入 `ended`（`cleanup-failed`），撤销失败的保护保留给最终释放重试；否则回到 G-02/1。录制选项来自 `setup.recording`（开发用 `developmentRecording(producer)` 即 `{ producer, checkpointInterval: 32 }`，生产 null），所有者不读构建模式。
  - 两级所有权：所有者级消费者 `MissionOwnerConsumer { stage: 'input' | 'ui' | 'media', connect(context) }` 在创建时按顺序连接（`context` 为 ownerId、无控制的会话视图 `{ status, currentRun, onStatus }` 与 `previousClosed` 关闭屏障），连接可提供 `release`、`attachRun(run, { ownerId, runId })`（运行级消费者经 `run.ownCleanup` 登记，随运行结束由会话逆序、至多一次释放）与 `onSessionError`（会话异步错误按连接转发）。释放顺序：holder 订阅与占位计时器 → `input` 阶段（逆序）→ 会话 `dispose`（结束运行与其运行级消费者）→ `ui` 阶段 → 离页保护 → `media` 阶段；每步都尝试，失败汇总锁存；返回 thenable 的释放加入关闭屏障，关闭失败异步锁存。创建中途失败按同一顺序回滚，回滚失败抛出 `RollbackError`（槽位锁存它）。06 的桥接按此接入：在 `connect` 中以 `context.ownerId` 建 store 与桥接并 `bind(context.session)`，`onSessionError: bridge.onError`，`release: bridge.unbind`（`ui` 阶段，在会话之后）。
  - [mission-slot.ts](../../../../../src/app/composition/mission-slot.ts)：`createMissionSlot({ onCleanupFailure, reportError, onPackageReplaced })`，每个应用实例一个；`open(create)` 先释放旧所有者，锁存时返回 null 且不调用 `create`；ownerId 从 1 递增、失败的创建也不复用；保存上次确认的选择与关闭屏障；所有者订阅的 `beforeReplace` 交给槽位：先释放（失败先锁存）再调用 `onPackageReplaced(ownerId)`，监听不抛错、不否决替换。`teardownMissionAndHolder(slot, holder)`：先释放槽位再 `holder.dispose()`（释放抛错时仍销毁 holder），供 09 在外壳卸载、holder 更换与 Fast Refresh 时使用。
  - [mission.test-support.ts](../../../../../src/app/mission/mission.test-support.ts)（供 07、09 复用）：`missionGroups`/`missionJob`/`missionHolder`（01 的任务场景经生产导入作业，按作业所有者的方式分出完整组与不完整组摘要，交给 [resource-holder.test-support.ts](../../../../../src/app/resources/resource-holder.test-support.ts) 的 `testHolder`；每个场景只导入与分组一次），`TestClock`、`TestTimer`（手动触发、保留全部回调以便迟到投递、取消先丢弃再抛错）、`TestSeeds`、`TestLeaveGuard`、`testPorts`、`ownerSetup`、`testSlot`、`openMission`（附会话探针 `session()`/`run()`；所有者、holder 与槽位的错误出口分别为 `reportError`、`holderErrors`、`slotErrors`）、`TestConsumer`（记录 connect/attach/cleanup/release，可令各步失败或返回异步关闭）及 `skip`、`toConfig`、`toDeparture`、`toFlight`、`elapsePlaceholder`。
- **Node 测试**（`pnpm exec vitest run src/app/mission src/app/composition/mission-slot.test.ts src/app/resources/mission-input.test.ts src/app/resources/mission-diagnostics.test.ts`：9 个文件、96 个测试通过；全部使用真实会话、Runtime、Core 与 01 的合成任务包）：
  - AC-07：[mission-owner.test.ts](../../../../../src/app/mission/mission-owner.test.ts) 走完 G-02/1 → 配置 → G-02/2 → 飞行 → 重开 → 配置 → 出发 → 飞行 → 返回：2,999 ms 后不结束、下一次回调排 1 ms，3,000 ms 结束；配置页内容等于 `FIVE_WINGMAN_NAMES` 与组 0/槽位 1、难度 19；出发期间 tick 0、无帧请求、离页保护 1 份；重复点击开始不再抽种子；重开后 runId 2、tick 0、种子重新抽取；每次发布的快照都满足 `FLOW_SESSION_PHASES`。无僚机与索引 0–4 各开始一次，运行的 `mission.wingman`、出发变体与重开后的预选一致；选择跨所有者保持，未确认的编辑与失败的开始不覆盖，新内容身份与新槽位（页面重载）重置；种子每次实际创建尝试抽一次，`-1`、2^32、1.5、NaN、字符串与 null 都是失败且会话保持 idle，重复值允许；开发录制的 producer 与间隔 32 进入记录，生产无录制。
  - AC-08：[mission-eligibility.test.ts](../../../../../src/app/mission/mission-eligibility.test.ts) 覆盖四个场景与无包、`not-attempted`、锁存，完整包在提交中、提交失败与已保存时都可开始，缓存列出可恢复条目也不代替持有；`mission-create-rejected` 可进入配置，确认时对 6 种选择都留在配置页显示 `core-input` 与 01 记录的路径和原因，会话 idle、无离页登记；holder 销毁或无通知的代际变化后开始被拒绝且不抽种子；不合资格的包打开时抛 `MissionUnavailableError` 且未订阅宿主、未排计时器。
  - AC-05（所有者部分）：[mission-owner-placeholder.test.ts](../../../../../src/app/mission/mission-owner-placeholder.test.ts) 覆盖提前回调、隐藏与 pagehide 不计时（一小时隐藏后仍只排剩余 2,000 ms）、隐藏前已满 3,000 ms 时恢复后的下一次回调结束、隐藏页面上打开时不排计时器；跳过只对当前占位生效一次，旧占位的计时器与跳过不能结束下一占位；出发期间隐藏后无论自然结束还是跳过都进入 paused（hidden），恢复可见后仍须显式继续；重开或释放后旧出发回调与跳过不启动运行；计时器登记失败、时钟抛错/非有限/倒退、时钟与取消同时失败均可见并报告，取消失败锁存且运行保持 transition。
  - AC-09、AC-10：[mission-owner-ownership.test.ts](../../../../../src/app/mission/mission-owner-ownership.test.ts) 以 6 个分阶段消费者验证连接一次、运行级逆序释放且不迁移、释放顺序（计时器 → input 逆序 → 运行级逆序 → ui 逆序 → 离页保护 → media 逆序）、失败全部尝试并汇总锁存、消费者视图没有控制、会话异步错误转发；开始回滚（attach 失败、回滚失败锁存 `RollbackError`、离页登记失败、离页 `RollbackError` 与运行收尾失败同时出现时保留全部原因、状态监听失败）与创建回滚；离页保护在 transition、running、paused、菜单、faulted 各 1 份，intro、配置、exit 与 dispose 后为 0，撤销失败锁存并在最终释放时重试；`beforeReplace` 先释放所有者（新包持有前）再返回菜单，旧帧回调无效，释放失败先锁存且不否决替换；单独 `holder.dispose()` 不释放所有者，`teardownMissionAndHolder` 在 holder 仍持有包时先释放；缓存状态变为已保存与重新列出不重建运行；异步关闭屏障在确认前挂起、确认后为 true，关闭失败锁存。stopped 由 [mission-owner-stopped.test.ts](../../../../../src/app/mission/mission-owner-stopped.test.ts)（isolated 项目，按会话测试的先例只在创建边界注入录制拒绝）验证：流程进入 `ended`（stopped），离页保护保留到重开或释放。槽位见 [mission-slot.test.ts](../../../../../src/app/composition/mission-slot.test.ts)。
- **工程检查：** `pnpm exec vitest run src/app`（41 个文件、834 个测试）、`pnpm typecheck`、改动文件的 ESLint 通过；`pnpm check` 通过（232 个文件、6,819 个测试与构建，含工程边界回归：`app/resources` 新模块在 Node 程序中、mock 文件归 isolated 项目）。
- **rubber-duck：** 无阻塞问题；采纳全部 4 项：重开时撤销失败的离页保护保留给释放重试，且与运行收尾失败汇总为一个原因；离页登记的 `RollbackError` 不再提前锁存，改由回滚统一锁存含全部原因的 `RollbackError`；隐藏时时钟与取消同时失败两者都保留；补 stopped 阶段的离页保护测试。自查另修正：创建回滚由槽位锁存 `RollbackError` 而非单个释放失败；会话状态中的清理失败在意图处理之后再锁存，使回滚的 `RollbackError` 优先。
- **simplify：** 采纳：抽出 `#exitRun()` 供开始回滚与重开共用、统一的失败合并、去掉 `#status` 缓存（直接读会话状态）、诊断与所有者共用 `missionFailureOf`、测试支持缓存场景分组、新增 `toDeparture`、以 `FLOW_SESSION_PHASES` 检查每次发布的快照。未采纳：把 render 的 `attemptAll` 移到中性模块（超出写入范围，且所有者的步骤还收集异步关闭）；以会话状态派生流程位置（spec 数据模型把流程位置与当前运行身份列为流程状态）；在 holder 上缓存解码结果（holder 不在写入范围）；`mission-input` 迁入的既有写法与监听集合复制等微优化。
- **文档影响：** 工程约定与 app 模块分册由 15 统一更新（其写入范围含 `docs/engineering/**`）；本项不改文档，建议条目见 worker 报告。现有 app 分册对任务载入诊断的描述仍准确（行为未变）。
