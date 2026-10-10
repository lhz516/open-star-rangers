---
type: plan
status: active
phase: P3
task: "06"
subtask: "16"
updated: 2026-10-09
---

# 16 — 真实内容本地核对

**契约来源：** [spec](../spec.md) 的 S-02、S-07；AC-07（本地真实内容部分）；[起飞初始状态](../spec.md#起飞初始状态)；[对照方法与判据](../spec.md#对照方法与判据)的独立性要求。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在被忽略的 `local/research/p3-06/real-content/` 写本地核对脚本：按 [P3-02/09](../../02/subtasks/09-real-content-check.md) 的做法，用生产导入作业转换开发者本地的 CloneCD 文件组，经 `validatePackage` 取得资源包与 `ContentIdentity`，从同一包解码三份逻辑 Asset 与 `data/craft-info`（`decodeRuleDataPayload`），再用 09 的创建入口建立世界（难度 19；僚机 null，以及至少一个名单索引）。
- 推进到玩家实例化、首次活动与首次运动之后，读取玩家的移动块、最高速度、控制状态与目标引用，以及首批活动对象的初始移动块。
- 期望由 05 的研究结论与原版数据独立推出，不复用被测 Core 的飞行状态或运动 helper；随机放置按 P3-02 的支持集判定，相对时刻按原点换算。依赖 P3-07 或 P3-08 的初值按检查点 A 的边界处理；尚未接入时写明，不宣称通过。
- 输出只含判定、计数与身份（内容身份、候选提交），不含名称、坐标或 payload；脚本与输出都留在 `local/`。
- 不一致时：记录差异，判断是实现缺陷还是研究缺口，交协调者新增修复子任务，本项不放宽判据。

## 不包含

- 原版运行时对照（17、18）；公共测试（不读原版文件）。
- 把核对脚本加入仓库或 `pnpm check`。

## 关键文件与契约

- [tools/logic-check.ts](../../../../../tools/logic-check.ts)、[tools/package-check.ts](../../../../../tools/package-check.ts)（生产导入作业的用法先例）；[rule-data-payload.ts](../../../../../src/content/rule-data/rule-data-payload.ts)。
- 05 的完成证据与检查点 A 定稿。

## 写入范围

- `local/research/p3-06/real-content/**`：本地核对脚本与输出（被忽略）。

## 验收标准

- [ ] AC-07（本地部分）：真实内容经同包验证与解码后进入 Core；玩家初态的确定值、随机支持集与相对时刻等于独立推出的期望，或差异已交修复。
- [ ] 输出只含判定、计数与身份；仓库中没有新增的跟踪文件。

## 验证方法

- 运行本地脚本并记录判定；`git status` 确认没有跟踪的输出。不涉及浏览器。

## 完成证据
