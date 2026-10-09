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
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 14。
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

- [ ] 全部 S 与 AC 都有完成证据，与 spec 一致；AC-02、AC-03、AC-05、AC-08、AC-10 的门槛满足。
- [ ] 工具测试通过，且不访问原版文件或 `local/`。
- [ ] AC-14：`pnpm --silent check:compliance` 通过；人工审阅确认没有原版内容进入仓库；登记表负责阶段未改；链接、锚点与 `updated:` 有效。
- [ ] 基准文件哈希与起始一致；自有资源已清理；没有 push 或部署。

## 验证方法

- `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`；`pnpm --silent check:compliance`；`git --no-pager diff --name-only <起点>..HEAD` 审阅提交范围；逐行比较登记表的负责阶段一列；链接与锚点检查；`node tools/task-state.ts p3/01`。
- 不涉及浏览器。

## 完成证据
