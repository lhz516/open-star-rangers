---
type: plan
status: active
phase: P1
task: "09"
subtask: "03"
updated: 2026-10-10
---

# 03 — 合成键位映射、会话动作分流与清键

**契约来源：** [Spec](../spec.md) 的 S-02/03/05、AC-01 至 AC-07、AC-12/14 与技术决定 4–8。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 UI/game 交付[键位文档 §2](../../../../engineering/keyboard-input.md#2-当前绑定表)五行映射：方向轴、N/X 命令、P 控制。消费者只依赖 01 的源端口和记录，不导入真实浏览器源，因此不依赖 02。
- 运行绑定窄扩展 setInput，保持 retired/unbind 保护和 Session 当前身份/phase 校验；store 的 UiActionError.operation 增加 input。
- 轴经当前绑定；命令复用 SyntheticCommandFeedback；P 复用 SyntheticGameControls 和 syntheticControlAvailability，按当前 Session 状态核对，不靠过期 React/store 缓存。
- 所有暂停清键，paused/idle/faulted 不登记轴；start/resume/new run 都不补旧输入。状态、取消、错误、清理及 attach 只做本地清理/接线，绝不调用输入或控制，也不排微任务绕过限制。
- 失焦/隐藏/pagehide 信号清表，仍合法 running 时立即发送 0。覆盖“源先清键、Session 后暂停”与相反顺序；旧 run 回调不能污染新 run。
- 已入队离散命令不因仅焦点变化撤回；取消/unconfirmed 按已有 Session 反馈，不重提、不乐观成功。
- 提供只读键盘状态快照：active/inactive 或 unavailable+原始 error，稳定引用且不按 tick 通知。input 同步失败保留 cause；实际成功轴变更只清旧 input 错误，no-op/忽略不清错。

## 不包含

- DOM 监听生产源（02）、owner/页面接线（04）。
- Core/Runtime/Session 修改、新命令/队列/控制、录制格式或额外调度。
- 独立键位文档定稿（06），其旧暂停规则不作为本项合同。

## 关键文件与契约

- **计划新增：** `src/ui/game/synthetic-keyboard-input.ts`、`synthetic-keyboard-input.test.ts`。
- **扩展现有：** [synthetic-session-bridge.ts](../../../../engineering/source-structure.md#r6-合成-ui-层)及[邻接测试](../../../../engineering/source-structure.md#r6-合成-ui-层)；[synthetic-game-store.ts](../../../../engineering/source-structure.md#r6-合成-ui-层)及[邻接测试](../../../../engineering/source-structure.md#r6-合成-ui-层)。
- **复用不另写判定：** [命令反馈](../../../../engineering/source-structure.md#r6-合成-ui-层)、[控制/可用性](../../../../engineering/source-structure.md#r6-合成-ui-层)及[真实 UI 测试设施](../../../../engineering/source-structure.md#r6-合成-ui-层)；测试设施如需记录 setInput，仅增加观测包装。

## 验收标准

- [x] AC-01/02：五行映射一致；单/双轴、释放与重复发送序列正确，真实 Session 的逐 tick 投影与相同输入参考 Core 逐位相等。
- [x] AC-03/04：N/X 仅一次提交，pending 经事件结算；P 覆盖 user/hidden 暂停、离页阻断、非法状态与同步错误；取消/unconfirmed 不重提。
- [x] AC-05：修饰键/composition 的轴 keyup 释放但不拦截；无资格/未知/重复/不可用路径没有虚假错误或额外命令。
- [x] AC-06/07：暂停、失焦、hidden、pagehide、restart/exit/fault/dispose 均清表；恢复的 repeat 不能建表，新非重复按下才生效，所有受限通知无输入/控制调用。
- [x] AC-12：input 错误保留原因和操作名；仅成功轴变更清旧 input 错误，不覆盖独立错误；状态快照不因 tick/相同状态重复发布。
- [x] retired/unbind/旧 run 的 setInput 不触及运行；目标测试与 `pnpm check` 通过，上游契约及测试不放宽。

## 验证方法

- `pnpm exec vitest run src/platform/input/keyboard-input.test.ts src/ui/game`，使用真实 Session、ControlledHost、store、桥接和命令反馈；测试源只按 01 端口交付记录，不伪造游戏结果。
- 固定种子与 tickRate，逐 tick 记录按键序列推导的 MoveInput；参考 Core 使用同一序列，比较投影。需要检查录制时使用现有 recording 选项，不改版本。
- 在通知边界记录 setInput/submitCommand/control 调用，确认暂停后既有轴归零且没有从 attach/status 补发；分别保留旧绑定/信号回调测试身份隔离。
- 浏览器反馈由 05 核验。本项收尾按 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限于消费者及必要的桥接/store 扩展。

## 完成证据

### 2026-10-03：实现与接口

- 新增 [synthetic-keyboard-input.ts](../../../../engineering/source-structure.md#r6-合成-ui-层) 与[邻接测试](../../../../engineering/source-structure.md#r6-合成-ui-层)。冻结的 `SYNTHETIC_KEYBOARD_BINDINGS` 恰好含 ArrowLeft/ArrowRight/KeyN/KeyX/KeyP；轴表从该映射派生，分类与按住推导复用 01 的 `classifyKeyboardInput`/`HeldKeyboardAxis`。消费者只依赖通用源端口，不导入浏览器源。
- owner04 的准确接线接口：

  ```ts
  const keyboard = createSyntheticKeyboardInput(
    { store: writer, session, bridge, feedback, controls },
    { source }, // 或 { unavailable: cause }
  );
  ```

  在 bridge 已绑定到同一个 session、已有 feedback/controls 后创建；键盘不用加入 bridge 的 run consumers。连接时同步 initial 信号重核 active/inactive，但同步初始按键不提交动作。外部只向 React 交出 `keyboard.reader`（冻结的 `getSnapshot`/`subscribe`），owner 持有 `keyboard.dispose()`；先 dispose 键盘，再销毁 Session，之后继续其他独立清理并锁存失败。此处仅交付接口，未修改 owner、hook 或页面，也未执行 04。
- `SyntheticRunBinding.setInput` 与 command 相同先做 retired/unbind 保护，Session 保留 run identity/phase/通知模式的最终判定。store 只窄扩展 `UiActionError.operation='input'`；[测试设施](../../../../engineering/source-structure.md#r6-合成-ui-层)只增加 setInput 观测并暴露桥接所用的稳定 Session 包装，不伪造模拟结果。
- 每次按键读取当前 Session/status 与 bridge binding；命令复用 feedback，P 复用 availability/controls，不依赖 store 的旧状态。状态订阅只做本地清表，所有暂停/结束/替换后 start/resume/repeat 均不补轴。源失焦信号只有在合法 running 边界且轴数值实际变化时发送 0；不取消已排队命令。
- reader 快照为冻结判别联合 `{state:'active'|'inactive'}` / `{state:'unavailable',error}`，同状态保持引用，tick 与会话 phase 不通知；dispose 后为 inactive、订阅停止、旧 sink/status 回调无效。普通 source 登记错误（包括普通 AggregateError）显示 unavailable 并保留原 error；source 或 unavailable 中的 `RollbackError` 始终向装配层抛出，先回滚已取得的状态订阅；消费层回滚失败也保留原始异常与全部新增原因。
- dispose 先逻辑失效/清表，再释放 source、取消状态订阅；两项独立失败全部尝试并汇总为 AggregateError，正常和失败后的重复 dispose 均无效果。失败不宣称物理监听已释放；后续 owner04 必须纳入既有清理失败锁存。

### 验收与检查

- 消费者 45 项测试结合真实 Session、ControlledHost、store、桥接、feedback 和 controls；十个成功 tick 的单/双键与任意释放顺序逐 tick 比对独立参考 Core 的完整 projection（逐位相等），同时验证实际 setInput 序列和既有 recording `record.ticks` 输入。repeat、不变轴值和空表 keyup 没有额外发送。
- N/X 覆盖 pending → accepted/rejected，以及 focusout 不撤回已入队命令；P/面板暂停和 hidden 覆盖 FIFO cancelled。Core 第一个 tick 故障保留 cancelled/failure，第二个 tick 故障保留成功前缀与 unconfirmed/session-failed；没有乐观成功或重提，restart 后 marker/轴均从零开始。
- 覆盖普通/modifier/composition keyup 的释放与拦截分离、Shift、未知 code（含原型属性名）、输入资格失效、idle/paused/faulted/disposed、store 过期、pause 同步调度取消失败、resume 可见性检查竞态和 input/command/control 同步原因保存。成功轴变化仅清 input 错误，独立 actionError/sessionError 不覆盖；忽略与 no-op 不清错。
- 生命周期覆盖所有暂停、focusout/window blur、hidden/pagehide 两种源/Session 顺序、无新 focusin 的 window focus/pageshow、双键轴为零时清表、restart/exit/start、fault、dispose、旧运行绑定与旧 status/sink 回调。状态通知内无输入/控制，初始连接/恢复/运行 attach 没有补发；所有正常序列无 invalid-state。
- 邻接桥接测试验证 retired/unbind 不再调用运行，旧 run 由 Session 拒绝且新世界不变，paused 错误仍来自 Session；store 测试验证 input operation、冻结外壳与原始 cause。
- 通过生产 DOM-free `createKeyboardSource` + 最小 KeyboardHost 连接真实消费链，验证资格重核、九项监听与释放、部分登记成功回滚时的 unavailable，以及真实移除失败的 RollbackError 和状态订阅回滚。假源另验证残留/晚到回调、释放顺序、同步初始化按键忽略、status 登记失败和全部独立释放/回滚原因。以上是 Node 边界证据，不冒充原生浏览器焦点、系统快捷键或页面接线验收。
- `pnpm exec vitest run src/platform/input/keyboard-input.test.ts src/ui/game`：8 个文件、128 项全部通过。
- `pnpm check`：三个 TypeScript 程序、ESLint、46 个测试文件/1178 项测试、生产构建全部通过；仅既有主块约 804 kB（gzip 217 kB）体积警告，没有为本项改分块或放宽检查。VS Code 测试工具未发现这些 Node 测试，因此使用仓库现有 Vitest 命令。
- rubber-duck/simplify 后再次运行目标测试与完整 `pnpm check`，结果相同；编辑器诊断无错误。四篇改动文档的 front matter/2026-10-03 日期与 121 个相对链接/锚点通过本地检查，`git diff --check` 通过，`node tools/task-state.ts p1/09 --json` 验证图结构且下一项为 04；遵照本轮仅 03 的授权，在此停止而不执行 04。

### 审阅、simplify 与文档影响

- 必需 rubber-duck：对本项全部确切代码 diff（含新文件）与直接相关文档完成**一次**只读审阅，结果为“无显著问题”；无适用待修项、无重复委派。已调用 simplify；按当前明确的单项范围直接检查复用、复杂度、效率和抽象层级，没有需要引入新抽象或改动行为的清理项，也未追加实现/清理代理。
- 同步[工程约定](../../../../engineering/README.md#ui-投影与指令反馈)的工厂、只读 reader、通知边界、错误与释放接口，以及[源码结构指南](../../../../engineering/source-structure.md)的实际模块落点；本文件/工程文档 updated 为 2026-10-03，goal 只改变 row03。
- approved spec、独立键位文档草案、Core/Runtime/Session、源 01/02、owner/页面 04、依赖/录制格式与原版记录均未修改。独立键位文档定稿仍归 06；原生浏览器证据归 05。阶段摘要、优先项和项目阻塞没有变化，因此不修改 STATUS；无新原版事实或冻结决定，不新增 ADR/研究记录。
