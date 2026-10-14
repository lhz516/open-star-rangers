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

- [x] Q-06 达到门槛：配置/模拟器源码证据与真实按住样本分开陈述，各带置信度；缺真实样本时写明尝试途径与原因，不以注入代替。
- [x] 严格到期比较与单键保留对节奏的影响有结论。
- [x] `pnpm check:compliance` 通过；改动 `tools/baseline/` 时其 unittest 通过。

## 验证方法

- 文档审阅对照 `local/research/p3-05/repeat/` 的记录；`git status --short`。

## 完成证据

- **Q-06 记录：** [键位表的“按住与自动重复”](../../../../original/input/key-map.md#按住与自动重复q-06p3-0507)按来源分段，各带置信度：
  - 配置：已确认，依据私有配置与 DOSBox-X 参考配置。
  - DOSBox-X 源码：已确认。读的是标签 `dosbox-x-v2026.08.31`（提交 `4f19017`），与应用包 Info.plist 记录的版本和 SDL1 构建一致。
  - 原版程序：已确认，静态；`DOS4G.EXE` 为高概率。
  - 基准实际重复值 500 ms/33 ms：高概率。
  - 推导节奏：高概率。
  - 真实按住样本：未取得，逐条写明考虑过的途径与不可用原因，没有用 BIOS 码注入或配置推断代替。
- **代码地标：** 写在 [executable 的 Keyboard hardware and repeat](../../../../original/formats/executable.md#keyboard-hardware-and-repeat-p3-0507)，接在 P3-06 已记录的键盘来源（不读 0x60/0x64、不挂 INT 9）之后，只补新事实：也不写这两个端口，没有调用 INT 16h 的路径，并列出写入的全部中断向量；附有界搜索说明。键位表一节同样只补 P3-06/07 试键未覆盖的“物理键经模拟键盘进入缓冲”中的重复部分。
- **随带更正：** 输入轮询中“samples are even”一句改为按 2 步进、奇偶性在初始化后固定（与[时基](../../../../original/formats/executable.md#simulation-time-base-p3-0106)一致），≥18/≥6 的结论不变。
- **U-011：** 增加 P3-05/07 的结论，状态仍为“部分确认”，真实按住样本列为剩余项。
- **严格到期与单键保留的结论（高概率）：**
  - 按住期间每次轮询恰好一次动作，BIOS 的 33 ms 周期看不出来。
  - 飞行等视角的间隔至少 18 个单位，40000 cycles 时多为 18–20 个单位，约每秒 3.2–3.6 次；基地内间隔至少 6 个单位。
  - 第一次动作在按下后的第一次轮询；第二次动作在按下约 500 ms 后的第一次轮询，与第一次相隔 1 或 2 个轮询间隔。
  - 松开后至多再有一次动作。
  - 按住时新按下的键（包括 Alt）会停止旧键的重复，新键本身多半被丢弃。
- **供 32 的差异（项目 32/16 时钟单位对照基准推导节奏；均为高概率推导，不是原版实测）：**
  1. **首次动作：** 项目在新按下时立即入队、下一 tick 消费；基准要等到下一次轮询，在飞行中为 0 到约 18–20 个单位。
  2. **第二次动作：** 项目在 c+32；基准在按下约 500 ms（约 32 个单位）后的第一次轮询，与第一次动作相隔 1 或 2 个轮询间隔（约 18–20 或 36–40 个单位）。
  3. **持续节奏：** 项目每 16 个单位一次，即每秒 4 次；基准在飞行中每个轮询间隔一次，至少 18 个单位，即至多约每秒 3.6 次；基地内基准约 6 个单位一次。基准节奏随帧时长变长，不追赶，项目同样不追赶。
  4. **松开：** 项目松开即取消；基准松开后可能再有一次动作。
  5. **多键：** 项目中每个有效按住键各自重复，Alt 的变化不改变重复身份；基准只重复最后按下的键，按下任何其他键（包括 Shift、Ctrl、Alt）就停止旧键重复，按住期间新按下的键多半被单键轮询丢弃，而项目逐 tick FIFO 保留。
  6. **宿主设置：** 两者都不受 OS 按键重复设置影响。基准由模拟键盘自身重复，与项目决定 3 的理由一致。

  是否据此调整项目参数，属于 spec 的契约修订，本项不改。
- **研究输出（不入库）：** `local/research/p3-05/repeat/`，包括：
  - `notes.md`；
  - DOSBox-X 源码稀疏检出 `dosbox-x-src/`；
  - Ghidra 私有副本 `ghidra/`、`probe.sh` 与加了 `ctx`/`raw`/`disat`/`blocks`/`after` 命令的 `ghidra_scripts/PipeProbe.java`；
  - 输出 `out/p1-scan`–`out/p16`。

  Ghidra 只以 `-noanalysis -readOnly` 打开私有副本。本项没有运行 DOSBox-X 或 Computer Use，未改 `tools/baseline/` 与运行时测量指南。
- **检查：**
  - `pnpm check:compliance` 通过（`passed: true`，`findings` 为空）。
  - 脚本核对三份改动文档的相对链接与锚点，0 处错误。
  - `git status --short` 只有写入范围内的三份文档与本文件。
- **rubber-duck：** 提出五项，全部采纳：
  - 第二次动作只隔一个间隔的条件原先写反了，改为按下在前一次轮询之后约 4 个单位以内；
  - “取样为偶数”改为奇偶性固定；
  - 基准实际重复值单独标为高概率；
  - 扩展键只占一项缓冲；
  - INT 16h 的表述改为“没有调用它的路径”。
- **文档影响：** 原版事实已写入键位表、executable 与 unknowns。基准环境指南与运行时测量指南的步骤不受影响。宿主须使用 ASCII 输入源这一条件只记在键位表；是否写进基准环境指南，交协调者决定。STATUS 与阶段索引无须改动。
