---
type: plan
status: active
phase: P3
task: "03"
subtask: "22"
updated: 2026-10-09
---

# 22 — 文档与未知项同步

**契约来源：** [spec](../spec.md) 的 S-01（U 项）、S-17、AC-01（U 项）、AC-14（限值与份额的记录）、AC-20。
**依赖：** 20, 21, 25, 26, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 01–21、24–27 的完成证据与 goal 执行记录中“交 22”的接口变化与线索，同步以下文档：
  - **模块分册：** [内容](../../../../engineering/modules/content.md)、[原版数据](../../../../engineering/modules/original-data.md)、[Core](../../../../engineering/modules/core.md)、[Worker](../../../../engineering/modules/workers.md)、[应用](../../../../engineering/modules/app.md)。记录规范 JSON 模块、新 payload 族（含 `hud-text`）、sound payload schema 2、错误码、限值名与限值、解析器、转换步骤、份额、`ConverterVersion`、切片定义版本 4 与 `MissionSetup.eventTriggers`；[平台](../../../../engineering/modules/platform.md)分册记录音频控制器的重复播放。
  - [源码结构](../../../../engineering/source-structure.md)的目录树：`src/content/rule-data/`、`src/content/flight/` 与新增文件。
  - [本地导入指南](../../../../guides/local-import.md)：转换器版本递增后须重新导入；查看器中新增的图像与声音。
  - [文档地图](../../../../README.md)：新增的 `craft.md`、`ai.md`、`comm.md`。
  - [imfat](../../../../original/formats/imfat.md) §5 的类型状态（ANIM、CINF、DFPG/AICO 等），以及 [executable](../../../../original/formats/executable.md) 到新格式文档的链接与执行记录中列出的更正。
  - [audio](../../../../original/formats/audio.md)：11 个新 SND 的 `flags`（10181 为 8，并写明其表示）与 SND 10409 循环条件的更正；[ai](../../../../original/formats/ai.md)：组 0 闭包的条目 ID 与名称区域，以及过时的 fixup 说明。
  - [未知项登记表](../../../../original/unknowns.md)：按 01–05 与 21 的线索更新 U-001、U-004、U-018、U-022、U-027、U-028、U-030 等的状态与线索，负责阶段不改。
- 每个修改的文档都更新 `updated:`；检查链接、锚点与 front matter。只写结构、计数、置信度与证据路径，不含原版内容。

## 不包含

- 工具用法与 `AGENTS.md`：已由 21 更新。
- 01–05 已写入的格式事实：只补链接与类型状态，不改写结论。
- [STATUS](../../../../STATUS.md) 与阶段 [tasks.md](../../tasks.md)：只由协调者修改。

## 关键文件与契约

- 01–21 的完成证据；spec 的 [S-17](../spec.md#包含)。

## 写入范围

- `docs/engineering/modules/content.md`：内容模块的新 API。
- `docs/engineering/modules/original-data.md`：解析器与转换。
- `docs/engineering/modules/core.md`：`MissionSetup.eventTriggers`。
- `docs/engineering/modules/workers.md`：作业接线与生产包配置。
- `docs/engineering/modules/app.md`：受影响的持有者与查看器说明。
- `docs/engineering/source-structure.md`：目录树。
- `docs/guides/local-import.md`：重新导入与新增查看项。
- `docs/README.md`：文档地图。
- `docs/original/formats/imfat.md`：类型状态。
- `docs/original/formats/executable.md`：到新格式文档的链接。
- `docs/original/unknowns.md`：U 项。
- `docs/engineering/modules/platform.md`：音频控制器的重复播放。
- `docs/original/formats/audio.md`：新 SND 的 `flags` 与循环条件的更正。
- `docs/original/formats/ai.md`：闭包条目与名称区域、过时说明。

## 验收标准

- [ ] AC-20：S-17 列出的分册、目录树、指南与文档地图已同步，指南写明须重新导入；audio 记录 `flags` 8 出现在切片中及其表示。
- [ ] AC-01（U 项）：受影响的 U 项已按研究结论更新，负责阶段未改。
- [ ] AC-14（记录）：限值、份额与推导所用的观测值已记录在模块分册中。
- [ ] 修改的文档 `updated:` 已更新，链接与锚点有效；文档中没有原版字节、文字、数值或反编译代码。

## 验证方法

- 文档 diff 审阅；链接、锚点与 front matter 检查。不涉及构建或浏览器。

## 完成证据
