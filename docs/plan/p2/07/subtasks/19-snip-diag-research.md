---
type: plan
status: active
phase: P2
task: "07"
subtask: "19"
updated: 2026-10-08
---

# 19 — DIAG 结构研究与 SNIP 文档

**契约来源：** [spec](../spec.md) 的 S-12、S-05 的证据规则（[研究与入选门槛](../spec.md#研究与入选门槛)）、技术决定 13；AC-16 的 DIAG 部分、AC-20 的结构依据。2026-10-08 修订加入，见 [goal 执行记录](../goal.md#执行记录)。
**依赖：** 09。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。
**执行方式：** 自动

## 工作范围

- **DIAG 10489 的结构（只读）：** 在本地读取条目字节与重定位，并在内存中反汇编现有 Ghidra 项目里读取它的函数（`0x4d0e0`、`0x4d308`、`0x4d44c`、`0x4f050`、`0x4f108`），不保存项目、不用 `-overwrite` 重新导入。确定头部各字段、文字指针、评级、启动消息列表与下行格式的位置和用途，以及 LO 的 DIAG 10491 是否同构。
- **SNIP 10487：** 在已确认的结构旁记录用户观察（标为用户观察）与本修订的转换方式；资源缺口一条记录当前状态。
- **文档：** 结构、偏移、计数与地址写入 [hud](../../../../original/formats/hud.md)（英文，不含文字内容与反编译代码），并更新 [U-030](../../../../original/unknowns.md#数据与格式)。
- **方法：** 脚本与输出放在被忽略的 `local/research/p2-07/snip-diag/`。

## 不包含

- 转换实现与生产常量：归 [20](./20-snip-diag-conversion.md)。
- 本地生产路径核对：归 [21](./21-snip-diag-local-check.md)。

## 写入范围

- `docs/original/formats/hud.md`
- `docs/original/unknowns.md`
- `local/research/p2-07/snip-diag/`（被忽略，不提交）

## 验收标准

- [x] hud 记录 DIAG 10489 的头部字段、文字指针、评级、启动消息列表、下行格式所在的 EXE 地址与各函数的用途，并给出置信度；10491 的同构结论有证据。
- [x] SNIP 10487 一节记录用户观察（标为用户观察，不提升置信度）与转换方式；U-030 同步。
- [x] 文档没有原版文字、字节、反编译代码或像素；Ghidra 项目只读使用。

## 验证方法

- 文档审阅、链接与元数据检查；nob-check 在 20 中按同一结构校验两个 DIAG 条目。

## 完成证据

- **结构（已确认）：** DIAG 10489 为 489 字节、31 个重定位；0x98 字节头部依次为上下两行各两个 `u32` 时序、4 个状态格式指针、5 个 {指针, `i32` 上限} 评级、15 个子系统名称指针、3 个状态词指针、启动消息列表指针与数量（3），其后为以 NUL 结尾的文字；31 个重定位恰为 4 + 5 + 15 + 3 个文字指针、列表指针与 3 个列表项。DIAG 10491 为 352 字节、27 个重定位，结构相同，列表指针与数量为 0。
- **用途（已确认，EXE）：** `0x4d308` 依次循环 4 个格式，各配一个值，第 2 个配评级文字；评级按 19 个子系统状态之和从最后一项向前查找。`0x4d44c` 在启动消息数非零且随机字节小于 0x55 时轮流显示启动消息，否则循环 15 个子系统，用 EXE `0x171e58` 的格式（LE 对象 4，6 字节含 NUL）组合名称与状态词。`0x4f050` 保存时序并把 `\n` 换为行分隔，`0x4f108` 按间隔逐字打出、打完后停留。
- **方法：** 本地 `diag-dump.ts` 输出结构；只读运行 `ghidra-headless … -readOnly` 与 `local/research/p2-07/ghidra/` 中的 `DecompileAt.java`、`ListRange.java`，输出在 `local/research/p2-07/snip-diag/`，项目未改动。
- **文档：** [hud 的 DIAG 10489](../../../../original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision) 新节；[SNIP 10487](../../../../original/formats/hud.md#snip-10487-confirmed-structure-p2-1227) 加入用户观察与转换说明；资源缺口一条加状态；“Outside the reference screens”一段改为指向两节；U-030 的 DIAG 部分改为已确认，SNIP 缺口改为已转换、待 P2-12 复核。文档只含偏移、计数与地址。
- **rubber-duck：** 与 20、21 一起按整个修订的 diff 审查，处理结果见 [20](./20-snip-diag-conversion.md#完成证据)。
