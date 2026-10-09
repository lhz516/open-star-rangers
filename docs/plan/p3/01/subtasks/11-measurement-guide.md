---
type: plan
status: active
phase: P3
task: "01"
subtask: "11"
updated: 2026-10-09
---

# 11 — 运行时测量指南与命令入口

**契约来源：** [spec](../spec.md) 的 S-05、S-11、AC-09、AC-14；[运行时测量](../spec.md#运行时测量)的指南部分。
**依赖：** 02, 07。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **新建指南** `docs/guides/runtime-measurement.md`（中文，guide front matter），按 02 的实际工具与 07 的实际合格运行编写，覆盖：
  - 场景的进入与配置记录（Computer Use 的使用、难度与僚机、私有配置与 cycles）；
  - 工具用法（命令行、配方与报告的位置、退出码与原因码）；
  - 读数的合格条件；
  - 计时：游戏计时与独立参考钟的区分、暂停排除与误差预算；
  - 私有目录中的 Capture 截图与录像；
  - 样本与容差的记录格式（与[行为模板](../../../../original/behavior/_template.md)一致）；
  - 原版文件保护与意外变化时的处理（不自动还原）；
  - 证据的存放与自有资源的清理；同一时间只有一个会话操作基准环境。
- **链接：** 从[原版证据获取](../../../../guides/original-evidence.md)、[基准环境](../../../../guides/baseline-environment.md)、[工具用法](../../../../guides/tools.md)与[文档地图](../../../../README.md)链接新指南。
- **命令表：** 在 [AGENTS.md](../../../../../AGENTS.md) 与[工程约定](../../../../engineering/README.md)的命令部分加入 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`，注明不属于 `pnpm check`。
- 指南只写方法与规则，不复制原版事实（链接 `docs/original/`），不含读数或截图。

## 不包含

- 工具功能本身（01、02）与时基结论（06、07）。
- `docs/engineering/slice-gaps.md`：由首个实现缺省的下游任务新建。

## 关键文件与契约

- 计划新增：`docs/guides/runtime-measurement.md`。
- 修改：`docs/guides/original-evidence.md`、`docs/guides/baseline-environment.md`、`docs/guides/tools.md`、`docs/README.md`、`AGENTS.md`、`docs/engineering/README.md`。

## 写入范围

- `docs/guides/runtime-measurement.md`：新建的指南。
- `docs/guides/original-evidence.md`：链接新指南。
- `docs/guides/baseline-environment.md`：链接新指南。
- `docs/guides/tools.md`：工具用法与链接。
- `docs/README.md`：文档地图条目。
- `AGENTS.md`：命令表。
- `docs/engineering/README.md`：命令表。

## 验收标准

- [x] AC-09：指南覆盖 spec 列出的全部内容，与 02 的工具和 07 的实际运行一致；由原版证据获取、基准环境、工具用法与文档地图链接。
- [x] AGENTS.md 与工程约定的命令表列出工具测试命令，并注明不属于 `pnpm check`。
- [x] 指南不含原版内容、读数或私人绝对路径；修改的文档 `updated:`、链接与锚点有效。

## 验证方法

- 按指南复述 07 的合格运行步骤，核对无遗漏或与工具不符之处。
- 文档链接、锚点与 front matter 检查。不涉及浏览器或基准运行。

## 完成证据

2026-10-09，worker `exec-p3-01-11`（基于认领提交 `a65c207`）。只改文档；未运行原版、DOSBox-X 或针对真实环境的 `measure.py`。

- **指南（AC-09）：** 新建 [runtime-measurement.md](../../../../guides/runtime-measurement.md)，按 02、14、15 的实际工具与 07 的实际合格运行编写。spec 与本项列出的内容逐项对应：
  - 场景的进入与配置记录：Computer Use 的使用与本机限制、难度与僚机（`identity.config` 加读数检查）、私有配置与 cycles（`environment.emulator`）、`gameSettings` 的白名单与取值、预检、报告的 `gameConfig.overrides` 与 `game-config-invalid`；即时存档规则。
  - 工具用法：`baseline-version` 与 `run`、配方各键与限值、`maxReadBytes` 的运行时计入项（启动对应尝试、每个暂停点的复核窗口、页查找）、阶段与 `status.json`、操作者应答（confirm 附身份、skip、abort、`operator/abort.json`，以及原子写入）、烟测、退出码 0/1/2/3、原因码分类。
  - 读数的合格条件、报告何时 `complete`。
  - 计时：游戏计数与独立参考（`emulatedMs`、`cycleCount`、`waitedSeconds` 的边界区间），窗口与暂停排除，窗口边界的选择，误差预算，cycles 依赖与 U-021 前提。
  - 私有目录中的 Capture 截图与录像：工具运行无菜单栏，P3-01 未在工具运行中用过捕获，写明首次使用时先确认输出位置。
  - 样本与容差的记录：字段以 12 更新后的[行为模板](../../../../original/behavior/_template.md)为准（goal 分支 `e9f2ff3`），指南不另定字段，只说明工具产物分别填入模板的“原版版本与配置”“测量方法”“测量结果”“验收容差”各节。B-006 作为方法参考，并注明它缺少判据的事先批准记录。
  - 原版文件保护：默认保护范围（`local/StarRang/` 严格、`local/research/` 既有文件），运行期间不改既有研究文件，意外变化时不自动还原，须经用户确认才可恢复。
  - 证据的存放、自有资源清理（`cleanup` 与 `killWait`、30 秒上限、遗留进程核对）、研究根目录锁与单一会话。
  - 指南只写方法；原版地址与结论链接 `docs/original/`。
- **链接：**
  - [原版证据获取](../../../../guides/original-evidence.md#agent-运行原版)：链接指南，补充私有副本说明与本机限制（Computer Use 无法向 DOSBox-X 送达按键、无法移动游戏内光标，需要游戏操作的运行由用户操作）。
  - [基准环境](../../../../guides/baseline-environment.md)：开头说明与 cycles 一条。
  - [工具用法](../../../../guides/tools.md)：表格新增一行、新增“运行时测量”一节、修改开头说明。
  - [文档地图](../../../../README.md)：新增一行。
- **命令表：** [AGENTS.md](../../../../../AGENTS.md) 在 “Python tool tests (not included in pnpm check)” 下加入 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`，并链接指南；[工程约定](../../../../engineering/README.md#命令)的命令部分新增 Python 测试命令表，注明不属于 `pnpm check`，测试约定中补充访问守卫与边界测试。
- **按指南复述 07 的合格运行：** 对照 07 的本地操作手册 `local/research/p3-01/timing-runtime/procedure.md` 与工具源码逐步核对，没有遗漏或不符之处：
  - 前提：仓库根目录与共享的 `local/`、无 DOSBox、研究根目录锁、新运行目录；
  - 命令与阶段：`launching`、`mapping`、`running`、`awaiting-confirmation`、`reading`、`finished`；
  - 用户何时开始操作、窗口焦点与鼠标释放、窗口内禁止的操作与须报告的情况；
  - 原子写入的确认、只在第一个标记使用 skip、两种中止、中止并重做的条件与下一个运行 ID；
  - 运行后核对 `status`、`reasons`、`integrity.passed`、清理结果与遗留进程，`original-changed` 与 `cleanup-failed` 时停下。
  - 操作手册中的原版细节（路线按键、标记键及其代码依据）没有写进指南，只链接 B-006。
- **检查：**
  - `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`：148 项通过（工具未改）。
  - 07 的本地链接检查脚本（只读运行）检查全部 7 个改动文档：304 个链接与锚点，0 个失败。变基到 `e9f2ff3` 后连同本文档与行为模板重查，327 个，0 个失败。
  - `git diff --check` 通过；`pnpm check:compliance` 通过，0 个发现（先执行了 `pnpm install --frozen-lockfile`；变基后重跑仍通过）。
  - 改动文档的 `updated:` 均为 2026-10-09，front matter 完整。
  - 人工审阅：没有原版字节、文字、读数原值或私人绝对路径。只引用 07 已公开的安全信息：运行 ID、用时、日志大小、配方限值，以及 B-006 的统计结论。
- **Rubber-duck：** 3 个阻塞项与 2 个非阻塞项全部采纳。
  - `runSeconds` 不覆盖收尾：回收另有上限，运行后哈希与写报告在回收之后。已照实写明；整次运行的上限是否需要覆盖收尾，交协调者判断。
  - `--smoke` 不改写暂停点：已写明须用专门的烟测配方，停止点无需输入即可到达，身份为 `{"context": "startup"}` 加仿真器键。
  - 基准环境的开头仍写 agent“自行运行”原版，与本机限制矛盾：已改。
  - 工具用法的开头说研究脚本只输出结构信息：已补充测量报告含读数，只在 `local/research/`。
  - `unit` 的实际限制：已写明受限记号规则。
- **文档影响：** 没有新的原版事实，U 项不变；行为模板由 12 负责，本项只链接，并在 12 集成后按协调者要求对齐了记录格式。对 STATUS 与阶段索引的建议写在 worker 报告中，由协调者决定。
