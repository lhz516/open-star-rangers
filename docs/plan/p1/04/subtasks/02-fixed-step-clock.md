---
type: plan
status: active
phase: P1
task: "04"
subtask: "02"
updated: 2026-10-02
---

# 02 — 固定步长时钟与补跑边界

**契约来源：** [spec](../spec.md) 的 S-02、S-07、S-08、AC-02、AC-03、AC-04（时钟部分）、AC-13，以及技术决定 2、3、12。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现 Runtime 内部时钟，仅接收已经验证的生效 `tickRateHz`、`maxTicksPerFrame` 和每帧的 `nowMs`。没有场景、命令、事件或宿主时钟；创建参数的公开校验归 04。
- 保存首帧/截断后的时间基准、相对已运行 tick 数和最后接受的时间戳；首帧只锚定。按 spec 的 `number` 运算顺序求 E，输出冻结的 `{ticks, capped, alpha}` 供 Runtime 使用。
- 默认上限由 Runtime 配置解析为 5。到期数恰等于上限不截断；超过时只返回上限 tick 数，并丢弃完整积压及余量，以本帧重新锚定、alpha=0。
- 非数值、非有限、倒退及时间差/乘积溢出都抛 `invalid-argument`，path 为 `nowMs`；拒绝前不能改变内部基准或进度，不把 Infinity 当成积压。相同时间戳不重复推进。
- 时钟不决定 Core 故障与监听器异常策略；04 在全部模拟结束后、分发之前公布帧状态与 alpha，Core 故障时进入终止状态。

## 不包含

- 不接入 rAF、`performance.now`、暂停/继续、页面隐藏和外部重置接口；这些由 P1-05 决定。
- 不设置浮点 epsilon 提前触发 tick，不改每帧上限，不保证不同逐 tick 输入的最终状态相同。

## 关键文件与契约

- 计划新增 `src/app/fixed-step-clock.ts`、`src/app/fixed-step-clock.test.ts`；目前均不存在。
- `src/app/runtime-errors.ts`（01 计划交付）：时间拒绝统一使用 `GameRuntimeError`。
- [spec：帧推进与时间](../spec.md#帧推进与时间)：计算式、错误路径和截断规则唯一依据。

## 验收标准

- [x] AC-02：50 Hz、时间戳 1000/1010/1020/1040/1085/1085 的 ticks 为 0/0/1/1/2/0、alpha 为 0/0.5/0/0/0.25/0.25；1019.999 不跨首 tick，1020 恰跨。
- [x] AC-02：60 Hz 从 0 到 1000 ms，至少三种不触发上限的帧切分均到 60 tick；alpha 始终在 [0,1)。
- [x] AC-03：默认上限下 0→1000→1010→1020 ms 分别为首帧 0、5（capped）、0、1 tick；自定义 1/3、恰好上限、1e9 ms 有限长帧和重复时间戳准确。
- [x] AC-04：非有限、错误类型、回退、差值与乘积溢出均明确拒绝；之后的有效调用与未做非法调用的时钟对照相同。
- [x] AC-13：没有宿主 API；目标测试、`pnpm check` 和限定范围清理复验通过。

## 验证方法

- `pnpm exec vitest run src/app/fixed-step-clock.test.ts`，手写时间戳，不用 fake timers 或真实等待。
- 溢出分别测试 `−MAX_VALUE→MAX_VALUE`（60 Hz/1e-308 Hz）、`0→MAX_VALUE`（60 Hz），与有限长帧区分；覆盖首次锚定前后及失败后的继续调用。
- ticks/capped 精确比较，0/0.25/0.5 的 alpha 精确断言，0.6 允许至多 `Number.EPSILON`；不得用容差放宽 tick 边界。
- `pnpm check`；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 只清理本项两个新增文件。01 文件只读复用。
- Core 状态与队列在错误前后不变的集成证据由 04/05 补齐；无浏览器或原版验收。

## 完成证据

- 2026-10-02：[时钟](../../../../../src/app/fixed-step-clock.ts)与[20 项测试](../../../../../src/app/fixed-step-clock.test.ts)通过；最终 `pnpm check` 16 文件、447 项通过，typecheck/lint/build 成功。
- rubber-duck 未发现实现阻塞；按建议补齐原样 1000/1010/1020 序列、已有 tick 进度后的错误、溢出后可表示的新时间，以及上限+1 边界。
- 随后限定两文件做 simplify：整数/余数截断共享参数化测试；时钟为单一类，无重复时间源或闭包持有场景，不增加通用调度层。复验通过。
- 文档检查：尚无浏览器入口或新操作命令，engineering/guides 无需新增使用流程；本项保留内部时钟契约，04 接线时再记录公开 Runtime 使用约定。
