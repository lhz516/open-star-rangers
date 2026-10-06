---
type: plan
status: active
phase: P2
task: "06"
subtask: "20"
updated: 2026-10-06
---

# 20 — 诊断原因的隐私补救

**契约来源：** [spec](../spec.md) 的 S-08 与 AC-16（本任务产生的诊断不含原版字节、条目编号、偏移、文件名或宿主路径）。
**依赖：** 05, 18。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。由 13 首轮最终对齐的补救流程加入，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- [model-step.ts](../../../../../src/original-data/conversion/model-step.ts) 与 [effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts) 各有一条 `invalid-declaration` 的原因文本写出了封包文件名。改为不含文件名的说法，code 与位置不变。
- 测试支持的 `expectSourceError` 只核对位置语法，没有核对原因文本。补充断言：`models…` 与 `effects…` 位置的原因文本不含光盘文件名、路径分隔符或十六进制偏移；对这两条声明错误断言完整的原因文本。

## 不包含

- 其他任务的诊断，例如 P2-08 音频转换中的同类文本。
- `nob-check` 的输出格式，理由见 goal 执行记录。
- 错误 code、位置语法与失败边界的任何变化。

## 关键文件与契约

- 修改 `model-step.ts`、`effect-step.ts`、[conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 及相应测试；新增 [conversion.test-support.test.ts](../../../../../src/original-data/conversion/conversion.test-support.test.ts)。
- 文档：[源码结构](../../../../engineering/source-structure.md)中模型与效果的位置语法说明。

## 验收标准

- [x] 模型与效果的转换诊断中，没有一条原因文本含文件名、路径分隔符或偏移；两条声明错误的 code 与位置不变。
- [x] `expectSourceError` 对 `models…` 与 `effects…` 位置检查原因文本；不修正源码时，新断言会失败。
- [x] `pnpm check` 通过。

## 验证方法

- 聚焦 Node 测试；`pnpm check`。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据

2026-10-06 完成。

- **源码：** 两条原因改为不含文件名的说法，code 与位置不变：
  - [model-step.ts](../../../../../src/original-data/conversion/model-step.ts)：“a model must map to one whole MODL entry of the model archive”；
  - [effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts)：“a projectile mapping must start with one whole RENS entry of the effect archive”。

  逐条检索模型与效果的转换、声明、生产输入与 MESH、MODL、LE 读取，以及 `content/models`、`content/effects` 的原因文本与位置，其余都只有固定描述、规范 Asset ID、结构序号与限值；插值只有限值与路径序号。P2-08 音频转换中的同类文本不属于本任务。
- **测试：**
  - [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 新增 `namesPrivateDetail`，判定原因文本是否含文件名、路径分隔符、十六进制值，或紧跟数字的条目、偏移、字节。`expectSourceError` 对 `models…` 与 `effects…` 位置都执行这一检查。
  - [conversion.test-support.test.ts](../../../../../src/original-data/conversion/conversion.test-support.test.ts) 给出判定的正反例：拒绝 10 种写法，接受 6 条现有的结构与限值措辞。
  - [model-step.test.ts](../../../../../src/original-data/conversion/model-step.test.ts) 与 [effect-step.test.ts](../../../../../src/original-data/conversion/effect-step.test.ts) 对这两条声明错误断言完整原因。
  - **证伪：** 暂时撤回源码修正后，恰好这 3 条新断言失败（实际原因含封包路径），其余通过；判定对两条旧原因都返回 true。
- **检查：**
  - `pnpm check` 通过（140 个文件，4,243 个测试，构建成功）；
  - `pnpm check:original` 通过，0 个发现；
  - 改动文档的链接检查 0 个问题。
- **Rubber-duck：** 没有阻断问题。非阻断：判定漏掉“entry ID 10751”、十进制偏移、其他扩展名与字节值等写法，已扩展判定并补上正反例。审阅确认：没有走 `expectSourceError` 的测试只涉及固定原因或下层继承的失败，不构成隐私缺口。
- **Simplify：**
  - 原因的类型转换只做一次，复用位置前缀判断，不再另建正则；
  - 判定的自测移到独立文件。

  复用角度没有发现：已有的 MARKER 隐私辅助函数检查的是植入标记，不能判定原因措辞。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)中模型与效果的位置语法两段补记了原因文本检查；其余文档不涉及诊断措辞，无需更新。

