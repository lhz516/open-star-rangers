---
type: plan
status: active
phase: P3
task: "08"
subtask: "09"
updated: 2026-10-14
---

# 09 — 跨任务修订关卡（D-03）

**契约来源：** [spec](../spec.md) 的 S-02、AC-01、AC-14；[实施关卡](../spec.md#实施关卡) D-03；[跨任务修订](../spec.md#跨任务修订d-03)、[与其他任务的接口](../spec.md#与其他任务的接口)。
**依赖：** 07。
**执行方式：** 需用户：批准 D-03 定稿的跨任务修订。spec 规定 D-03 须由用户明确批准，本 goal 没有预先授权由 agent 代批。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **AI 解析数据的导入（P3-03）：** 依 02 与 07，修订 [P3-03 spec](../../03/spec.md) 中 `data/ai-programs` 的范围与[字段处理规则](../../03/spec.md#字段处理规则)的适用说明：关键字表、分隔符等静态数据的来源区域、LE fixup 与字符串目标校验、表项形状与顺序、重复键规则、名称/计数/字节预算、payload schema 由 1 递增与生产 `ConverterVersion` 递增、旧缓存不恢复。
- **友伤累计（P3-02 CR-13、P3-10）：** 在 P3-02 spec 的 CR-13 中写明 `0x3c208` 僚机分支的累计与窗口归本任务，其余反应仍归 P3-10，并写明调用点的操作数与一次性。
- **僚机命令与回复接口（P3-10）：** 在 P3-02 spec 中写明 P3-10 投递的请求形状、本任务交出的回复事实与 P3-10 拥有的回复队列；P3-10 的 spec 尚未生成，在 P3-02 与 Core 交接中记录供其起草时采用。
- **地图可见性（P3-09）：** 写明集合与 +0xD4 历史的唯一所有者、`object-sets` 阶段中 P3-09 的调用点、地图开/关/连续帧的联合测试与 P3-09 的联合验收责任。
- **`b` 的绑定（P3-05）：** 06/07 确认 `b` 属于正常玩法时，修订 [P3-05 spec](../../05/spec.md) 的[绑定表](../../05/spec.md#绑定表)（修饰键、重复、菜单捕获、各上下文门禁）；否则在本任务 spec 记录不纳入的证据并请用户批准。
- 需要修改阶段索引的责任描述时，以建议形式交协调者（`tasks.md` 只由协调者修改），并随本关卡一起请用户批准。
- 各受影响 spec 的审批节记录用户批准的日期、范围与原话；已完成任务的 goal 与 subtask 不改写。

## 不包含

- D-01 的 Core 形状（08）；实现（13、22）。

## 关键文件与契约

- [P3-03 spec](../../03/spec.md)、[P3-05 spec](../../05/spec.md)、[P3-02 spec](../../02/spec.md)。
- 现有实现：[rule-data-payload.ts](../../../../../src/content/rule-data/rule-data-payload.ts)（`ai-programs` schema 1）、[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts)、[bindings.ts](../../../../../src/ui/game-input/bindings.ts)。

## 写入范围

- `docs/plan/p3/02/spec.md`：CR-13 与接口的修订及批准记录。
- `docs/plan/p3/03/spec.md`：导入范围修订及批准记录。
- `docs/plan/p3/05/spec.md`：`b` 绑定的修订及批准记录（纳入时）。
- `docs/plan/p3/08/spec.md`：受定稿影响的内容与批准记录。

## 验收标准

- [ ] 五项跨任务修订都已定稿写入相应 spec 正文，并取得用户的明确批准与记录。
- [ ] 导入修订写明 schema 与转换器版本的递增及旧缓存处理；`b` 的纳入或排除有证据与批准。
- [ ] 需要的阶段索引修改已交协调者；没有实现代码；`node tools/task-state.ts p3/08` 不报计划问题。

## 验证方法

- 逐项对照 spec 的跨任务修订方向与 07 的汇总；文档的链接与元数据检查；git 审阅。

## 完成证据
