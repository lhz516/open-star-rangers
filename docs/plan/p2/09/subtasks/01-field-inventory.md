---
type: plan
status: active
phase: P2
task: "09"
subtask: "01"
updated: 2026-10-05
---

# 01 — 所选任务的字段清单研究

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；[源字段处理](../spec.md#源字段处理)与[研究门槛与阻塞](../spec.md#研究门槛与阻塞)。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地只读统计：** 在 `local/research/p2-09/` 编写脚本（不提交），经 P2-03 的读取链读取基准镜像的 `MAIN/SCENARIO.NOB` 与 `MAIN/SR.NOB`。统计以下记录中每个字段位置出现非默认值的次数：
  - 所选 SCEN（SCCT group 0 / slot 1）的头部与段 0 至段 6；
  - 段 1 的记录、段 5 的模板与成员数组（别名记录只计一次，并记录别名关系的计数）；
  - SCCT 的僚机记录；
  - 实际引用的 M2ID 槽位。

  132 字节记录的每个字节区域都要归入源字段处理表中的一行，或证明为零。
- **逐项结论：** 对源字段处理表中的每一行给出结论：
  - “非默认即不支持”的位置在所选任务中是否全部为默认值；
  - 段 6 的列表与小结构对载入后的空间数据有何影响（只读静态分析加载代码，例如 [executable §4](../../../../original/formats/executable.md#4-code-landmarks) 中的重新缩放与构建函数）；
  - 段 5 布局指针（+4）是否影响成员的规范空间数据；
  - 头部 0x00/0x04 是否影响本任务的载入数据；
  - 候选名称的最大长度、字符范围（是否全为可打印 ASCII）与每条记录的候选数；
  - 段 0、段 1、段 5 的元素数与每组成员数，供 05 的限值核对；
  - SCCT 条目 ID（若 scenario 尚未记录），供 08 的映射表使用。
- **文档：** 把结构、计数、置信度与证据路径写入 [scenario](../../../../original/formats/scenario.md)（必要时 [executable](../../../../original/formats/executable.md)），更新 [U-022/U-023](../../../../original/unknowns.md#数据与格式)。不写原版数值表、名称、文字或反汇编。
- **研究门槛：** 若发现所选任务使用了“非默认即不支持”的位置，或段 6/编组布局影响规范空间数据，或名称不全是可打印 ASCII，按 spec 的研究门槛处理：本子任务在 goal 中标为 blocked，记录受影响的验收项与恢复条件（spec 修订经审阅并由用户重新批准）。

## 不包含

- 地图框架与坐标轴约定（02）。
- 任何产品代码、测试或工具；P3 的规则研究（生成、AI、默认值语义、Warp 公式）。
- 用合成数据替代本地研究。

## 关键文件与契约

- **只读使用：** [open-verified-source.ts](../../../../../src/original-data/source/open-verified-source.ts) 等 P2-03 读取链（经 Node 文件端口，参照 [source-check.ts](../../../../../tools/source-check.ts)）；Ghidra 项目 `local/ghidra/srangers`，只做 `-noanalysis -readOnly` 分析（[基准环境指南](../../../../guides/baseline-environment.md#静态分析)）。
- **修改：** [scenario.md](../../../../original/formats/scenario.md)、[unknowns.md](../../../../original/unknowns.md)，必要时 [executable.md](../../../../original/formats/executable.md)。
- **本地新增：** `local/research/p2-09/` 下的脚本与输出（被忽略，不提交）。

## 验收标准

- [ ] AC-01：所选 SCEN 的每段、每个记录位置、SCCT 僚机记录与引用的 M2ID 槽位，都有非默认值计数与处理结论；段 6、段 5 布局与头部 0x00/0x04 有带置信度的结论；名称的最大长度与字符范围已记录；U-022/U-023 已更新；没有处理结论不明的位置。
- [ ] 若触发研究门槛：spec 修订已完成审阅并由用户重新批准；否则在证据中逐条说明未触发的依据。
- [ ] 文档只含结构、计数、置信度与证据路径；文档链接与元数据检查通过；`pnpm --silent check:original` 通过；`git status` 显示 `local/` 下的文件未被跟踪。

## 验证方法

- 本地运行 `node local/research/p2-09/<脚本>.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，文件名执行时确定，记录在证据中；Ghidra 命令与导出文件同样只记路径。
- 由 rubber-duck 复核结论与原版文档的置信度标注是否一致，以及是否复述了不应写入仓库的内容。
- 不适用 browser-testing；不做视觉或听觉对照。

## 完成证据
