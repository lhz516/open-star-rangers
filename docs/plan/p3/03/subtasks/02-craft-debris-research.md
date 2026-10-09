---
type: plan
status: active
phase: P3
task: "03"
subtask: "02"
updated: 2026-10-09
---

# 02 — 机型、武器与碎片参数的结构研究

**契约来源：** [spec](../spec.md) 的 S-01、S-03、S-04、AC-01；[字段处理规则](../spec.md#字段处理规则)、[研究门槛与阻塞](../spec.md#研究门槛与阻塞)、[规范 payload](../spec.md#规范-payload) 的 `craft-info` 与 `debris-parameters` 行。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用只读 Ghidra 与本地数据研究 `CRAFT.NOB` 与 `DEBRIS.NOB`（闭包 #15、#16、#18）：
  - **TABL 4003：** 18 行，每行 3 对 {条目 ID, 倍率}，确定两者的存储类型；确认 `0x2cf38` 对槽与组的限幅规则，以及倍率的读取者 `0x2cf0c`→`0x30150`。
  - **CINF：** 研究 CINF 4037 的头部，以及它如何定位 10 条炮、9 条导弹、20 条机型与弹体记录（指针与数量）。确定各记录的大小与每个字段的存储类型。指针字段在 CINF 内引用何处、是否引用其他条目。还要说明 `0x2cf38` 把首字改写为序号的规则，以及 `0x2d2d8`、`0x2d400` 等读取者的访问。已知线索：机型记录 236 字节（[分配路径](../../../../original/formats/executable.md#two-allocator-paths-native-inputs-and-profile-comparison)），+0x54、+0x9C 用于修理计时，+0xA4 用于 Warp 间隔。
  - **DEBRIS TABL 4501：** 20 组 {指针, 数量} 与 96 字节记录的每个字段。确定 `0x246a0` 在载入时做的变换的性质：写入 +0x0C 的归一化取反副本，以及对嵌套浮点数组（指针 +0x38、数量 +0x3C）的调整，二者分别是结构性的还是算术派生；+0x5C 的类型。读取者有 `0x249dc`、`0x25124`。
- 对每个字段给出存储类型与证据：原生代码访问为已确认，全部 24 个 CINF 一致为高概率。记录只在基准中为零的位置，以及载入变换的处理（复现、不执行或不转换）。
- 统计观测值：各记录数组的长度、嵌套数组长度与条目大小（CINF 4037 与全部 CINF）。
- 事实写入计划新增的 `docs/original/formats/craft.md`（英文），标题为 CRAFT.NOB 与 DEBRIS.NOB 的参数表；研究脚本与输出放在 `local/research/p3-03/craft/`。
- 若某个非零字段无法确定存储类型，按研究门槛记为 blocked。

## 不包含

- 字段的规则语义（射速、伤害、转向率等）：归 P3-06、P3-07、P3-09、P3-10。
- 解析器与 payload：归 08、10。
- 从 [executable](../../../../original/formats/executable.md) 与 [imfat](../../../../original/formats/imfat.md) 链接到新文档、文档地图与 U 项：由 22 完成；本项在完成证据中列出 U-001、U-008、U-026、U-027 的线索。

## 关键文件与契约

- [武器记录](../../../../original/formats/executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)、[碎片参数](../../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)、[难度读取路径](../../../../original/formats/scenario.md#difficulty-readers-p3-01) 1 与 6。
- 计划新增：`docs/original/formats/craft.md`。

## 写入范围

- `docs/original/formats/craft.md`：TABL 4003、CINF 与 DEBRIS TABL 4501 的结构、类型与观测值（新建）。
- `local/research/p3-03/craft/**`：研究脚本、Ghidra 输出与私有副本（被忽略）。

## 验收标准

- [ ] AC-01（TABL 4003、CINF、DEBRIS 部分）：每个转换位置都有存储类型、证据与置信度；引用目标、载入变换的性质与处理，以及只在基准中为零的位置都已记录。
- [ ] 载入变换已逐项区分：结构性的复现，算术派生的不执行，被载入代码覆盖的不转换。
- [ ] 观测值已记录，可供 06、08 推导限值。
- [ ] 文档只含结构、计数、置信度与证据路径，没有原版数值、文字或反编译代码；front matter 与链接有效。

## 验证方法

- 只读 Ghidra（私有副本）与本地数据统计，产物只在 `local/`。
- 文档 diff 审阅与链接检查。不涉及浏览器。

## 完成证据
