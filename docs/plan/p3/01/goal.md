---
type: plan
status: accepted
phase: P3
task: "01"
updated: 2026-10-09
related: [ADR-0004, ADR-0014, ADR-0017, U-008, U-010, U-021, U-022, U-031]
---

# P3-01：玩法闭环边界与原版对照基线 — Goal

## 目标与来源

交付用户于 2026-10-08 批准的 [spec](./spec.md) 的 S-01 至 S-11、AC-01 至 AC-15：

- 原版研究：难度读取路径、成功与失败终态的可达性、重开入口、模拟时基与 cycles 关系、衔接媒体、自动视角与数据闭包，事实写入 `docs/original/`；
- 受跟踪、经合成测试的运行时测量工具与操作指南，并在基准环境中完成合格读数；
- 规则对照目录的证据途径与 L/G/R/V 契约交接记录。

本文件不重新定义行为契约。本任务不修改 `src/`；L/G/R/V 表是交给 P3-02 至 P3-16 的契约，不由本 goal 实现。

## 代码现状与前提

- **产品代码：** 不改动。P3 消费的现有边界见 spec 的[当前实现与依据](./spec.md#当前实现与依据)：[load-mission.ts](../../../../src/core/mission/load-mission.ts) 的 `MissionSetup` 不含原始难度、本次僚机选择或任何运行时状态；[logic-content.ts](../../../../src/content/logic/logic-content.ts) 的 `RuleInputs` 按来源保留规则输入。
- **测量工具：** 仓库中没有运行时测量工具；受跟踪的 Python 工具只有 [tools/ghidra/](../../../../tools/ghidra/)（测试 `test_*.py`，标准库 unittest）。可参考的被忽略本地实现：`local/research/p2-12/map-frame/`（PTY 调试器会话、DOSBox-X 调试器屏幕解析、CODE/DATA 对应、私有副本与两行配置重定向、`-break-start -fastlaunch -nogui -nomenu` 启动参数、SIGKILL 回收）与 `local/research/p2-01/runtime-vrt-map.py`（VRT 暂停与对象对应）。它们读取原版 EXE、彼此导入，只能作为方法参考，不能复制进仓库或当作合成测试（spec 技术决定 4）。
- **计划新增：**
  - `tools/baseline/`：测量工具及其 `test_*.py`；
  - `docs/guides/runtime-measurement.md`：运行时测量指南；
  - `docs/original/behavior/B-006-simulation-timing.md`：时基与 cycles 的测量；
  - 被忽略的 `local/research/p3-01/<主题>/`：研究脚本、配方、私有运行目录与输出。
- **环境（起草时核对）：**
  - Python 3.12.3；DOSBox-X 2026.08.31 在 `~/Applications/dosbox-x.app`，启动脚本 `~/Tools/bin/dosbox-x`，基准配置 `local/StarRang/star-rangers-dosbox-x-mac.conf`（[基准环境](../../../guides/baseline-environment.md)）；
  - Ghidra 12.0.1 与项目 `local/ghidra/srangers`；静态分析一律 `-noanalysis -readOnly`，不 `-overwrite`。并行时若项目锁冲突，在本项的 `local/research/p3-01/<主题>/` 中使用项目的私有只读副本；
  - 原版数据：`local/StarRang/SRANGERS/`（安装目录）、`local/StarRang/cd/`（CloneCD 镜像）、用户文件初始快照 `local/StarRang/baseline/initial/`；
  - Computer Use 需要 macOS 的辅助功能与屏幕录制权限。缺少权限时相应行 blocked，请用户授予权限；不以 shell 或 AppleScript 绕过。
- **基准环境的使用：** 同一时间只能有一个会话操作基准环境（[原版证据获取](../../../guides/original-evidence.md#agent-运行原版)），需要基准运行的行（02 的烟测、04、05、07、08、09、10 的运行时核对）由协调者统一进行。原版运行一律在私有副本中进行，不改动基准安装、用户文件与基准配置。
- **跨任务前提：** [P2 退出评审](../../../reviews/P2-exit.md)为 accepted；[P3 任务拆分](../tasks.md)已批准。本任务不依赖其他 P3 任务。

### 原版证据

全部由 agent 按[原版证据获取](../../../guides/original-evidence.md)自行取得：已有记录、本地数据、只读 Ghidra、本任务的测量工具，以及用 Computer Use 操作私有基准运行；参考视频只作线索，单凭视频最高为高概率。只有全部适用途径都不能取得所需证据时才请用户帮助，并写明尝试、缺口与最小操作。

失败终态（05）与核心时基（06、07）可能达不到 spec 的门槛。届时该行记为 blocked，写明受影响的验收项与 spec [终态可达性门槛](./spec.md#终态可达性门槛)或[时基研究](./spec.md#时基研究)规定的恢复条件；不以项目自定的条件或未合格的读数代替。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 12 | 12：L-01 至 L-10 与闭环运行组合的交接记录；13：无下游实现被写成本任务已通过 |
| S-02 | 03 | 03：难度读取路径与影响；13：切片配置未被改动，或修订已重新批准 |
| S-03 | 04、05 | 04：成功路径与重开入口；05：失败终态、被毁与救援；13：门槛逐项满足或已按 spec 阻塞 |
| S-04 | 06、07 | 06：T-1 至 T-3 的代码依据；07：运行时核对、T-4/T-5 与 B-006；13：核心时基已确认 |
| S-05 | 01、02、11、14 | 01、02：合成测试；07：首次合格运行；11：指南与命令入口；13：重跑工具测试 |
| S-06 | 10 | 10：数据闭包决定表与格式文档；13：影响闭环的待研究项为零 |
| S-07 | 08 | 08：每条衔接的媒体、状态与跳过记录；13：G-02 实例齐全 |
| S-08 | 12 | 12：G-01 至 G-08 的依据、必要信息、标注与补齐责任；13：与 spec 一致 |
| S-09 | 09 | 09：自动视角结论与键位文档 §7；12：视角范围的交接；13：文档检查 |
| S-10 | 12 | 12：R 条目证据途径、L/G/R/V 映射与容差模板；13：覆盖与一致性 |
| S-11 | 03–11 | 各研究行写入 `docs/original/` 并更新 U 项；11：指南、工程约定、AGENTS.md 与文档地图；13：AC-14 的全部检查 |
| AC-01 | 03 | 03：读取路径、覆盖限制、原始难度与难度组分开、影响与负责任务；13：结论写入格式文档 |
| AC-02 | 04 | 04：成功结果位置（已确认）与正常玩法路径（至少高概率），排除调试强制成功；13：U-022 已更新 |
| AC-03 | 05 | 05：真正失败结果位置与可达路径，区分主动退出、强制失败与被毁/救援；B-005、U-031 已更新；达不到门槛时 blocked |
| AC-04 | 04 | 04：重开入口的行为（至少高概率）或未确认原因写入 B-003 |
| AC-05 | 06、07 | 06：T-1 至 T-3 的代码依据与其他计时消费量的逐项结论；07：运行时交叉核对；13：核心关系已确认，U-008 已更新 |
| AC-06 | 07 | 07：B-006 的测量方案、两个 cycles 的重复样本、误差预算与依赖判定；STATUS 前提建议交协调者；13：U-021 未被关闭，基准配置哈希不变 |
| AC-07 | 01、02、14 | 01：纯逻辑的正负单元测试；02：每类拒绝的端到端假调试器测试；13：重跑 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` |
| AC-08 | 07 | 07：所选任务飞行状态中两个暂停点之间有有效运行时段的合格报告；13：报告只在 `local/`，证据只记身份、统计与判定 |
| AC-09 | 11 | 11：指南内容与四处链接，AGENTS.md 与工程约定的命令表；13：链接检查 |
| AC-10 | 10 | 10：起点、线索与 L/R/V 依赖全覆盖，处置与身份绑定；13：影响闭环的待研究项为零 |
| AC-11 | 08 | 08：媒体类型、前后状态、输入与模拟推进、原版跳过能力、项目占位；U-010 已更新 |
| AC-12 | 09 | 09：媒体与引擎相机的区分、需保留的自动相机与责任；键位文档 §7 已更新 |
| AC-13 | 12 | 12：每个 R 条目的证据途径、置信度、限制与责任；L/G/R/V 与阶段索引的映射；行为模板的容差字段 |
| AC-14 | 03–11 | 各行只写 `docs/original/` 的事实与受影响 U 项；13：U 项负责阶段未改、`updated:`、链接与锚点、原版隔离审阅、`pnpm check:compliance` |
| AC-15 | 12 | 12：L、G、R、V 的交接记录；13：无下游测试或实现被写成本任务已通过 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-recipe-report-contracts.md](./subtasks/01-recipe-report-contracts.md) | — | completed |
| [02-debugger-session-protection.md](./subtasks/02-debugger-session-protection.md) | 01 | completed |
| [03-difficulty-readers.md](./subtasks/03-difficulty-readers.md) | — | completed |
| [04-success-result-restart.md](./subtasks/04-success-result-restart.md) | — | completed |
| [05-failure-destruction-rescue.md](./subtasks/05-failure-destruction-rescue.md) | 04 | completed |
| [06-timebase-static.md](./subtasks/06-timebase-static.md) | — | completed |
| [07-timebase-runtime-cycles.md](./subtasks/07-timebase-runtime-cycles.md) | 02, 06, 14 | blocked |
| [08-transition-media.md](./subtasks/08-transition-media.md) | — | completed |
| [09-automatic-views.md](./subtasks/09-automatic-views.md) | 08 | in-progress |
| [10-data-closure.md](./subtasks/10-data-closure.md) | 02, 08 | pending |
| [11-measurement-guide.md](./subtasks/11-measurement-guide.md) | 02, 07 | pending |
| [12-catalog-handoff.md](./subtasks/12-catalog-handoff.md) | 03, 04, 05, 07, 08, 09, 10 | pending |
| [14-private-game-settings.md](./subtasks/14-private-game-settings.md) | 02 | completed |
| [13-final-alignment.md](./subtasks/13-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 14 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-08 — 并行执行安排：** 协调者在 `p3-01-execute-goal` 分支上执行，同时运行的 worker 不超过 4 个（用户指定）。宿主不能在指定文件夹启动会话，worker 改在应用管理的 worktree 中运行（以认领提交为基），其分支改名为 `exec-p3-01-NN` 作为认领标记，`local` 以符号链接接入。原版运行（工具烟测、Computer Use 与运行时读数）仍由协调者统一进行。
- **2026-10-08 — 05 的基准复现未取得：** 协调者两次在私有副本中启动原版（基准文件哈希不变）。本机 Computer Use 无法操作 DOSBox-X：按键只在 DOSBox-X 为前台应用时送达，合成点击能触发按钮但不移动游戏内光标，选项、战役、简报与僚机页面都靠鼠标；用户当时无法协助。依 spec 终态可达性门槛“至少高概率”与有界核实“必要时复现”，05 以代码、数据与既有用户观察完成于高概率；已确认的规则证据与真实内容失败运行仍归 P3-11（P3-15 之前）。需要进入所选任务的运行（07 的合格读数）须由用户操作游戏。
- **2026-10-09 — 06 更正 03 的一处时间间隔：** 03 记录的速度辅助“至多每 8 个时间单位”来自反编译对 int* 全局量的指针运算；按代码实为样本 + 0x20 时钟单位（0.5 秒），06 已在 scenario §4 更正，并确认 §3 的生成时间单位为 1/64 秒。
- **2026-10-09 — 新增 14，07 改为依赖 14：** 07 的静态路线分析确认本机无需用户的进入路线：页面只按 INT 33h 的移动计数移动光标、按钮读取按下状态而非按下次数，计时窗口的标记也需要按键。07 的合格运行须由用户操作游戏，协调者运行工具并写操作确认。按 07“工具功能扩展记为 02 的修复项，由协调者新增子任务”，新增 14：配方可声明私有副本的 `STARTUP_PRACTICE` 与 `CURR_LEVEL` 覆盖，使用户只用键盘即可进入难度恰为 19 的所选任务。07 依赖 14，暂回 `pending`；其 worker 会话与 `exec-p3-01-07` 分支（无提交）保留待命，测量方案、路线分析与配方草稿在 `local/research/p3-01/timing-runtime/`。最终对齐加入对 14 的依赖。
- **2026-10-09 — 14 完成并修复 02 的不稳定测试：** 配方新增 `gameSettings`（`STARTUP_PRACTICE` 布尔值、`CURR_LEVEL` 为练习与战役两个 0–100 的值）与原因码 `game-config-invalid`；07 可用 `{"STARTUP_PRACTICE": false, "CURR_LEVEL": [100, 19]}`。集成时发现 02 的 `test_reclaim_escalates_when_sigterm_is_ignored` 在负载下偶发失败（子进程尚未安装 SIGTERM 忽略处理即被终止），经扩大 14 的写入范围在同一提交中修复。
- **2026-10-09 — 08 以静态证据完成：** 工作范围中的基准运行未进行（同 05 的宿主限制）；各衔接字段的依据为代码与数据（已确认），与用户观察的对应为高概率；运行核对步骤记在 08 的完成证据。08 提出的下游交接（G-02 占位时间的计入方式由 P3-02 与 P3-04/P3-10/P3-11 决定，所选任务勋章的判定与显示由 P3-11 在 G-06 下决定）交 12 的交接记录。
- **2026-10-09 — Subtask 07 blocked:** 合格运行须进入所选任务的飞行状态并在窗口边界按键，只能由用户操作游戏：本机 Computer Use 无法向 DOSBox-X 送达按键或移动游戏内光标，用户当前无法协助。
  Evidence: 协调者三次私有副本试验（`local/research/p3-01/failure/cu-recon-*`、`cu-run1-*` 与 `timing-runtime/cu-cursor-probe-*` 的 run-notes，基准哈希均未变）；07 的静态路线分析与测量方案（`local/research/p3-01/timing-runtime/route-analysis.md`、`plan.md`），两份配方已通过解析与映像核对。
  Affected acceptance: 07 的 AC-05（运行时交叉核对）、AC-06、AC-08；依赖 07 的 11、12 与最终对齐 13。
  Resume when: 用户可按 `local/research/p3-01/timing-runtime/procedure.md` 在 DOSBox-X 中只用键盘操作 4 次运行（每次约 8–12 分钟；协调者同时运行工具并写操作确认），且没有与 07 重叠的行在进行。
- **2026-10-09 — 07 阻塞期间暂缩写入范围：** 07 在 executable.md 与 unknowns.md 中没有部分改动（B-006 草稿只在 `local/`），为让不依赖 07 的 09、10 继续，暂从其写入范围移去这两处；恢复 07 时在没有重叠行进行的情况下重新加入，07 以届时的 goal 分支为基继续。

## 审批

用户于 2026-10-08 明确批准本 goal（“accept goal, and commit all”）。批准范围为当前的 13 个子任务、依赖、写入范围与验收覆盖。这不代表实现完成，不替代 spec 批准，也不授权执行之外的 push、部署或阶段切换。
