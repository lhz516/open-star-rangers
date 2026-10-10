---
type: plan
status: active
phase: P3
task: "05"
subtask: "07"
updated: 2026-10-10
---

# 07 — 基准环境的 BIOS 自动重复（Q-06）

**契约来源：** [spec](../spec.md) 的 S-01、S-15，[原版研究](../spec.md#原版研究) Q-06，[离散命令与重复](../spec.md#离散命令与重复)与技术决定 3（项目节奏不是原版值）；AC-01，R-23 的已知差异。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **配置与源码证据：** 基准环境的 DOSBox-X 配置中与键盘重复相关的设置，以及 DOSBox-X 源码中 BIOS 键盘与重复的处理（只读，记录文件/函数与结论，不复制代码）；宿主按住如何经模拟器变为 BIOS 重复。
- **真实按住样本：** 在基准环境中按住键，观察实际到达游戏的码节奏，以及[输入轮询](../../../../original/formats/executable.md#input-polling-p3-0201)的严格到期比较（取样 +16，偶数取样下相邻至少 18）与“每次只保留一键”对实际节奏的影响。读回所需工具来自 P3-06 集成；未满足时只阻塞样本部分，配置与源码部分照常完成。
- 逐个注入 BIOS 码不是自动重复证据。agent 能用的途径（Computer Use 送键、模拟器自身的输入机制）都无法产生持续按住时，记录已尝试的途径与原因，交协调者决定是否请用户做最小的物理按住样本；不以注入或配置推断冒充真实样本。
- 结论写入[键位表](../../../../original/input/key-map.md)（自动重复与节奏）与 [unknowns](../../../../original/unknowns.md)，必要时在 [executable](../../../../original/formats/executable.md) 补充代码地标；输出只在 `local/research/p3-05/repeat/`。
- 本项只为 32 列出与项目重复（32/16 时钟单位）的差异；需要改项目参数时须修订 spec，不在本项改动。

## 不包含

- 项目重复的实现（18、20）；R-23 对照文档（32）。

## 关键文件与契约

- [executable.md 输入轮询](../../../../original/formats/executable.md#input-polling-p3-0201)、[key-map.md](../../../../original/input/key-map.md)、[unknowns.md](../../../../original/unknowns.md)；[基准环境](../../../../guides/baseline-environment.md)、[运行时测量](../../../../guides/runtime-measurement.md)。

## 写入范围

- `local/research/p3-05/repeat/**`：研究输出（不入库）。
- `docs/original/input/key-map.md`、`docs/original/formats/executable.md`、`docs/original/unknowns.md`：结论。
- `tools/baseline/**`：仅在必须扩展读回工具时。
- `docs/guides/runtime-measurement.md`：工具改动的用法。

## 验收标准

- [ ] Q-06 达到门槛：配置/模拟器源码证据与真实按住样本分开陈述，各带置信度；缺真实样本时写明尝试途径与原因，不以注入代替。
- [ ] 严格到期比较与单键保留对节奏的影响有结论。
- [ ] `pnpm check:compliance` 通过；改动 `tools/baseline/` 时其 unittest 通过。

## 验证方法

- 文档审阅对照 `local/research/p3-05/repeat/` 的记录；`git status --short`。

## 完成证据
