---
type: plan
status: active
phase: P3
task: "01"
subtask: "13"
updated: 2026-10-09
---

# 13 — 最终对齐

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-11 与 AC-01 至 AC-15；技术决定 1 至 9。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新功能或新研究。发现缺口时由协调者新增修复子任务，插入本项之前并加入依赖。

- **覆盖：** 逐项核对 goal 的验收覆盖表，每个 S 与 AC 都有对应子任务的完成证据，且与 spec 当前文本一致。
- **门槛：** 成功与失败终态（AC-02、AC-03）、核心时基（AC-05、AC-08）与数据闭包（AC-10）都满足 spec 的门槛；任何一项仍为 blocked 时，本项不能完成。
- **工具：** 重跑 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`，退出码为 0；确认测试不访问 `local/` 或原版文件，没有新增第三方依赖。
- **原版隔离（AC-14）：** 运行 `pnpm --silent check:compliance`（先构建再做原版与许可检查）；人工审阅本 goal 的全部提交：没有 `local/` 路径下的文件、原版字节、成串十六进制、原版文字、截图、读数或反编译代码；工具源码与配方只含本项目实现与定位元数据。
- **登记表与文档（AC-14）：** `docs/original/unknowns.md` 的差异只在受影响项的状态与线索，负责阶段一列未改；新事实只在 `docs/original/`；改动的文档 `updated:`、链接与锚点有效。
- **协调者修改：** 07 给出的 STATUS 建议（如有）已由协调者处理；阶段索引只有导航变化；没有把任务进度复制到 STATUS 或阶段索引。
- **清理：** 自有的模拟器进程、私有运行目录中的未完成状态、端口与临时文件已清理或如实记录；基准安装、用户文件与基准配置的哈希与起始时一致。
- **路由：** `node tools/task-state.ts p3/01` 与 tracker 一致。

## 不包含

- 新功能、修复或研究（缺口转为修复子任务）；下游任务的工作；push 或部署。

## 关键文件与契约

- [goal](../goal.md) 的验收覆盖与子任务跟踪；01–12 的完成证据；[unknowns](../../../../original/unknowns.md)。

## 写入范围

- `dist/**`：`pnpm check:compliance` 的构建产物（被忽略）。

## 验收标准

- [x] 全部 S 与 AC 都有完成证据，与 spec 一致；AC-02、AC-03、AC-05、AC-08、AC-10 的门槛满足。
- [x] 工具测试通过，且不访问原版文件或 `local/`。
- [x] AC-14：`pnpm --silent check:compliance` 通过；人工审阅确认没有原版内容进入仓库；登记表负责阶段未改；链接、锚点与 `updated:` 有效。
- [x] 基准文件哈希与起始一致；自有资源已清理；没有 push 或部署。

## 验证方法

- `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`；`pnpm --silent check:compliance`；`git --no-pager diff --name-only <起点>..HEAD` 审阅提交范围；逐行比较登记表的负责阶段一列；链接与锚点检查；`node tools/task-state.ts p3/01`。
- 不涉及浏览器。

## 完成证据

2026-10-09，协调者在 goal 分支上执行（起点 `7a2a7d3`）：

- **覆盖与门槛：** 01–12、14、15 全部 `completed`，各自验收框均已勾选，验收覆盖表的每个 S 与 AC 都有对应完成证据；spec 本身在本 goal 中未改动。AC-02（04：成功结果位置已确认，路径高概率）、AC-03（05：失败结果位置已确认，第三次损失路径高概率，未取得运行复现，已在 B-005 与执行记录披露）、AC-05/AC-08（07：结构关系由运行时确认，速率判据未满足，经用户 2026-10-09 决定作为依赖 cycles 的 T-4 结果交 U-021，见 B-006 与执行记录）、AC-10（10：影响闭环的待研究来源为 0）均按 spec 门槛与用户决定满足；没有 `blocked` 行。
- **工具：** `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 148 项通过；`tools/ghidra` 测试通过。测试模块经 `access_guard.py` 拦截 `local/` 与原版文件名访问；`tools/baseline/` 只导入标准库与同目录模块，无新增第三方依赖。
- **原版隔离（AC-14）：** `pnpm --silent check:compliance` 退出码 0，无发现。审阅 `7a2a7d3..HEAD` 的全部提交：没有 `local/` 下的文件；新增行中唯一的成串十六进制是假调试器测试中的合成屏幕行；文档只记地址、作用、结构与统计，没有原版文字、截图、读数原值、反编译代码或私人绝对路径。
- **登记表与文档：** `unknowns.md` 的 U 项集合不变，负责阶段一列没有改动；状态变化只有 U-008（未确认→进行中）、U-020（未确认→部分确认）、U-031（进行中→部分确认），其余为线索更新。新原版事实只在 `docs/original/`；其他改动文档为指南、命令表与键位文档 §7 的链接与接入时机。本 goal 改动的全部 Markdown 链接与锚点检查 1311 处、0 失败，`updated:` 均为 2026-10-08 或 2026-10-09。
- **协调者修改：** 07 的 STATUS 建议（计时对照前提）与 05 的 U-031 建议已写入 STATUS；阶段索引只增加一处指向 B-005 与 10 的链接；12 的阶段索引范围建议未采用，交用户决定（见执行记录）。没有把任务进度复制到 STATUS 或阶段索引。
- **清理：** 没有 DOSBox-X 进程或监听端口残留；6 个工具运行目录的状态都是 `finished`（`tb-c40000-01` 为失败运行，已排除）。基准安装、`baseline/` 快照与两个基准配置的哈希与首次运行前（`failure/cu-recon-*` 的 `baseline-before.sha256`）一致。worker 分支与 worktree 已全部移除。没有 push 或部署。
- **路由：** `node tools/task-state.ts p3/01` 与 tracker 一致。

