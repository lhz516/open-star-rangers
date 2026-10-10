---
type: plan
status: active
phase: P3
task: "06"
subtask: "07"
updated: 2026-10-10
---

# 07 — 原版测量准备与预实验（B-008）

**契约来源：** [spec](../spec.md) 的 S-09、AC-10（方案部分）；[对照方法与判据](../spec.md#对照方法与判据)的覆盖下限、运行与配置；[执行检查点](../spec.md#执行检查点) B 的预实验。
**依赖：** 21、22。
**执行方式：** 自动：agent 用 [22](./22-agent-driven-input.md) 的模拟器内输入（经配方声明并记录的刺激）进入所选任务并施加按键与摇杆刺激，不需用户操作；不得在宿主层注入输入（2026-10-10 由协调者从“需用户”改为自动，原因见 goal 执行记录）。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **B-008 方案（数值判据除外）：** 按[行为模板](../../../../original/behavior/_template.md)新建 `docs/original/behavior/B-008-flight-motion.md`（创建前确认编号未被占用）：
  - 场景与配置：所选任务（战役 group 0 / slot 1）、原始难度 19、基准 `fixed 40000` cycles、过场设置、操纵驱动、灵敏度档位、僚机选择；
  - 观测量（地址取自 01–05）：运动阶段前后的位置、姿态行、移动块字段、所用机型字段与该帧步长；油门与控制块；匹配与辅助的条件量与结果；停放、活动区域与世界边界的状态；初态的两个时刻；
  - 暂停点与配对：前后态来自同一对象与预期调用；条件化单步测量与不中断窗口分开；说明调试暂停对帧分布的影响；
  - 覆盖下限按 spec；有效运行与重做规则；误差来源清单（数值判据由 08 填入）。
- **工具：** 用 [tools/baseline/](../../../../../tools/baseline/) 运行。工具目前只读配方声明的字段，不读 x87 栈或任意寄存器；若需要新能力（例如更多暂停点、成对读数），按工具既有契约增量扩展，补合成测试并同步[运行时测量指南](../../../../guides/runtime-measurement.md)与[工具用法](../../../../guides/tools.md)。不得用 shell 或 AppleScript 向 DOSBox-X 注入按键。
- **操作手册：** 写本地操作手册（进入路线、按键次序、禁止的输入、何时报告）。02 未能静态确认的飞行键，在运行准备阶段由操作者试键，以控制块读数核实，结论写入键位表与 U-011。
- **预实验：** 运行足以估计步长分布、输入对齐与读数分辨率的预实验，输出供 08 推导误差预算。预实验样本不计入正式样本（17），报告与运行目录单独编号。
- **阻塞：** 无法取得必需的输入操作或合格读数时，本项记为 blocked，写明尝试、缺口与恢复条件。

## 不包含

- 数值判据与样本数的定稿（08）；正式采集（17）；新版对照（18）。
- 冻结 U-021（负责阶段 P0）。

## 关键文件与契约

- [运行时测量指南](../../../../guides/runtime-measurement.md)、[原版证据获取](../../../../guides/original-evidence.md#agent-运行原版)、[基准环境](../../../../guides/baseline-environment.md)。
- [B-006](../../../../original/behavior/B-006-simulation-timing.md)、[B-007](../../../../original/behavior/B-007-mission-instantiation.md)（方案与配方的先例）；01–05 的完成证据。
- 计划新增：`docs/original/behavior/B-008-flight-motion.md`；被忽略的 `local/research/p3-06/runtime/`。

## 写入范围

- `docs/original/behavior/B-008-flight-motion.md`：测量方案（新建）。
- `docs/original/input/key-map.md`、`docs/original/unknowns.md`：试键核实的飞行键与 U-011（需要时）。
- `tools/baseline/**`：仅在需要时的增量扩展与合成测试。
- `docs/guides/runtime-measurement.md`、`docs/guides/tools.md`：工具扩展后的用法同步。
- `local/research/p3-06/runtime/**`：方案、配方、操作手册、预实验运行目录与分析（被忽略）。

## 验收标准

- [x] B-008 写明场景、配置、观测量、暂停点与配对、覆盖下限、误差来源与重做规则；数值判据留待 08。
- [x] 预实验运行的报告完整（或其缺口已记录），输出足以让 08 推导误差预算；预实验与正式样本分开编号。
- [x] 需要试键时，飞行键已以读数核实并写入键位表与 U-011。
- [x] 若改动了 `tools/baseline/`：`python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过，指南已同步。
- [x] 仓库中没有原版读数、截图或反编译输出；改动文档的 `updated:`、链接与锚点有效。

## 验证方法

- 工具的私有报告与配方指纹；运行笔记与预实验分析保存在 `local/research/p3-06/runtime/`。
- 文档链接与 front matter 检查。不涉及浏览器。

## 完成证据

- **2026-10-10 — B-008 方案：** 新建 [B-008](../../../../original/behavior/B-008-flight-motion.md)（编号未被占用），按行为模板写明场景与配置（所选任务、难度 19、`fixed 40000`、过场与摇杆配置的记录、僚机 1）、全部由配方刺激给出的输入（BIOS 键盘缓冲中的键、设备状态中的数字摇杆满偏、用上次读数副本保持与松开）、观测量与地址、暂停点与配对（同帧运动前后；回调暂停之间窗口的帧数与积分时间公式；R-05a 的三个时刻与时间原点）、条件化单步与不中断窗口的分开、地图与基地窗口作为有意差异单独列出、spec 覆盖下限到采集段的对应（含 Shift+9 与 Backspace 的比较、俯仰加偏航与俯仰加横滚、偏航加横滚只由 Node 覆盖、R-04d 的阈值两侧、R-05b 的停放编队与分支暂停）、误差来源与有效运行与重做规则；数值判据与“判据批准”留给 08。正式方案、预实验方案、操作手册与配方生成器在被忽略的 `local/research/p3-06/runtime/`（`plan.md`、`pilot-plan.md`、`procedure.md`、`scripts/`）。按协调者转达的 06 要点对齐了已合入的检查点 A/C 修订（R-04b/c、覆盖下限、操纵）。
- **预实验（`pilot-*`，与 17 的正式运行分开编号；登记表 `local/research/p3-06/runtime/analysis/runs.md`）：** agent 独自运行，无宿主输入，`--evidence local/research/p3-06/runtime/runs`。统计与判定见 B-008 的[预实验](../../../../original/behavior/B-008-flight-motion.md#预实验)，要点：
  - 91 对同帧运动前后（含转向 32 对、AI 飞行器 10 对）全部由独立求值器 `motion/ref_step.py` 按就近舍入逐位再现，37 个可区分对没有一对与向零舍入一致（诊断，U-009 的结论留给 17）；
  - 1 秒窗口按固定 2 单位步长推进：只含 0 与 2 单位帧的窗口逐位再现，含 4 单位帧的窗口位置差至多 0.71 单位、行方向差至多 0.31°，直接校准 08 的步长项；步长分布随画面内容变化很大（每秒 30–99 帧）；
  - 键盘轮询、设备读取与自动选择的到期间隔（18、8、66 单位，4 单位帧时各多 2）；油门 17 次（含 Shift+9 与 Backspace 的比较）与摇杆五种刺激的结果符合代码；
  - 起飞（R-05a）：实例化、控制块建立与首次运动的字段符合代码；首次运动的步长为 230 与 190 单位（载入帧），把玩家送到锚定敌机近旁，速度辅助下一帧即匹配，所以方案规定在首次可操纵更新的那一次轮询关闭辅助（`pilot-a-02` 按此重做）；
  - 速度辅助：连续匹配间隔 32 单位，阈值内侧的近边样本（距离平方比阈值小 0.07%），Enter 与 Ctrl+Enter 开关的结果符合代码（`pilot-d-02`）；
  - R-05b 的可行性（`pilot-f-01`）：转入扇区平面后直飞约 4 分钟，开局敌机始终保持在活动半径内，停放编队以约每秒 115 单位接近，+y 世界边在约 8 分钟内可达；分支暂停用寄存器寻址读到被更新的对象本身；
  - 有缺口的运行已记录：`pilot-a-01`（本会话在运行中编辑了证据范围内自己的文件，`integrity-failed`；读数只作诊断）、`pilot-b-01`（确认脚本的跳过计数错位，排除）、`pilot-d-01`（目标退出辅助阈值后暂停点不再命中，中止）。之后的运行把运行目录放在 `runs/`，证据范围只含 `runs/`，脚本、配方与分析在其外。
  - 完整的预实验运行：`pilot-a-02`、`pilot-b-02`、`pilot-c-01`、`pilot-d-02`、`pilot-e-01`、`pilot-f-01`；全部 `complete`，刺激全部施加，原文件保护与回收通过。耗时：每个读数暂停 27–55 秒，日志约 1.7 MB；正式采集按此规划预算。
- **试键（U-011）：** `pilot-e-01`（`complete`，43/43 刺激）在飞行中写入方向键（含 E0 形式）、Home、PgUp、End、PgDn、小键盘中键、Ctrl 组合、NumLock 下的小键盘数字与 F11×3：视角键按自动视角一节切换，Ctrl+左/右/Home/PgUp/End/PgDn 与不按 Ctrl 相同，Ctrl+上/下、End、PgDn 与数字无作用，任何键都不改变操纵轴；F11 依次给出 High、Low、Medium 并重建灵敏度表。写入[键位表](../../../../original/input/key-map.md#飞行操纵代码确认u-011)、U-011 与 B-008 的[试键](../../../../original/behavior/B-008-flight-motion.md#试键u-011)。
- **工具（`tools/baseline/`）：** R-05b 需要读取同一例程逐个处理的对象（停放行进 `0x2f314` 中 ESI、停放切换中 EBX 为其句柄），因此按既有契约增量加入**寄存器寻址的字段**：`address` 可为 `{"register", "offset", "pointers"}`，第一跳为停止时的寄存器值加偏移，只能出现在断点暂停点（VRT 暂停点解析时拒绝），第一跳越出 DS 段为 `pointer-out-of-range`；所寻址的寄存器在停止时的寄存器栏读不到时以 `debugger-unparsed` 失败（字段与寄存器寻址的设备相同）。`recipe.py` 的字段与设备共用一个地址解析 `_base`，`locate.AddressSpace.linear` 统一段内换算（设备刺激的行为与原因码不变）。`python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`：166 项通过（原 163 项；新增 `test_recipe`、`test_qualify`、`test_session` 中的解析、拒绝、读数、越界与缺寄存器用例，`fake_debugger` 可隐藏寄存器）。[运行时测量](../../../../guides/runtime-measurement.md)（配方表、校验与指纹）与[工具用法](../../../../guides/tools.md)已同步。
- **Rubber-duck：** 两轮。第一轮 3 项阻塞、3 项非阻塞，全部采纳：R-04c 补上俯仰加横滚与各转向的施加、保持、松开窗口；R-05b 补上停放编队的字段与停放行进的分支暂停，并为此加入寄存器寻址的字段；R-04d 补上 `0x28030` 的阈值外侧逐帧读数、等号与负分支交 Node、连续匹配靠每次运行开局与重复运行；跨帧相等只用于玩家（AI 会在两帧之间重建姿态）；Ctrl+上/下的例外写清；排除的运行全部列出。第二轮（含工具改动）无阻塞，3 项非阻塞全部采纳：所寻址的寄存器在寄存器栏缺失时以 `debugger-unparsed` 失败（字段与设备），指南中“地址只写 LE 对象”一句更正，`pilot-d-01` 列入排除表。
- **Simplify（工具改动）：** 采纳：字段与设备共用地址解析 `_base`；段内换算统一为 `AddressSpace.linear`（设备刺激复用，去掉重复的边界运算与多余的导入）。未采纳：把 `Address` 与 `Device` 合并为一个地址类型（较大的重构，超出本项需要）；三个测试套件各自构造寄存器字段（各测不同层，保持独立更清楚）；每遍重复计算第一跳地址（只是整数运算，不增加调试器读取）。
- **文档影响：** B-008 新建；[键位表](../../../../original/input/key-map.md#飞行操纵代码确认u-011)与 U-011 写入试键结论；[运行时测量](../../../../guides/runtime-measurement.md)与[工具用法](../../../../guides/tools.md)同步寄存器寻址的字段。executable 不在写入范围：预实验中关于原版的观察（首次运动的长步长、控制块建立时玩家状态为 1、飞行中写回只与就近舍入一致、停放行进分支入口的含义）只记在 B-008 的预实验中，待 17 的正式采集确认后再入 executable 与 U-009。`docs/STATUS.md` 与阶段 `tasks.md` 不需修改。
- **检查：** `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过（166 项）；改动文档的链接与锚点用脚本核对全部有效，`updated:` 为 2026-10-10；`node tools/compliance/cli.ts original` 在索引、工作树与未跟踪文件中没有命中（唯一的发现是本 worktree 没有 `dist/` 构建）；`node tools/task-state.ts p3/06` 没有计划问题。跟踪文件中只有地址、结构、计数、统计与判定，没有读数原值、截图或反编译输出。运行后没有遗留的 DOSBox-X。
