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

- [x] AC-01：所选 SCEN 的每段、每个记录位置、SCCT 僚机记录与引用的 M2ID 槽位，都有非默认值计数与处理结论；段 6、段 5 布局与头部 0x00/0x04 有带置信度的结论；名称的最大长度与字符范围已记录；U-022/U-023 已更新；没有处理结论不明的位置。
- [x] 若触发研究门槛：spec 修订已完成审阅并由用户重新批准；否则在证据中逐条说明未触发的依据。
- [x] 文档只含结构、计数、置信度与证据路径；文档链接与元数据检查通过；`pnpm --silent check:original` 通过；`git status` 显示 `local/` 下的文件未被跟踪。

## 验证方法

- 本地运行 `node local/research/p2-09/<脚本>.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，文件名执行时确定，记录在证据中；Ghidra 命令与导出文件同样只记路径。
- 由 rubber-duck 复核结论与原版文档的置信度标注是否一致，以及是否复述了不应写入仓库的内容。
- 不适用 browser-testing；不做视觉或听觉对照。

## 完成证据

- **本地研究（2026-10-05）：** 以下脚本均在 `local/research/p2-09/`，经 `openVerifiedSource` 读取 `local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`：
  - `node local/research/p2-09/field-inventory.ts …` 输出 `field-inventory.json`：头部、7 个段、9 条唯一记录与 5 条僚机记录的逐字计数，名称范围，M2ID 槽位；
  - `pointer-targets.ts`：指针目标分类；
  - `member-backrefs.ts`：全任务与所选任务的成员回指和布局统计；
  - `section2-trigger.ts`、`section2-coverage.ts`：段 2 事件触发头部与逐字节划分，无缝隙、无重叠。

  Ghidra 只读探针 `local/research/p2-09/ghidra/Probe.java`（`-noanalysis -readOnly`）输出 `probe-1.txt`–`probe-5.txt`，覆盖引用、常量、段 6 原生循环与构建器调用。结果写入：
  - [scenario](../../../../original/formats/scenario.md)：头部、段表、记录字段、段 5 字段表与[切片字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)；
  - [executable](../../../../original/formats/executable.md#mission-placement-scheduling-and-world-grid)：放置、调度与世界网格；
  - [unknowns](../../../../original/unknowns.md#数据与格式) 的 U-022/U-023。

  名称为可打印 ASCII，段 0 最长 11 字节，记录候选最长 6 字节，僚机名称最长 8 字节。SCCT 条目 ID 为 3123。
- **研究门槛：** 已触发。所选任务使用了段 3、段 5 布局、段 6 与记录 +0x3C、+0x44、+0x48、+0x54、+0x58；头部 0x00/0x04 影响载入数据。spec、goal 与子任务 02、04、05、07、08、09、11、12 已据此合并修订一次（S-02 为结论 2，S-12 不适用），见 goal [执行记录](../goal.md#执行记录)与 spec [审批](../spec.md#审批)。修订依据用户在本次 execute-goal 调用中的授权生效。
- **检查：**
  - 会话内的相对链接与锚点检查覆盖全部改动文档，结果为 `all links ok`；
  - `git diff --check` 通过；
  - 先 `pnpm build` 生成 `dist/`，再运行 `pnpm --silent check:original`，结果为 `passed: true`；
  - `node tools/task-state.ts p2/09` 给出 `execute-goal`；
  - `local/` 为被忽略的符号链接，`git status` 中没有 `local/` 路径。
- **rubber-duck：** 审阅原版文档、spec 修订与计划对齐，提出 3 项阻塞与 7 项其他意见。处理如下：
  - **已采纳：**
    - 段 2 逐字节划分已用 `section2-coverage.ts` 证明；
    - 头部只确认低 16 位；
    - +0x3C 的成员含义降为高概率；
    - 事件触发改为“范围包含当前比值”；
    - 段 0 名称备用池转为 `namePool`；
    - 只经段 5 到达的记录与僚机空间字段失败关闭；
    - Core 增加名单机型表引用核对，玩家条件改为“没有僚机选项解析为玩家”；
    - 段 6 表后计数字越界为 `invalid-payload`；
    - AC-02 的数值条件改为可检验的表述；
    - spec 明确以 02 的记录为准。
  - **未完全采纳：** 意见要求等用户逐条重新批准，以及在 02 完成前不写入结论 2。依据是用户在本次调用中的明确授权；依赖地图框架的实现子任务（04、05、09）都依赖 02，02 记录不符时按研究门槛处理。
- **文档影响：**
  - 原版事实只写入 `docs/original/`；
  - 工程约定、工具指南与 STATUS 不受本研究影响：没有代码、命令或阶段摘要变化。
