---
type: guide
status: active
phase: P3
updated: 2026-10-10
related: [U-021, B-006]
---

# 原版运行时测量

用 `tools/baseline/measure.py` 在私有副本中运行原版：工具在 DOSBox-X 调试器的暂停点读取有界的内存字段，写出可作证据的报告。适用于静态分析答不了、需要运行中数值、计数或时间关系的原版事实，以及按容差测量的规则对照。第一次合格使用是 [B-006](../original/behavior/B-006-simulation-timing.md) 的时基测量（P3-01/07）。

- 工具契约见 P3-01 spec 的[运行时测量](../plan/p3/01/spec.md#运行时测量)与[工具数据契约](../plan/p3/01/spec.md#工具数据契约)；实现与测试在 [tools/baseline/](../../tools/baseline/)。
- 本指南只写方法与规则。原版的地址、字段含义与测量结论写在 [original/](../original/)；测量方案、配方、运行目录与读数只放在 `local/research/<任务>/<主题>/`。
- 先按[原版证据获取](./original-evidence.md)的顺序用代价更低的途径。只看画面、不读内存时，按 [agent 运行原版](./original-evidence.md#agent-运行原版)操作，不需要本工具。
- 工具不经宿主注入输入。它只读取配方声明的字段，只在配方声明的输入通道中写入游戏输入（[模拟器内输入](#模拟器内输入)），不提供任意内存导出、任意写入或通用调试。

## 角色、单一会话与本机限制

- **操作者：** 把游戏带到配方要求的状态，并在暂停点触发停止。可以是在游戏窗口中操作的人，也可以是配方声明的[模拟器内输入](#模拟器内输入)：这时 agent 独自完成整次运行。
- **运行者（agent）：** 启动工具，观察终端、`status.json` 与游戏窗口，写操作者应答文件，记录运行笔记，运行后核对报告。
- **本机限制（协调者 2026-10-08/09 实测）：** 本机的 Computer Use 无法向 DOSBox-X 送达按键，也无法移动游戏内光标（合成点击能触发按钮，但光标不动）。
  - 所需的游戏操作能写成配方的模拟器内输入时，由 agent 独自运行（[流程](#agent-独自运行)）。
  - 不能写成配方输入的操作（例如持续的自由驾驶）仍由用户在键盘上操作，agent 承担运行者的全部工作。观察画面可以用 Computer Use 截图，也可以请用户口头报告。
  - 不得用 shell、AppleScript、Computer Use 或其他宿主层自动化向 DOSBox-X 注入按键来绕过这一限制。
  - 启动烟测（`--smoke`，见[烟测](#烟测)）不需要操作者。
- **单一会话：** 同一时间只有一个会话操作基准环境。
  - 工具在研究根目录 `local/research/` 上取得独占锁（解析符号链接后加锁，所以链接同一个 `local/` 的各 worktree 共用这把锁）。锁已被占用时，工具以 `session-busy` 拒绝运行。
  - 运行前及启动后，只要发现任何 DOSBox 进程，工具就以 `emulator-already-running` 拒绝。它不附着、也不结束别人的进程；请等该进程退出，或请用户自己关闭。
  - 并行执行 goal 时，基准运行统一由协调者进行。

## 流程

1. 采集前写定测量方案（[测量方案](#测量方案)）。
2. 写配方并预检（[配方](#配方)）。
3. 为操作者写本地操作手册：进入路线、窗口内允许与禁止的输入、出现哪些情况要立即报告。全部输入都由配方声明时，手册改为记录每个刺激的暂停点、取值与依据（[模拟器内输入](#模拟器内输入)）。
4. 逐次运行并应答暂停点（[运行](#运行)）。
5. 核对报告与运行后的状态（[报告、退出码与原因码](#报告退出码与原因码)）。
6. 分析并记录事实与证据（[样本与容差的记录](#样本与容差的记录)），清理自有资源（[证据的存放与自有资源清理](#证据的存放与自有资源清理)）。

## 测量方案

- 采集前把方案写在 `local/research/<任务>/<主题>/plan.md`，评审后才开始运行。
- 采集开始后不再改动方案。偏差另行记录，例如在运行结束后写入同目录的 `run-notes.md`。运行进行中不要修改 `local/research/` 中已有的文件，见[原版文件保护](#原版文件保护与意外变化)。

方案至少写明：

- **场景与配置：** 任务、难度与僚机、游戏设置覆盖、cycles，以及进入路线。
- **观测量：** 字段、类型、单位，以及它们与原版事实的对应（链接 `docs/original/` 中的地址）。
- **暂停点与窗口边界：** 在哪里停止，以及这个停止点为什么不改变游戏状态。
- **参考钟与时间隔离：** 见[计时](#计时游戏时钟与参考钟)。
- **样本数：** 每个配置的独立运行数与窗口数，以及运行顺序。
- **误差预算：** 计数分辨率、边界延迟、窗口间与运行间的离散程度。不使用未说明来源的固定百分比。
- **判定规则：** 什么样的样本有效，以及每个量的判据。用作验收容差的判据须事先经用户批准（[对照方式与判定](../plan/p3/01/spec.md#对照方式与判定)）。
- **有效运行与重做规则。**

## 配方

配方是不超过 64 KiB 的 JSON（`schemaVersion: 1`），只含元数据，放在 `local/research/<任务>/<主题>/recipes/`。

| 键 | 内容与限制 |
|---|---|
| `schemaVersion` | `1` |
| `recipeId` | 受限标识，例如 `timebase-c40000` |
| `source` | `baselineVersion` 与 `exeSha256`，照抄 `measure.py baseline-version` 的输出 |
| `identity` | `mission` 与 `config`：所选任务与配置的身份，各 1–16 个键，值为布尔、整数或受限记号。`checks`：每个暂停点都必须读到且等于给定值的字段列表，用读数证实身份 |
| `correlation` | `code`：`object`、`size`（64–512，16 的倍数），可选 `offset`；`data`：`object`、`offset`、`size`（16–512）。用于在每个进程中建立 LE 对象与线性地址的对应 |
| `pauses` | 有序暂停点：`id`、`stop`、`fields`。`stop` 为 `{"kind": "breakpoint", "object": …, "offset": …}` 或 `{"kind": "vrt"}`（下一次垂直回扫）。`fields` 可省略或为空：这样的暂停点只停止（并施加其刺激），不读字段、不产生样本，也不等操作者确认 |
| `fields` | `id`；`address`：`object`、`offset`（LE 对象位置），或 `register`、`offset`（断点处寄存器值加偏移，偏移 −65536…65535，在 DS 段内；只能在断点暂停点读取，见下），以及可选的 `pointers`（每跳解引用后加上的非负偏移）；`type`：`u8`、`u16`、`u32`、`i16`、`i32` 或 `f32`（小端）；`unit`：非空的受限 ASCII 记号（字母或数字开头，只含字母、数字与 `._/:+-`，至多 64 个字符），例如 `raw`、`tick-1/64s`；`required`：默认为 `true`。每个字段至少被一个暂停点使用 |
| `limits` | `runSeconds`、`waitSeconds`、`maxPauses`、`maxFields`、`maxChainDepth`、`repeatReads`（≥ 2）、`maxReadBytes`、`maxLogBytes` |
| `emulator`（可选） | 只接受 `cycles`（1000–2000000）。工具把私有配置中的 cycles 行改为 `fixed <值>` |
| `gameSettings`（可选） | 只接受 `STARTUP_PRACTICE`（布尔）与 `CURR_LEVEL`（`[练习, 战役]` 两个 0–100 的原始难度） |
| `devices`（可选） | 输入设备状态字段：`id`、`address`、`type`（`u8`、`u16`、`u32`、`i16`、`i32`）。`address` 为 `{"object": …, "offset": …}`（LE 对象位置），或 `{"register": "ESI", "offset": …}`（断点处寄存器值加偏移，偏移 −65536…65535，在 DS 段内）。每个设备至少被一个刺激写入 |
| `stimuli`（可选） | 有序刺激：`id`、`pause`（暂停点 ID）、`kind` 与取值，见[模拟器内输入](#模拟器内输入) |

形状示意（尖括号处换成实际值；地址取自 `docs/original/` 记录的 LE 对象与偏移）：

```json
{
  "schemaVersion": 1,
  "recipeId": "<配方 ID>",
  "source": {"baselineVersion": "<baseline-version 输出>", "exeSha256": "<baseline-version 输出>"},
  "identity": {"mission": {"group": 0, "slot": 1}, "config": {"cycles": 40000, "difficulty": 19},
               "checks": [{"field": "difficulty", "equals": 19}]},
  "correlation": {"code": {"object": 2, "size": 128}, "data": {"object": 4, "offset": <偏移>, "size": 64}},
  "pauses": [{"id": "mark-1", "stop": {"kind": "breakpoint", "object": 2, "offset": <偏移>},
              "fields": ["difficulty", "clock"]},
             {"id": "mark-2", "stop": {"kind": "breakpoint", "object": 2, "offset": <偏移>},
              "fields": ["difficulty", "clock"]}],
  "fields": [{"id": "difficulty", "address": {"object": 4, "offset": <偏移>}, "type": "i32", "unit": "raw"},
             {"id": "clock", "address": {"object": 4, "offset": <偏移>}, "type": "u32", "unit": "tick-1/64s"}],
  "limits": {"runSeconds": 3600, "waitSeconds": 1500, "maxPauses": 4, "maxFields": 64, "maxChainDepth": 1,
             "repeatReads": 2, "maxReadBytes": 1048576, "maxLogBytes": 134217728},
  "gameSettings": {"STARTUP_PRACTICE": false, "CURR_LEVEL": [100, 19]}
}
```

### 校验与指纹

- 未知键、类型错误、越界取值、重复 ID 或无效引用，都在任何副作用之前以 `recipe-*` 原因码拒绝（退出码 2）。配方不能携带表达式、调试器命令或 shell 字串。
- 写入只能落在声明的输入通道：引用未声明设备的刺激、未被写入的设备、在 VRT 暂停点写寄存器地址的设备、同一暂停点的第二个按键，都在解析时拒绝。刺激须按暂停点的顺序声明，声明顺序就是施加顺序。
- `identity.checks` 的字段须出现在每个读字段的暂停点中；没有字段的暂停点不检查身份。
- **寄存器寻址的字段**（P3-06/07）：在同一断点处理多个对象的代码中（例如对每个停放对象调用一次的例程），对象句柄常在寄存器里，LE 对象位置无法指向“这一次的对象”。这样的字段以停止时 `stop.json` 记录的寄存器值加偏移为第一跳的地址，之后与其他字段一样逐跳解引用、重复读取并核对页映射；它不能出现在 VRT 暂停点（解析时拒绝）。第一跳落在 DS 段之外时样本为 `pointer-out-of-range`。读数前后寄存器不变本来就是合格条件，所以各遍读取用的是同一个寄存器值。
- 地址写 LE 对象号与偏移，或断点处的寄存器与偏移，不写上一次运行得到的绝对线性地址。字段或设备所寻址的寄存器在停止时的寄存器栏中读不到时，运行以 `debugger-unparsed` 失败。
- 报告的 `recipe.fingerprint` 是规范化 JSON 的 SHA-256，`emulator` 与 `gameSettings` 都计入。采集开始后不要修改配方：改动后指纹变化，新旧运行不能合并统计。

### 限值与预算

限值是研究工具自身的保护，不是原版数值或保真容差。

- **`waitSeconds`** 限制每一次单独的等待：调试器响应、启动对应中的每次停止、运行到每个暂停点（包括操作者在此之前的游玩时间，例如从启动、跳过片头到第一个标记），以及每次等待应答。
- **`runSeconds`** 限制从建立运行目录到测量结束的准备与调试器会话，包括运行前的哈希核对。收尾不在其内：回收自有进程另有上限（3 秒宽限期加 SIGKILL 后至多 30 秒，见[回收](#报告退出码与原因码)），运行后的哈希核对与最终报告在回收之后进行。
- 07 的每次运行实际用时约 6–15 分钟，其中进入飞行约 1–3 分钟；配方取 `waitSeconds` 1500、`runSeconds` 3600。
- **`maxReadBytes`** 是整次运行的累计读取上限。配方解析时只核对一对 CODE/DATA 窗口加上 `repeatReads` 遍字段读取，运行时还要计入以下各项：
  - 启动时每次对应尝试：一个 CODE 窗口；CODE 匹配后再加一个 DATA 窗口。工具在启动阶段最多尝试 512 次 VRT 停止，但只有 32 位保护模式的停止才会读窗口。
  - 每个暂停点的复核：一个 CODE 窗口加一个 DATA 窗口。
  - 每个暂停点的字段读取：`repeatReads` ×（每个字段 4 × 指针跳数 + 标量大小）。
  - 页查找：读取前后，对涉及的每一页各计 16 字节。
  - 刺激：写入前的读取、写入本身与写回后的回读都计入；按键另读缓冲指针与边界各 4 字节，换档标志另读 1 字节。页查找取自同一次显示，不另计。解析时按每个按键 20 字节、每个换档 4 字节、每个设备写入 3 倍字段大小估算。

  据此估算后留足余量。超出即 `budget-exceeded`，运行失败。07 每次 4 个暂停点、至多 53 个字段，配方取 1 MiB。
- **`maxLogBytes`** 是调试器原始输出与命令记录的总量上限。调试器每条命令都会重绘屏幕，07 的每次运行约产生 3.3–3.8 MB；配方取 128 MiB。超出即 `log-budget-exceeded`。
- **`repeatReads`** 至少为 2，各遍读数必须完全一致。

### 私有配置与游戏设置

- **`emulator.cycles`：** 只改私有配置副本，基准配置不变。不声明时，私有配置保留基准的 cycles 行。在 `identity.config` 中写上 `cycles`，工具就会按私有配置核对它。
- **`gameSettings`：** 预设私有副本设置文件 `MAIN/SRANGER.CFG` 中的游戏自身设置。
  - 用途：让操作者只用可用的输入就能进入场景，例如跳过只能用鼠标操作的页面（[B-006 的进入路线](../original/behavior/B-006-simulation-timing.md#场景与输入)）。这两项都是玩家可在设置页改动并保存的普通设置；难度值的含义见 [scenario 的难度读取](../original/formats/scenario.md#difficulty-readers-p3-01)。
  - 预检：以只读方式在基准安装的设置文件上核对覆盖能否应用。每个键必须恰好出现在一行，且大小写相同；否则以 `game-config-invalid` 拒绝（退出码 2，不建运行目录）。
  - 准备阶段：私有副本按 manifest 核对之后，工具只改写这些行的值，其余字节与换行方式不变。
  - 不得用它设置玩家无法设置的状态。

## 运行

### 命令

在含有（或链接了）`local/` 的仓库根目录运行：

```sh
# 配方 source 所需的基准版本记号与 EXE 指纹
python3 -B tools/baseline/measure.py baseline-version

python3 -B tools/baseline/measure.py run \
  --recipe local/research/<任务>/<主题>/recipes/<配方>.json \
  --out local/research/<任务>/<主题> \
  --run-id <运行 ID> \
  [--evidence local/research/<任务>/<主题>]
```

- **`--out`** 解析后必须位于 `local/research/` 之内：不得含 `..`，也不得经符号链接逃出。
- **`--evidence`**（可选）：把既有证据的保护范围缩小到 `local/research/` 内的一个目录，见[原版文件保护](#原版文件保护与意外变化)。它必须包含运行目录，不得含 `..`、经符号链接逃出或位于研究根目录之外，否则以 `evidence-scope-invalid` 拒绝（退出码 2）。
- **运行 ID 与路径段**都是受限记号（字母或数字开头，只含字母、数字与 `._-`，至多 64 个字符）。运行目录 `<out>/<运行 ID>` 必须尚不存在。
  - 每次尝试用新的运行 ID，例如 `<主题>-<配置>-NN` 依次递增。
  - 写过任何文件的运行 ID 不再使用；退出码 2 的运行什么也没写，可以沿用同一 ID。
- **预检**在任何副作用之前完成，失败即退出码 2：
  - 配方校验、输出位置与证据范围；
  - 没有正在运行的 DOSBox；
  - manifest 与 EXE 指纹，以及配方的 `source`；
  - 配方的位置与窗口对照 LE 映像；
  - `gameSettings` 能否应用。
- **准备与启动：**
  1. 取得会话锁，新建运行目录，先写一份未完成状态的报告。
  2. 对受保护文件与既有证据计算哈希（[原版文件保护](#原版文件保护与意外变化)）。
  3. 建立私有副本与私有配置，应用游戏设置。
  4. 以 `-conf <私有配置> -defaultmapper -break-start -fastlaunch -nogui -nomenu` 启动自有的 DOSBox-X，并证明进程归属。
- **测量与收尾：** 在启动阶段建立 CODE/DATA 对应，然后依次取各暂停点；最后回收进程，核对文件，写出最终报告。

### 阶段与应答

终端每次状态变化打印一行（`phase=… pause=… signal=…`），同样的内容写在运行目录的 `status.json` 中：`phase`、`utc`、`pause`、`signal`（相对路径）与 `expects`（可用的应答，以及配方的 `mission` 与 `config`）。

| 阶段 | 含义 | 操作者 |
|---|---|---|
| `launching` | 启动自有的 DOSBox-X | 等待 |
| `mapping` | 在启动阶段的 VRT 停止中建立对象对应，07 中约 20 秒 | 等待。仿真器在这一阶段反复停止，不能操作 |
| `running pause=<id>` | 已布下断点并让游戏运行，`signal` 指向 `operator/abort.json` | 开始或继续操作，在要求的状态触发停止 |
| `awaiting-confirmation pause=<id>` | 停在暂停点，等待 `operator/<id>-<n>.json` | 运行者核对画面后应答 |
| `reading pause=<id>` | 读取字段；游戏画面冻结，07 中为几秒到约半分钟 | 等画面恢复 |
| `input pause=<id>` | 读字段之后施加该暂停点的刺激，逐个写入并回读 | 等待 |
| `finished` | 全部暂停点完成 | 工具回收仿真器，写出最终报告 |

VRT 暂停点没有 `running` 阶段：工具运行到下一次回扫就停止。没有字段的暂停点没有 `awaiting-confirmation` 与 `reading`。

应答文件写在 `operator/` 中，内容是 JSON 对象，至多 4 KiB，键不得重复：

- **确认：** `{"action": "confirm", "mission": {…}, "config": {…}}`，恰好这三个键。
  - `mission` 与 `config` 照抄 `expects` 中配方的身份，只在观察核实状态之后声明。
  - `config` 中的仿真器键（`cycles`、`core`、`cputype`、`machine`、`memsize`）由工具按私有配置的实际值替换。
  - 身份与配方不符时，该暂停点的样本记为 `identity-mismatch`，运行不会 `complete`。
- **跳过：** `{"action": "skip"}`，表示这次停止不算。工具重新运行到同一暂停点，并改为等待 `<id>-<n+1>.json`。只在测量窗口开始之前使用（例如第一个标记触发得太早）。跳过之后，该窗口的宿主时长只覆盖最后一段运行（[计时](#计时游戏时钟与参考钟)）。
- **中止：** 写入 `{"action": "abort"}` 作为应答，或在任何时候创建 `operator/abort.json`（任何内容均可）。
  - `abort.json` 只在等待停止或等待应答时被检查。
  - 建立对应或读数时要立即停止，向工具进程发送 Ctrl-C 或 SIGTERM。不要直接结束 DOSBox-X，由工具回收它。
  - 两种方式都以 `cancelled` 报告结束（退出码 3）。

应答必须原子写入：先在 `operator/` 中以另一个名字写好，再改名。写到一半的文件、多余的键、超出大小或符号链接，都会以 `operator-invalid` 使运行失败。

```sh
d=local/research/<任务>/<主题>/<运行 ID>/operator
printf '%s\n' '<应答 JSON>' > "$d/.<暂停点>-<n>.tmp"
mv "$d/.<暂停点>-<n>.tmp" "$d/<暂停点>-<n>.json"
```

### 合格运行的操作

以下按 07 的实际运行整理，操作手册与方案只放在 `local/`：

- **开始前：** 向用户交代操作手册，包括进入路线、窗口内的驾驶方式、禁止的按键，以及哪些情况要立即报告。
- **开始操作：** 终端出现第一个暂停点的 `running` 后，用户才开始操作。先点一次游戏窗口取得键盘焦点；鼠标被 DOSBox-X 捕获时，用其释放键（默认映射为 Ctrl+F10）释放。
- **窗口内：** 每次运行按同样的方式操作。除非这正是测量对象，不得打开菜单、地图或通讯，不得暂停、改变视角或结束当前状态（例如进入结果画面、被毁或救援）。
- **每次确认前：** 对照操作手册核对冻结的画面（Computer Use 截图或用户报告），再选择确认、跳过（只在第一个暂停点）或中止。
- **中止并重做的情形：**
  - 窗口内发生了禁止事项；
  - 场景状态提前结束；
  - 用户需要停下。

  重做时，同一配置用下一个空闲的运行 ID。未 `complete` 的运行不计入统计，但保留其目录，并在记录中列为“排除”，写明原因（例如 B-006 排除的 `tb-c40000-01`）。
- **配置顺序：** 交错安排不同配置的运行（例如 A、B、B、A），减小宿主状态随时间漂移的影响。
- **每次运行后：** 按[证据的存放与自有资源清理](#证据的存放与自有资源清理)核对运行结果，再开始下一次。

### 烟测

`--smoke` 不等待操作者：每个暂停点都自动以任务身份 `{"context": "startup"}` 与空的配置声明确认，报告记录 `mode: smoke` 与 `measurementEvidence: false`。它不改写配方的暂停点，所以要用专门的烟测配方：

- 每个停止点都必须无需操作者即可到达（VRT 停止、启动过程中必然命中的断点，或由配方刺激带到的断点）；需要人操作才能到达的断点会等到 `wait-timeout`。
- `identity.mission` 为 `{"context": "startup"}`，`identity.config` 只含仿真器键（例如 `{"cycles": 40000}`，由工具按私有配置填入）；否则样本为 `identity-mismatch`。

烟测只核对工具与环境，永远不能作为测量证据。

## 模拟器内输入

配方可以声明刺激（P3-06/22）：工具在暂停点用 DOSBox-X 调试器的 `SMV` 命令改写被暂停的客户机内存，由原版自己的读取路径取得这一输入。它不产生宿主键盘或鼠标事件，也不经 DOSBox-X 的映射器。第一次使用是 [P3-06/22](../plan/p3/06/subtasks/22-agent-driven-input.md) 的烟测：只用配方按键进入所选任务的飞行，在飞行中施加油门键，并写入一次摇杆偏转，全程没有宿主输入。

### 通道与取值

| `kind` | 键 | 写入 | 原版如何读到 |
|---|---|---|---|
| `key` | `ascii`、`scan`（各 0–255） | BIOS 键盘缓冲：头指针 `0x41A`、尾指针 `0x41C`，缓冲边界在 `0x480`/`0x482`。把 ASCII 与扫描码写在尾部，再推进尾指针。缓冲必须为空 | DOSBox-X 的 DOS 控制台与 INT 16h 从这一缓冲取键，原版经 INT 21h 0Bh/07h 读键（[输入轮询](../original/formats/executable.md#input-polling-p3-0201)） |
| `shift` | `flags`：`rshift`、`lshift`、`ctrl`、`alt`、`caps` 到布尔值的对象 | BIOS 换档标志字节 `0x417`：列出的位置 1 或清 0，其余位不变 | 原版直接读这一字节 |
| `device` | `device`（`devices` 中的 ID）、`value`（按字段类型的整数） | 声明的输入设备状态字段 | 原版自己的设备读取与变化比较 |

- 刺激在暂停点的字段读数之后，按配方顺序施加。同一暂停点至多一个按键：原版每次轮询只处理一个键，其余读出丢弃（[输入轮询](../original/formats/executable.md#input-polling-p3-0201)）。
- 读字段的暂停点上，只有身份与停止证据合格时才施加刺激：任一样本带 `identity-mismatch`、`stop-unverified` 或 `owner-changed`，或暂停点级的读取失败（例如对应关系变化），都以 `stimulus-rejected` 拒绝，什么也不写。
- 每次写入都先读写前字节与页查找，再用 `SMV` 写入，并要求调试器确认写入的字节数，然后回读。回读须等于写入值，前后页查找须相同。BIOS 数据区所在的页须是恒等映射（线性页 0 对应物理页 0），因为 BIOS 与 DOS 的读键代码按物理地址访问它。该暂停点的刺激全部写完后再核对寄存器未变，然后才把它们记为已施加。
- 写入的每个值都带前导 0（例如 `0AF`），以免调试器把 `AF`、`CF`、`DF` 解释为标志名。
- 只能写声明的通道：BIOS 键盘缓冲的尾槽与尾指针、换档标志字节，以及 `devices` 中声明的字段。被测的运动、控制或任务状态不得声明为设备。

### 选择暂停点

- 刺激在原版下一次读取时才生效。按键的暂停点应位于原版检查键盘之前，并确定处于目标画面，例如页面读键函数的入口，或飞行键盘轮询中已通过到期判断、尚未调用 INT 21h 0Bh 的位置。页面载入时会清空键盘缓冲，不要在载入之前施加。
- 同一断点在多个画面命中时，用不读字段的“门”暂停点把刺激限定在预期画面，例如页面调度的入口（`stop.json` 的寄存器记录页面号）。
- 设备字段在设备读取之后、变化比较之前写入，原版才把它当作新的设备值。原版只在设备值变化时应用；保持偏转与回到零各需要怎样的写入或读取，以相应的原版文档为准。
- 写入时模拟时间不前进。刺激只改变输入，不改变游戏状态；后续暂停点的读数要证明原版按自己的路径处理了它，例如键处理函数入口的 AL、已经清空的缓冲，以及按预期变化的状态字段。

### 刺激记录

报告的 `stimuli` 与 `pauses/<id>/stimuli.json` 逐条记录：

- `id`、`pause`、`kind`、`status`、`utc`，以及该暂停点的 `emulatedMs` 与 `cycleCount`。`status` 为 `applied`；或为结束运行的原因码，另有 `detail`；或为 `written`：已写入并回读，但同一暂停点后面的刺激或寄存器核对失败，所以不算已施加；
- 每次写入的 `channel`、`linear`、`before`、`written`、`readback` 与 `pages`；
- 按键另记 `key` 与写入前的缓冲指针和边界，换档记 `flags`，设备记 `device` 与 `value`。

`stop.json` 另有 `stimuli`（记录文件）与 `registersUnchangedAfterStimuli`。

刺激失败即结束运行：

- `stimulus-rejected`：施加前的条件不满足。`detail` 为 `pause-<原因码>`（暂停点不合格）、`key-buffer-busy`（缓冲非空）、`key-buffer-invalid`、`mapping-not-identity`、`mapping-unverified`、`device-out-of-range`、`context-unqualified`，或读数错误码。
- `stimulus-unverified`：调试器没有确认写入（`write-unacknowledged`）、回读不一致（`readback-mismatch`）、页查找改变（`mapping-changed`）或寄存器改变（`registers-changed`）。

刺激没有全部施加时，报告另有 `stimuli-missing`。

### agent 独自运行

1. 用代码与已有记录确定每个输入的暂停点与取值，写进配方。读字段的暂停点用 `identity.checks` 证实配方身份的每一项：agent 不看画面时，身份声明只能由检查读数支持。
2. 预检与运行同[运行](#运行)。agent 作为操作者，在每个 `awaiting-confirmation` 核对 `status.json` 中的暂停点，然后原子写入确认，`mission` 与 `config` 照抄 `expects`。这一步可以交给只写应答文件的本地脚本。
3. 运行后核对报告：`status` 为 `complete`，`stimuli` 全部为 `applied`，并按方案核对每个刺激在后续读数中的效果。

### 不采用的方式

- **宿主层输入：** 用 shell、AppleScript、Computer Use 或其他自动化向 DOSBox-X 窗口发送按键，仍然禁止。
- **DOSBox-X 的 `AUTOTYPE`：** 它在宿主线程上按宿主时间等待与间隔（DOSBox-X 源码 `src/gui/sdl_mapper.cpp` 的 `Typer`），调试器暂停时照样发键，而且只能发键盘事件。按键时刻因此不受暂停点控制，不用于测量运行。
- **模拟摇杆：** 私有配置启用 DOSBox-X 的游戏端口摇杆后，摇杆位置只随宿主事件或映射器事件变化，调试器没有命令能设定它。转向输入因此改为写设备状态字段。

## 场景的进入与配置记录

- **进入场景：** 在私有运行中从启动开始正常游玩，进入所选场景。
  - 进入路线可以由配方的按键刺激完成（[模拟器内输入](#模拟器内输入)）：每个键都是玩家在该画面能按的键，经原版自己的读键路径生效。工具不经宿主注入输入；Computer Use 的权限、启动与输入规则见[原版证据获取](./original-evidence.md#agent-运行原版)，本机限制见[上文](#角色单一会话与本机限制)。
  - 不得改写内存或游戏状态来证明某个状态正常可达；刺激只写输入通道，不写被测的游戏状态。
- **即时存档：** 当前工具不管理即时存档，P3-01 也未使用。若将来用即时存档缩短准备过程，存档只能放在本次运行目录中，并须重新核对来源、任务与配置；对象对应照样在每个进程中重新建立。
- **难度与僚机：**
  - 记录原始难度值，不记难度组，并写明用的是练习值还是战役值；同时记录僚机选择。
  - 这些值写入 `identity.config`，并用 `identity.checks` 在每个暂停点读取内存中的对应值加以证实，不能只凭操作者的声明。
  - 原版事实见 [scenario 的难度读取](../original/formats/scenario.md#difficulty-readers-p3-01)与 [B-003](../original/behavior/B-003-campaign-flow.md)。
- **私有配置与 cycles：** 记录实际配置，而不是假定私有副本满足基准设置。报告的 `environment.emulator` 包含：
  - 私有配置与基准配置的哈希（`configSha256`、`baselineConfigSha256`）；
  - 改动行（`changedLines`、`changes`：`captures`、`mount-c`、`cycles`）；
  - 实际写入的设置（`settings`：`cycles`、`core`、`cputype`、`machine`、`memsize`）；
  - 挂载的介质（`media`）。

  测量从不修改基准配置；cycles 只经配方改变。
- **游戏设置：** 报告的 `gameConfig` 记录私有副本设置文件的 `sha256` 与开始时生效的 `settings`。使用 `gameSettings` 时另有 `overrides.requested`（配方声明的值）与 `overrides.before`（改写前的 `sha256` 与 `settings`）；不使用时没有 `overrides`。游戏在运行中自己写入或新增的文件列在 `integrity.privateCopyWrites` 中。
- **其他身份：** `environment.manifest`（基准版本与核验的文件数）、`environment.host`、`environment.process`（自有 PID 与进程组）与 `environment.startupMapping`。

## 读数的合格条件

样本只有在下列条件全部满足时才是 `qualified`；否则为 `unqualified`，值为 `null`（绝不补零），并附原因码：

- **对象对应：**
  - 在本进程启动时建立：CODE 窗口在指定对象中唯一匹配，DATA 窗口及其指针相符，见 [executable](../original/formats/executable.md#bounded-runtime-codedata-object-correlation)。
  - 在本暂停点重新核对，基址不变；否则为 `mapping-changed`。
- **停止：**
  - 暂停时处于 32 位保护分页模式，CS/DS 为平坦段。
  - 断点有登记确认、原生列表中只有它，且命中位置等于登记位置。否则为 `breakpoint-unconfirmed` 或 `breakpoint-wrong-hit`，二者都使整次运行失败。
  - VRT 停止要有 `VRT` 命令从运行到停止的转换。
  - 读数前后寄存器不变；否则为 `stop-unverified`。
- **可读性：**
  - 每一跳都读满，没有缺页标记（`read-fault`）或短读（`read-short`）。
  - 指针非空、在范围内，没有溢出或循环；链深不超过 `maxChainDepth`。
- **重复：** 至少两遍读数，且完全一致（`repeat-insufficient`、`repeat-mismatch`）。
- **映射与所有者：** 涉及的每一页在读前、读中、读后的页查找都相同，地址空间所有者（PID 与 CR3）不变（`mapping-unverified`、`mapping-changed`、`owner-changed`）。可读性的边界见 [executable](../original/formats/executable.md#watch-registration-and-address-space-availability-boundary)。
- **身份：** 操作者的声明等于配方身份，而且每个身份检查字段都合格并等于给定值；否则该暂停点的全部样本记为 `identity-mismatch`。
- **数值：** `f32` 必须是有限值（`value-nonfinite`）。

暂停点级的失败（例如 CODE 窗口不再匹配）使该暂停点的全部样本不合格，并写入 `unavailable` 证明；运行照常结束并写报告，但不会 `complete`。每个暂停点的证明在 `pauses/<id>/` 中（`stop.json`、`mapping.json`、`identity.json`、`reads.json`），启动对应在 `mapping-startup.json` 中。

只有同时满足以下条件，报告才是 `complete`：

- 计划的样本全部按顺序取得，且每个必需样本都合格；
- 配方声明的刺激全部按顺序施加并回读一致（只适用于声明了刺激的配方）；
- 文件保护与进程回收都通过；
- 运行正常结束，未取消。

其余情况为 `failed` 或 `cancelled`。合格的前缀不算合格运行。

## 计时：游戏时钟与参考钟

- **游戏计时：** 从内存读到的计数器，例如游戏时钟、帧计数与步长。它们的差值不能反过来证明自身的频率。
- **独立参考：** 来自每个暂停点的 `pauses/<id>/stop.json`。
  - `registers.emulatedMs`：调试器寄存器栏显示的模拟器（PIC）时间，单位毫秒，即模拟器时间参考。
  - `registers.cycleCount`：CPU 周期计数，只用来核对 cycles 设置是否生效。它可能回绕，可用“固定 cycles × 模拟器时间差”作参照展开。
  - `waitedSeconds`：宿主单调时钟上，从发出运行命令到检测到停止的时长，含工具等待屏幕静默的时间。它比真实运行时长多 0.05 秒到约 1.05 秒，且无法逐窗校正，判定时按整个区间计入。
  - 同时记录模拟器时间与宿主时间的关系（实时因子），以及未能测得的部分。
- **窗口：** 两个相邻暂停点之间的一次运行。调试器停住仿真器时，模拟器时间与游戏计数都不前进，所以确认与读数时间自动排除在外，宿主时长也只计这段运行。用过 `skip` 的窗口，宿主时长只覆盖最后一段运行，应记为不可用。
- **暂停排除：** 窗口内游戏自身的暂停、菜单、输入等待、过场、被毁与救援，调试器都不会排除。
  - 要用窗口两端读到的状态字段（字段见相应的原版文档，例如 B-006 的时间隔离）与操作规则来排除，两端不符的窗口作废。
  - 无法排除的时段要计入误差预算，或者让窗口避开它。
- **窗口边界：** 选择由操作者有意触发的停止点，并有代码证据表明它不改变游戏状态（例如 [B-006](../original/behavior/B-006-simulation-timing.md#场景与输入) 的标记键）。不要选每帧都会命中的位置：工具读完一个暂停点后会立即布下下一个断点并运行，这样只能得到一帧长的窗口。
- **帧与绘制次数：** 只取自有代码依据的计数器，不得用显示器刷新率、捕获帧率、截图或工具轮询次数代替。
- **误差预算：** 计入每窗分辨率（计数相位、取整）、边界延迟、宿主边界区间，以及窗口间与运行间的离散程度。每个配置都要有多次独立运行；B-006 要求每个配置至少 2 次 `complete` 运行、合计至少 3 个有效窗口。
- **cycles：** 所有计时证据都要写明 cycles。在所选任务中，游戏时钟相对模拟器时间的速率与帧率都依赖 cycles（[B-006](../original/behavior/B-006-simulation-timing.md#依赖判定)）。[U-021](../original/unknowns.md) 冻结之前：
  - 计时结论只适用于所测的配置；
  - 最终数值验收须在冻结后的配置下核对适用性，必要时重测；
  - 比较不同 cycles 时只用配方的 `emulator.cycles`，不改基准配置。

## Capture 截图与录像

- **输出位置：** 私有配置把 DOSBox-X 的 `captures` 重定向到运行目录的 `captures/`。基准的 `local/StarRang/captures/` 受严格保护，运行期间在那里新增文件会使运行失败。
- **操作方式：** 工具以 `-nogui -nomenu` 启动，没有菜单栏，也就没有 **Capture** 菜单，只能用 DOSBox-X 映射器的捕获快捷键（`-defaultmapper` 下为默认映射）。
  - P3-01 的合格运行都没有使用捕获，本机尚未在工具运行中验证过这条途径。第一次使用时，先确认文件确实写进了运行目录的 `captures/`。
- **证据的用途：** 捕获文件是原始像素，可用来判断分辨率与颜色。它只说明画面状态，不能代替读数；其帧率也不是游戏帧率。Computer Use 截图是缩放后的图像，只能用于观察状态。
- **存放：** 截图与录像只放在 `local/`，文档中只写相对路径。

## 原版文件保护与意外变化

- **私有副本：** 游戏只在运行目录的私有副本中运行。
  - 副本由独立的普通文件组成，没有符号链接或硬链接，并按 [manifest](../original/manifest.md) 核对。
  - 私有配置与基准配置只差三处：重定向的 `captures`、C 盘挂载，以及配方声明的 cycles。
  - 光盘按只读 CD-ROM 挂载，并绑定到 manifest 中已核验的镜像。
  - 游戏的存档、缓存与交换文件都写在私有副本中。
- **默认保护范围：** 运行前后计算哈希并比较。
  - `local/StarRang/` 整个目录严格保护：任何修改、删除或新增都使运行失败。
  - `local/research/` 中的既有文件（本次运行目录除外）：被修改或删除即失败，新增文件不受影响。
- **缩小的证据范围（`--evidence`）：** 其他会话在 `local/research/` 的别处同时写入时（例如并行执行中的 Ghidra 研究会改写各自私有项目的索引文件与笔记），默认范围会把这些写入判为 `original-changed`。这时用 `--evidence` 指定包含本次运行的主题目录，例如 `local/research/<任务>/<主题>`：
  - 只有该目录中的既有文件受保护；研究根目录其余部分的变化不再被发现，所以这一保证比默认范围窄。
  - `local/StarRang/` 的严格保护、快照、私有副本与 manifest 核对完全不变。
  - 报告的 `environment.protection` 记录 `evidenceScope`（`research-root` 或 `declared`）与 `evidenceRoots`。
  - 没有其他会话写入时不要使用它。
  - 前后清单写在 `protection/before.json` 与 `after.json`。快照 `protection/before/` 保存快照范围内除已按 manifest 核验的原版文件以外的全部文件，核对通过后删除。
- **运行期间的规则：** 不要动 `local/StarRang/`，也不要修改 `local/research/` 中已有的文件，包括其他主题的方案与笔记；其他会话同样如此。新的笔记可以写成新文件，或在运行结束后再改。
- **意外变化时：**
  - 工具记录 `original-changed` 与 `integrity.passed: false`，列出 `changed`、`removed`、`added`，保留快照，并把当前文件另存到 `protection/current/`。
  - 工具从不还原或删除任何文件（`restored: false`）。
  - 停止所有运行，把这些清单报告给用户。只有在用户确认变化的归属并明确授权后才能恢复，不得覆盖用户或其他进程的新进度与新文件。

## 报告、退出码与原因码

报告是运行目录中的 `report.json`。工具先写入未完成状态（`run.end` 为 `null`，原因含 `run-unfinished`），结束时原子替换为最终状态。未完成的报告不能当作证据。

| 字段 | 内容 |
|---|---|
| `status`、`reasons` | `complete`、`failed` 或 `cancelled`，以及稳定的原因码 |
| `recipe` | 配方 ID 与指纹 |
| `tool` | 工具版本与生产模块的源码摘要 |
| `source` | 基准版本与 EXE 指纹 |
| `environment` | `mode` 与 `measurementEvidence`、`host`、`manifest`、`protection`、`emulator`、`privateCopy`、`process`、`startupMapping` |
| `gameConfig` | 见[场景的进入与配置记录](#场景的进入与配置记录) |
| `run` | `start` 与 `end`（UTC、`elapsedSeconds`、`endedBy`） |
| `samples` | 每个样本：暂停点、字段、`status`、类型、单位、`required`、值、原因码与证明引用 |
| `stimuli` | 只在配方声明了刺激时出现：施加或尝试过的每个刺激，见[刺激记录](#刺激记录) |
| `counts` | `planned`、`actual`、`qualified`、`requiredPlanned`、`requiredQualified`；声明了刺激时另有 `stimuliPlanned`、`stimuliApplied` |
| `integrity` | 保护核对结果与 `privateCopyWrites` |
| `cleanup` | 回收结果，见下 |

终端只打印阶段、原因码、计数与相对路径，最后一行为 `status=… reasons=… samples=实际/计划 qualified=n report=local/research/…`，不显示读数、身份或绝对路径。

| 退出码 | 含义 |
|---|---|
| 0 | `complete` |
| 1 | 失败；包括最终报告无法写出的情况，此时终端的原因码含 `run-unfinished` |
| 2 | 运行前拒绝（预检、会话锁或建立运行目录失败），什么也没写 |
| 3 | 取消（操作者中止、`abort.json`、SIGINT 或 SIGTERM） |

原因码是封闭集合，完整列表见 [reasons.py](../../tools/baseline/reasons.py)：

| 类别 | 原因码 | 处理 |
|---|---|---|
| 配方 | `recipe-*` | 修正配方；退出码 2 |
| 来源与预检 | `source-mismatch`、`output-path-invalid`、`output-exists`、`evidence-scope-invalid`、`emulator-already-running`、`session-busy`、`game-config-invalid` | 来源不符时不运行，先查明原因；其余按原因码处理后重试 |
| 定位与对应 | `le-invalid`、`object-missing`、`object-not-executable`、`location-outside-object`、`window-outside-image`、`window-weak`、`code-unmatched`、`code-ambiguous`、`data-mismatch`、`mapping-contradiction`、`base-invalid`、`object-unmapped` | 检查配方的位置与窗口。预检阶段发现的退出码为 2；启动时始终无法建立对应则运行失败 |
| 读数 | `read-*`、`pointer-*`、`repeat-*`、`mapping-unverified`、`mapping-changed`、`owner-changed`、`stop-unverified`、`identity-mismatch`、`value-nonfinite` | 样本不合格；按[读数的合格条件](#读数的合格条件)查原因 |
| 运行 | `wait-timeout`、`run-timeout`、`child-exited`、`debugger-unparsed`、`breakpoint-unconfirmed`、`breakpoint-wrong-hit`、`operator-invalid`、`stimulus-rejected`、`stimulus-unverified`、`budget-exceeded`、`log-budget-exceeded`、`report-write-failed`、`emulator-unverified`、`private-copy-invalid`、`tool-error` | 结束运行；排除原因后用新的运行 ID 重做。刺激失败的细节见报告 `stimuli` 中该刺激的 `detail` |
| 结论 | `samples-*`、`stimuli-missing`、`integrity-failed`、`original-changed`、`cleanup-failed`、`run-unfinished`、`run-cancelled` | 不是合格运行；`original-changed` 与 `cleanup-failed` 须先停下报告 |

**回收（`cleanup`）：**

- 工具只向自有进程组发送 SIGTERM。3 秒宽限期后进程仍在，就升级为 SIGKILL；实测的运行中 DOSBox-X 都忽略了 SIGTERM。
- 之后至多等待 30 秒，要求子进程被回收、PID 与进程组都已消失。
- `signals` 列出发出的信号；macOS 上进程组只剩僵尸成员时，信号名带 `:zombie-group` 后缀。
- `killWait`：未发 SIGKILL 时为 `null`；否则为 `{seconds, limit, limitReached}`，即发出 SIGKILL 后实际等待的秒数、上限与是否到达上限。到达上限时 `passed` 为假，原因码为 `cleanup-failed`。
- P3-01/15 之后的运行中，SIGKILL 后约 0.06 秒进程即退出。

## 证据的存放与自有资源清理

```text
local/research/<任务>/<主题>/
  plan.md、procedure.md、run-notes.md、recipes/、scripts/、out/
  <运行 ID>/
    report.json、status.json、dosbox-x.conf、debugger.raw、commands.log、mapping-startup.json
    pauses/<暂停点>/（stop.json、mapping.json、identity.json、reads.json；有刺激时另有 stimuli.json）
    operator/、captures/、install/（私有副本）、protection/
```

- **受跟踪的记录只写：** 运行 ID、`status` 与计数、配方指纹、工具源码摘要、基准版本、配置哈希、统计量与判定。不写读数原值、刺激的写前与回读字节、截图或私人绝对路径，也不把运行目录中的任何内容复制进受跟踪文件。
- **保留全部运行目录：** 包括失败与取消的运行；排除的运行在记录中写明原因。不删除、不改写既有证据，这也是[原版文件保护](#原版文件保护与意外变化)的要求。
- **每次运行后：**
  - 记下运行 ID、退出码，以及报告的 `status`、`reasons`、`integrity.passed`、`cleanup.passed` 与 `killWait`。
  - 确认没有遗留的 DOSBox-X 进程，例如 `ps -A -o pid=,comm= | grep -i dosbox`。
  - 出现 `cleanup-failed`、有遗留进程或 `original-changed` 时，停止后续运行并报告，不启动替代运行。不终止不能证明属于本次运行的 DOSBox-X。
- **全部运行结束后：** 关闭自己启动的服务器、浏览器与其他进程，把基准环境交还给其他会话。

## 样本与容差的记录

原版行为的方法、样本与判定写进 B 文档，字段以[行为模板](../original/behavior/_template.md)为准，本指南不另定格式。工具的产物按模板各节对应填写：

- **原版版本与配置：** 报告的 `source`（基准版本与 EXE 指纹）；`environment.emulator`（基准配置哈希、实际 cycles 与改动的行）；`gameConfig`（游戏设置与 `overrides`）；配方身份，以及核实它的 `identity.checks`。
- **测量方法：** 采集前写定的[测量方案](#测量方案)（日期与 `local/` 下方案文件的相对路径），以及[计时](#计时游戏时钟与参考钟)中的参考钟、时间隔离与误差预算。
- **测量结果：** 每行一个运行或窗口，写运行 ID、配置与报告状态；排除的运行写明原因。只写统计量，不写读数原值。
- **验收容差：** 判据须事先经用户批准，写明批准记录；还要写明适用前提（例如基准 cycles 与 U-021）。

[B-006](../original/behavior/B-006-simulation-timing.md) 可作方法、cycles 与误差预算的参考，但它没有判据的事先批准记录，新记录须按模板补上。另外：

- **代码事实与待确认事项：** 代码事实写进相应的格式文档，并更新受影响的 `U-###`。
- **任务证据：** 只记安全身份、统计与判定，并链接 B 文档。

## 工具测试

修改 `tools/baseline/` 后运行：

```sh
python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'
```

它不属于 `pnpm check`。测试用代码生成的合成 LE 映像、假调试器与临时目录，不读取 `local/` 或原版文件（访问守卫会使这类读取失败），只依赖 Python 标准库。生产模块一变，报告中的 `tool.source` 摘要随之改变；不同工具版本的运行要在记录中分开写明。
