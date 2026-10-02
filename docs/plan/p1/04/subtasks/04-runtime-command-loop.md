---
type: plan
status: active
phase: P1
task: "04"
subtask: "04"
updated: 2026-10-02
---

# 04 — 独占场景的输入、命令与帧边界

**契约来源：** [spec](../spec.md) 的 S-01、S-02、S-03、S-04、S-05、S-07、S-08，AC-01 至 AC-10、AC-12、AC-13、AC-14；录制相关断言由 05 完成。
**依赖：** 01, 02, 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `synthetic-runtime.ts` 建立 `createSyntheticRuntime`、`SyntheticRuntimeOptions` 和 `SyntheticRuntime`，装配 01 的错误、02 的时钟、03 的 Event Bus 与真实 `SyntheticScene`。本项实现未录制模式，recording 选项由 05 接入；不得先接受该选项却静默关闭录制。
- 创建校验外层字段及上限，默认 5；可选值 `undefined` 等同省略，null 拒绝。`scene` 只取值一次并交给 Core 创建入口验证，生效频率从场景读取；错误路径重定位到 `options.scene.*`，保留 Core cause。外部不能取得可 step 的场景引用。
- `setInput`、`submitCommand` 复用 `readTickInput` 的验证结果构建隔离快照，不在校验后重读字段，不修改/冻结调用者对象；路径分别转为 `input.*`、`command.*`。初始 moveX=0，队列空，commandId 从 1 起。
- `frame` 只使用帧开始的轴快照和命令批次：0 tick 帧保留队列；首个实际 tick 消费全部命令，后续 tick 命令为空。每次成功 step 后更新前后 Render State；全部模拟结束后更新 alpha/时间进度，再一次性分发原事件及 commandId。不将 ID 写入 Core 输入或事件。
- 对外只提供订阅、提交、帧推进和只读投影，不暴露总线发布或内部时钟。读取返回冻结纯数据，保留旧值不受后续 tick 和标记增删影响；未录制时 `exportRecording()` 按契约返回 null。
- 监听器新输入/命令进入后续实际 tick；分发期间嵌套 frame 抛 reentrant-call，未被监听器捕获则作为 listener-failed 的成员。监听器错误不回滚已完成模拟、时间进度或抛错前副作用，也不自动重试。
- Core 抛错时停止本帧，丢弃本帧通知批次，不回滚已成功 tick；保留最后 Render State 对、最新 projection，alpha=0。之后 frame/submit/setInput 优先抛出带最初 cause 的 faulted；读取和订阅取消仍可用。
- commandId 分配前守卫保证合法下一 ID；耗尽时不签发、不回绕，终止后续模拟。若在监听器提交期间触发，当前已提交帧继续投递、未捕获 faulted 进入外层汇总。

## 不包含

- 05 的 recording 配置、录制会话创建分支和有效录制导出；不写假的记录或“录制成功”占位。
- 不实现 rAF、暂停/继续/重启/销毁、清键、React/Zustand、渲染器、存储或世界恢复入口。
- 不修改既有 Core 代码/测试或上游行为，不因测试需求公开场景或分配器。

## 关键文件与契约

- 计划新增 `src/app/synthetic-runtime.ts`：Runtime 类型与唯一创建入口。
- 计划新增 `src/app/synthetic-runtime.test.ts`、`src/app/synthetic-runtime-events.test.ts`、`src/app/synthetic-runtime-fault.test.ts`。
- `src/app/runtime-errors.ts`、`src/app/fixed-step-clock.ts`、`src/app/synthetic-event-bus.ts`（01–03 计划交付，只读消费）。
- [synthetic-scene.ts](../../../../../src/core/synthetic/synthetic-scene.ts)（已有，只读）：`createSyntheticScene`、`readTickInput`、`SyntheticScene` 及输入/事件/projection 类型。
- [CoreInputError](../../../../../src/core/errors.ts)（已有，只读）：只重定位 Runtime 外部 path，原错误保持在 cause。

## 验收标准

