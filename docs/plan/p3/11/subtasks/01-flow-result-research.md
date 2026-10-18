---
type: plan
status: active
phase: P3
task: "11"
subtask: "01"
updated: 2026-10-17
---

# 01 — 流程、全清、总结与结局研究

**契约来源：** [spec](../spec.md) 的 S-03、S-08、S-10、S-11、AC-14；[原版研究](../spec.md#原版研究) Q-01、Q-03、Q-08、Q-10 与 Q-11 中流程/总结部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-01：** `0x3266c` 中主状态 3–5、子状态 0–5 的分派次序与各分支的到期比较与重设；与 P3-10 停靠分派的相对位置；成功/失败处理之后主状态 0/1、`0x334bc` 与实体清理的次序；锁存 tick 的剩余阶段；所选任务中状态 5 失败分支只经调试入口可达的证明（或反例）。
- **Q-03：** `0x69a70` 的完整条件（存活、被毁、状态 6、待生成项、阶段内已投递请求的边界）；`0x69c54` 的触发与区间选择、比例常量与截断、零分母、空消息与无匹配、拼接、i8 选择值及有效域；`0x69e1c` 的作用及其输出的读者；所选任务的规范内容是否足以表达这些规则，以及 Core 需要的创建时语义检查。
- **Q-08：** 成功处理 `0x335f0` 与失败处理 `0x3351c` 中本任务需要的部分：结局过场的组成与变体条件（返航变体读对象状态 +3）、救援计数复位与锁存的先后、统计读取；按种类计数、感谢与重伤标志的实际读者；得分、统计行、勋章与晋升是否回写任何规则状态、是否抽取 RNG 或调用音效。只做到能判断“是否影响本任务规则”为止。
- **Q-10：** `0x339cc` 的读者与条件；主状态 4 的推迟读哪一个视角字段；主状态 4、5 中各门禁（菜单、地图、Warp、停靠）的行为。
- **Q-11（流程部分）：** 各到期比较的 u32 视图与严格与否，比例的 f64 计算与截断。
- 每条结论标明置信度与证据（函数地址、原生指令读取、数据统计）。

## 不包含

- 被毁、信标、救援与僚机计时（02）；消息常量与手册（03）。
- 写入 `docs/original/`（04）；勋章完整条件（P4）；原版运行（06、20）。

## 关键文件与契约

- [任务结果与重开](../../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)、[过场与衔接](../../../../original/formats/executable.md#cut-scenes-and-loop-transitions-p3-0108)、[C3](../../../../original/formats/executable.md#c3-cross-frame-consumption-by-the-main-flow--confirmed-code)、[段 2 事件触发](../../../../original/formats/scenario.md#section-2-event-triggers-p3-03)。
- 规范内容与解析边界：[logic-content.ts](../../../../../src/content/logic/logic-content.ts)、[scen.ts](../../../../../src/original-data/formats/scen.ts)、[setup-check.ts](../../../../../src/core/world/setup-check.ts)。
- 阶段表：[pipeline.ts](../../../../../src/core/systems/pipeline.ts)、[P3-02 系统流水线](../../02/spec.md#系统流水线)。

## 写入范围

- `local/research/p3-11/flow/**`：Ghidra 脚本、只读输出、数据统计与 findings。

## 验收标准

- [ ] Q-01、Q-03、Q-08、Q-10 及 Q-11 流程部分各有达到“已确认（代码）”门槛的结论，或明确未达门槛的具体缺口与恢复条件。
- [ ] 状态 5 失败分支的可达性有证据链结论；`0x69e1c` 与勋章路径有“影响/不影响本任务规则”的判断及依据。
- [ ] findings 只含地址、结构、计数与文字结论，不含反编译输出或原版内容；git 中没有受跟踪文件变化。

## 验证方法

- Ghidra `-noanalysis -readOnly`；寄存器敏感的步骤从原生指令读取。数据结论用只读脚本统计 SCEN 3019。
- `git status` 确认只有被忽略的 `local/` 有变化。

## 完成证据
