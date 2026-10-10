---
type: plan
status: active
phase: P3
task: "03"
subtask: "23"
updated: 2026-10-09
---

# 23 — 最终对齐

**契约来源：** [spec](../spec.md)（含修订 1）的全部 S-01 至 S-17 与 AC-01 至 AC-21。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只做验证，不交付新功能代码。逐项核对 [goal 的验收覆盖](../goal.md#验收覆盖)：每个 S 与 AC 都有实现与证据，证据对应当前代码与文档，没有过期的结论被当作通过。
- 核对本任务的不变量：
  - 只导入闭包的 18 项与 spec 修订 1 追加的 #47；G 项与“不用”的条目（含 #48–#54）没有进入包；
  - 字段只保留来源值，没有规则解释、默认值或换算；存储类型都有证据；
  - 切片定义只有一份，版本为 4；`ConverterVersion` 只有一个生产定义；导入协议版本符合 spec；
  - `MissionSetup` 只透传事件触发，`loadMission` 的其余行为不变；
  - 研究门槛：凡有阻塞，都已按 spec 记录恢复条件，或已有经批准的修订（修订 1 覆盖 24 的门槛 3 与 4 及 `flags` 8）。
- 核对原版隔离（AC-18）：仓库、文档与提交中没有原版字节、文字、数值、图像、声音、反编译代码或截图；合成数据只由代码生成；诊断与 CLI 输出不泄露值。
- 运行工程检查：`pnpm check`、`pnpm test:e2e` 与 `pnpm check:original`，并检查修改文档的链接与 `updated:`。
- 发现缺口时，交给协调者新建修复子任务（使用新 ID，插入本行之前并加入本行的依赖），不在本行修补功能。

## 不包含

- 新功能、规则或文档内容的补写：缺口归新的修复子任务。
- push、合并、部署或云操作：不在授权内。

## 关键文件与契约

- [goal](../goal.md) 的验收覆盖与子任务跟踪；01–22 与 24–28 的完成证据。

## 写入范围

- 无。

## 验收标准

- [x] 每个 S 与 AC 都有对应的实现与当前证据；AC-01 至 AC-20 逐项核对通过，或已按 spec 记录阻塞。
- [x] 本任务的不变量与原版隔离（AC-18）核对通过。
- [x] AC-21：`pnpm check` 与 `pnpm test:e2e` 通过；`pnpm check:original` 通过。
- [x] 修改过的文档 `updated:`、链接与锚点有效。

## 验证方法

- 命令：`pnpm check`、`pnpm test:e2e`、`pnpm check:original`；文档链接检查；代码与文档审阅。

## 完成证据

2026-10-09，协调者在 `p3-03-rule-data-spec` 的 checkout 中执行，两轮。

- **首轮（未通过）：** 合并 main（P3-02）后，`setupHash` 不含 `MissionSetup.eventTriggers` 与声明的 `eventTrigger`，与 P3-02 spec 中“覆盖全部静态输入”不符（22 报告）。按 execute-goal §5 回到 pending，新增修复子任务 28，详见 goal 执行记录。其余核对在首轮已通过，第二轮重新确认。
- **第二轮（通过），基于 28 集成后的 `d893f6b` 与认领提交 `79201ed`：**
  - **覆盖：** 01–22 与 24–28 的验收复选框全部勾选；[验收覆盖](../goal.md#验收覆盖)中每个 S 与 AC 都指向已完成行的当前证据。spec 修订 1 的改动（`hud-text`、sound payload schema 2、技术决定 14–16 与改动后的 AC）由 25–27 覆盖；AC-01 的门槛条款由修订 1 的批准满足；AC-02 由 07 与 28 覆盖。
  - **不变量：**
    - 只导入闭包的 18 项与 #47：19 与 26 的读取日志测试（含闭包外的 MUSC 诱饵与未读条目的全量核对）通过；21 的不共用格式解析的独立读取在基准上比较 246 项、10,954 个叶值，0 处不一致，G 项与“不用”的条目不在包中。
    - 只保留来源值：08–17、25–27 的解析与转换测试按字段处理规则核对，存储类型的证据在格式文档中。
    - 唯一定义：`SLICE_DEFINITION_VERSION` 为 4，只有一份切片定义（工程边界回归）；四个组件只各定义一次，`PRODUCTION_PACKAGE.converterVersion` 为 `osr-import.graphics-4.logic-2.audio-2.models-4` 并由测试推导核对；`IMPORT_PROTOCOL_VERSION` 为 5；logic payload schema 2，sound payload schema 2。
    - Core：`loadMission` 只透传事件触发；28 之后 setupHash 覆盖它们，Core 仍不解释、不调度。
    - 研究门槛：24 的门槛 3 与 4 及 `flags` 8 由 spec 修订 1 解决；没有剩余阻塞。
  - **原版隔离（AC-18）：** `pnpm check:original` 通过（index 与 worktree 1,122 个文件、build 9 个文件，没有发现）；工程边界回归在 `pnpm check` 中通过；合成数据都由代码生成；诊断与 CLI 输出只含 code、结构路径、计数与哈希（10、14、16、19、21、26 的测试与审阅）。21 的完成证据把截图外观写作已确认，超出技术决定 11 的上限；22 已在 textures §6 按高概率更正，goal 执行记录同步更正。
  - **AC-21：** `pnpm check` 通过（208 个测试文件、6,438 个测试与生产构建，28 集成时运行）；完整 `OSR_E2E_DEV_PORT=5190 OSR_E2E_PREVIEW_PORT=5191 pnpm test:e2e` 185 项全部通过（11.9 min，Chrome 155.0.8059.39，代码状态为 `d893f6b`）；`pnpm check:original` 通过。
  - **文档：** 本任务改动的 74 个文档链接与锚点有效（含合并带入的 P3-02 文档）；带 front matter 的文档 `updated:` 均为 2026-10-09；`AGENTS.md` 与技能参考按约定没有 front matter。
- **残余与后续（不阻塞完成）：**
  - `repeat` 声音的排程在 Chrome 中逐帧核对为准确，Firefox 与 WebKit 未实测（27）；
  - `joint-pipeline.production.spec.ts` 的 `framePixels` 仍用旧原点规则，只在像素比 1 下运行，两种规则一致（20）；
  - 22 列出的未处理文档项（hud §3 的 EXIC 链接与 NEBC 顺序、comm 的对象列表构成、`source-error.ts` 的 `textBytes` 注释）与 12、13、15、17 建议的代码整理，留作后续；
  - spec `debris-parameters` 一行的“归一化取反副本”措辞不准（02 已记录，处理不变）。
