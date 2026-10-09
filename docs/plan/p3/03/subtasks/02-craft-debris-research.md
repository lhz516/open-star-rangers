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

- [x] AC-01（TABL 4003、CINF、DEBRIS 部分）：每个转换位置都有存储类型、证据与置信度；引用目标、载入变换的性质与处理，以及只在基准中为零的位置都已记录。
- [x] 载入变换已逐项区分：结构性的复现，算术派生的不执行，被载入代码覆盖的不转换。
- [x] 观测值已记录，可供 06、08 推导限值。
- [x] 文档只含结构、计数、置信度与证据路径，没有原版数值、文字或反编译代码；front matter 与链接有效。

## 验证方法

- 只读 Ghidra（私有副本）与本地数据统计，产物只在 `local/`。
- 文档 diff 审阅与链接检查。不涉及浏览器。

## 完成证据

2026-10-09，worker `exec-p3-03-02`。

- **方法：** 只读 Ghidra，使用 `local/research/p3-03/craft/ghidra` 中的项目私有副本，`-noanalysis -readOnly`；在内存中建立的函数与调用约定都不保存。`CraftFlow.java` 先按 rel32 调用目标与数据引用在内存中建立 998 个函数，再反编译 2,736 个函数（失败 5 个），导出每次读写的地址表达式、宽度与 p-code 用途（`out/flow12b`），由 `flowq.ts`、`q-roots.ts`、`q-aux.ts`、`q-mount.ts` 按指针来源归类。关键函数另有反编译与原生指令输出 `out/p1`–`out/p18`。数据统计脚本为 `walk-cinf.ts`、`walk-debris.ts`、`tabl4003.ts`、`survey.ts`、`survey2.ts`、`zeros.ts`、`checks.ts`、`maxima.ts`、`floats.ts` 与 `order.ts`，输出只含结构、分类与计数。全部产物在被忽略的 `local/research/p3-03/craft/`。未运行原版或 DOSBox-X。
- **AC-01：** 结论写入 [craft.md](../../../../original/formats/craft.md)。
  - **结构（已确认）：** 对全部 24 个 CINF 与 DEBRIS TABL 4501 做图遍历，每个字节恰好覆盖一次；全部重定位都归入所列的指针字段，每个指针目标都是预期结构的起点。TABL 4003 为 18 × 3 对 {u32 条目 ID, f32}。
  - **类型：** 每个转换位置都有存储类型、证据与置信度。多数由原生访问确认；只有 CINF 头部 +0x1C、炮 +0x18 与 +0x20、机型 +0x08、+0xBC、+0xC0、+0xC8 依据 24 个 CINF 的取值模式，为高概率。符号无法由用途判定的 32 位整数记为 int32：只在 0–2³¹−1 内转换，最高位为 1 时为 `unsupported-payload`。CINF 4037 与 DEBRIS 4501 中没有类型未定的非零位置，未触发研究门槛 1。
  - **引用：** TABL 4003 的 54 格都是 `CRAFT.NOB` 的 CINF 条目 ID，第 1 行第 0 对为 4037。CINF 的块内指针包括名称文字、导弹→弹体、mount→炮或导弹记录（由 mount +0x10 选择）、mount 之间的两条链、三张 mount 列表、box 与 pair 数组；DEBRIS 有 20 组记录指针与每条记录的嵌套 box。两者都不含条目 ID。
  - **零值、文字与运行时写入：** 只在基准中为零而类型未定的位置为炮 +0x29–+0x2B、导弹 +0x19–+0x1B 与 +0x25–+0x27、mount +0x11–+0x13，记为 zero only。CINF 4037 的零字节分布与全部 24 个相同。弹体记录只有 6 个位置非零，按机型布局转换，其余指针与计数位置必须为零。文字以 NUL 结束、各被一个指针引用，长 3–26 字节，全部为可打印 ASCII。载入后唯一的运行时写入是作弊表第 19 行的 `0x28110` 把玩家机型 +0xA4 置 0。
- **载入变换逐项区分：**
  - 结构性，由位置表示：炮与导弹记录的首字回写为数组序号。
  - 算术派生，不在导入时执行，由消费者按格式文档实现：炮 mount 的 +0x08 加上 RENS 10751 对应记录的长度（机型记录 0、1 先乘 `f64` 常量）；DEBRIS +0x00–+0x08 原地取反；DEBRIS 嵌套 box 的两个角点各加一个 `f64` 常量，每次加两遍。
  - 被载入代码覆盖，不转换：炮 +0x0C、+0x10；导弹 +0x08、+0x0C、+0x10、+0x2C（+0x28 的反余弦）、+0x50；机型 +0x14，以及 box 数不为零时的 +0x10、+0x18–+0x2C；DEBRIS +0x0C–+0x34 与 +0x5C。这些存储值在基准中都为零（机型的条件覆盖位置恰在被覆盖的记录中为零）。
  - 变换用到 5 个 EXE 数据对象常量，文档只给地址与类型；按闭包第 32 行属代码规则，不是导入数据。
