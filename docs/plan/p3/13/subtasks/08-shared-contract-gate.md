---
type: plan
status: active
phase: P3
task: "13"
subtask: "08"
updated: 2026-10-25
---

# 08 — D-01 输入、内容与预算定稿

**契约来源：** [spec](../spec.md#共享契约修订d-01) 的 S-01，AC-01/02/03/06/09/18。
**依赖：** 07。
**执行方式：** 需用户：批准尚未形成的共享合同；agent 先完成精确草案，推荐授权不替代未定合同审批。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 为仪表调度 payload、同 tick `TickOutput.projection`、statusDisplay.blink、满刻度/目标变体/标签威胁等定稿确切类型、单位、输入来源和消费者。
- 明确 slot 7 无图像的表达与 slot 2 同源几何、有限静态参数，禁止导入运行期指针/计时；决定是否需要布局 schema 变化。
- 固定消息/文字/历史/CPU/GPU 上限、雷达容量策略、格式失败与包校验/缓存恢复/版本影响；保留单事件通道和整批输入拒绝语义。
- 同步右键双调用与 ready 握手、G-05 项目消息策略以及受影响上游合同；计划中的文件名/写入范围若需调整，由协调者在认领实现前核对。

## 不包含

不写产品代码，不批准新的原版差异或省略证据，不修改已完成 goal/subtask 证据。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)、[game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)。
- [map-input.ts](../../../../../src/ui/game-input/map-input.ts)、[layout-payload.ts](../../../../../src/content/graphics/layout-payload.ts)。

## 写入范围

- `docs/plan/p3/02/spec.md`：Core 只读事实合同。
- `docs/plan/p3/03/spec.md`：补充导入与版本。
- `docs/plan/p3/04/spec.md`：Runtime 批次/生命周期。
- `docs/plan/p3/05/spec.md`：输入与绘制 ready。
- `docs/plan/p3/09/spec.md`：map 读模型/零能量反馈。
- `docs/plan/p3/10/spec.md`：基地项目消息呈现。
- `docs/plan/p3/13/spec.md`：D-01 完整合同和批准记录。

## 验收标准

- [ ] 所有必需输入与预算有封闭定义，非必需候选以可推导性证据撤销。
- [ ] 逐 tick 数据、错误前缀/拒绝、版本与旧缓存恢复一致，无猜测 fallback。
- [ ] 上游同步获得适用批准；仍未批准的部分不能作为实现前提 completed。

## 验证方法

合同对实际类型、原版事实和合成验证矩阵逐项核对，检查链接/metadata；不得以只写方向或“将来决定”通过关卡。

## 完成证据
