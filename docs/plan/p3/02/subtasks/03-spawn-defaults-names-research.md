---
type: plan
status: active
phase: P3
task: "02"
subtask: "03"
updated: 2026-10-09
---

# 03 — 原版研究：排程、缺省、名称、僚机与实例化

**契约来源：** [spec](../spec.md) 的 S-09、AC-14；[原版研究](../spec.md#原版研究)的 Q-01、Q-04、Q-05、Q-06（代码部分）、Q-07；[任务实例化](../spec.md#任务实例化)与[僚机](../spec.md#僚机)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

用只读 Ghidra 与本地数据回答以下问题，事实写入 scenario 与 executable（英文，逐条标注置信度）：

- **Q-01 排程顺序：** `0x6721c` 中段 1 记录、段 5 条目与僚机的入队次序；`0x67584` 对同一时刻各项的排列；`0x67018` 在一帧内处理多个到期项与多次请求的次序；任务构建后首轮队列检查与原点（`0x176740`）的关系。
- **Q-04 缺省值：** `0x6744c` 的调用时机（每条记录一次或每个对象一次）；+0x0C、+0x10、+0x60–+0x68、+0x70–+0x78 各自的 null、显式零、负值语义（只有已证实的字段钳为 0，不泛化）；+0x78 的随机映射；段 5 成员与 SCCT 僚机记录的缺省。
- **Q-05 名称：** `0x67d44` 对掩码 `0x6001`、`0x93780`、`0x78000` 的分支；种类名的来源（EXE 表或内容）；已用名称的记录与释放；名称耗尽时的处理。若种类名需要从未导入的数据读取，写明交给 P3-03 的导入需求。
- **Q-06 僚机（代码部分）：** `0x6721c` 中的门禁、选择值钳位与索引转换、生成时刻、放置（种类 2 的 +0x48 缺省为玩家记录）、缺省值与名称。运行时确认归 10。
- **Q-07 实例化：** `0x67938` 写入的、不依赖机型记录的初值（姿态与速度的来源、规则输入副本 +0xDC/+0xE0/+0xE4、计数器 +0x18 与段 5 计数、玩家视角模式）与对象事件（类型 3）；依赖机型记录的初值只列出交给 P3-06、P3-07 的清单。
- **所选任务的推导（交给 09、10）：** 按上述规则，从 SCEN 3019 与 SCCT 3123 独立推出带与不带僚机两种配置下的实例化清单：按种类的累计数量、来源（声明或编组与成员位置）与到期时刻（时钟单位）。推导脚本放在 `local/`，不复用被测 Core 的 helper；完成证据只记计数、来源编号与时刻。
- **冲突处理：** 发现切片实际使用、但 spec 未列出的路径或字段时，写明冲突交协调者先修订 spec。
- **记录：** U-022、U-023 更新状态与线索，负责阶段不改；脚本与输出在 `local/research/p3-02/spawn/`。

## 不包含

- 实例化的实现（07）；放置与换算（02）；僚机门禁的运行时确认与 +0xDC/+0xE0/+0xE4 的运行时读数（10）。

## 关键文件与契约

- [scenario §3–4](../../../../original/formats/scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely)、[难度读取路径](../../../../original/formats/scenario.md#difficulty-readers-p3-01)、[切片字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)。
- [放置与调度](../../../../original/formats/executable.md#mission-placement-scheduling-and-world-grid)、[任务结果](../../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)、[时基](../../../../original/formats/executable.md#simulation-time-base-p3-0106)。
- 已有本地脚本可参考：`local/research/p3-01/terminal/enemy-count.ts`（按调度规则统计 SCEN 3019 的敌方对象）。

## 写入范围

- `docs/original/formats/scenario.md`：Q-01、Q-04、Q-05、Q-06 的记录与 SCCT 事实。
- `docs/original/formats/executable.md`：排程、名称与实例化的代码事实。
- `docs/original/unknowns.md`：U-022、U-023（负责阶段不改）。
- `local/research/p3-02/spawn/**`：Ghidra 脚本、推导脚本、输出与私有项目副本（被忽略）。

## 验收标准

- [ ] Q-01、Q-04、Q-05、Q-07 达到门槛（已确认，代码）。
- [ ] Q-06 的代码部分已确认；运行时确认的观测点与判据交给 10。
- [ ] 完成证据给出所选任务两种僚机配置下的独立实例化清单（计数、来源、时刻），以及给 P3-03、P3-06、P3-07 的交接。
- [ ] U-022、U-023 已更新，负责阶段未改；无反编译代码或原版内容；`updated:`、链接与锚点有效。

## 验证方法

- 只读 Ghidra 的原生指令与调用链；推导脚本用 `src/original-data/` 解析器独立读取本地数据，输出只含计数与编号。
- 文档链接与锚点检查；`git diff` 审阅。

## 完成证据
