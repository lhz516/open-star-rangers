---
type: plan
status: active
phase: P3
task: "01"
subtask: "15"
updated: 2026-10-09
---

# 15 — 回收时等待 DOSBox-X 退出的时限（02 的修复项）

**契约来源：** [spec](../spec.md) 的 S-05、AC-07；[运行时测量](../spec.md#运行时测量)的有界生命周期（“所有读等待、断点等待与整个运行都有必填的有限上限；……清理失败不得变成成功”）；[07](./07-timebase-runtime-cycles.md) 的“测量工具本身的功能扩展：如需修改，记为 02 的修复项，由协调者新增子任务”。
**依赖：** 02, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来由

07 的第一次合格运行（`tb-c40000-01`）在本机取得全部 146 个合格读数，原版文件核对通过，但以 `cleanup-failed` 结束：工具先发 SIGTERM（等待 3 秒），再发 SIGKILL，之后两次各等待 5 秒，DOSBox-X 进程仍未退出；它在报告写出后才消失。烟测（约 24 秒、无游戏输入）的回收没有这个问题。等待时限过短使有效运行被判为失败。

## 工作范围

- **等待时限：** 把 SIGKILL 之后等待进程被回收、PID 与进程组消失的时限改为有限的 30 秒（总计不超过该上限，而不是两次各等待），保持 SIGTERM 宽限与信号顺序不变。超过时限仍判 `cleanup-failed`，不启动替代运行。
- **记录：** 报告的 `cleanup` 记录 SIGKILL 后实际等待到退出的秒数（或达到上限），便于判断时限是否足够。
- **测试：** 用自有子进程覆盖：默认上限为 30 秒；在上限内退出的进程判为通过并记录等待时间；超过上限（以测试注入的短上限模拟）判为失败；已有的回收测试保持通过且稳定。测试不读取 `local/` 或原版文件，不启动真实模拟器。

## 不包含

- 改变 SIGTERM/SIGKILL 的顺序、进程归属判定或其他会话行为。
- 07 的配方、测量与运行（归 07）。

## 关键文件与契约

- 02 的进程归属与回收：`tools/baseline/processes.py`；会话层调用：`tools/baseline/session.py`。
- 失败运行的证据（被忽略）：`local/research/p3-01/timing-runtime/tb-c40000-01/report.json` 的 `cleanup`。

## 写入范围

- `tools/baseline/processes.py`、`tools/baseline/session.py`：回收等待时限与报告字段。
- `tools/baseline/test_processes.py`、`tools/baseline/test_session.py`：相应的测试。

## 验收标准

- [x] SIGKILL 之后的等待以 30 秒为有限上限，报告记录实际等待时间；超过上限仍判 `cleanup-failed`。
- [x] 回收的正负路径有稳定的测试；`python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 退出码为 0；测试不读取 `local/` 或原版文件；无新增第三方依赖。

## 验证方法

- 运行 unittest 命令（含并发负载下的重复运行）；审阅时限有界。
- 首次真实使用由 07 的下一次合格运行完成。不涉及浏览器。

## 完成证据

- **实现（[processes.py](../../../../../tools/baseline/processes.py)）：** `KILL_WAIT` 由 5 秒改为 30 秒。`PtyTransport.reclaim` 的 SIGTERM、宽限期（默认 3 秒）与升级 SIGKILL 的条件和顺序不变；之后原来的 `child.wait(5)` 与另一段 5 秒的进程组轮询合并为一个总计不超过 `kill_wait` 的轮询（每次至多睡 0.05 秒且不超过剩余时间），每次观察一并取得回收、PID 与进程组状态，报告的 `returnCode`、`reaped`、`pidGone`、`groupGone`、`passed` 取自时限内的最后一次观察，不在时限后重新探测。发出 SIGKILL 时 `cleanup.killWait = {seconds, limit, limitReached}`（SIGKILL 后实际等待的秒数、上限与是否达到上限），未升级时为 `null`。超过上限 `passed` 为假，会话层照旧记 `cleanup-failed`（[session.py](../../../../../tools/baseline/session.py) 原样传递该字典，无需改动）。
- **宿主事实（本机实测，自有子进程）：** macOS 上被 SIGKILL 的子进程若其 PTY 输出未被读走，约 0.64 秒后才能被回收（读走时约 0.05 秒；PTY 缓冲区写满时仍约 0.64 秒，即退出时的排空是有限的，不会无限阻塞）。`tb-c40000-01` 中超过 10 秒的退出另有原因，未在本项查明；30 秒上限与 `killWait` 记录供 07 的下一次运行判断。
- **测试（[test_processes.py](../../../../../tools/baseline/test_processes.py)，假调试器作为自有子进程在真实 PTY 上运行）：**
  - `test_reclaim_escalates_when_sigterm_is_ignored`：不传 `kill_wait` 时 `killWait.limit` 为 30（默认上限），`limitReached` 为假；保留 14 加入的就绪等待。
  - `test_reclaim_waits_for_a_slow_exit_within_the_bound`：以补丁模拟回收延迟 0.6 秒、进程组再滞留 0.6 秒，在默认上限内通过，`killWait.seconds ≥ 1.2`。
  - `test_reap_and_group_share_one_bound`：两段各自短于注入的 1.5 秒上限、合计至少 1.6 秒，判失败：`passed` 与 `groupGone` 为假，`limitReached` 为真，`seconds ≥ 1.5`；子进程之后以 −9 退出。
  - `test_escalated_reclaim_is_recorded_in_the_report`：完整烟测运行（忽略 SIGTERM 的假调试器）中报告的 `cleanup` 含 SIGTERM、SIGKILL 与 `killWait`（上限 30、未达到）；`test_smoke_run_on_a_real_pty` 断言未升级时 `killWait` 为 `null`。
- **检查：** `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 148 个测试通过，退出码 0；在 4 个并行副本的负载下重复 6 轮（另有修改前后的两批各 5 轮）共 24/24 通过，且以 `-W error::ResourceWarning` 运行。测试不读取 `local/` 或原版文件；未新增依赖；未运行原版、DOSBox-X 或针对真实环境的 `measure.py`。
- **Rubber-duck：** 采纳两条：时限后的重新探测可能使 `passed` 与 `limitReached` 自相矛盾、轮询睡眠可能越过时限（改为取时限内最后一次观察、睡眠不超过剩余时间）；原测试不能区分“一个总时限”与“两段各自时限”（新增共享时限测试）。未采纳：回收后仍以 `kill(pid, 0)` 证明 PID 消失可能因 PID 复用而等满上限——保留 02 的 PID 证明语义，复用时结果与修改前同为失败。
- **Simplify：** 去掉单独的默认值测试与 `inspect`（并入升级测试的字面量 30），辅助函数改用 `nonlocal`；未采纳注入时钟/观察者接口与减少轮询中的 PID 探测（扩大改动，收益可忽略）。
- **文档影响：** 02 的完成证据对回收的描述（宽限期后升级 SIGKILL、证明 PID 与进程组消失）仍然准确；运行时测量指南尚未编写，由 11 写入 30 秒上限与 `cleanup.killWait` 的读法。没有原版事实或 U 项变化。
