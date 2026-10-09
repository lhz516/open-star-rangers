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

- [ ] SIGKILL 之后的等待以 30 秒为有限上限，报告记录实际等待时间；超过上限仍判 `cleanup-failed`。
- [ ] 回收的正负路径有稳定的测试；`python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 退出码为 0；测试不读取 `local/` 或原版文件；无新增第三方依赖。

## 验证方法

- 运行 unittest 命令（含并发负载下的重复运行）；审阅时限有界。
- 首次真实使用由 07 的下一次合格运行完成。不涉及浏览器。

## 完成证据
