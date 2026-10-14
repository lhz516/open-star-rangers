---
type: plan
status: active
phase: P3
task: "05"
subtask: "21"
updated: 2026-10-10
---

# 21 — 能力申请生命周期：全屏、Keyboard Lock 与 Pointer Lock

**契约来源：** [spec](../spec.md) 的[全屏与 Keyboard Lock](../spec.md#全屏与-keyboard-lock)、[生命周期与资源](../spec.md#生命周期与资源)“异步申请”、[清键与恢复](../spec.md#清键与恢复)（退出全屏、退出 Pointer Lock）、[数据模型与契约](../spec.md#数据模型与契约)的“能力申请状态与错误”行，技术决定 7；S-10、S-12、S-14 的能力部分；AC-13、AC-14、AC-16 的 Node 部分。
**依赖：** 13、14、20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/ui/game-input/capabilities.ts` 并接入 20 的输入消费者：全屏、锁键与 Pointer Lock 各自的 `unsupported`/`idle`/`pending`/`active`/`failed` 状态，带 owner、run 与申请代次；同种能力至多一个未结申请。
- **全屏：** 开始手势中发起的申请先绑定该次 start attempt，仅在这次 start 成功后关联其 run，不借给后来的重开；开始失败、返回菜单、取消或重开撤销资格，正常的配置→占位→飞行转换不撤销。只退出本任务申请且仍拥有的全屏。退出全屏时使锁键资格失效、清本地按住与重复，running 时 `clearInput('focus-loss')`，不单独暂停；同时 hidden 时以会话自动暂停为准。
- **锁键：** 只在 API 全屏、running 且输入区合格时以 19 推导的 code 清单锁定（不锁 Escape、Tab、Meta、F12）；暂停、失焦、任务菜单、配置、占位、stopped/faulted、离开页面或全屏时立即解锁；重新合格后满足条件才恢复，需要新手势时由状态提示按钮，不无限重试。锁键失败但全屏成功时保留“全屏、未锁键”并给出降级原因。
- **Pointer Lock 的通用部分：** 申请、实际目标确认与主动/被动解锁的状态与代次，供 22 使用；每次从本任务的锁定转为无锁都清本地状态，running 时 `clearInput('pointer-lock-exit')`。
- **迟到与屏障：** 主动取消立即逻辑失效；迟到成功只能对仍由本任务拥有的目标解锁/退出，不重设焦点、不改模式、不提交动作；迟到失败进入原申请的错误/收尾记录。跨 owner 等待 `previousClosed`，同 owner 重开也等待旧申请/关闭收尾；旧 disposer 不能解除新运行的锁。每项清理独立尝试、聚合失败；无法确认释放则锁存，不报“已释放”。
- 能力状态与失败写入 20 的输入状态供界面显示；不进入 Core 或录制。
- Node 测试：受控 Promise 与 change/error 事件的各种排列（成功、失败、部分成功、迟到成功/失败、未结时离页、重开与跨 owner 屏障），锁键启停条件矩阵，退出全屏与解锁的清键。

## 不包含

- 平台适配（13、14）；地图位置、光标与命令（22）；按钮与提示的呈现（23）；装配（25）。

## 关键文件与契约

- 13 的 `pointer-lock.ts`、14 的 `fullscreen.ts`；20 的 `input-consumer.ts`、`input-status.ts`；[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 的 `previousClosed`；[rollback-error.ts](../../../../../src/app/session/rollback-error.ts)。
- 计划新增：`capabilities.ts`、`capabilities.test.ts`。

## 写入范围

- `src/ui/game-input/capabilities.ts`、`src/ui/game-input/capabilities.test.ts`
- `src/ui/game-input/input-consumer.ts`、`src/ui/game-input/input-consumer.test.ts`
- `src/ui/game-input/input-status.ts`、`src/ui/game-input/input-status.test.ts`

## 验收标准

- [x] 各能力的状态、代次与单一未结申请成立；开始手势的全屏只关联成功的那次 start。
- [x] 锁键只在全屏+running+合格输入区启用，清单不含 Escape/Tab/Meta/F12，所有规定情形立即解锁；失败与降级如实显示。
- [x] 迟到结果不影响新运行，屏障与清理聚合、锁存符合契约（AC-16 的 Node 部分）；退出全屏与解锁的清键符合 AC-13。
- [x] `pnpm exec vitest run src/ui/game-input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 受控 Promise 与事件排列；浏览器与实机由 28、30 验证。

## 完成证据

- **实现：** [capabilities.ts](../../../../../src/ui/game-input/capabilities.ts) 的 `createInputCapabilities` 是输入消费者在所有者生命期内持有的能力控制器（DOM-free），经 13 的 `createPointerLock`、14 的 `createFullscreenPort` 两个端口工作。每次申请是一条带 owner、run（开始手势中的全屏先为 null）与代次的记录；每种能力至多一个在端口未结的申请，`revoke` 立即使其逻辑失效。状态按真实事实推导：全屏以实际全屏元素、锁键以本端口当前成功的锁、Pointer Lock 以端口确认的目标为 `active`，从不以 API 存在或 promise 完成冒充。
  - **全屏：** `startWithFullscreen(start)` 只在同时支持全屏与 Keyboard Lock 且尚未全屏时，于手势中同步请求，再调用 `start`；`start` 开出新运行才把申请关联到该 run，否则撤销（迟到成功只退出）。重开（运行从非 `transition` 阶段离开会话，由所有者级状态订阅判断）、显式退出与释放时撤销未结申请并只退出本端口进入且仍拥有的全屏；开始回滚（运行从 `transition` 离开）、stopped 与 faulted 不退出。退出全屏使锁键失效，经 `GameInputConsumer.clear('focus-loss')` 清键（running 时一次 `clear-input`，hidden 时会话已自行暂停，只清本地）；撤销申请的迟到全屏被退出时不清键。
  - **锁键：** 以注入的 `keyLockCodes`（由绑定表推导，19 交付生产清单；创建消费者时校验非空且不含 Escape、Tab、Meta、F12）在“API 全屏且无本端口未结的全屏申请或退出 + running + 输入区合格”时锁定，否则立即解锁（已锁或未结皆然）；被撤销的锁未结时不发新锁，待其结清再按条件锁定。失败后保留“全屏、未锁键”与原因，不再自动重试，直到新手势（`retryKeyboardLock`、开始或全屏按钮）。解锁抛错时保持锁定状态并记 `release` 失败，下次条件变化再试。
  - **Pointer Lock（通用部分，供 22）：** `requestPointerLock` 绑定当前运行；端口在 promise 观察者之前回报的 `lock(true)` 若属当前未撤销申请即为 `active`，否则作为迟到成功立即 `exit()`，不改状态、不清键、不转发指针输入。`exitPointerLock` 撤销未结申请并对已持有的锁只请求一次退出（期间不再转发相对输入）；端口每次回报本任务的锁结束都经 `clear('pointer-lock-exit')` 清键（running 时一次 `clear-input`）。运行的输入接线结束（故障、退出）或运行离开会话时结束其锁。`pointerLocked()` 取端口的实际持有，用于 Esc 门控。
  - **屏障与释放：** `previousClosed` 结清（真或假；假时槽位已锁存）前、或同种能力仍有旧申请/退出未结时，全屏与 Pointer Lock 申请记为 `closing` 失败，锁键等待。释放先使全部未结申请失效，再逐项尝试取消状态订阅、解锁、撤监听；仍有未结的锁键、全屏申请或退出、Pointer Lock 申请时返回异步关闭：等待锁键结清（解锁失败后若锁生效则再解）、退出迟到成功的全屏、保持 Pointer Lock 端口连接直到结果后再释放；无法确认的退出以 `CapabilityReleaseError` 使关闭失败，所有失败聚合后由所有者锁存。连接失败回滚已连接的端口（回滚失败为 `RollbackError`）。
- **接入与状态：** [input-consumer.ts](../../../../../src/ui/game-input/input-consumer.ts) 的选项增加 `fullscreen`、`pointerLock` 工厂与 `keyLockCodes`（取代 20 的 `pointerLocked` 谓词），连接键盘源后连接能力，释放时先失效、撤键盘源、再释放能力，同步与异步失败合并（只有一个时原样抛出）；资格变化与运行解除接线时通知能力；`capabilities` 暴露给 23/25（开始、全屏按钮、重试锁键）与 22（Pointer Lock）。[input-status.ts](../../../../../src/ui/game-input/input-status.ts) 增加 `capabilities.{fullscreen,keyboardLock,pointerLock}`：`state`、`ownerId`、`runId`、`generation`、`failure { operation: 'request' | 'release', reason }`（只用平台端口的稳定类别与 `closing`，不含宿主异常），三项一次写入、未变者保持原对象。
- **Node 测试：** `pnpm exec vitest run src/ui/game-input`：7 个文件、181 项通过（[capabilities.test.ts](../../../../../src/ui/game-input/capabilities.test.ts) 29 项、[input-status.test.ts](../../../../../src/ui/game-input/input-status.test.ts) 5 项、[input-consumer.test.ts](../../../../../src/ui/game-input/input-consumer.test.ts) 31 项）。能力测试用真实所有者/Session/Runtime（ControlledHost、开发录制）、假键盘源、`TEST_BINDINGS` 推导的锁键清单，以及真实的 13/14 端口包在可手动结清 promise、触发 change/error 事件的假宿主上；stopped 以 mission-owner-stopped 测试相同的录制拒绝注入产生。断言：
  - S-12/AC-14：开始手势中、`start` 运行之前已同步请求全屏（pending，run 为 null），开始成功后关联 run 1；出发占位到飞行不撤销；seed 失败的开始立即撤销，紧接的开始因旧申请未结得到 `closing`（关联到新 run）且不借用旧申请，旧申请迟到成功只被退出；开始回滚不退出此前按钮进入的全屏，重开退出；用户自己的全屏从不退出；故障与 stopped 只解锁、保留全屏，重开时才退出；请求被拒、未进入、宿主抛错分别显示 `rejected`/`not-entered`/`failed` 且任务照常进入飞行；不支持全屏或 Keyboard Lock 时开始不请求、状态为 `unsupported`，按钮在无 Keyboard Lock 时仍可全屏；显式退出撤销未结申请，退出失败保持 `active` 并记 `release` 失败。
  - 锁键：出发占位中不锁；飞行且聚焦时以完整清单锁定（不含 Escape/Tab/Meta/F12），暂停、失焦、任务菜单、hidden、退出全屏各自恰一次解锁、恢复后各一次重锁；故障、重开、开始页与下一次出发均不锁；未结的锁被解锁后不发第二个，旧锁结清（被替换）后才锁；被本任务解锁替换的迟到失败不算失败，其他迟到失败只在仍是最新申请时显示且不阻止下次锁定（Pointer Lock 同样：较新的 `closing` 不被旧申请的迟到拒绝覆盖，自身为最新时显示 `rejected`）；拒绝（`denied`）后保持全屏、暂停/失焦往返都不重试，`retryKeyboardLock` 后才再锁；解锁抛错时保持 `active` 并在下次变化时再解；未结的全屏申请（含先报 change 后结清 promise 的已撤销申请）期间不锁键。
  - Pointer Lock：无运行时不申请；重复申请只有一次宿主请求，代次与 run 正确；`other` 目标为 `target-mismatch`，error 事件为 `rejected`，不支持为 `unsupported`；确认目标后锁指针时 Esc 不打开菜单、不调用端口；被撤销申请的迟到锁立即退出、状态不变、不清键，持有期间新申请为 `closing`；重开与故障各退出一次运行的锁；直接控制器测试确认解锁时转发绝对输入、锁定时转发相对输入、主动退出与迟到锁期间不转发。
  - S-10/AC-13：飞行中按住 `KeyI` 后用户退出全屏，恰一次 `clear-input('focus-loss')`、下一 tick 中性；同时 hidden 时只清本地；被动与主动解锁各恰一次 `clear-input('pointer-lock-exit')` 且下一 tick 中性，暂停中解锁只清本地，恢复后仍中性、须新按下。
  - S-14/AC-16：重开后旧运行的未结锁键与 Pointer Lock 申请令新运行的申请等待（`closing`），其迟到成功被撤销/退出，不影响新运行，旧锁结清后新运行才锁（run 2）；下一所有者在上一所有者的异步关闭（未结 Pointer Lock 申请、未结锁键）确认前不申请全屏/Pointer Lock、不锁键，关闭确认后才可；释放先失效（之后的事件不再写状态），聚合解锁失败与全屏退出失败（`CapabilityReleaseError('fullscreen', 'rejected')`）为所有者清理失败；解锁失败而锁随后生效时关闭中再解；释放后迟到的全屏成功被退出；无未结项时同步释放且端口释放退出所持的锁；能力端口连接失败使所有者创建失败、键盘源撤销，回滚失败为 `RollbackError`；空或含不可锁 code 的清单在创建消费者时抛 `RangeError`。
  - 变异检查：分别去掉未结全屏申请的锁键门、重开撤销全部申请、退出期间的指针输入门、释放等待锁键、开始失败撤销、撤销全屏结束不清键、`previousClosed` 屏障、失败后阻止重锁、迟到锁转为 stale、重开与回滚的区分、解锁清键、退出全屏清键、失格解锁、开始关联 run、迟到失败只记最新、未结时保持 Pointer Lock 端口连接、退出只请求一次，共 17 处，各至少一项测试失败。
- **工程检查：** `pnpm typecheck`、`pnpm exec eslint src/ui/game-input` 通过；`pnpm check` 通过（review 修正前一次：240 个文件 7264 项；review 与 simplify 后：240 个文件 7268 项、生产构建；补最后一项用例后：240 个文件 7269 项、生产构建），未出现 5 秒超时。
- **rubber-duck：** 6 项发现全部处理：(1) 释放未把未结锁键计入关闭屏障——改为等待其结清，必要时再解，并补跨所有者测试；(2) 无运行时由按钮发起的全屏申请在重开后未被撤销——重开改为撤销全部未结全屏申请，开始回滚仍只撤销该运行的；(3) 主动退出 Pointer Lock 后仍转发相对指针输入——退出前先标记撤销、期间不转发（退出失败则恢复以便重试），补直接控制器测试；(4) 已撤销申请的全屏 change 先于 promise 到达时可能锁键——全屏申请未结期间不锁键，`#undoing` 在退出前设定，补测试；(5) 迟到失败被丢弃——改为属于原申请：仅当它仍是最新申请时显示，锁键中由本任务解锁导致的 `superseded` 不算失败；(6) 被 `closing` 拒绝的开始申请未关联 run——改为也关联。
- **simplify：** 采纳：`Track` 的代次由最新申请推导，`open`/`settled` 合并为一条记录并以 `revoke` 方法返回其结清 promise；释放与连接回滚复用 `render/scene/cleanup.ts` 的 `attemptAll`（`ui/game` 已复用）；三项能力状态一次写入；消费者的能力事实直接取 `#moment`。未采纳：锁键 code 校验与 14 的端口重复（端口校验未导出且不在写入范围，创建时校验可提前暴露配置错误）；以显式的开始结果与运行结束原因取代 run ID/阶段推断（需要修改 `app/mission`，不在写入范围）；`{ errors, closes }` 释放协议（避免嵌套 AggregateError）；缓存宿主读数（实时读取才能如实显示，读数成本低）。
- **文档影响：** 本项写入范围不含文档；建议 32 在 [键位文档](../../../../engineering/keyboard-input.md) §7（全屏 + Keyboard Lock、Pointer Lock 行）、[ui 模块说明](../../../../engineering/modules/ui.md)与[源码结构指南](../../../../engineering/source-structure.md)记录能力控制器的状态与原因类别、申请代次与屏障、开始手势全屏的关联规则、退出全屏按 `focus-loss` 清键，以及释放可能成为异步关闭；浏览器与实机行为仍由 28、30 验证。

