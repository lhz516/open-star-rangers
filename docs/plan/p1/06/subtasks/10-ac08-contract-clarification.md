---
type: plan
status: active
phase: P1
task: "06"
subtask: "10"
updated: 2026-10-02
---

# 10 — AC-08 并存条款的契约更正

**契约来源：** [spec](../spec.md) 的 AC-08、技术决定 5，以及“计划新增的 UI 契约”中 `recentResults` 的保留规则；由 [09](./09-final-alignment.md) 的最终对齐发现。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 修订 spec 的 AC-08 与技术决定 5，说明真实 Runtime 中两条互斥的故障路径：首个 tick 失败只产生 failure 取消（命令未消耗）；后续 tick 失败只产生 unconfirmed（命令已消耗、事件被丢弃）。
- 保留原有要求：仍未终结的 pending 必须标为 unconfirmed，不显示假成功或假取消，也不悬挂；若同一转换先后出现两类结果，二者都保留；unconfirmed 不覆盖已有终态；不自动重提。
- 验证方法改为两类路径分别用真实 Core 注入验证，并存保留由 store 原子转换测试验证。唯一放宽的是删除“同一真实故障必须同时产生两类结果”这一无法满足的要求；不新增行为，其余要求与全部测试断言不变。
- 在 spec 审批节如实记录本次更正的来源、范围（包括被删除的要求）与授权依据；修订使旧审阅标记失效，按 ADR-0015 的先例删除该标记，不伪造新的审阅。

## 不包含

- 修改 Runtime、Session 或 Core，使一次故障同时产生两类结果：这超出 P1-06 的受保护范围。
- 新增实现代码或测试；现有证据见 [04](./04-cancellation-failure-controls.md#完成证据) 与 [01](./01-projection-store-contract.md#完成证据)。

## 关键文件与契约

- [spec](../spec.md)：AC-08 行、技术决定 5、审批节与 front matter 的 `reviewed`。
- [goal](../goal.md)：验收覆盖中的 AC-08 行（生成本项时已更新）。

## 验收标准

- [x] AC-08 与技术决定 5 的新措辞与真实 Runtime 行为一致，只删除“同一真实故障必须同时产生两类结果”，保留“不悬挂、不假成功或假取消、并存时都保留、不覆盖已有终态、不自动重提”的全部要求。
- [x] 新的验证方法与 04、01 已有测试逐一对应，没有删除或放宽任何测试断言。
- [x] spec 审批节如实记录更正的来源、范围与授权依据，并说明这是窄范围契约放宽；失效的 reviewed 标记已删除；front matter 与链接有效；`node tools/task-state.ts p1/06` 不报告 spec 或覆盖不一致。

## 验证方法

- 逐句对照修订前后的 AC-08 与技术决定 5；核对 04 的首个/后续 tick 故障测试与 01 的 store 原子转换测试仍覆盖新措辞的每一项要求。
- 运行文档链接与元数据检查，以及 `node tools/task-state.ts p1/06 --json`。
- 只改文档，因此不运行应用构建，也不执行 simplify。

## 完成证据

- 2026-10-02：已更正 [spec](../spec.md) 的 AC-08 与技术决定 5，审批节追加“AC-08 契约更正”记录，删除了失效的 reviewed 标记。
- 逐句对照：
  - 首个 tick 失败只产生 failure 取消：outcomes 测试“cancels unconsumed commands when the first tick of a frame fails”。
  - 后续 tick 失败标为 unconfirmed，投影为 tick 1 且含 marker，pending 为空，重启后不重提：outcomes 测试“marks commands whose tick ran before a later tick failed as unconfirmed…”。
  - 已收到的结果在之后的 consumer 故障中保留：outcomes 测试“keeps a result received before a consumer failure…”。
  - 并存时两类结果都保留，后到的结算不覆盖已终结的命令：store 测试“applies run transitions as one coherent snapshot”，与 settle 只结算仍在 pending 中的命令。
  - 测试与实现均未改动。
- rubber-duck：确认新措辞与 Runtime 行为一致（命令只在首个 step 成功后清空，事件在全部 tick 完成后才分发），测试覆盖充分，审批记录如实、未伪造批准，tracker 结构有效，34 个文件 / 668 项测试通过。它指出这项修订确实删除了“同一真实故障必须同时产生两类结果”这一要求，不能写成“不放宽”。已采纳：spec、goal 与本项都改为如实表述为窄范围契约放宽，并保留请用户确认。
- 检查：文档链接与元数据有效；`node tools/task-state.ts p1/06` 在本项完成后路由到 09，没有报告覆盖或结构问题；`git diff --check` 通过。只改文档，未运行构建，也不执行 simplify。
