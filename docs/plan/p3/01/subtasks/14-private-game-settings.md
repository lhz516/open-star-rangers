---
type: plan
status: active
phase: P3
task: "01"
subtask: "14"
updated: 2026-10-09
---

# 14 — 私有副本的游戏设置覆盖（02 的修复项）

**契约来源：** [spec](../spec.md) 的 S-05、AC-07；[运行时测量](../spec.md#运行时测量)的会话与原版保护、场景进入，[工具数据契约](../spec.md#工具数据契约)的配方身份与报告身份；[07](./07-timebase-runtime-cycles.md) 的“测量工具本身的功能扩展：如需修改，记为 02 的修复项，由协调者新增子任务”。
**依赖：** 02。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来由

07 的合格运行须进入所选任务（group 0 / slot 1，难度 19）的飞行状态。本机 Computer Use 无法操作 DOSBox-X（见 goal 执行记录），须由用户操作游戏。07 的静态分析显示：基准 `SRANGER.CFG` 的 `STARTUP_PRACTICE=TRUE` 使启动后直接进入练习任务，难度只能用鼠标把战役设置页的滑块拖到恰好 19。`STARTUP_PRACTICE` 与 `CURR_LEVEL` 都是游戏自身保存的用户设置（选项页的开关与难度滑块的值，读取路径见 [scenario 的难度读取路径](../../../../original/formats/scenario.md#difficulty-readers-p3-01)）。在私有副本中预设它们，可让进入路线只用键盘，并精确得到难度 19。

## 工作范围

- **配方：** 在配方中加入可选的私有游戏设置覆盖，只接受白名单键：`STARTUP_PRACTICE`（`TRUE`/`FALSE`）与 `CURR_LEVEL`（两个 0–100 的整数，依次为练习与战役的原始难度）。其他键、重复键、格式或范围错误在产生会话副作用之前以稳定原因码拒绝。覆盖计入配方指纹。
- **应用与保护：** 只在本次运行新建的私有副本中改写 `SRANGER.CFG` 的相应行，不改动基准安装、基准用户文件快照或基准配置；保持其余行、行序与换行方式不变。改写前后的私有文件哈希与实际生效的设置写入报告的实际游戏配置。未声明覆盖时行为与现状完全相同。
- **测试：** 用合成的设置文件与自有临时目录覆盖正负路径：白名单内的覆盖生效且只改目标行；未知键、非法值、超范围、重复键被拒绝且无 `complete` 报告；基准文件哈希不变；报告记录覆盖。测试不读取 `local/` 或原版文件。

## 不包含

- 注入游戏输入或自动操作页面（工具仍不注入输入）。
- 修改 DOSBox-X 配置中 cycles 以外的设置，或冻结 U-021。
- 07 的配方、测量与运行（归 07）。

## 关键文件与契约

- 02 的会话、私有副本与保护模块；01 的配方解析与报告。
- 07 的路线分析与配方草稿：`local/research/p3-01/timing-runtime/`（被忽略，只作需求参考）。

## 写入范围

- `tools/baseline/recipe.py`、`tools/baseline/session.py`、`tools/baseline/protect.py`、`tools/baseline/report.py`、`tools/baseline/reasons.py`、`tools/baseline/measure.py`：覆盖的解析、应用与记录。
- `tools/baseline/test_recipe.py`、`tools/baseline/test_session.py`、`tools/baseline/test_protect.py`、`tools/baseline/test_report.py`：相应的测试。
- `tools/baseline/test_processes.py`、`tools/baseline/fake_debugger.py`：修复 02 的不稳定测试 `test_reclaim_escalates_when_sigterm_is_ignored`（负载下 SIGTERM 可能早于子进程安装忽略处理而到达）。

## 验收标准

- [x] 白名单覆盖只改私有副本的目标行，并记入配方指纹与报告；无覆盖时行为不变。
- [x] 未知键、非法值、超范围与重复键在会话副作用之前以稳定原因码拒绝，无 `complete` 报告；基准文件哈希不变。
- [x] `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 退出码为 0；测试不读取 `local/` 或原版文件；无新增第三方依赖。

## 验证方法

- 运行 unittest 命令；审阅改写只作用于私有副本。
- 不需要基准运行；首次真实使用由 07 的合格运行完成。不涉及浏览器。

## 完成证据

- **2026-10-09 — 实现（Python 3.12.3，仅标准库）：**
  - **配方（[recipe.py](../../../../../tools/baseline/recipe.py)）：** 可选顶层键 `gameSettings`，键集封闭为 `STARTUP_PRACTICE`（JSON 布尔）与 `CURR_LEVEL`（恰好两个 0–100 的 JSON 整数，依次为练习与战役原始难度），例如 `{"STARTUP_PRACTICE": false, "CURR_LEVEL": [100, 19]}`。其他键（含大小写变体）为 `recipe-key-unknown`，类型错误为 `recipe-type-invalid`，个数或范围错误为 `recipe-value-invalid`，JSON 重复键沿用既有的 `recipe-json-invalid`；均在 `parse_recipe` 中、任何副作用之前拒绝。指纹是整个规范化文档的 SHA-256，因此覆盖计入指纹。`Recipe.game_settings` 保存类型化的值，写入文件的值文本（`TRUE`/`FALSE`、`100 19`）由 protect.py 按游戏自身的写法生成，与 `emulator.cycles` 的分工一致。
  - **改写与保护（[protect.py](../../../../../tools/baseline/protect.py)）：** `override_settings` 只替换每个键所在那一行的值区间，其余字节、行序、每行的换行方式（CRLF、LF、单独 CR、无末尾换行）与行内空白保持不变；目标键不存在、出现在多行、以其他大小写出现（报告的设置表不会显示它），或文件超过 1 MiB 文本上限，均以新增原因码 `game-config-invalid`（[reasons.py](../../../../../tools/baseline/reasons.py)）拒绝。`override_game_config` 从私有安装目录起逐级以不跟随链接的目录描述符打开设置文件（任何一级是符号链接都拒绝），只写链接数为 1 的普通文件，就地改写后返回报告记录。
  - **会话（[session.py](../../../../../tools/baseline/session.py)）：** 预检在副作用之前以只读方式核对覆盖能否应用于基准安装的设置文件（缺文件、缺键、重复键即退出码 2，不建运行目录）；准备阶段在私有副本按 manifest 核对之后改写私有副本（预检之后基准文件若被改成不可应用的形状，运行以 `game-config-invalid` 失败且不启动模拟器）。私有副本摘要表随之更新为改写后的值，因此运行结束时的 `privateCopyWrites` 只列出游戏自己的写入。报告的 `gameConfig` 为改写后的 `sha256` 与 `settings`（实际生效的设置），另加 `overrides.requested`（配方声明的值）与 `overrides.before`（改写前私有文件的 `sha256` 与 `settings`）。未声明覆盖时走原路径：不读取基准设置文件，私有副本原样，`gameConfig` 没有 `overrides` 键。
  - **命令行（[measure.py](../../../../../tools/baseline/measure.py)）：** 帮助文本说明 `gameSettings` 的形状、白名单与报告记录。
- **验证：**
  - `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`：145 项通过，退出码 0（原 136 项，新增 9 项，扩充 1 项）。[test_recipe.py](../../../../../tools/baseline/test_recipe.py)：合法覆盖的类型化结果、边界值 0/100、空对象、指纹随覆盖与取值变化；未知键（含小写变体与其他 CFG 键）、布尔/列表/整数类型错误、个数错误、超范围、JSON 重复键。[test_protect.py](../../../../../tools/baseline/test_protect.py)：只改目标行的表驱动用例（CRLF、混合换行、缩进与 `=` 两侧空白、无末尾换行、值与现值相同）；缺键、重复键、大小写变体、无 `=`、空文件、超上限均拒绝；就地改写保持 inode 与记录内容；叶子符号链接、硬链接、祖先目录符号链接、根目录符号链接、缺文件、目录、无法应用的内容均拒绝，且被链接的“基准”文件不变。[test_session.py](../../../../../tools/baseline/test_session.py)（假调试器 + 合成 LE + 临时目录的端到端运行）：带覆盖的运行 `complete`，私有副本恰为预期字节、基准文件与运行目录外所有文件不变、`gameConfig` 记录前后哈希与设置、报告指纹等于含覆盖配方的指纹且不同于去掉覆盖的配方；游戏在运行中再写设置文件时 `privateCopyWrites` 列出该文件，否则为空；未知键、非法值、超范围、JSON 重复键、设置文件缺键/重复键/缺失均为退出码 2、无运行目录、未启动、运行目录外文件不变；预检后基准文件被改时运行失败、不启动；`test_complete_run` 另断言无覆盖时 `gameConfig` 无 `overrides` 且私有设置文件与安装一致。测试文件名均为合成名，访问守卫未触发；只导入标准库与同目录模块（`test_boundaries` 通过）。
  - 变异核对：去掉摘要表更新、去掉预检核对、把逐级打开换回只对叶子不跟随链接，相应测试分别失败。
  - 只读适用性核对（不运行游戏、DOSBox-X 或 measure.py，不写任何文件）：在内存中对本机基准设置文件应用 `STARTUP_PRACTICE=false`、`CURR_LEVEL=[100, 19]`，可应用、行数不变、恰改 2 行、CRLF 保留、生效值正确，基准文件哈希前后一致。
- **Rubber-duck：** 阻断项——`O_NOFOLLOW` 只保护最后一级，私有安装中的 `MAIN` 若被换成指向基准目录的符号链接，就地改写会写到基准文件（评审以合成目录复现）；已改为逐级目录描述符打开并补充祖先与根目录链接的回归测试。非阻断项——大小写变体键会被改写但不出现在报告的设置表中；已改为拒绝大小写变体。
- **Simplify：** 采纳：`CURR_LEVEL` 复用 `_list`；键名只解码一次；配方保存类型化值、值文本移到写入方；改写用例表驱动；去掉与单元测试重复的端到端拒绝用例，无覆盖的检查并入既有完整运行测试。未采纳：去掉 `fsync`（与工具其他写入一致，代价可忽略）；新增通用的“私有副本封存”步骤（目前只有一处工具自身的改写，重新哈希整个副本代价更高）。
- **文档影响：** 维护中的指南与工程约定尚无配方键说明（运行时测量指南由 11 新建），`docs/original/` 无新事实（只使用 `game_config` 已依赖的 KEY=VALUE 行结构），unknowns、STATUS 与阶段索引无需修改。建议 11 在指南的“场景的进入与配置记录”中说明 `gameSettings` 的白名单、取值、报告字段与 `game-config-invalid`。
- **未做：** 按本项要求未进行基准运行；首次真实使用由 07 的合格运行完成。
- **2026-10-09 — 02 的不稳定测试（协调者集成核对发现，写入范围已扩大）：** `test_processes.ProcessTests.test_reclaim_escalates_when_sigterm_is_ignored` 在 `verify_owner` 之后立即回收，假子进程可能尚未安装 SIGTERM 忽略处理，于是被 SIGTERM 直接终止（`signals == ["SIGTERM"]`）。修复前在 8 个 CPU 占用进程下单独运行该测试 20 次失败 11 次。现在测试在回收前等待假子进程的第一屏输出：[fake_debugger.py](../../../../../tools/baseline/fake_debugger.py) 的 `serve` 在安装场景的信号处理之后才写出构造时渲染的第一屏（已加注释固定此顺序），所以读到任何输出即证明忽略处理已生效；没有增加等待时间或放宽断言。修复后同样负载下 40 次全部通过；完整套件 3 个并发 × 3 轮共 9 次全部 145 项通过，在 8 个 CPU 占用进程下再做 3 × 3 也全部通过。