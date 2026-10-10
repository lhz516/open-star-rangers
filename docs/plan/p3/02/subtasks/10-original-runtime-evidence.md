---
type: plan
status: active
phase: P3
task: "02"
subtask: "10"
updated: 2026-10-09
---

# 10 — 原版运行时取证（B-007）

**契约来源：** [spec](../spec.md) 的 S-09；AC-14、AC-15（原版部分）；[原版研究](../spec.md#原版研究)中须经运行时核对的 Q-02（支持集）、Q-04（+0xDC/+0xE0/+0xE4）与 Q-06；[对照方法与判据](../spec.md#对照方法与判据)。
**依赖：** 02, 03。
**执行方式：** 需用户：在 DOSBox-X 的私有副本中只用键盘进入所选任务并飞行到延迟来源生成，带与不带僚机各至少一次（每次约 10–20 分钟）。原因：P3-01 实测本机 Computer Use 无法向 DOSBox-X 送达按键或移动游戏内光标；agent 负责方案、配方、启动、读数、应答、判定与记录。执行时若该限制已解除，协调者改为自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **采集前的方案（B-007）：** 按[行为模板](../../../../original/behavior/_template.md)新建 B-007，并在 `local/research/p3-02/runtime/plan.md` 写定后才运行：
  - 场景与配置：战役 group 0 / slot 1，原始难度 19（`gameSettings` 的 `CURR_LEVEL` 与 `STARTUP_PRACTICE`），僚机选择（无与一个名单项），cycles（记录实际值；基准为 40000），过场设置（记录基准值；如另做关闭过场的运行，单独记录，不覆盖基准结论）。
  - 观测量（地址取自 01–03 与既有记录）：生成队列原点 `0x176740`、帧样本 `0x186414` 与步长、生成队列项及计数、源记录与编组的生成计数，实例化对象的种类、位置、+0xDC/+0xE0/+0xE4 与当时的锚点。
  - 暂停点：实例化处与生成队列检查处的断点；说明暂停不改变游戏状态；记录调试暂停对计时的影响。
  - 判据：按 spec 的 R-02/R-03 行。首轮队列检查单独判定 elapsed > due 与全部已到期项；延迟项判定上一轮 elapsed ≤ due 且本轮 elapsed > due 并在本轮全部派发；位置落入由当时操作数推出的支持集（舍入区间按 02 的推导组合）；+0xDC/+0xE0/+0xE4 等于 03 推出的缺省或落在其随机映射内；无僚机时没有僚机，带僚机时恰好所选项。两次运行是离散覆盖下限，不做分布统计。
  - 有效运行与重做规则、误差来源。
- **工具：** 用 [tools/baseline/](../../../../../tools/baseline/) 运行；若读取实例化对象需要现有配方不支持的能力（例如更多暂停点或其他定位方式），按工具既有契约增量扩展，补合成测试并同步[运行时测量指南](../../../../guides/runtime-measurement.md)与[工具用法](../../../../guides/tools.md)。不得用 shell 或 AppleScript 向 DOSBox-X 注入按键。
- **运行：** 写本地操作手册（进入路线、允许与禁止的输入、何时报告）；至少 2 次报告为 `complete` 的合格运行（带与不带僚机各 1 次）。失败或不合格的运行保留证据，用新编号重做，不合并统计。
- **结论：** B-007 写入方法、样本、判定与证据（只记安全身份、计数与判定，不记读数原值）；Q-06 的运行时确认写入 scenario 或 executable；U-022、U-023 更新状态与线索，负责阶段不改。以真实秒表示的结论不在本项范围；实际帧生效时间遵守 [B-006](../../../../original/behavior/B-006-simulation-timing.md) 的 cycles 前提。
- **阻塞：** 无法取得必需的输入操作或合格样本时，本项记为 blocked，写明尝试、缺口与恢复条件，不用合成测试或静态结论代替。

## 不包含

- 新版实现与原版的对照结论（11）；真实内容核对（09）。
- 冻结 U-021（负责阶段 P0）。

## 关键文件与契约

- [运行时测量指南](../../../../guides/runtime-measurement.md)、[原版证据获取](../../../../guides/original-evidence.md#agent-运行原版)、[基准环境](../../../../guides/baseline-environment.md)。
- [B-006](../../../../original/behavior/B-006-simulation-timing.md)（计时与 cycles 前提）；P3-01/07 的配方与操作手册可参考（`local/research/p3-01/timing-runtime/`）。
- 计划新增：`docs/original/behavior/B-007-mission-instantiation.md`；被忽略的 `local/research/p3-02/runtime/`。

## 写入范围

- `docs/original/behavior/B-007-mission-instantiation.md`：测量方案、样本与结论（新建）。
- `docs/original/formats/scenario.md`、`docs/original/formats/executable.md`：Q-06 等运行时确认。
- `docs/original/unknowns.md`：U-022、U-023（负责阶段不改）。
- `tools/baseline/**`：仅在需要时的增量扩展与合成测试。
- `docs/guides/runtime-measurement.md`、`docs/guides/tools.md`：工具扩展后的用法同步。
- `local/research/p3-02/runtime/**`：方案、配方、操作手册、私有运行目录与分析（被忽略）。

## 验收标准

- [x] B-007 在采集前写明场景、配置、观测量、样本、误差来源、判据与重做规则。
- [x] 至少 2 次合格运行（带与不带僚机各 1 次，工具报告为 `complete`），原文件保护与进程回收通过。
- [x] R-02 的生成时刻、放置支持集、缺省值与 R-03 的门禁按判据得出原版侧结论；Q-02、Q-04、Q-06 的运行时部分已记录。
- [x] U-022、U-023 已更新，负责阶段未改；仓库中没有原版读数、截图或反编译输出；改动的文档 `updated:`、链接与锚点有效。
- [x] 若改动了 `tools/baseline/`：`python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过，指南已同步。（未改动 `tools/baseline/`，指南无需同步；基准工具测试仍通过。）

## 验证方法

- 工具私有报告、配方指纹与运行笔记；分析脚本在 `local/research/p3-02/runtime/` 中按预先写定的判据输出判定。
- 文档链接与锚点检查；`git diff` 审阅确认没有原版内容。

## 完成证据

2026-10-09。方案、配方与分析脚本由 worker 在采集前写好；两次运行由协调者启动工具与确认辅助脚本，用户在键盘上操作；结果记录由 worker 完成。只记安全身份、计数与判定，读数原值只在 `local/research/p3-02/runtime/`。

**方法：** 采集前写定的方案为本地 `local/research/p3-02/runtime/plan.md`（采集后未改动），摘要与判据见 [B-007 的测量方法](../../../../original/behavior/B-007-mission-instantiation.md#测量方法)；操作手册为同目录 `procedure.md`。

- 工具 `tools/baseline/` 未改动：现有配方契约可以表达全部暂停点，新对象经其种类表的尾节点读取。工具源码摘要与 P3-01/07 相同（`sha256:7911b5b0…`）。
- 两份配方都只用代码断点：构建器调用 `0x6721c` 处、原点写入后、队列检查入口与其处理到期项处、`0x67678` 两处调用 `0x67938` 返回后、消息循环之后。无僚机 62 个暂停、215 个字段，带僚机 63 个、230 个字段；每个暂停检查难度、僚机选择值、战役标志与任务序号。配方指纹：无僚机 `sha256:34496cfb…`，带僚机 `sha256:e85ac99a…`（全文见 B-007）。
- 本地辅助脚本 `confirm.py` 按配方次序写确认（只写配方身份，从不跳过），并在第一个暂停后解码身份字段；分析脚本 `analyze.py` 按预先写定的判据只输出判定与计数，期望来自 03 的独立清单与同一运行的读数。两者与离线预检 `validate.py` 都在采集前用合成报告与模拟状态自测通过。
- 僚机的选择方式由只读 Ghidra 查明（出发前页面 0xF 的僚机章节以选择值为图像序号），写入 executable 的[生成队列](../../../../original/formats/executable.md#spawn-queue-p3-0203)；带僚机运行在简报页按 Esc（选择值 1，SCCT 第 0 项），无僚机运行在僚机档案章节按一次 `d` 后按 Enter（选择值 0）。

**Computer Use 复测：** 第一次运行开始时，在介绍剪辑播放期间点击窗口后用 Computer Use 发送空格与回车，剪辑照常播放，没有效果，与 P3-01 相同；因此两次运行都由用户在键盘上操作，执行方式中的“需用户”仍然成立。

**运行（cycles `fixed 40000`，基准过场设置，难度 19，group 0 / slot 1）：**

| 运行 | 僚机 | 工具 | 判定 | 计数 |
|---|---|---|---|---|
| `smoke-01` | 启动烟测 | `failed`（`integrity-failed`、`original-changed`） | **排除**：烟测永远不是证据；运行期间另一个 worker 改写、删除了它自己在 `local/research/` 下的研究文件，基准安装未变 | 10/10 样本合格 |
| `inst-nowing-01` | 选择值 0 | 退出码 0，`complete`，保护与回收通过 | 一致（`analyze.py` 退出码 0） | 971/971 样本合格；62/62 次确认；队列 7/7；首轮 6 个到期项、开局 50 个对象同帧；延迟 6 个；来源与次序 56/56；放置 56/56（布局加法 7/7）；缺省 56/56；门禁 0 个僚机项、0 个僚机对象 |
| `inst-wing1-01` | 选择值 1 | 退出码 0，`complete`，保护与回收通过 | 一致（退出码 0） | 999/999 样本合格；63/63 次确认；队列 8/8（含 1 个僚机项）；首轮 7 个到期项、开局 51 个对象同帧；延迟 6 个；来源与次序 57/57；放置 57/57（布局加法 7/7）；缺省 57/57；门禁 1 个僚机项、1 个来自 SCCT 第 0 项的对象 |

两次运行的用户在开局读数结束到延迟停止之间都没有飞行输入，没有被毁、菜单或结果画面（运行笔记在各运行目录的 `run-notes.md`）；判据不依赖飞行输入，有效性不受影响。

**结论：**

- R-02 的生成时刻、放置支持集与缺省值、R-03 的僚机门禁：原版侧按判据全部成立，判为“一致”。
- 运行时确认写在 executable 的[运行时核对](../../../../original/formats/executable.md#runtime-check-p3-0210)（队列、首轮检查、延迟项、来源与计数）、[放置映射](../../../../original/formats/executable.md#placement-mappings-p3-0202)与[段 5 派发](../../../../original/formats/executable.md#section-5-dispatch-p3-0202)（Q-02 支持集与布局加法）、[记录缺省](../../../../original/formats/executable.md#record-defaults-p3-0203)（Q-04）以及[生成队列](../../../../original/formats/executable.md#spawn-queue-p3-0203)（Q-06，选择值 0 与 1）。scenario 的 SCCT 一行与[所选任务实例化](../../../../original/formats/scenario.md#selected-mission-instantiation-p3-0203)补记了运行时确认，并把首轮检查的触发由高概率改为已确认。
- 未经运行时核对的部分（仍只有代码证据）：名称、活动状态、姿态、实例化内部的抽取、缺省值的负值分支、选择值 2–5，以及切片不用的上限/重复/概率/触发路径。

**舍入方向（与 Q-11 的先前结论矛盾）：** 两次运行共 113 个位置都与就近舍入一致。其中 77 个只与就近一致：开局 72 个，含 1 个经世界边界移动；延迟锚点 5 个，在构建帧之后约 9,000 帧放置。没有一个只与向零一致。

- 这与 02 由代码推出的“渲染器首次光栅化后向零（高概率）”矛盾；代码事实本身仍成立。
- 原因未确认：遗漏的控制字恢复路径、10 个例程在这些放置前没有运行，或模拟器行为。当前 DOSBox-X 主线的 f32 存储转换遵守舍入控制，已安装的 2026.08.31 版本是否相同未核实。
- 记录在 executable 的 [x87 一节](../../../../original/formats/executable.md#x87-precision-rounding-and-trigonometry-p3-0202)、U-009 与 B-007。
- 用户已批准 Core 改为就近舍入，决定与修复子任务由协调者记在 [goal 执行记录](../goal.md#执行记录)。

**U 项：** 负责阶段都未改。

- U-009：状态仍为高概率，加入舍入矛盾作为开放线索。
- U-022：加入运行时确认，状态仍为进行中。
- U-023：用途、选择语义与门禁已由代码、运行时与试玩确认，状态由“部分确认”改为“已确认”；仍未核对的是选择值 2–5 的运行时表现与档案人物的逐条对应。

**检查：**

- 相对链接与锚点检查（会话的 `linkcheck.py`）：B-007、executable、scenario、unknowns 与本文件，0 失败。
- `pnpm run check:compliance` 与 `pnpm run check:original` 退出码均为 0。
- `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`：148 个测试通过（工具未改）。
- `git diff` 审阅：只有地址、偏移、计数、运行 ID、哈希与判定，没有读数、截图、游戏文字或反编译输出。

**文档影响：** 新增 B-007；修改 executable（P3-02/02、P3-02/03 两节，地标表两行）、scenario（SCCT 一行与所选任务实例化）、unknowns（U-009、U-022、U-023）。STATUS、阶段索引、指南与工程说明无需修改；goal 由协调者维护。
