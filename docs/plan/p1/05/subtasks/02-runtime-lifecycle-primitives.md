---
type: plan
status: active
phase: P1
task: "05"
subtask: "02"
updated: 2026-10-10
---

# 02 — Runtime 显式生命周期操作

**契约来源：** [spec](../spec.md) 的 S-03、S-05、S-06、S-08，AC-04、AC-05、AC-08、AC-14，以及技术决定 10。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 让内部时钟显式丢弃基准、最后时间、相对进度与余量，下一 frame 只锚定；不能通过新场景或改 Core tick 模拟暂停。
- Runtime 显式清零轴、取出待执行 commandId（冻结 FIFO ID 数组、清后再次为空）、折叠 previous/current 到最新成功状态且 alpha=0、撤销全部域订阅。这些能力在 faulted 后仍可用于收尾，不解除 faulted。
- 操作仅在通知批次外由 owner 调用，不能在裸 Runtime 的事件分发中 reset。正常未调用生命周期操作时，P1-04 原语义全部保留。
- 世界/录制/ID 分配器不受清理或重锚影响；已执行和业务拒绝命令不再取消，丢弃的未执行命令不生成 Core 事件。

## 不包含

- 不引入 GameSessionError、会话状态、rAF 或浏览器；不提前建暂停命令。
- 不改既有 Core/记录格式，不删除或放宽 P1-04 测试。

## 关键文件与契约

- [synthetic-runtime.ts](../../../../engineering/source-structure.md#r3-合成-runtime)、[fixed-step-clock.ts](../../../../../src/app/runtime/fixed-step-clock.ts)、[synthetic-event-bus.ts](../../../../engineering/source-structure.md#r3-合成-runtime)（已有，本项修改）。
- 计划新增 `src/app/synthetic-runtime-lifecycle.test.ts`；已有 Runtime/clock/bus 测试只读回归。

## 验收标准

- [x] AC-04：50 Hz、1000/1020/1040/1050 得到 tick=2、pair=1/2、alpha=0.5；折叠后 2/2，重锚 100000 时 0 tick 仍 2/2，100020 时 2/3。另覆盖新基准早于旧时间。
- [x] AC-05：清除待执行 ID 仅一次、输入归零、无世界/RNG/ID/记录副作用，下一合法提交 ID 连续。
- [x] AC-08：旧冻结结果不变，最新折叠无 Core 写入；全量订阅撤销后不投递，旧取消句柄幂等。
- [x] AC-14：faulted 后仍能清理但不能继续 frame；P1-04 既有测试全部保留并通过，目标测试及 pnpm check 通过。

## 验证方法

- `pnpm exec vitest run src/app/synthetic-runtime-lifecycle.test.ts src/app/fixed-step-clock.test.ts src/app/synthetic-event-bus.test.ts src/app/synthetic-runtime.test.ts src/app/synthetic-runtime-events.test.ts src/app/synthetic-runtime-fault.test.ts src/app/synthetic-runtime-recording.test.ts`。
- 真实 Runtime/Core/录制对照，数值/ID/时间边界沿用 spec；错误注入只在测试创建边界，绝不新增公开编辑世界接口。
- rubber-duck 后 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 仅覆盖上述三个修改文件和新测试。同步更新 [engineering](../../../../engineering/source-structure.md#r10-菜单入口键位与工程文档) 的新显式操作边界；无浏览器或原版验证。

## 完成证据

- 2026-10-02：[生命周期测试](../../../../engineering/source-structure.md#r3-合成-runtime) 7 项通过，完整 app 104 项通过；`pnpm check` typecheck/lint/23 文件 524 测试/build 成功。
- AC-04 的原样时序及较早新锚精确通过；独立真实 Runtime 记录对照证明清意图不消耗世界/RNG/记录，下一命令 ID 连续。旧冻结输出不变，批次中四种操作均拒绝且不应用；故障后成功前缀可 replay。
- rubber-duck 无实现缺陷。保留 P1-04 reentrant-call 的原消息/种类以免改既有错误契约；engineering 明确它也用于批次内生命周期调用。四角度 simplify 并行完成，无适用清理。
- 文档影响：engineering 记录四种显式操作及权限/故障边界；guides 仍准确，无浏览器或原版流程变化。Core、冻结决定与阶段退出项未改。
