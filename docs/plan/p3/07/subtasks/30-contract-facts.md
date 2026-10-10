---
type: plan
status: active
phase: P3
task: "07"
subtask: "30"
updated: 2026-10-10
---

# 30 — 契约依据的两项原版事实

**契约来源：** [spec](../spec.md) 的 S-11、AC-15；P3-02 spec 的 [CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（导弹构造中的 `0x21a3c`）与 [CR-10](../../02/spec.md#cr-10-帧尾的驾驶舱显示步d-01)（驾驶舱显示步的视角集合，事实待写入 cockpit）；[08 的完成证据](./08-shared-contract-gate.md#完成证据)中 08 自行补取、尚未写入 `docs/original/` 的两项事实。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **`0x21a3c` 的原生语义：** 在私有的 Ghidra 项目副本上以 `-noanalysis -readOnly` 读取原生指令（可沿用 02 的私有副本，或在 `local/research/p3-07/contract-facts/` 中另建一份；不 `-overwrite`），核实 08 的读数，写入 [executable 的 W11](../../../../original/formats/executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code)（目前只写到速度取 min(对象 +0x78, 发射者速度)）：
  - 模式 0：置到达标志；速度与指令速度都为 min(对象 +0x78, 发射者移动块 +8)；+0x70 为 0 时取机型 +0xB8；再求速度比；
  - 其他模式：只写速度。
  同时核对 [移动块字段表](../../../../original/formats/executable.md#movement-stage-and-integration-p3-0601)中列出的 `0x21a3c` 读写与此一致；不一致时以原生指令为准更正，并在完成证据中写明。
- **CCKD 的仪表类型：** 只读本地 `SR.NOB` 的 CCKD 条目 10103、10101、10097 的组目录与 48 字节仪表记录的类型字段（+0），按条目、槽与布局号列出仪表类型的次序与个数，写入 [cockpit 的组目录](../../../../original/formats/cockpit.md#group-directory-confirmed-structure-on-all-three-entries)（或其下的新小节）：
  - 08 的读数：类型 6、7 只出现在布局 0、5 与 10097 的槽 0；外部视角的布局 1–4、8 只有类型 8；地图的布局 6 有类型 10、8；
  - 类型 6、7 分别是左、右显示屏的绘制例程（[T8](../../../../original/formats/executable.md#t8-left-display-no-target-reads-confirmed-code)、[T7](../../../../original/formats/executable.md#t7-right-target-display-confirmed-code)，已确认）；本项只链接，不重复；
  - 记录次序供 16 的帧尾显示步决定右显示屏清除与状态显示步的先后。
- **证据与置信度：** 每项事实标注 Confirmed / Likely / Unconfirmed 及依据（地址、条目号、计数）。完成证据写明 [CR-10](../../02/spec.md#cr-10-帧尾的驾驶舱显示步d-01) 中“高概率”的依据能否改为已确认，交协调者处理，不修改 spec。
- 私有脚本、Ghidra 输出与读数只存放在 `local/research/p3-07/contract-facts/`。

## 不包含

- 修改 P3-02 或本任务的 spec 与 goal（协调者负责）。
- `docs/original/unknowns.md`（不在写入范围）：若 U-029 等的状态需要改变，在完成证据中写明，交协调者。
- 仪表的绘制、位置与像素（P3-13）；CCKD 的图像与其他字段。
- 实现代码（13、14、16 使用这两项事实）。

## 关键文件与契约

- [executable 的 Combat rules](../../../../original/formats/executable.md#combat-rules-p3-07)（W11、T7、T8）与 [P3-06 的运动一节](../../../../original/formats/executable.md#movement-stage-and-integration-p3-0601)的移动块字段表。
- [cockpit](../../../../original/formats/cockpit.md) 的 CCKD 一节。
- 08 的完成证据；goal 的环境约定（Ghidra 只读副本，研究输出只在 `local/research/p3-07/<主题>/`）。
- 结构工具：`node tools/nob-list.ts`（只列目录）；计数脚本写在 `local/research/p3-07/contract-facts/`。

## 写入范围

- `docs/original/formats/executable.md`：W11 中 `0x21a3c` 的原生语义；必要时更正移动块字段表的写入者说明。
- `docs/original/formats/cockpit.md`：按条目、槽与布局的仪表类型及其次序与个数。
- `local/research/p3-07/contract-facts/**`：私有脚本、Ghidra 输出与读数（被忽略）。

## 验收标准

- [x] executable 的 W11 记录 `0x21a3c` 在模式 0 与其他模式下的写入，带置信度与地址证据，与移动块字段表一致。
- [x] cockpit 记录 10103、10101、10097 各槽的仪表类型、次序与个数（只含类型、计数、布局号与条目号），带置信度；类型 6、7 所在的布局与 CR-10 视角集合的对照结论写在完成证据中。
- [x] 所改文档的 `updated:`、链接与锚点正确；仓库中没有原版内容、反编译或反汇编输出；私有输出只在 `local/research/p3-07/contract-facts/`。
- [x] `pnpm check:compliance` 通过；`node tools/task-state.ts p3/07` 没有计划问题。

## 验证方法

- 完成证据写明原生指令的读取命令（`-noanalysis -readOnly`）与 CCKD 计数脚本的命令；计数由脚本从本地数据独立得出，再与 08 的读数对照。
- 文档的链接与元数据检查；git 审阅确认只改写入范围内的文件。

## 完成证据

2026-10-10，P3-07 并行执行的 worker 30（应用为该会话创建的分支 `p3-07-30-contract-facts`，基于认领提交 `a3633bd`，见 goal 执行记录）。只改两份格式文档与本文件，不涉及代码、浏览器、基准运行或 Computer Use。

- **读取方式：** 把 `local/ghidra/srangers` 复制为私有副本 `local/research/p3-07/contract-facts/ghidra/`，用 `local/research/p3-07/contract-facts/probe.sh <输出名> <命令…>` 运行 `ghidra-headless … -process SRANGERS.EXE -noanalysis -readOnly -postScript FactProbe.java`（由 02 的探针复制改名；内存中的改动不保存，不 `-overwrite`）。读取了 `0x21a3c`、其调用点所在的 `0x2b00c`、块构造 `0x21794`、仪表分派 `0x49b2c`、帧渲染 `0x3ee58` 与视角切换 `0x3f158` 的原生指令，以及 `0x21a3c`、`0x21794`、`0x49b2c`、`0x49848` 的原始调用扫描。输出只在 `local/research/p3-07/contract-facts/out/`（a1–a10）。
- **`0x21a3c`（已确认，原生指令；写入 [W11](../../../../original/formats/executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code)）：** 与 08 的读数一致，并补充：
  - 唯一调用者是 `0x2b00c` 的 `0x2b304`（原始 E8/E9 扫描；镜像中没有指向它的 4 字节值），条件是导弹记录的字节 +0x18 ≠ 0，紧接在 `0x21794` 之后；
  - 对象的记录指针（+0x1C）或发射者的移动块指针为空时不写任何字段；不检查发射者句柄的有效性；
  - 模式 0 的次序：+0x78 ← 1；v 为对象 +0x78 与发射者移动块 +0x08 中较小者（相等取发射者的值，比较无序取对象 +0x78，按位复制）；+0x08、+0x6C ← v；+0x70 为 ±0 时取记录 +0xB8；0 < +0x70（或比较无序）时速度比为 F(D(速度 ÷ +0x70))，否则为 0；
  - 其他模式只把速度设为发射者移动块 +0x08 本身（不取最小值）。08 写的“只写速度”正确，此处补上了所写的值；
  - 唯一路径上块必为模式 0（`0x2b00c` 交给 `0x21794` 的参数记录的模式字节为 0），`0x21794` 已把同一对象的记录 +0xB8 复制到 +0x70 并置 +0x78 = 1，所以实际改变的只有速度、指令速度与速度比。
- **移动块字段表（更正）：** 表中列出的 `0x21a3c` 读写与原生指令一致。+0x70 一行补上“只在模式 0 且值为 ±0 时”并链接 W11；+0x74 一行构造值的条件补上“或比较无序”：`0x2c3b0` 经 `0x21794` 构造（原始调用扫描），后者的模式 0 分支与 `0x21a3c` 用同样的 `FLDZ`/`FCOMP` 比较（原生指令核实）。
- **CCKD 仪表类型（已确认，数据；写入 [cockpit](../../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)）：** `node --preserve-symlinks --preserve-symlinks-main local/research/p3-07/contract-facts/instrument-order.ts` 经共享的 IMFAT 读取器只读组目录与每条记录的 +0，输出 `out/instrument-order.json`（只有条目号、槽、布局号、记录数与类型）。结果：
  - 10103、10101 的槽 0（布局 0）各 10 条，槽 1（布局 5）各 11 条，槽 2（布局 6）各 2 条（类型 10、8），槽 3–7（布局 1、2、3、4、8）各 1 条（类型 8）；10097 的槽 0（布局 0）10 条，次序与 10103 的槽 0 相同。没有槽含重复的类型。
  - 类型 6、7 各一条，只出现在布局 0、5。凡含二者的槽，类型 7 都在类型 6 之前（下标从 0 起：10103 槽 0 为 5、7，槽 1 为 6、8；10101 槽 0 为 5、6，槽 1 为 6、7；10097 同 10103 槽 0）。
  - 与 08 的读数对照：一致。一处措辞更正：布局 1–4 是方向键与小键盘中键的视角，外部视角只有布局 8；两者都只有类型 8。计数也与 P3-03/24 的按槽计数（排序后）和 P2-12/16 记录的 10103 槽 0 各记录类型一致。
- **分派与次序（已确认，原生指令）：** `0x3ee58` 只在视角模式 1、6、8、0xC–0x12 中每帧调用一次 `0x49b2c`。`0x49b2c` 按记录下标升序、步长 48 字节、直到组目录 +0x1C 的计数，对到期或强制重绘的记录调用类型匹配的第一个处理例程。`0x3f158` 跳转表给出的布局号与[自动视角](../../../../original/formats/executable.md#automatic-views-and-cameras-p3-0109)的记录一致：0xC→0、0xD→5、1→0、6→0（10097）、8→6、0xE/0xF/0x10/0x12→3/2/1/4、0x11→8、0x13→无。据此组目录 +0x18 的类型字段与 48 字节步长、+0x1C 的计数由“高概率”改为“已确认”。
- **CR-10 的对照结论（交协调者，未改 spec）：** 类型 6、7 的处理例程只在视角模式 0xC、1（布局 0）、6（10097 的布局 0）与 0xD（布局 5）中运行，与 [CR-10](../../02/spec.md#cr-10-帧尾的驾驶舱显示步d-01) 的视角集合完全一致。依据现为帧渲染的模式分派、`0x3f158` 的布局选择与 `0x49b2c` 的按类型分派（均为原生指令），加上三个条目的计数。因此 CR-10 中的“高概率”可改为“已确认”，“事实待写入 cockpit”可改为链接 cockpit 的新小节。另外，两者同帧到期时类型 7（T7 的目标清除）先于类型 6（D9 的状态显示）运行，与 CR-10 所列两步的先后一致，可供 16 的帧尾显示步采用。
- **未写入的观察（不在写入范围，交协调者）：** 在 `0x49b2c` 中，组目录 +0x0C 非零时跳过周期判定，并作为 EBX 传给处理例程（原生指令），这关系到 U-029 中 +0x0C 的含义。`docs/original/unknowns.md` 不在写入范围，U-029 的状态未改；类型 +0 与记录数已确认后，U-029 中仪表记录尚未确认的只剩矩形之后的字段。是否写入 +0x0C 的这一用途并更新 U-029，由协调者决定。
- **rubber-duck：** 一次审阅，两项：（1）完成证据尚未填写，现已填写；（2）移动块字段表 +0x74 一行的“> 0”与 W11 中“比较无序也做除法”不一致，已按原生指令更正该行（见上）。审阅确认 W11 的写入次序、最小值的相等与无序处理、±0 判定、其他模式与唯一路径，以及 cockpit 的表格（与重新运行的脚本输出一致）、分派与视角结论都与原生指令和数据一致，没有原版内容进入跟踪文件。
- **文档影响：** 事实只写入 `docs/original/formats/executable.md`（W11 与移动块字段表）与 `docs/original/formats/cockpit.md`（新小节与组目录两行的置信度），两份的 `updated:` 为 2026-10-10。工程文档、指南与 STATUS 不受影响；CR-10 的置信度与 U-029 的建议交协调者。
- **检查：** `node local/research/p3-02/pipeline/check-links.ts docs/original/formats/executable.md docs/original/formats/cockpit.md docs/plan/p3/07/subtasks/30-contract-facts.md`（本地链接与锚点）0 失败；`pnpm check:compliance` 通过（`passed: true`，此前运行了 `pnpm install --frozen-lockfile`，锁文件未变）；`node tools/task-state.ts p3/07` 没有计划问题；`git diff --check` 通过。人工审阅 diff：只有地址、偏移、常量、类型号、计数与行为描述，没有原版字节、文字、图像、反编译或反汇编输出；私有输出只在被忽略的 `local/research/p3-07/contract-facts/`。
