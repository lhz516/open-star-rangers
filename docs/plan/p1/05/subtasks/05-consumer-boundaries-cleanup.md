---
type: plan
status: active
phase: P1
task: "05"
subtask: "05"
updated: 2026-10-02
---

# 05 — 消费者通知边界与资源所有权

**契约来源：** [spec](../spec.md) 的 S-02、S-04 至 S-08，AC-02、AC-05 至 AC-10、AC-14，以及技术决定 11、12。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在当前 controller 上完成 onFrame/onCommandsCancelled/ownCleanup、运行域订阅收集与控制器 onStatus 所有权；所有回调同步返回 undefined，取消/释放句柄幂等。
- 三种通知边界（rAF、同步控制、宿主通知）统一串行：域/帧消费者控制、宿主通知和故障记录到末尾 FIFO；当前批次不半途替换世界。静止帧回调同样不能递归重启其所属 pause。
- 形状错误直接抛；应用时非法转换按 control failure 记录、继续后续队列且不致健康运行故障。同步控制内由通知产生的 control 失败经 onError，直接调用者自己失败仍同步抛，不偷换来源。
- 固定顺序：取消反馈→仅 pause/hidden 静止帧→适用的订阅撤销/资源清理/新 run 创建→onStatus→错误出口。新增订阅下一批生效，取消立即生效，状态通知中允许新运行注册，禁止其递归控制。
- 清意图产生冻结 `{runId,commandIds,reason}`，FIFO、每未执行 ID 恰一次，空队列不通知，不伪装 DomainEvent。覆盖所有已批准 reason。
- 资源逆注册顺序、至多尝试一次，失败继续其余清理；release 先移出再调用，抛错置 cleanupFailed 并反馈，但不主动终止运行。cleanupFailed 单调且独立于 error，start/restart 持续拒绝。
- 旧运行取消句柄不能影响新 run；faulted 可读但不能注册资源，exit/dispose 使旧 run 全部能力失效，dispose 的最终状态通知后清空 controller 订阅。

## 不包含

- 不引入通用资源加载/异步清理框架、媒体/GPU/键盘实现；仅合成消费者。
- 不把清理抛错算作底层资源已释放；06 将系统性核对运行失败与收尾故障组合。

## 关键文件与契约

- `src/app/synthetic-session.ts`（04 计划交付，本项修改）。
- 计划新增 `src/app/synthetic-session-consumers.test.ts`；04 的 test-support 复用，若需计数扩展仅改相关测试 helper。
- [SyntheticEventBus](../../../../../src/app/synthetic-event-bus.ts)（已有，复用其域事件逻辑），不在 Core 加第二个总线。

## 验收标准

- [x] AC-05：每种取消 reason、ID 集合、已执行拒绝不再取消准确；暂停输入无旧意图入未来 tick。
- [x] AC-06：首域事件请求 exit/restart，当前其余事件/帧仍来自旧 run；pause→resume、静止帧控制、宿主通知 FIFO、非法排队控制的显式错误均准确。
- [x] AC-08：0 tick 与静止帧 shape、冻结/旧输出、注册顺序/下一批新增/即时取消、状态变化通知符合契约；权限负向类型成立。
- [x] AC-09：资源 C/B/A、提前 release B、C 抛仍执行 A；每项至多一次，清理失败不建新运行，订阅/宿主清理分别计数。
- [x] AC-02/10：cleanupFailed 在 error 覆盖后仍阻断，release 失败的反馈与“仍在运行”分开验证；错误通知不吞掉，也不递归调用控制。
- [x] AC-14：目标测试、pnpm check 与现有会话回归通过，文档更新实际消费者所有权。

## 验证方法

- `pnpm exec vitest run src/app/synthetic-session.test.ts src/app/synthetic-session-consumers.test.ts`；`pnpm check`。
- 真实 Runtime 的 add/add/remove 产生三个域事件，分别由消费者请求控制/抛错；记录所有通知的 runId/tick、资源及控制处理顺序。
- 模拟资源是同步独立函数，计数与独立对照证明失败继续/不重试；不只判断运行没崩。类型负向证明 async 不能作为同步 listener/cleanup。
- rubber-duck 后 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 限定本项 Runtime 消费者 hunks/新测试/必要 test-support 修改。更新 [engineering](../../../../engineering/README.md)，检查 guides 有无新操作；无真实 GPU/输入或浏览器证据声明。

## 完成证据

- 2026-10-02：[消费者测试](../../../../../src/app/synthetic-session-consumers.test.ts) 23 项，基础控制 26 项共 49 项通过；`pnpm check` typecheck/lint/25 文件 573 测试/build 成功。所有六种 reason、已业务拒绝不取消、冻结 FIFO、空集合不通知都有断言。
- 真实 add/add/remove 旧域批次与三 tick 的旧帧全部完成后才 restart/exit；静止帧内控制、pause→resume、宿主通知 FIFO 与非法排队 control 不 fault 均通过。帧/状态订阅固定批次，即时取消；状态接线新运行、禁止递归控制、已结束权限与正常 dispose/runId=null 有明确测试。
- C/B/A、提前 release、失败仍全部尝试、每项至多一次和 cleanupFailed 持续阻断通过。消费者失败按“剩余帧消费者→failure 取消→清理→faulted 状态→唯一错误出口”精确核验；未声称真实 GPU/媒体/输入已释放。
- rubber-duck 提出的“所有 consumer 或 release 错都经 onError、同步/排队错误合并”不采纳：spec 明确同步公开操作失败直接抛，排队控制独立报告，error 只保留最近值。新增测试证明直接 pause 的通知失败与排队 control 分别反馈；帧内 release 被调用者捕获时不重复 onError，之后的 consumer 错可替换 error 而 cleanupFailed 仍保留。裸 Runtime 生命周期操作均在批次外且不抛正常收尾错，不为不可达的推测添加 broad catch。
- simplify 四角度并行，应用释放 token 的 owner/run/cleanup 引用清空，避免保留无效 disposer 牵连新世界；重验全通过。
- 文档影响：engineering 更新完整消费者/资源/FIFO 与同步错误来源说明；guides 仍仅研究流程，原版事实和冻结决定无变化，阶段完整浏览器证据尚待 07，未勾 STATUS。