- **观测值（供 06、08；CINF 4037 / 全部 24 个的最大值）：** 块 18,619 / 19,491 字节，重定位 268 / 298；炮 10、导弹 9、机型 20、弹体 9（24 个相同）；每机型 mount 16 / 18，合计 115 / 130；每机型 box 32 / 32，合计 114；mount 列表 0、1、2 每机型 3、2、1 / 3、5、1；每张 pair 表 3 对；字符串 59 条，最长：炮 18、导弹 15、机型 +0x00 26、+0x04 7 字节。DEBRIS：8,200 字节、85 个重定位、67 条记录，每种类 2–8 条（种类 13、14 没有），每条记录 1 个 box。浮点位置中没有 −0、NaN 与无穷大；唯一的非规格化值在导弹 +0x40（每个 CINF 一条）。TABL 4003：54 格引用 21 个不同的 CINF。
- **文档检查：** craft.md 只含结构、计数、偏移、地址、置信度与证据路径；EXE 常量只给地址与类型，没有原版数值、文字或反编译代码。front matter 为 `type: format`、`status: draft`、`phase: P3`、`updated: 2026-10-09`。`node local/research/p3-03/craft/check-links.ts docs/original/formats/craft.md docs/plan/p3/03/subtasks/02-craft-debris-research.md`（复制自 P3-01 的本地链接与锚点检查）：0 失败。`node tools/compliance/cli.ts original`：index、worktree、untracked 三个范围完成且无发现；build 范围因本 worktree 没有 `dist/` 报 `ENOENT`，本行是纯文档改动，未构建。
- **Rubber-duck：** 审阅一次。采纳两项：只靠相等测试、加减或低位乘法使用的整数字段不能确定符号，改为 int32 并写明转换范围；机型 +0x00 没有读取者，改为“指针已确认、文字高概率”。另一项交协调者：已批准 spec 的 `debris-parameters` 行与 executable 的 DEBRIS 一段都写作“+0x0C 为归一化并取反的副本”，原生指令表明 +0x0C 是未取反的归一化副本，取反作用于 +0x00–+0x08。处理方式不变：+0x0C 不转换，算术由 P3-07 按格式文档实现，+0x00–+0x08 的取反按字段处理规则 5 同样由消费者实现。没有新增 Asset、kind、schema 或闭包外依赖，未触发研究门槛。
- **文档影响（交 22 或协调者）：** 本行只新建 craft.md。需要同步：executable 中“Data loaded by the loop”的 DEBRIS 一段（更正取反对象并链接 craft.md）与“Weapon records”一节（载入时除首字外还改写派生字段）；imfat §5 的 CINF 行与 §7 引用说明链接 craft.md；文档地图加入 craft.md；spec 规范 payload 中 `debris-parameters` 行的措辞。
- **U 项线索（交 22，本行未改 unknowns）：**
  - **U-001：** CRAFT.NOB 与 DEBRIS.NOB 的结构已确认，见 craft.md；字段含义多数未确认。
  - **U-008：** 机型 +0xAC、+0xB0、+0xB4 由 `0x21dd0` 与控制输入相乘（转向率，高概率）；+0xB8 由 `0x3060c`、`0x30e0c`、`0x2f314` 读取，并成为导弹 +0x08 的来源（导弹射程为寿命 × 常量 × 此值，像速度，高概率）；炮 +0x08、+0x24 同理（速度与寿命，高概率）。
  - **U-026：** 机型 +0xA4 由 Warp 的 `0x2be00`、`0x2bf08` 读取，作弊 `0x28110` 将其置 0；+0x58、+0x64–+0x70、+0x78–+0x84（`0x3060c`、`0x30b20`、`0x30bc0`：+0x58 减去两张等级表中选中的项）、+0x88 与 +0xB8（`0x3060c`）、+0x94/+0x98 的 pair 表（`0x30d2c` 分段系数）是能量相关的候选，均未确认。
  - **U-027：** DEBRIS 记录 +0x00 向量（载入时取反，`0x25124` 用作三个方向向量的权重）；碰撞形状与机型记录共用 68 字节布局；+0x5C 由嵌套 box 的尺寸算出，决定 `0x25124` 给碎片对象 +0xD0 的两种初值之一（`0x28450` 把它当作被击中时扣减的耐久值）与难度路径 6；嵌套 box 在载入时向外扩；`0x249dc` 对种类 1、2 的部件序号减 3，且不检查越界。
