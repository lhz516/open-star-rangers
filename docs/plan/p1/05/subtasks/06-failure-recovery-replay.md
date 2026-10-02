---
type: plan
status: active
phase: P1
task: "05"
subtask: "06"
updated: 2026-10-02
---

# 06 — 故障汇总、恢复与录制一致性

**契约来源：** [spec](../spec.md) 的 S-01、S-03、S-05 至 S-08，AC-02 至 AC-06、AC-09 至 AC-12、AC-14（失败组合/录制部分）。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 完成 Runtime faulted→runtime、listener-failed→consumer、nowMs 非法→scheduler，宿主 request/read/cancel、通知消费者、资源及 control 的 phase 映射；保留各原始 cause，取消失败同时阻断清理成功结论。
- 每个异步边界只报告一次汇总并在全部通知后调用 onError；同步执行与通知中排队来源区分，禁止成功形状报告或已完成 tick 重试。
- 故障停止凭证、清意图/订阅/资源并折叠最后成功状态；取消失败时实际迟到回调无效。Runtime.frame 抛错无成功 onFrame，消费者自身失败仍完成其余本批通知。
- 状态失败观察者取消，错误处理额外失败继续汇总；onError 失败用 AggregateError 保留双方原因，不能为报告错误重启循环。
- 当前帧中已请求 exit/restart 与故障一起收尾，不遗漏控制；只含 control 错误不停止健康运行。安全故障可 restart，清理失败终止恢复权限；首次 request 与未创建世界的失败分别为可读 faulted 与 idle/error。
- 真实录制 1/4 间隔跨 pause/hidden/resume，精确成功输入与取消不入记录；故障成功前缀 replay 一致，restart 新记录，旧导出不变，关闭/开启录制的有效 tick 状态等价。

## 不包含

- 不更改上游记录/schema、时间规则或正常裸 Runtime 行为，不用事件重建世界。
- 不做隐式重试、异步消费者等待、持久化或生产注入接口。

## 关键文件与契约

- `src/app/synthetic-session.ts`（04/05 计划交付，本项修改）；必要时扩展其 test-support 故障能力。
- 计划新增 `src/app/synthetic-session-fault.test.ts`、`src/app/synthetic-session-replay.test.ts`。
- [既有 Runtime 故障测试](../../../../../src/app/synthetic-runtime-fault.test.ts)（只读先例）；[replay](../../../../../src/core/synthetic-replay.ts)（只读，真实函数）。

## 验收标准

- [ ] AC-10：所有指定故障 phase、原原因与附加清理原因有序、一边界一错误出口；onError 抛出双方 AggregateError，当前循环已停止。
- [ ] AC-06/09/11：先请求 exit 再抛错仍收尾；cleanupFailed 持续且不新建运行，无失败时安全重启，故障只读状态/记录可取。
- [ ] AC-03/04/05：取消失败的迟到请求不能推进，错误输入/时间与未执行命令不入成功记录，重锚/折叠不回退。
- [ ] AC-11：初始化监听部分失败由宿主撤销；首 request 失败保留有 owner 的控制器监听但无循环；dispose 全部尝试，不虚报资源回收。
- [ ] AC-12：间隔 1/4 的跨生命周期输入、事件、检查点及 JSON replay 全部匹配；restart tick0、新 run、新记录，旧导出不变。
- [ ] AC-14：目标测试、pnpm check、既有回归通过；工程和使用文档描述故障/清理阻断，无沉默默认。

## 验证方法

- `pnpm exec vitest run src/app/synthetic-session-fault.test.ts src/app/synthetic-session-replay.test.ts src/app/synthetic-session.test.ts src/app/synthetic-session-consumers.test.ts`；`pnpm check`。
- host 故障用 test-support；Core 用 Vitest 创建边界包装真实场景，仅在指定 step 前抛，成功调用仍是真实 Core。不能给生产 controller 一个假世界或故障参数。
- replay 用新实例和 `compareSyntheticReplayResults`，另比较手写成功 tick 序列与 ID 取消日志；不以“记录自己 replay”代替取消原子性/模式对照。
- rubber-duck 后 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 仅本项变更 hunks/两新测试。同步更新 [engineering](../../../../engineering/README.md) 的最终错误契约，guide 具体操作留待 07 真实验证。

## 完成证据
