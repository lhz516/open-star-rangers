---
type: plan
status: active
phase: P3
task: "05"
subtask: "04"
updated: 2026-10-10
---

# 04 — 键盘研究的事实记录（Q-01、Q-02、Q-04）

**契约来源：** [spec](../spec.md) 的 S-01、[文档影响](../spec.md#文档影响)（键位表、executable、unknowns）、[执行检查点](../spec.md#执行检查点)“先完成”一栏；AC-01。
**依赖：** 01、02。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 01、02 的结论写入[键位表](../../../../original/input/key-map.md)：四个按键上下文、修饰组合与 CapsLock、小键盘（NumLock/Shift）、`p` 与 Esc、通讯与能量页、基地按键；删去“待试玩补充”中已由代码解决的项；未确认项保留并写明缺什么证据。
- 在 [executable](../../../../original/formats/executable.md) 增加相应代码地标（函数地址、角色、结构），沿用该文档的英文与现有节结构；不写码表原文或反编译。
- 更新 [unknowns](../../../../original/unknowns.md) 的 U-011：已确认的部分改为已确认并链接证据，其余写明剩余项（负责阶段仍为 P0）。
- 每条事实标置信度与证据；与 P3-06、P3-07 已有记录冲突时，在事实处如实记录并注明交接对象。P3-07 尚未合入时，对其 T3、W3、D10、CR-05 已覆盖的事实只写带分支与提交的交叉引用，不复制正文（合入后由 32 改为正式链接）。
- 更新各文档 front matter 的 `updated:`。

## 不包含

- 地图鼠标事实（05）；运行样本与自动重复（06、07）；K 定稿与 spec 修订（08）。

## 关键文件与契约

- [docs/original/input/key-map.md](../../../../original/input/key-map.md)、[docs/original/formats/executable.md](../../../../original/formats/executable.md)、[docs/original/unknowns.md](../../../../original/unknowns.md)。
- 输入：`local/research/p3-05/flight/` 与 `local/research/p3-05/contexts/` 的摘要。
- 注意：executable 也被 P3-06、P3-07 分支修改，合并时按“一个事实一个位置”消解，不重复记录。

## 写入范围

- `docs/original/input/key-map.md`：按键事实。
- `docs/original/formats/executable.md`：代码地标。
- `docs/original/unknowns.md`：U-011。

## 验收标准

- [x] Q-01、Q-02、Q-04 的结论都已入库，每条带置信度与证据；未确认项写明所缺证据。
- [x] 仓库中没有原版码表原文、读数、反编译或原版文字；`pnpm check:compliance` 通过。
- [x] U-011 的状态与剩余项准确；与 P3-06/P3-07 的冲突或交叉引用已注明。
- [x] 相对链接与锚点可解析，`updated:` 已更新。

## 验证方法

- 逐条对照 01、02 的摘要；`pnpm check:compliance`；以脚本或人工检查改动文档的相对链接与锚点。

## 完成证据

2026-10-10，worker `exec-p3-05-04`（基于认领提交 `ab9c9cea`）。只整理 01、02 的研究结论入库；没有运行 DOSBox-X、没有用 Computer Use、没有重读 Ghidra。下文只写结构、结论与核对结果。

**入库内容**

- [键位表](../../../../original/input/key-map.md)：新增[修饰键与大小写](../../../../original/input/key-map.md#修饰键与大小写p3-0501)、[小键盘](../../../../original/input/key-map.md#小键盘p3-0501)、[按键上下文](../../../../original/input/key-map.md#按键上下文代码确认p3-050102)（飞行、通讯菜单与能量页、Warp、基地、地图、暂停与 Esc 六小节）、[项目操纵候选键 I/J/K/L](../../../../original/input/key-map.md#项目操纵候选键-ijklk-规则-1-的输入) 与“其他交接”。主表更正沿用 README 的两行（主武器键 `/` 而不是 `?`；Alt+F4 不切换视角，只有按住 Alt 的主炮起作用），补写暂停、通讯菜单、离港、能量、损伤、Warp、选择导弹各行的代码条件，新增选项页、摇杆设置页、基地服务列表、屏幕闪光开关、截图、`b`、控制字符别名与小键盘别名八行。目标模式中 `u` 改为已确认并补上 `r`/`y` 的方向；速度键中小键盘 `+`/`-` 与 Shift+数字的来源对基准模拟器改为已确认。“待试玩补充”删去已由代码解决的通讯菜单按键，留下页面系统按键与宿主物理键映射（Q-05）。
- [executable](../../../../original/formats/executable.md)：新增 [Key reading and key contexts (P3-05/01, P3-05/02)](../../../../original/formats/executable.md#key-reading-and-key-contexts-p3-0501-p3-0502)：读键 `0x3c970`、换算 `0x75048`、CapsLock 互换、输入词匹配器与作弊门禁 `0x3cb78`，飞行处理的叶块地址与角色，两个前置处理与菜单按键的生成方式，Warp/基地/地图的分支与调度子命令，暂停循环与页面运行器，以及与 P3-06、P3-07 的对照。另在 P3-06/02（F12 门禁不再是“高概率”）、P3-06/03（小键盘 `+`/`-` 与 Shift+数字的来源；`0x27ab4` 的页 1 即能量页；菜单占用的键）与 two allocator paths（`0x2148e` 的事件由 `b` 发出）三处就地加注并链接新节。
- [unknowns](../../../../original/unknowns.md) 的 U-011：新增 P3-05/01–02 一段（已入库的范围、两行更正、`u` 升级、与 P3-07 分支的交叉引用及一处冲突），删去 P3-06/07 段中已过时的“仍未确认：菜单中的其他快捷键……”，改为汇总的“其余仍未确认”（Q-05 的物理键映射与运行样本、页面系统按键、练习模式的 Esc 页面、`b` 对象的作用、玩家状态字节 +0、实机送达）。状态仍为部分确认，负责阶段仍为 P0。

**逐条对照 01、02 的摘要**

- 01（`local/research/p3-05/flight/summary.md`、`findings.md`、`modifiers.md`、`addresses.md`）：读键路径、飞行处理的动作族、作弊门禁码与无作用码、修饰组合与 CapsLock、小键盘表、I/J/K/L（Shift+J 摇杆页、Ctrl+J 与 Ctrl+Shift+J 同 Ctrl+Enter、i/I 仅作弊）、Q-02 飞行部分（只有 `p` 开始暂停，`p`/`P` 结束，Esc 不结束；Esc 选项页，前置处理不占用 Esc）、Q-04 飞行部分（数字只在菜单有该键时占用，`0` 从不，`x` 关闭，Shift+数字从不被占用；能量页只在档位改变时占用）与“待 04 更正”各项都已入库。
- 02（`local/research/p3-05/contexts/summary.md`、`codes.md`、`addresses.md`）：Warp 只有 `p`、`|` 与仅作弊的 `i`/`I`；基地的上、下、Enter、`l`/`L`、Esc、`m`、`P`、`p`、`|`，数字无作用，上/下两端钳制、停靠时复位；地图的 `m` 与 Esc 关闭、`w`/`W` 请求 Warp、`p`、`|`；三处的暂停循环；Warp 中 I/J/K/L 无非作弊作用，都已入库。
- 地图 Esc 与 05 已更正的 B-001 及“战略地图开关”行一致（键位表[地图](../../../../original/input/key-map.md#地图)小节明写 `m` 与 Esc 都关闭地图），没有重新引入旧观察。07 的按住重复与 05 的地图鼠标只链接、不重复。
- **置信度：** 各处理对码的结果为已确认（代码）；PC 扫描码经基准 DOSBox-X 产生哪个码为已确认（模拟器源码）；宿主物理键到扫描码与布局为高概率或未确认，凡依赖这一步的结论（修饰组合、小键盘、I/J/K/L 的组合）都写明待 06 的运行样本（Q-05）。页面身份为已确认（数据）；选项页以 Esc 继续、`0x538a0` 的 Miles 调用身份、基地列表序号 0 在最上一行、音乐序号即强度层级、对象列表达到 33 项时 `x` 选中第 33 项（推论）为高概率；`b` 对象的作用、玩家状态字节 +0、练习模式的 Esc 页面、`D`/`M`/F12 族的作用为未确认或未追踪。

**与 P3-06、P3-07 的交叉引用与冲突**

- P3-06 已合入本分支：直接链接其各节；与其结论一致，小键盘 `+`/`-` 与 Shift+数字的“高概率”对基准模拟器升为已确认（宿主物理键仍待 Q-05）。
- P3-07 未合入：T3、W3、D10、D15 与 P3-02 spec 的 CR-05 只写分支 `p3-07-weapons-damage-spec` 与提交 `589d780b` 的交叉引用（01 对照的 `362f4fb3` 与之相比，这几节没有改动，已用 `git diff 362f4fb3 589d780b` 核对），不复制正文；合入后由 32 改为正式链接。本研究回答了 T3 留下的两点（大写 `T` 为仅作弊的击杀事件；数据菜单不占用字母）。
- 冲突一处：该分支 U-011 补充写“大写（Caps Lock 或 Shift）”，按 01 的代码与模拟器源码 CapsLock 不改变到达的大小写；已在键位表[修饰键与大小写](../../../../original/input/key-map.md#修饰键与大小写p3-0501)的事实处记录并交 P3-07（或由 32 合入时处理）。
- 范围外（未改，在报告中交协调者）：[comm §4](../../../../original/formats/comm.md#4-text-rules-confirmed) 称 `0x754d9` 转为大写，实为转为小写（效果相同；executable 新节已注明）；[B-001](../../../../original/behavior/B-001-strategic-map.md#warp-的衔接p3-0108) 的 Warp 一节“另外两个作用未追踪的键”现已追踪；[B-004](../../../../original/behavior/B-004-base-communications.md#入港与离港的衔接p3-0108) 的“Enter 执行所选项目”可细化为提到服务队列队首。

**核对**

- `pnpm check:compliance`：通过（index 与 worktree 各 1270 个文件，0 项发现）。
- 链接与锚点：以 `local/research/p3-06/criteria/check_links.py`（GitHub 式标题锚点）检查三个改动文档与本文档，0 个问题；表格逐行核对列数一致，表格单元格中的 `|` 已转义；`git diff --check` 无问题。
- 三个文档的 `updated:` 均为 2026-10-10（当日已是该值）。
- 合规审阅：改动只写地址、角色、结构、结论、ID 与计数；没有码表原文、换算读数、反编译、原版文字或作弊词。
- rubber-duck：指出四项阻塞与一项非阻塞——无作用列表与仅作弊的 Alt+F12 矛盾；executable 把物理键到码写成已知（未区分 Q-05）；键位表缺少 `r`/`y` 的方向；executable 与 U-011 重复了键位表的逐键内容；暂停的声音一项置信度高于证据。均已采纳：收窄 Alt 的无作用表述，executable 两处改为区分模拟器侧（已确认）与宿主映射（待 Q-05），目标模式补上 `r`/`y` 的方向及 T2/T3/CR-05 的交叉引用，executable 的逐键无作用列表与 U-011 的逐项摘要改为链接键位表，声音一项标为高概率。
- 文档影响：事实已写入写入范围内的三个文档；STATUS、阶段 tasks.md 与 goal 由协调者维护，本子任务不建议改动（见 worker 报告）。工程与指南文档不受影响。
