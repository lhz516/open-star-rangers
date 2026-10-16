---
type: plan
status: active
phase: P3
task: "14"
subtask: "06"
updated: 2026-10-15
---

# 06 — D-01 共享输出与音频端口定稿

**契约来源：** [spec](../spec.md#实施关卡) 的 S-03、S-06、S-08、AC-06、AC-08、AC-10，D-01。
**依赖：** 05。
**执行方式：** 需用户：明确批准具体共享契约和必要量化判据；当前 spec 批准不代替该决定。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 05 的已核实需求落到最小字段：warnings 的 readiness/两布尔值、必要活动/运动/事件时快照；列明拥有者、生产者、类型、单位、缺失值、冻结和版本影响。
- 定稿 AudioController/能力端口的初始与更新参数、进度、状态查询、任务暂停门禁、封闭结果和错误；不将待核实原版范围硬套平台，不改变查看器缺省行为。
- 定稿所有者可信激活与异步关闭的必要公开接线，以及共享事件变更对 Runtime 测试替身和 replay 读取器/比较器的影响。
- 将具体变化与需要批准的数值判据写入相应现有 spec，按工作流取得明确批准；只有必需字段有真实需求时才扩展。代码落点由 08–18 实现。

## 不包含

- 不实现共享类型或规则，不批准冻结决定变更；不代建尚不存在的 P3-08 至 P3-13 spec。

## 关键文件与契约

- 现有 [P3-02 扩展规则](../../02/spec.md#扩展规则)、[P3-04 消费者生命周期](../../04/spec.md#消费者接线与释放)。
- 现有 [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts)、[DomainEvent](../../../../../src/core/contracts/domain-events.ts)、[Projection](../../../../../src/core/projections/projection.ts)只用于核对。

## 写入范围

- `docs/plan/p3/14/spec.md`：已授权关卡的具体定稿与审批记录。
- `docs/plan/p3/02/spec.md`：只读输出及必要版本修订。
- `docs/plan/p3/04/spec.md`：必要所有者/运行接线修订。
- `docs/plan/p2/08/spec.md`：若现有播放器公开契约需修订，限定新增能力及兼容边界。

## 验收标准

- [ ] 具体字段、参数/结果形状、单位、默认值、版本和测试责任写全，没有开放任意载荷。
- [ ] 受影响合同已有真实批准记录；未批准时不把本项 completed 或放行依赖代码。
- [ ] 未改变 S/AC 范围；需要另改合同则先走 generate-spec/review-spec，不以 goal 自行决定。

## 验证方法

- 文档与实际 TypeScript 定义逐项核对；检查引用、元数据、版本升级/保持依据。
- 按[任务工作流](../../../../engineering/agent-workflow.md)处理审阅与审批标记；本项不运行应用实现。

## 完成证据
