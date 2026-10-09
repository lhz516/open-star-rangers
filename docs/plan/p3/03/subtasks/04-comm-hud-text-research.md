---
type: plan
status: active
phase: P3
task: "03"
subtask: "04"
updated: 2026-10-09
---

# 04 — 通讯菜单、HUD 表、程序文字与 RENS 头部的结构研究

**契约来源：** [spec](../spec.md) 的 S-01、S-06、S-07、S-08、S-09（RENS 头部）、AC-01；[字段处理规则](../spec.md#字段处理规则)、[研究门槛与阻塞](../spec.md#研究门槛与阻塞)、[规范 payload](../spec.md#规范-payload) 的 `comm-menus`、`base-repair-items`、`flight-messages`、`view-labels`、`scene-settings` 行。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用只读 Ghidra 与本地数据研究以下来源：
  - **COMM.NOB TABL 2003、2005、2013（闭包 #24）：** 由 `0x2cbb4` 按目标种类选择，`0x2c850`、`0x2c9d0` 读取；TABL 2007、2009 由命令处理程序 `0x27b44` 读取。确定每张表的结构：项目数、项目文字的存储与终止规则、其他字段的存储类型，以及指针目标。
  - **TABL 10165（闭包 #31）：** 确定 +0x6C 子系统选择值的存储类型与值域（已知 0–9 为单个子系统，33、34 为两组），读取者为 `0x39664`、`0x39cb4`、`0x398ec`。还要确定定位 11 条记录所需的结构，其余字段不研究。
  - **TABL 10399 第 8 项（闭包 #25）：** 字串指针的目标与终止规则，读取者为 `0x45de0`。
  - **7 条 EXE 字串（闭包 #30）：** `0x17106c`、`0x171094`、`0x170db8`、`0x170dc8`、`0x170ddc`、`0x170df8`、`0x170e14`。确定各自的 LE 对象与对象内偏移、含 NUL 的长度、字符范围，以及是否含格式说明符（`0x4e9e8` 如何显示它们）。
  - **RENS 10751 头部 +0x00–+0x57（闭包 #17）：** 每个字段的存储类型，已知读取者为 `0x3cfbb`、`0x3d0b0`、`0x3df90`、`0x3e0cc`、`0x48d64`、`0x48dbc`、`0x48e14`。还要确认 +0x58/+0x5C 是记录数组（已交付）的起点，以及没有被读取的头部位置。
- 对每个字段给出存储类型与证据，并记录只在基准中为零的位置与观测值（项目数、文字字节数）。
- 事实分别写入：计划新增的 `docs/original/formats/comm.md`（COMM 菜单，英文）；[hud](../../../../original/formats/hud.md) 的 TABL 10165 与 10399 两行；[executable](../../../../original/formats/executable.md) 的 EXE 字串与 RENS 头部两段。研究脚本放在 `local/research/p3-03/comm-hud-text/`。
- 若某个非零字段无法确定存储类型，按研究门槛记为 blocked。

## 不包含

- 菜单状态机、显示时机与灯光等规则或表现语义：归 P3-10、P3-11、P3-12、P3-13。
- 头像相关的 COMM TABL 2001、2011（G-03），以及 TABL 10165 的图像与文字（G-05）。
- 解析器与 payload：归 08、09、12、13。
- 文档地图与 U 项：由 22 完成；本项在完成证据中列出 U-001、U-027、U-028、U-030 的线索。

## 关键文件与契约

- 闭包决定表 [#17、#24、#25、#30、#31](../../01/subtasks/10-data-closure.md#决定表)；[hud §2](../../../../original/formats/hud.md#2-tabl-entries-in-srnob-contents-likely)；[executable 的数据闭包一节](../../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)。
- [production-executable.ts](../../../../../src/original-data/conversion/production-executable.ts)（只读）：地址到 LE 对象与偏移的换算。
- 计划新增：`docs/original/formats/comm.md`。

## 写入范围

- `docs/original/formats/comm.md`：COMM 菜单表的结构（新建）。
- `docs/original/formats/hud.md`：TABL 10165 的选择值与 TABL 10399 第 8 项。
- `docs/original/formats/executable.md`：EXE 字串与 RENS 头部。
- `local/research/p3-03/comm-hud-text/**`：研究脚本、Ghidra 输出与私有副本（被忽略）。

## 验收标准

- [ ] AC-01（本项的来源）：每个转换位置都有存储类型、证据与置信度；文字规则（终止、字符范围、格式说明符）、引用目标与只在基准中为零的位置都已记录。
- [ ] TABL 10165 选择值的值域、7 条 EXE 字串的区域（对象、偏移与含 NUL 的长度）已记录，可供 12 建立映射。
- [ ] 观测值已记录，可供 06、08、09 推导限值。
- [ ] 文档只含结构、计数、置信度、地址与证据路径，没有原版文字或数值；front matter 与链接有效。

## 验证方法

- 只读 Ghidra（私有副本）与本地数据统计，产物只在 `local/`。
- 文档 diff 审阅与链接检查。不涉及浏览器。

## 完成证据
