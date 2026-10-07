---
type: plan
status: active
phase: P2
task: "11"
subtask: "15"
updated: 2026-10-06
---

# 15 — 效果贴图坐标研究

**契约来源：** [spec](../spec.md) 的 S-10（研究）、AC-17，以及[效果贴图坐标](../spec.md#效果贴图坐标)的研究范围与技术决定 9。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 有界的只读 EXE 研究（Ghidra headless，`-readOnly`，不重新导入）：
  - `0x82ae8` 的参数含义；
  - 它在导弹旋转映射（`0x44cd8`）与带贴图碎片（`0x3eab4`）处的调用，以及调用的全部输入：包围盒、`0x1718ea` 处的双精度数、立即数与旋转步长；
  - 映射应用到顶点的代码：贴图坐标的计算公式与计算时机（创建时还是每帧）。
- 结论写入 [executable](../../../../original/formats/executable.md) 的效果表现来源一节：只记地址、结构、公式与置信度，不提交反编译输出；更新 [U-027](../../../../original/unknowns.md)。
- 判定：
  - 结论达到高概率或已确认时，本子任务通过，16 可以开始；
  - 结论依赖运行时状态时（例如随相机变化），记录结论，并说明查看器只显示静止姿态下的坐标；
  - 达不到高概率时，本子任务为 blocked，在 goal 执行记录写明证据与恢复条件，16 同时为 blocked，由用户决定后续安排。
- Ghidra 脚本与输出只放在被忽略的 `local/research/p2-11/`。

## 不包含

- payload、转换器与查看器的修改（16）。
- 光照、明暗级与模式字（P3，U-028）。

## 关键文件与契约

- 修改 [executable.md](../../../../original/formats/executable.md)、[unknowns.md](../../../../original/unknowns.md)。
- 工具：`~/Tools/bin/ghidra-headless local/ghidra srangers -process SRANGERS.EXE -noanalysis -readOnly`，用法见[基准环境指南](../../../../guides/baseline-environment.md)与[工具指南](../../../../guides/tools.md)。

## 验收标准

- [x] AC-17：executable 记录参数含义、坐标公式、计算时机、导弹旋转映射与带贴图碎片平面映射的全部输入，附置信度与证据（地址、结构、计数）；U-027 已更新。
- [x] 结论达到高概率或已确认；否则本子任务为 blocked，执行记录写明恢复条件。
- [x] 文档中没有原版内容或反编译输出；链接与元数据检查通过。

## 验证方法

- 只读 Ghidra 分析；脚本与输出留在 `local/`。
- 文档审阅、链接与元数据检查。只改文档时不需要 simplify；按 execute-goal 做 rubber-duck 审阅结论与证据。

## 完成证据

- **只读研究（2026-10-06）：**
  - 工具：`~/Tools/bin/ghidra-headless local/ghidra srangers -process SRANGERS.EXE -noanalysis -readOnly`，共 30 次运行，没有重新导入，内存中的反汇编在结束时丢弃。
  - 脚本、原生指令导出、局部反编译与只输出计数的核对脚本都在被忽略的 `local/research/p2-11/effect-mapping/`。
- **AC-17（已确认，代码）：** 结论写入 [executable 的 Effect texture mappings](../../../../original/formats/executable.md#effect-texture-mappings-p2-1115-research)：
  - `0x82ae8` 的参数含义（类型、参照帧、原点、方向、上方向、贴图原点与缩放）与对象偏移；
  - 平面、柱面与球面的坐标公式；
  - 计算时机：应用时一次算出，类型 0–2 之后不重算，`0x82c48` 的 4 个调用点都已核对；
  - 导弹 32 个旋转映射的全部输入：每个参数的指令地址与操作数形式，以及旋转缩放与步长；
  - 带贴图碎片映射的全部输入：包围盒的最小与最大角、`0x1718ea` 的双精度数与各立即数。
- **随研究更正与新增的事实：**
  - 碎片映射是柱面映射，不是此前所记的平面映射；
  - 原版只应用第 0 个旋转映射，每枚导弹的元素副本保留其坐标（wrap 表在整个映像中只有 3 处 32 位引用）；
  - `0x3e8cb` 处的第三个 wrap 不可达；
  - 碎片面表按（顶点，法线）对读取，各是一个 6 角面，executable 的面表结论已更正。
- **未确认（单独标注，不影响坐标结论）：** 跨 u 接缝的面如何插值。计数：导弹元素 3 个侧面中 1 个、另一模板 6 个面中 2 个，以及碎片唯一的面；碎片 6 个顶点中有 4 个在轴上。对 09、16 与 P2-06 实现的影响已写入 goal [执行记录](../goal.md#执行记录)。
- **U-027：** 已追加效果贴图坐标的结论、面表更正与未确认项。
- **合规与文档检查：**
  - `node tools/compliance/cli.ts original`：worktree 与 index 各 744 个文件扫描完成，没有原版内容。build 范围因本 worktree 没有 `dist/` 报 ENOENT；本子任务只改文档，没有构建。
  - 改动文档的相对链接、锚点（含新锚点）与 front matter `updated` 检查：0 个问题。
  - diff 中没有十进制常量或 8 位十六进制常量。只记地址、偏移、结构、公式、计数，以及决定公式结构的立即数（类型、轴、单位缩放）。
- **审阅：** 本会话不能运行 rubber-duck 子 agent（没有可用的互补模型），改由 general-purpose 子 agent 按同一要求只读审阅。
  - 结论 1–7 与原生导出一致，通过 AC-17 合理。
  - 采纳并已修正：
    - 碎片面表按（顶点，法线）对读取，已复核 `0x80c14` 及全部效果构建函数的 ECX；
    - 写入交接记录；
    - 补充各输入的操作数形式，并说明立即数的记录范围；
    - 更正 `0x7d530` 的描述；
    - 补充重算的证据、`0x41c00` 模块的置信度与类型计数，以及随机序号的措辞。
- **文档影响：**
  - 更新了 executable、unknowns，以及 STATUS 的下一步（15 的结论与 P2-06 待修正项）；
  - 工程约定与指南不需修改，因为没有新增命令、接口或操作步骤，Ghidra 用法与已有指南一致；
  - spec 不修改：其契约未变，名称与范围上的影响记在 goal 执行记录，由用户决定。
