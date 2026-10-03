---
type: plan
status: accepted
phase: P1
task: "06"
updated: 2026-10-02
related: [ADR-0002, ADR-0006, ADR-0008, ADR-0012, ADR-0015]
---

# P1-06：UI projection 与 React 指令闭环 — Spec

## 问题与目标

合成 Core、Runtime 和 Session 已有纯投影、帧后命令反馈与生命周期接口，但 [App](../../../../src/app/App.tsx) 仍为占位页面，尚无 Zustand、UI 桥接或 React 消费者。当前不能从实际页面证明“点击提交意图 → Core 判定 → 显示真实结果”，也不能证明消费者会随运行切换和 React 卸载正确释放。

本任务建立一个明确标记为 **P1 合成工程演示、非原版玩法** 的开发面板：React 读取降频投影，提交已有 marker 命令与独立会话控制，分别显示待处理、Core 接受、Core 拒绝、会话取消和故障后的未确认结果。UI 不先行修改 marker，不复制整个世界，不承载逐帧模拟或 Classic 飞行 HUD。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p1-06-ui-projection-与-react-指令闭环)。本任务直接支持 P1 的“React 指令经 Core 反馈”，并提供 P1-08/10 所需的 UI 消费者；不独自完成合成 Three.js 场景或阶段退出评审。