- [x] AC-01（未录制）：所有创建参数错误准确，undefined/null 行为一致；配置 getter 不被重复取值，实例互不干扰，调用者对象未修改/冻结。
- [x] AC-02 至 AC-04：真实 Core 的 tick 与 02 时钟一致；非法时间不改输入、队列、场景、旧 Render State 或时间基准。三种无截断帧切分在相同逐 tick 输入下等价；宿主 30 ms 改轴的反例仍得到 0.02/0.04，而非错误承诺相同。
- [x] AC-05：add/add/remove 全在首 tick，delivery.commandId=1/2/3，added/removed 的 entityId 均为 2；未知类型、额外字段或非对象不入队且不耗 ID；修改原命令或变化 getter 不改变执行值。
- [x] AC-06：默认轴不移动；50 Hz 下满轴两 tick 后 X=0.04，再以 −0.5 两 tick 后 X=0.02；非法轴保留旧值，输入对象隔离。
- [x] AC-07、AC-10：每 tick 保留前后状态；回调读到本帧最后 tick 和 alpha（50 Hz、0→65 ms 时为 3/0.25）；0/1/多 tick 的状态对与裸场景对照，旧输出深冻结且不变。
- [x] AC-08、AC-09：分发期命令/输入只影响后续实际 tick，0 tick 不消费；重入捕获/未捕获两条路径和订阅变更正确；监听器抛错前副作用保留，取消失败监听器后同时间戳不重发，下一 tick 只执行一次。
- [x] AC-12（未录制）：首 tick 与第二个 tick 的受控失败都进入终止状态；后者只保留 tick 1，不通知 added，alpha=0；解除测试注入也不能恢复模拟，原 cause 不被后续非法参数覆盖。
- [x] AC-14：有分配前安全整数守卫；明确审阅 `MAX_SAFE_INTEGER` 分支、耗尽终止和分发期的汇总路径，未引入测试后门。
- [x] AC-13：目标测试、`pnpm check`、限定范围清理复验通过；同帧跨 tick 事件收集顺序有代码审阅证据，不虚构该场景不存在的多 tick 发事件用例。

## 验证方法

- `pnpm exec vitest run src/app/synthetic-runtime.test.ts src/app/synthetic-runtime-events.test.ts src/app/synthetic-runtime-fault.test.ts`。
- 使用固定 seed=0、真实 Core。时间、commandId、事件形状精确比较；位置容差 1e-12，alpha 遵循 spec 的精确值/`Number.EPSILON` 规则。
- 故障测试仅在 Vitest 的创建模块边界包装真实场景：第 1 或第 2 次 step 在调用真实 step 前抛 CoreInputError，其余 step 与读取委托真实实现，测试结束恢复包装。不能注入另一套玩法、用时间溢出制造 tick，或修改生产 API。
- 监听器 A 抛出的 Error/非 Error 值都保留，与执行相同副作用但不抛错的实例对照；用同时间戳重试检查时间进度已提交。
- `pnpm check`；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 只清理本项四个新增文件及 diff。无浏览器、实机或原版要求。

## 完成证据

- 2026-10-02：[Runtime](../../../../../src/app/runtime/synthetic-runtime.ts)及三个目标测试文件 45 项通过；最终 `pnpm check` 20 文件、499 项通过。过程中修复表驱动用例的 tuple 类型和 mock 的 type-import lint，最终 typecheck/lint/build 全部成功。
- [帧与状态测试](../../../../../src/app/runtime/synthetic-runtime.test.ts)覆盖默认/非法配置、getter、连续输入、50/60 Hz、0/1/多 tick、采样反例与旧输出；[事件测试](../../../../../src/app/runtime/synthetic-runtime-events.test.ts)覆盖 FIFO、关联 ID、延后意图、重入和同步失败副作用；[故障测试](../../../../../src/app/runtime/synthetic-runtime-fault.test.ts)用真实场景包装验证成功前缀和终止状态。
- rubber-duck 先审阅并确认主要不变量；补入故障前 alpha=0.5 的帧，使置零断言可证伪。随后 simplify 限定四个代码文件：复用 Core 校验和统一路径包装，避免 0 tick 帧复制整条队列；不新增通用注入层。
- **AC-14 审阅：** `submitCommand` 在结构读取与递增之前检查 `nextCommandId === MAX_SAFE_INTEGER`；最后可签发 MAX_SAFE_INTEGER−1。`#fail` 缓存第一原因，之后优先抛 faulted。监听器提交触发耗尽时，总线捕获该异常、继续当前批次，再汇总 listener-failed；无 ID 回绕或公开分配器后门。
- **跨 tick 顺序审阅：** frame 按 tick 循环，按 Core 返回数组顺序 push 到 pending，循环结束才 dispatch；只有首 tick 获得命令，现有场景后续 tick 没有事件。这是代码证据，不伪装成多 tick 事件的 Runtime 测试。
- 文档检查并更新 [engineering 的合成 Runtime 约定](../../../../engineering/README.md#合成-runtime)：时间来源、命令关联、同步监听器、失败不可重试与测试入口。guides 无浏览器或原版操作变化，不新增占位流程。
