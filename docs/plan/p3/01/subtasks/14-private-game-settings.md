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

- [ ] 白名单覆盖只改私有副本的目标行，并记入配方指纹与报告；无覆盖时行为不变。
- [ ] 未知键、非法值、超范围与重复键在会话副作用之前以稳定原因码拒绝，无 `complete` 报告；基准文件哈希不变。
- [ ] `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 退出码为 0；测试不读取 `local/` 或原版文件；无新增第三方依赖。

## 验证方法

- 运行 unittest 命令；审阅改写只作用于私有副本。
- 不需要基准运行；首次真实使用由 07 的合格运行完成。不涉及浏览器。

## 完成证据