直接依赖 [P1-05](../05/spec.md)，传递依赖 P1-01 至 P1-04。生成本 Spec 时，[P1-05 tracker](../05/goal.md#子任务跟踪) 的 01–07 为 completed、08 最终对齐仍为 pending；可先规划，但不得把已有代码或目录迁移当作该前提已完整验收。实施前须核验其最终对齐证据。

## 范围

### 包含

- **S-01 投影 store：** 引入 Zustand vanilla store，保存当前会话状态、最新 `SyntheticUiProjection` 和最小命令反馈；写入口归桥接，React 只读并按 selector 订阅。
- **S-02 分层发布：** 常规投影固定按 10 Hz 采样；初次接线、运行切换、命令结果、取消、暂停/继续与故障等关键边界立即发布。只消费 Session 通知，不新建游戏循环或采样定时器。
- **S-03 游戏命令闭环：** React 提交已有 `add-marker` / `remove-marker`，以运行身份和 Runtime commandId 关联反馈；入队不是成功，接受与两种 Core 拒绝均可从页面验证。
- **S-04 取消与故障反馈：** 消费 `onCommandsCancelled`，明确区分取消、Core 拒绝、提交时同步失败及“已可能提交但结果未送达”；不能永久留下 pending 或通过重试掩盖未知结果。
- **S-05 会话控制与错误出口：** 开始、暂停、继续、重启、退出直接走 `SyntheticSession.control`；依据真实状态启用控件，呈现同步错误、异步会话错误及 `cleanupFailed`。
- **S-06 开发演示接线：** 在现有应用入口接入非飞行 React 面板，展示投影字段、会话状态、待处理命令和最近反馈；可用鼠标及原生按钮键盘操作，不要求先导入原版数据。
- **S-07 所有权与释放：** store 和运行订阅按 owner/运行隔离，暂停不销毁，重启不继承旧反馈；退出、故障、卸载、StrictMode effect 重建与 HMR 均释放本任务拥有的资源。
- **S-08 验证与依赖边界：** 新增邻接 Node 契约测试和真实浏览器交互证据，保留既有 Core/Runtime/Session/replay 行为，依赖及锁文件遵循现有工程与许可证政策。

### 不包含

- Three.js、Canvas/WebGL、飞行画面比例、驾驶舱/HUD/MFD、相机与 GPU 资源：由 P1-07 和后续任务负责。本面板是开发诊断界面，不是 DOM 飞行 HUD。
- 正式菜单、导入流程、设置页面、战略地图或完整恢复 UX：P1-08/后续阶段负责；不创建真实 File/Worker/缓存接线或假的导入成功。
- 游戏键位、全局键盘监听、鼠标飞行、Gamepad、Pointer Lock、Keyboard Lock 与重映射：不在本任务范围；原生按钮交互不等于游戏输入适配。
- 新 Core 命令、marker 规则、实体字段、正式玩法、通用命令框架、中央 schema、第二套世界或 Event Bus。
- IndexedDB/localStorage、Zustand persist、玩家存档、资源指纹、回放文件导入导出 UI、遥测或网络服务。
- Playwright 项目依赖/E2E runner、CI、云部署、发布性能与多设备兼容矩阵；项目级浏览器回归入口由 P1-10 建立。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| [core/synthetic](../../../../src/core/synthetic/)（已有） | 复用纯投影、Command、DomainEvent 与 replay；不修改规则、版本或时间单位 |
| [app/session](../../../../src/app/session/)、[app/runtime](../../../../src/app/runtime/)（已有） | 使用公开 Session/SessionRun 和帧后 EventDelivery，不暴露内部 frame/step/publish |
| `src/ui/game/`（计划新增） | synthetic 命名的 vanilla store、投影桥接、命令反馈及 selector；不创建整个世界的镜像 |
| `src/ui/dev/`（计划新增） | 合成开发面板、状态和错误反馈；与正式菜单和飞行 HUD 分开 |
| [App](../../../../src/app/App.tsx)，必要时 `src/app/composition/`（后者计划新增） | 装配会话、浏览器宿主、UI 桥接及 owner 清理；不引入全局会话单例 |
| [browser-session-host.ts](../../../../src/platform/browser/browser-session-host.ts)（已有） | 复用真实 rAF/页面生命周期适配；不增加另一套监听或循环 |
| [package.json](../../../../package.json)、[pnpm-lock.yaml](../../../../pnpm-lock.yaml)（已有） | 实施时加入 Zustand 并同步锁文件；本次 Spec 生成不安装依赖 |

## 当前实现与依据

- [synthetic-scene.ts](../../../../src/core/synthetic/synthetic-scene.ts) 已定义 `Command`、`DomainEvent`、`SyntheticUiProjection` 和 `SyntheticScene.uiProjection()`。投影是脱离内部状态、深冻结的纯数据；读取不推进 tick、不消耗 RNG。字段依据 [P1-02 契约](../02/spec.md#数据模型与契约)，不是正式玩家世界。
- [synthetic-runtime.ts](../../../../src/app/runtime/synthetic-runtime.ts) 已负责 FIFO 命令队列，`submitCommand()` 返回运行内 commandId；[synthetic-event-bus.ts](../../../../src/app/runtime/synthetic-event-bus.ts) 的 `EventDelivery.commandId` 用于关联，Core 的 `commandIndex` 不是该 ID。帧末事件观察者读到本帧最终状态，而非事件发生时的中间状态。
- [synthetic-session.ts](../../../../src/app/session/synthetic-session.ts) 已有 `SessionStatus`、`SessionFrame`、`SessionCommandsCancelled`、`SessionRun`、`SyntheticSession`。`onStatus` 不回放历史；晚接消费者先主动读取当前状态/投影。暂停时游戏输入拒绝，但会话控制仍可用。
- [session-errors.ts](../../../../src/app/session/session-errors.ts) 定义同步/异步错误数据；`cleanupFailed` 是持续阻断事实，不能仅通过最近 error 推断可否重启。故障后的 run 可读最后成功投影，但不能注册消费者或提交输入。
- [Runtime 事件测试](../../../../src/app/runtime/synthetic-runtime-events.test.ts)、[Session 消费者测试](../../../../src/app/session/synthetic-session-consumers.test.ts)及[故障测试](../../../../src/app/session/synthetic-session-fault.test.ts)已有 FIFO、帧末读取、取消顺序、资源清理和成功前缀先例。尤其 Core 在补跑第二个 tick 失败时，首 tick 可能已提交，但整帧域事件未投递；不能把剩余 UI pending 一律解释为“没有执行”。
- [main.tsx](../../../../src/main.tsx) 已启用 StrictMode；[package.json](../../../../package.json)尚无 Zustand，[vite.config.ts](../../../../vite.config.ts)只发现 `.test.ts` 并运行于 Node，无 React DOM 或 E2E runner。`ui/` 和新组件/测试仍是计划新增，不能视作已交付。
- 冻结依据：[总计划 §4–5](../../master-plan.md#4-总体架构)、[ADR-0006](../../../decisions/ADR-0006-core-returns-events.md)、[ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)。目录基线见[源码结构指南](../../../engineering/source-structure.md)，本地验证边界见 [ADR-0012](../../../decisions/ADR-0012-local-p1-defer-ci-deployment.md)。
- 本任务不产生原版研究结论，不新增 U/B 事实或依赖未知规则。所有 marker 行为、坐标与测试数值均为已有合成契约，不能当作原版保真证据。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 创建开发面板，尚未开始 | 创建 idle owner，无当前 projection、无 pending、无游戏 rAF；明确合成标记 | 初始化失败显示错误，无假的 tick 0 世界或“已启动” |
| start / 接入已有 running 或 paused run | 读取 status 与当前 projection，立即建立完整视图和运行订阅；晚接线不依赖历史事件 | 故障 run 仅作诊断读取，不注册运行资源 |
| 正常帧、含 0 tick 的帧 | 常规投影按采样规则发布，React 不逐帧跟踪 RenderFrame | 读取/桥接失败进入既有错误出口，不保持“健康运行”的成功提示 |
| marker 不存在时 add | 返回 commandId 后显示 pending，marker 仍来自旧投影；Core 发 marker-added 后才显示接受和最新投影 | 接受结果携带原事件的 tick、实体 ID 和位置 |
| marker 存在时再次 add；不存在时 remove | 保留可提交按钮，让 Core 校验；收到 command-rejected 后显示准确原因 | 分别为 marker-already-exists / marker-not-found，不显示接受或擅自改 marker |
| 同 tick 连续 add → remove | 两个 ID 分别得到接受反馈；本帧最终 projection.marker=null | 不根据 marker-added 先合成中间世界，再根据 marker-removed 修正 |
| 点击 pause 或实际页面隐藏 | 立即显示 paused 和 pauseReason，未执行命令按 Session 通知取消；tick 保持，普通采样停止 | 取消不是 Core 拒绝；重复暂停不重复终结同一命令 |
| 返回可见 / 点击 resume | 返回可见仍 paused；显式 resume 后恢复，首帧重新锚定，UI 不补发遗漏的采样 | hidden 时 resume 按 Session 拒绝，不能显示 running |
| restart / exit / dispose | 旧运行的取消反馈先写入 store、可由同步订阅观察，随后切换清空；新运行从 tick 0 接线，idle/disposed 无 projection。P1 不要求 DOM 保留跨运行反馈 | 旧订阅、按钮闭包或迟到通知不能改变新 store；dispose 不自动创建新 owner |
| 故障，尚有 UI pending | 优先应用真实取消/已收到的结果；其余标为 unconfirmed，保留实际最后成功投影用于诊断 | 显示会话错误，未确认不宣称未执行、不自动重提命令 |
| 同步提交/控制/释放失败，或异步 onError | 同步失败写入 actionError，异步错误写入 sessionError；显示操作、错误类型及可用原因，状态仍读取实际 Session | 提交失败无伪造 commandId/域事件；cleanupFailed 阻止 start/restart，面板保留 exit 并提示重新加载页面以建立新 owner |
| React 卸载、StrictMode 重建、HMR | 新 owner 只在旧 owner 的 dispose 和全部独立清理尝试之后创建；正常清理后无旧订阅/请求 | 清理错误抛给 React 或经 `reportError` 报告并保留原因；不靠全局单例、吞掉异常或自动刷新页面掩盖失败 |

### 发布频率与立即边界

- 选择总计划 10–20 Hz 区间内的 **10 Hz，即 100 ms 常规采样间隔**。桥接只在现有 `onFrame` 中判断是否到期，使用装配层提供的单调毫秒读取函数；浏览器可由 `performance.now()` 提供，Node 用可控时钟。不向 Core 添加宿主时间，也不要求修改 SessionFrame/SessionHost。
- 初次绑定立即发布并建立采样基准。投影是否已发布以 owner、runId 与 tick 判断：当前合成 Core 的状态变化都伴随 tick 前进，同一运行的同一 tick 不重复写入。之后常规发布之间至少间隔 100 ms；到期帧只要最新 tick 尚未发布就必须发布，0 tick 帧不单独触发写入。帧稀疏时不承诺实际达到 10 Hz，也不补发历史快照。
- 命令接受/拒绝或取消、会话 phase/pauseReason/环境可见性/cleanupFailed/error 改变均绕过节流，在该通知边界同步更新 store，React 在下一次提交显示。命令终结或进入 paused/faulted 时，若最新 tick 尚未发布，projection 同步更新为当时的 `run.uiProjection()`；立即发布重新建立常规采样基准，紧随其后的 onFrame 不重复写入同一 tick。
- 帧末域事件反馈读取 `run.uiProjection()`；正常帧复用 `SessionFrame.projection`。两者都是最终已提交事实，不能从事件推导 marker 状态。一次性反馈不因采样未到期而延迟或丢弃。
- paused 状态靠静止帧/状态通知更新，faulted 靠状态变化及诊断读取更新；不另设 rAF、interval 或 timeout。idle/disposed 清空投影。
- 采样时钟须为有限、单调不减的毫秒值，运行切换重建基准。绑定或帧通知中的读取异常、非法值由该消费者同步抛出，经 Session 记为 consumer 故障并由 sessionError 显示；不能默认为 0、静默跳过或继续显示正常状态。

### 控件可用性

面板按最新 status 启用控件，Session 仍是唯一判定者；过期点击产生的 Session 错误按同步失败显示，不在 UI 侧放宽或改写。

- status=null 或 phase=disposed：全部游戏命令与会话控制禁用。
- start：phase=idle 且 cleanupFailed=false。
- pause：phase=running。
- resume：phase=paused 且 environmentVisible=true。
- restart：phase 为 running、paused 或 faulted，且 cleanupFailed=false。
- exit：phase 为 running、paused 或 faulted。
- add-marker / remove-marker：phase=running；不按 marker 是否存在禁用。

## 数据模型与契约

### 已有权威类型

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出边界 |
|---|---|---|---|
| `SyntheticUiProjection` | `{scenario:'synthetic',tick,tickRateHz,mover,marker}`；tick 为已提交 tick，tickRateHz 为每秒 tick 数；实体为 `{id,position:{x,y,z}}`，marker 可为 null；坐标仅为合成单位 | [Core 场景](../../../../src/core/synthetic/synthetic-scene.ts) | store 保存最新冻结投影，不加入 seed/rngState/nextEntityId、RenderFrame 或完整 snapshot；null 投影表示没有当前世界，不是 marker 缺失 |
| `Command` / `DomainEvent` | 已有 add/remove 判别联合及 marker-added、marker-removed、command-rejected；事件有 tick/commandIndex，拒绝有 commandType/reason | Core | UI 提交原类型，不新增“接受”Core 事件或私自判定规则 |
| `EventDelivery.commandId` | 运行内正安全整数；不同 run 可再次出现同一值 | [Runtime 总线](../../../../src/app/runtime/synthetic-event-bus.ts) | 与 owner 身份、runId 共同关联命令；不入 Core/replay，不等于 entityId 或 commandIndex |
| `SessionStatus` / `SessionFrame` | 沿用现有只读字段，status.phase 为 idle/running/paused/faulted/disposed；frame.phase 仅为 running/paused，含真实 projection/render/report | [Session](../../../../src/app/session/synthetic-session.ts) | status 即时消费，frame 只取 UI 需要的投影；不把 render/interpolation 塞入 store |
| `SessionCommandsCancelled` | `{runId,commandIds,reason}`，reason 沿用 user-pause/hidden/restart/exit/dispose/failure | Session | 只对匹配 pending ID 终结；未出现的 ID 不能被臆测为已取消 |
| `GameSessionError` | kind 为 invalid-argument/invalid-state/operation-failed，保留可用 path/reason/operation/failures/cause | [会话错误模块](../../../../src/app/session/session-errors.ts) | 在 UI 展示摘要，完整原因供开发诊断；非玩家存档或可序列化 Core 数据 |

### 计划新增的 UI 契约

类型跟随 `src/ui/game/` 内实际 owner 文件，均保留 synthetic 语义；以下规定数据形状，不规定函数拆分或实现顺序。

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出边界 |
|---|---|---|---|
| UI 状态 | `status:SessionStatus|null`、`projection:SyntheticUiProjection|null`、`pendingCommands:readonly UiPendingCommand[]`、`recentResults:readonly UiCommandResult[]`、`actionError:UiActionError|null`、`sessionError:GameSessionError|null` | UI 桥接/反馈层 | status=null 只用于尚未成功创建 controller；不可伪造 idle 成功状态。每次更新为只读数据，不暴露世界/step/frame/publish 或任意投影写入口给组件 |
| `UiPendingCommand` | `{runId:number,commandId:number,commandType:Command['type']}` | UI 请求跟踪，不是 Core 事实 | 仅 submitCommand 正常返回 ID 后加入，保持提交顺序；一次命令只从 pending 终结一次 |
| `UiCommandResult` | 公共字段沿用 pending；`outcome:'accepted'` 携带原 marker-added/removed event；`'rejected'` 携带原 command-rejected event；`'cancelled'` 携带 Session 原 reason；`'unconfirmed'` 携带 `reason:'session-failed'` | UI 对收到通知的解释 | 不是新 DomainEvent。accepted/rejected 仅来自真实域事件；cancelled 仅来自真实取消通知；unconfirmed 仅处理故障后仍未确认的 pending |
| `recentResults` | 当前运行（含 faulted 诊断态）按终结顺序保留至多 10 项终态，最新在后；超出时丢弃最旧项。10 是显示保留上限，不是游戏规则 | UI | start/restart 建立新运行或 exit 回到 idle 时清空；同一转换内先取消、后未确认的结果同时保留。不是事件历史，也不驱动投影 |
| `UiActionError` | `{operation:Command['type'] \| SessionControl['type'] \| 'initialize' \| 'cleanup',cause:unknown}`，保留原错误 | UI 操作出口 | 无 commandId 的失败只在此反馈，不伪装 submitted/accepted/rejected/cancelled；本 owner 的下一次命令或控制尝试开始时清空，失败则替换；不能清除 Session 的故障/cleanupFailed |
| `sessionError` | 本 owner 经 onError 收到的最近一次 `GameSessionError` | UI 错误出口 | 只同步写 store，不调用控制或抛出；新运行成功开始时清空，与 Session 清除 error 的时机一致 |
| 采样时间输入 | `() => number`，有限单调毫秒；仅表示宿主采样时间 | 装配层供给，桥接消费 | 不持久化、不写入 Core/replay，不成为第二条调度通道 |

owner 身份是装配实例的内存身份，不要求新建全局序号或序列化字段。单个 controller 的 runId 不能隔离 StrictMode/HMR 创建的另一个 controller，故所有回调与 action 必须同时验证 owner 和当前 run。运行切换可重建 store 或原子重置其运行字段，但旧引用不能写入新视图。

store 只保留 UI pending 与当前运行的有界最近终态，不保存事件历史或世界副本。未提交到 UI 的其他消费者命令可以促使最新投影刷新，但其反馈不得伪装为本面板发起；未知 ID、已终结 ID 不创建 phantom pending。相同运行内重复投递不能重复终结已确认请求，旧 owner/run 通知不影响当前状态。

`src/ui` 对 Core 与 app 的依赖仅为公开类型；Session、浏览器宿主与采样时钟由 app 装配创建并传入，UI 不导入 App/装配，也不自建会话或宿主。Node 测试覆盖的 store/桥接文件不依赖 DOM 全局、DOM 类型或 React 渲染；React hook/组件由应用类型程序检查并在浏览器验证。

### 持久化与兼容

不适用：本任务只使用会话内存，无 IndexedDB/localStorage、内容指纹、存档 schema、原子写入、迁移、配额或数据清理。刷新/退出不保留 UI 反馈；不修改 P1-03 snapshot/replay 格式或版本。控制、runId、commandId、采样时间、UI 错误与取消/未确认结果均不写入 replay。

## 技术决定

用户要求需要回答时直接使用推荐答案，以下据此选择；不等于用户已批准完整契约。

1. **Zustand vanilla + React selector。** 非 React 桥接写 store，组件只订阅所需标量或稳定切片；禁止整个 store/世界订阅。tick 更新不能导致只看 marker ID 或会话 phase 的组件提交；普通父组件渲染不作为 selector 失败证据。
2. **复用 Session，而非裸 Runtime。** 应用装配已有浏览器宿主与会话控制器，消费者不持有 frame/step 或独立帧调度。按 [ADR-0015](../../../decisions/ADR-0015-source-module-structure.md) 组织必要小模块，不创建泛型引擎或大 schema。
3. **10 Hz 常规采样 + 即时关键反馈。** 降低 React 发布频率，且命令/生命周期反馈不等待采样窗；不把总计划初始 60 Hz 模拟参数硬编码为 UI 的 tick 时间转换。
4. **允许有效命令被 Core 拒绝。** add/remove 不因当前 marker 事实或已有 pending 而禁用，仅按有效 running 运行控制提交能力；不在 UI 复制 marker 规则。连续点击仍是按 FIFO 提交，不合并、去重或自动重试。
5. **最小反馈而非通用请求日志。** pending 列表与当前运行最近 10 项终态足以证明关联，故障相关的取消与未确认结果都可观察，同时出现时都保留；同步、异步错误分开呈现。故障可能已有提交，增加 UI-only unconfirmed，不把它虚构为 Core 拒绝或 Session 取消。
6. **暂停保留，切换隔离。** 运行级订阅/disposer 通过 `ownCleanup` 归属 Session；controller 状态订阅归应用 owner。初始化或部分接线失败回滚已取得资源并报告，独立清理全部尝试，遵守 Session 通知中的注册/控制限制。不建立全局 owner 登记来阻止新 owner；旧回调由 owner/run 身份隔离，清理失败显式报告。
7. **开发面板代替正式页面。** 先交付可操作的工程证明，保留合成说明；不用自动启动跨过 start 边界，不提前制作正式菜单、飞行 HUD 或键位系统。P1 中该面板在开发与生产构建的应用入口均可见，不额外按环境隐藏；P1-08 再将其纳入菜单流程。无自定义全局按键，按钮有可读标签和可见错误反馈。
8. **本地证据，不提前引入浏览器 runner。** Node 测试 vanilla store/桥接/反馈，真实浏览器测试 React DOM 和生命周期；Zustand 依赖选择兼容现有 React/TS 的版本并锁定，遵循 [ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)，不顺带升级工具链。
9. **UI 依赖方向与可测边界。** 沿用平台以类型依赖 Session 端口的先例：UI 只依赖公开类型并接收装配实例，纯 store/桥接保持 DOM-free，以便由现有 Node 类型程序和 Vitest 检查。

第 5–7 项的修订与第 9 项由 2026-10-02 审阅时按用户同一授权采用推荐答案。未改变冻结决定，无新 ADR 前置需求；若实施中发现必须改变冻结架构，须先取得相应 ADR/总计划批准，而非通过本 Spec 越界。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | 创建为 idle，projection=null、pendingCommands/recentResults 为空、actionError/sessionError 为 null，无 rAF；start 后立即显示 scenario、tick=0、实际 tickRateHz、mover 和 marker=null。晚接运行已有 marker 时无需历史事件即可显示当前 marker | Node 对真实 Session 初始/晚接线断言，投影与 run.uiProjection 深相等；浏览器面板初始和开始后的 DOM 证据 |
| AC-02 | 初次绑定 t=0 发布后，Core 持续推进且无关键变化的 t=99/100/199/200 ms 帧分别不发布/发布/不发布/发布；每次到期取最新投影。稀疏帧 t=450 只发布一次；0 tick 不单独触发发布，到期但同一 tick 不重复写入。非法时钟成为 consumer 故障并显示 sessionError | Node 可控单调时钟和真实 Session；记录 store 发布次数、时间、tick，覆盖 NaN/Infinity/倒退/读取抛错；不以模拟 tick 数代替宿主毫秒 |
| AC-03 | 采样窗未到期时，Core 接受/拒绝、取消、暂停/继续、环境及错误变化均在当前通知边界更新相关字段；投影立即发布后同帧 onFrame 不重复写相同快照；正常帧不存储 RenderFrame | Node 同步订阅记录与返回后断言，含同毫秒多结果、暂停 report=null、故障无成功帧；浏览器下一次 React 提交显示反馈 |
| AC-04 | running 且无 marker 时点击 add：同步获得 ID 后仅 pending，投影不提前变化；首个执行 tick 后结果为 accepted，原 marker-added 的 tick/entityId/position 与最新投影一致，pending 移除 | Node 在 0 tick/执行 tick 两边精确检查 pending；真实浏览器点击、接受文字、marker 字段及对应 ID 证据，不仅确认按钮可点。若采集浏览器 pending，须在点击的同一任务内同步读取 DOM |
| AC-05 | 有 marker 时再次 add 得 rejected/marker-already-exists；无 marker 时 remove 得 rejected/marker-not-found；marker 保持相应权威状态，UI 不显示成功 | Node 两种拒绝原事件断言；浏览器两条实际交互及原因反馈，按钮不靠规则禁用来避开测试 |
| AC-06 | 同 tick 排队 add→remove 的两个 commandId 均按 FIFO 终结一次，投影只显示帧末 marker=null；反馈使用 delivery.commandId 而非 commandIndex/entityId。其他消费者命令不生成本面板请求结果 | Node 对 store 订阅记录、真实事件及最终 projection 的精确断言；覆盖重复已确认 ID 与外部命令 |
| AC-07 | 未执行命令在 user-pause/hidden/restart/exit/dispose/failure 时按通知 ID/reason 取消，保留顺序、不变成拒绝、不入 replay；新 run 的 pending/recentResults 不继承旧值，迟到旧通知无效 | Node 参数化真实 Session 转换、取消冻结数据和旧 store 记录；同 commandId 在新 run 重用以及不同 owner 的 runId 重用均隔离 |
| AC-08 | 补跑第二 tick 故障且首 tick 已提交、事件未送达时，最后成功投影仍反映该提交；未被取消或确认的 pending 为 unconfirmed/session-failed，而非假成功/假取消。真实 Runtime 中，同一帧首个 tick 失败时命令未消耗，只产生 failure 取消；后续 tick 失败时命令已消耗、事件被丢弃，只产生 unconfirmed。若同一转换先后出现两类结果，二者都保留在 recentResults，unconfirmed 不覆盖已有终态；收到真实结果后发生消费者故障也不覆盖已有终态 | Node 沿用现有 Vitest 创建边界注入，首个与后续 tick 两条故障路径分别用真实 Core/录制成功前缀对照；断言错误、无 pending 悬挂、无自动重提，生产无故障后门；两类结果并存时的保留由 store 原子转换测试验证 |
| AC-09 | 提交/控制非法状态或形状的同步失败显示 actionError，保留原原因，不分配虚构 ID；onError 的异步错误显示为 sessionError。初始化/部分接线失败有明确反馈，卸载期清理失败抛给 React 或经 `reportError` 报告；cleanupFailed 即使 error 后被替换仍阻止 start/restart | Node 失败输入、部分注册回滚与清理异常测试；浏览器开发诊断证据可用自有探针注入，不污染生产参数或用户存储 |
| AC-10 | pause 后跨帧 tick 不变且未执行命令取消；paused 仍能操作 resume/restart/exit，resume 仅在 environmentVisible 时可用；返回可见不自动继续，显式 resume 首帧不补跑。idle/disposed 无世界 | Node 控制启用条件和 Session 状态对照；真实 Chromium 中实际 hidden→visible 观测，不用伪造 visibility 代替。浏览器取消证据须在同一任务内依次触发 add 与 pause 按钮的真实 click，再读取 DOM |
| AC-11 | 只订阅 marker ID/phase 的切片在普通 tick/坐标发布时不被通知；对应字段改变才更新。实际 React 组件只取得只读读取/订阅入口，不订阅整个 store，也不因无关 store 更新产生额外提交 | Node selector/订阅计数，以及组件侧不存在写入口的负向类型检查或代码审阅；隔离浏览器以临时 React Profiler 或等价组件观测，区分 StrictMode 初次提交与父组件更新，记录基线及无关/相关更新差值 |
| AC-12 | restart/exit/failure 释放真实 UI 运行订阅；卸载/dispose 还撤销 owner 状态订阅及宿主监听。StrictMode effect 重建、重新挂载和 HMR 后最多一个 running owner/待交付帧请求、一个当前运行的桥接订阅组；完全卸载后均为 0 | Node 登记/撤销计数及独立清理失败继续；真实开发浏览器分别核验 StrictMode、卸载/再挂载，并以临时、可还原的源码编辑分别触发开发面板组件与 UI 桥接模块的 Vite 更新。若后者实际回退为整页重载，按实际记录并检查重载后计数；结束后还原源码且无工作区残留。记录清理前后计数和旧回调不再写 store，不只观察 tick 速度 |
| AC-13 | 面板明确为合成演示，具备 start/pause/resume/restart/exit、add/remove、状态/投影/pending/最近结果/错误；各控件按“控件可用性”启用。鼠标和 Tab+Enter/Space 能操作启用按钮，禁用按钮不会提交；没有导入成功、飞行 HUD 或全局游戏键绑定 | 浏览器逐项 DOM/交互观测，原生键盘焦点记录；无 Canvas/GPU 要求，不把本项当原版键位或无障碍全量验收 |
| AC-14 | 相同初始配置、逐 tick 输入和实际执行的命令，接入/不接入 UI 桥接及不同采样时间表得到相同 Core 事件流、replay 结果及状态哈希；读取/反馈不改 tick/RNG，暂停/取消不进入记录 | Node 用真实 recording/replay 与独立基线比对，包含连续 add/remove、取消、重启后的独立记录；仅承诺同版本同运行时一致 |
| AC-15 | 新 `.test.ts` 进入已有 Vitest 发现范围，Zustand 及锁文件同步，Core 纯度与模块边界未放宽；目标测试与 pnpm check 均通过。未新增 Playwright/DOM runner、云配置或原版内容 | 目标 Vitest、完整工程检查输出；依赖许可证及变更文件审阅；实现时同步直接受影响的工程/源码结构说明，证据留在后续 subtask |

## 验证策略

- **单元/契约测试：** 计划在 `src/ui/game/` 新增邻接 `.test.ts`，测试 vanilla store、采样、命令关联、selector、同步失败、故障未确认及清理；应用装配有真实需要时在其所属模块增加 Node 可测生命周期测试。复用 [ControlledHost](../../../../src/app/session/synthetic-session.test-support.ts) 和真实 Core/Session，不导入测试支持到生产，不为测试伪造 marker 世界。
- **目标回归：** 实施后的目标命令为 `pnpm exec vitest run src/ui/game src/app/runtime src/app/session src/core/synthetic`；存在 app/composition 测试时一并加入同一 runner。当前 `ui/game/` 尚不存在，该命令是实施后要求，不是已通过证据。
- **Replay/一致性：** 使用已有 [synthetic-replay.ts](../../../../src/core/synthetic/synthetic-replay.ts) 和录制选项，逐 tick 输入、事件、检查点/最终哈希对照真实基线；采样时钟只影响发布时刻。无跨引擎逐位一致承诺，也不通过事件回放构造 UI。
- **浏览器验证：** 按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 使用自有 Chromium context、真实 Vite origin/rAF 和自建合成场景。覆盖接受/两种拒绝、pending/取消、暂停恢复、实际页面隐藏、selector、StrictMode、HMR 与释放；采用已有浏览器工具和[生命周期复现路线](../../../engineering/README.md#浏览器生命周期复现)，不先建设 P1-10 runner。pending 与取消只存在于下一帧前，须在同一任务内触发真实按钮 click 并同步读取 DOM；不能直接写 store 代替交互。HMR 的临时编辑完成后必须还原。
- **证据边界：** 精确毫秒和故障注入由 Node 证明；DOM 可见反馈与实际 React 生命周期必须取得浏览器证据。仅 HTTP 200、页面截图或旧 P1-05 的 Session 探针不能代替当前消费者验证。临时自有探针清理后不进入产物；实际 hidden 或 HMR 无法取得时对应 AC 仍未完成，不用模拟结果豁免。
- **实机/原版对照：** 不适用。本任务无原版规则、GPU、媒体或浏览器快捷键拦截承诺；后续任务的原版保真、Safari/跨系统输入与真实设备门槛不被合成 DOM 测试免除。
- **工程检查：** TypeScript/app 实施须运行 `pnpm check`，不扩展 `.test.tsx`/DOM 发现范围、不安装无关测试框架。本 Spec 的文档修订只检查元数据、链接、S/AC、工作流路由和改动范围，不运行应用构建。

## 风险与恢复

风险等级：**中**。游戏规则及存储格式不变，但首次接入实际 React/订阅/宿主资源，可能出现假成功、旧运行串扰或重复循环。

- **节流掩盖反馈：** 命令/生命周期绕过常规采样；Node 精确证明即时更新，浏览器证明可见结果。不能用提高所有发布频率代替正确分流。
- **帧末事实与事件混淆：** 同 tick add/remove 和故障成功前缀均以 projection 为持续事实，事件只解释请求结果；unconfirmed 明示缺少确认，不重放或补偿已可能执行的命令。
- **owner/run ID 重用与订阅泄漏：** 内存 owner 身份加 runId/commandId，旧实例先销毁；用真实 React/HMR 和计数证据验证，而非全局 singleton 避开 StrictMode。
- **初始化/部分清理失败：** 回滚已取得资源并尝试其余独立清理，保留原因与 cleanupFailed；不以全局登记阻止新 owner，旧回调由身份守卫隔离。健康故障且清理成功可显式 restart；清理失败时面板只保留 exit 并提示重新加载页面，不提供面板内重建、自动恢复或操作用户站点数据。
- **恢复/兼容：** 新 UI/store/装配可撤回到原占位页，不需要存档/缓存迁移；既有 Core/Runtime/Session 及录制版本保持不变，依赖变更须与锁文件一起恢复。完整菜单、渲染与键盘接入仍由各自任务验收。

## 未决事项

无。需要取舍的范围、10 Hz 采样、反馈形状、故障未确认、开发面板和验证边界，以及审阅新增的结果保留、错误出口、控件可用性、UI 依赖方向与 HMR 证据，均按用户要求采用推荐方案。P1-05 最终对齐是实施前提，不是本契约尚待选择的行为问题。

## 审批

**2026-10-02 用户批准完整 Spec。** 用户调用 generate-goal 并明确写明“approve the spec. generate goal”，批准当前审阅版本的 S-01 至 S-08、AC-01 至 AC-15 与技术决定 1–9（含审阅修订）。status 为 accepted，仅表示契约获批，不表示实现完成，也不批准尚未生成的 goal 或授权执行/提交。

**2026-10-02 AC-08 契约更正（执行中修订）。** goal 的最终对齐发现，原 AC-08“同次故障的 failure 取消与 unconfirmed 同时保留”在字面上要求一次真实故障同时产生两类结果，而真实 Runtime 无法做到：首个 tick 失败只产生取消，后续 tick 失败只产生 unconfirmed。修订删除了这项无法满足的“同一故障必须同时产生两类结果”要求，属于范围很窄的契约放宽；改为说明两条互斥路径，并把并存要求表述为“若出现则都保留”，技术决定 5 的措辞随之调整。AC-08 的其余要求、其他 AC、行为、数据形状与全部测试断言均未改变，验证方法改为分别覆盖两条路径。该方案依据用户 2026-10-02“需要提问时直接采用最推荐答案”的指示采纳，未另行取得逐字确认，已在交付报告中提请用户复核。修订使旧 reviewed 标记失效，已删除，未伪造新的审阅。
