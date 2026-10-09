---
type: plan
status: active
phase: P3
task: "01"
subtask: "02"
updated: 2026-10-08
---

# 02 — 调试器会话、私有运行与原版保护

**契约来源：** [spec](../spec.md) 的 S-05、AC-07（运行与失败部分）；[运行时测量](../spec.md#运行时测量)的会话与原版保护、有界生命周期、输出与失败、场景进入，[工具数据契约](../spec.md#工具数据契约)的运行结论；[持久化与兼容](../spec.md#持久化与兼容)；技术决定 4、9。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

在 `tools/baseline/` 中实现会话层与命令行入口，调用 01 的纯逻辑：

- **私有运行目录：** 在 `local/research/<任务>/<run-id>/` 中新建唯一目录，复制安装目录（拒绝符号链接与硬链接指向基准文件），按 [manifest](../../../../original/manifest.md) 核对来源哈希；从基准配置生成私有配置，只改指向私有副本的路径与配方允许的设置（例如 cycles），并在报告中记录本次实际配置及其哈希。游戏存档、缓存、截图与调试输出都在该目录；光盘镜像只读使用。
- **原版保护：** 运行前后对基准安装、`SRANGER.CFG`、`SRHISCOR.RAW`、基准配置与 `local/StarRang/` 下的既有文件计算哈希清单；有变化时报告失败并保留运行前快照与当前文件，不自动回写或删除任何文件。
- **调试器会话：** 用 PTY 启动 DOSBox-X 调试器，解析其屏幕输出，支持对象对应所需的暂停、读取、断点注册与列表核对、运行与停止；所有等待都有配方或命令行给出的有限上限。断点须取得注册确认、列表与实际命中位置；其他暂停方式须有自身可验证的停止凭据。
- **进程归属与回收：** 只对本次启动并已证明归属的 PID 操作；启动前检测到已有的 DOSBox-X 时拒绝运行，不附着、不终止它。正常结束、取消（SIGINT）、超时、解析失败或子进程意外退出都尝试回收；回收失败记入报告并以非零退出，不启动替代运行。
- **输出与退出码：** 报告先以未完成状态写入唯一的新文件，只有读数、完整性与清理都通过才改为 `complete`；拒绝覆盖已有证据、路径穿越与经符号链接逃出 `local/research/`。终端只输出稳定原因码、计数与安全的相对报告路径。非合格、取消、超时、清理失败与报告写入失败都以非零退出。
- **场景进入：** 工具不注入游戏输入，也不通过 shell 或 UI 自动按键；进入所选任务由 agent 用 Computer Use 操作游戏窗口。命令行提供在指定暂停点等待并读数的流程，以及与操作者确认进度的方式。
- **测试：** 以假调试器（合成屏幕输出）、合成 LE 映像与自有临时目录做端到端测试，覆盖 01 已有的全部拒绝类在命令行层面的结果，以及：断点未确认或命中错误位置、超时、取消、子进程退出、输出越界、覆盖或写入失败、原文件变化、回收失败。每类断言非零退出、没有 `complete` 报告、工具未改写已有文件，并已尝试回收自有资源。测试不读取 `local/` 或原版文件，不启动真实模拟器。
- **烟测：** 在真实基准环境中做一次只到启动暂停的运行（不进入任务、不注入输入）：私有副本、对象对应、断点注册与列表、回收与哈希核对都通过。它只证明工具能连上真实调试器，不满足 AC-08。

## 不包含

- 所选任务飞行状态中的合格读数与时基测量：归 07（AC-08）。
- 运行时测量指南与命令入口文档：归 11。
- 冻结或修改基准配置（U-021 归 P0）；跨系统适配。

## 关键文件与契约

- 计划新增：`tools/baseline/` 下的会话、私有运行与保护模块、命令行入口及其 `test_*.py`。
- 参考（被忽略，不复制）：`local/research/p2-12/map-frame/map-frame.py`、`mf_debugger.py`、`mf_flow.py`、`mf_fake.py` 的 PTY 会话、调试器屏幕解析、私有副本与启动参数；[基准环境](../../../../guides/baseline-environment.md)。
- 可读性与执行模式的边界见 [executable](../../../../original/formats/executable.md#watch-registration-and-address-space-availability-boundary)。

## 写入范围

- `tools/baseline/**`：会话层、命令行入口与测试。
- `local/research/p3-01/tool-smoke/**`：烟测的私有运行目录与报告（被忽略）。

## 验收标准

- [x] AC-07：端到端假调试器测试覆盖 spec 列出的全部拒绝类；每类非零退出、无 `complete` 报告、已有文件未被改写、已尝试回收自有资源；测试不读取原版文件或 `local/`。
- [x] 已有 DOSBox-X 进程时拒绝运行；只回收本次启动的进程；终端输出不含原版输出或私人绝对路径。
- [x] 烟测报告：私有副本与来源哈希、对象对应、断点注册与列表、回收与基准文件哈希核对都通过；明确记为烟测，不作为 AC-08 证据。
- [x] `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 退出码为 0；无新增第三方依赖。

## 验证方法

- 运行 unittest 命令；审阅源码中的路径检查、PID 归属与超时。
- 烟测由协调者在基准环境中运行（同一时间只有一个会话）；完成证据只记安全的报告路径、计数、原因码与哈希核对结果，不记读数。
- 不涉及浏览器。

## 完成证据

- **2026-10-08 — 实现（Python 3.12.3，仅标准库，`tools/baseline/` 平铺模块；调用 01 的配方、对应、判定与报告）：**
  - **命令行（[measure.py](../../../../../tools/baseline/measure.py)）：** `run --recipe <配方> --out local/research/<任务>/<主题> --run-id <id> [--smoke]` 与 `baseline-version`（打印由 manifest 行导出的基准版本记号与 EXE 指纹，供配方 `source` 填写）。退出码：0 `complete`、1 失败、2 运行前拒绝（不写任何文件）、3 取消。终端只有 `phase=…`、`status=… reasons=… samples=a/b qualified=n` 与 `local/research/…` 相对路径。
  - **预检与输出（[session.py](../../../../../tools/baseline/session.py)、[runfiles.py](../../../../../tools/baseline/runfiles.py)）：** 副作用之前完成配方解析、输出位置（运行 ID 与路径段为受限记号；拒绝 `..`、研究根本身、解析后越出 `local/research/` 与已存在目录）、已有 DOSBox 进程（进程表不可读也视为拒绝）、manifest 与 EXE 指纹、`verify_source` 与配方位置核对。之后在研究根目录上取得非阻塞独占锁（不建锁文件），整个运行期间持有；运行目录经不跟随链接的目录描述符逐级创建；所有文件独占新建，报告先写未完成状态再以不跟随链接的临时文件原子替换；每次写入前复核运行目录仍解析为自身。
  - **原版保护与私有副本（[protect.py](../../../../../tools/baseline/protect.py)）：** 运行前后对 `local/StarRang/`（严格：任何修改、删除或新增都失败）与整个 `local/research/`（除本次运行目录；既有文件被修改或删除即失败）计算哈希清单，前后清单写入 `protection/before.json`、`after.json`；快照包含安装目录、用户初始状态与基准配置中除已按 manifest 核验的原版文件外的全部文件，失败时保留快照并另存当前文件副本，从不回写或删除运行目录之外的文件。私有副本拒绝符号链接与特殊文件，逐个核对副本为独立 inode、链接数 1 且哈希与来源一致，再按 manifest 核对。私有配置只重定向唯一的 `captures` 与 C 盘挂载，可按配方 `emulator.cycles` 改写唯一的 cycles 行；要求恰好一个只读 CD-ROM 挂载（`-t cdrom`/`-t iso`），其描述文件引用的影像须为 manifest 已核验的 `.img`；其他挂载与日志、映射文件路径一律拒绝。报告记录实际配置哈希、改动行、仿真器设置、挂载介质与私有副本内的写入。
  - **进程（[processes.py](../../../../../tools/baseline/processes.py)）：** 在私有 50×160 PTY 上以新会话启动（进程组 ID 即 PID），以 `ps` 证明可执行名后才继续，启动后再次确认没有其他 DOSBox 进程（排除自有 PID）。回收只向自有进程组发送 SIGTERM，宽限期后升级为 SIGKILL（协调者实测标题画面忽略 SIGTERM），回收子进程并证明 PID 与进程组均已消失；macOS 上只剩僵尸成员时的 EPERM 单独记录。回收失败记 `cleanup-failed`，不启动替代运行。
  - **调试器（[screen.py](../../../../../tools/baseline/screen.py)、[debugger.py](../../../../../tools/baseline/debugger.py)）：** 自建 VT100 屏幕模型；输入行的 `(Running)`→提示符转换计为一次停止；每条命令后跟唯一的数据视图标记，以其确认划定响应范围；寄存器只从命令引起的整屏重绘后的寄存器窗格读取，并要求代码视图列出 CS:EIP。断点须有确认行、原生列表恰为该断点、命中时 CS:EIP 等于登记位置（`run_to_breakpoint`）；VRT 暂停的凭据为“提示符下发出 VRT 并观察到运行→停止”。线性读取按页与 7 行分块，`pf`/`na` 为 null，PHY 页脚须保留页内偏移才作为页查找；所有等待受配方单次等待与总时限约束，解析不了的屏幕报 `debugger-unparsed`。原始调试输出与命令记录只写运行目录并受日志字节预算约束。
  - **流程：** 启动后在 VRT 暂停中逐个尝试 CODE/DATA 对应（仅 Pr32、保护且分页、32 位平坦 CS/DS 的暂停；可重试的拒绝类最多 512 次），每个暂停点再在当前状态重读启动时的 CODE 位置与 DATA 窗口，基址不同为 `mapping-changed`；所有窗口、字段与页查找都计入配方的累计读取预算。普通模式下工具不注入任何输入：`status.json` 与终端给出等待阶段和信号文件路径，操作者（用 Computer Use 的 agent）写 `operator/<暂停点>-<n>.json`（`confirm` 附任务/配置身份、`skip` 或 `abort`），`operator/abort.json` 随时取消；仿真器设置（cycles 等）由工具从私有配置观察，覆盖操作者声明。烟测模式不等待操作者，任务身份固定为 `{"context": "startup"}`，报告记 `mode: smoke`、`measurementEvidence: false`。每个暂停点写 `pauses/<id>/` 下的停止、映射、身份与读数证明；暂停点级失败写 `unavailable` 证明并使该暂停点样本不合格。SIGINT/SIGTERM 与操作者中止均回收、核对并写 `cancelled` 报告。
  - **配方扩展：** 01 的配方新增可选 `emulator: {"cycles": 1000–2000000}`（spec“配方允许的设置”），计入配方指纹；原因码新增 `session-busy`、`emulator-unverified`、`operator-invalid`、`tool-error`。
- **验证：** `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`：136 项通过，退出码 0（约 13 秒）。新增 65 项：
  - [test_session.py](../../../../../tools/baseline/test_session.py)（假调试器 + 合成 LE + 临时目录的端到端运行）：完整运行（零值合格、证明文件齐全、私有配置只改两行）、烟测、cycles 设置与工具观察的身份、操作者跳过、命令行入口；运行前拒绝（配方各拒绝类、来源不符、定位与窗口不足、输出越界/穿越/符号链接逃逸/已存在、已有仿真器、会话锁被占用）均为退出码 2 且不建运行目录；运行失败类（启动前后出现其他仿真器、私有副本链接、断点未确认三种、错误命中、单次等待/总时限/准备阶段超时、操作者超时与非法回答、SIGINT 与两种中止、子进程退出、屏幕无法解析、日志预算、映射始终不成立、累计读取预算、只得有效前缀、回收失败、基准/证据/其他主题证据/新增文件变化、报告首次与最终写入失败）与暂停点级拒绝（缺页、短读、空指针、循环、溢出、越界、重复值变化、映射变化、所有者变化、停止未核实、身份字段不符、声明身份不符、非有限值、CODE 不匹配、DATA 不符、上下文不合格）均断言非零退出、无 `complete` 报告、运行目录外既有文件未变、已调用自有回收、终端只有原因码/计数/相对路径，失败样本的证明引用均存在。
  - [test_processes.py](../../../../../tools/baseline/test_processes.py)：以本模块的假调试器为子进程在真实 PTY 上运行：所有权证明、非仿真器可执行名被拒、忽略 SIGTERM 时升级到 SIGKILL（返回码 −9，PID 与进程组消失）、子进程退出检测、完整烟测运行与运行中子进程退出。
  - [test_debugger.py](../../../../../tools/baseline/test_debugger.py)、[test_protect.py](../../../../../tools/baseline/test_protect.py)、[test_runfiles.py](../../../../../tools/baseline/test_runfiles.py)：屏幕转义序列、寄存器窗格外的注入文本不被采信、故障标记与 PHY 偏移、断点列表不完整、manifest 与介质绑定（含 `.sub` 不可挂载）、硬链接副本、配置拒绝、保护不回写、目录替换与临时文件符号链接、写入前包含性复核、信号文件校验。
  - 测试只用临时目录与合成数据：各测试模块先导入 01 的访问守卫，假调试器子进程同样导入；测试支持文件不用原版文件名，临时根目录不命名为 `local`。本机本地只读预检（不属于测试，只打印原因码与计数）：烟测配方、真实 manifest、EXE 指纹、11 个安装文件与 2 个影像、真实基准配置的重定向（2 行）与挂载介质绑定均通过。
- **烟测（协调者 2026-10-08 在本 worktree 的真实基准环境运行，单一会话，无游戏输入；只到启动暂停）：** `python3 -B tools/baseline/measure.py run --recipe local/research/p3-01/tool-smoke/smoke-recipe.json --out local/research/p3-01/tool-smoke --run-id smoke-01 --smoke`，退出码 0，终端末行 `status=complete reasons=- samples=4/4 qualified=4 report=local/research/p3-01/tool-smoke/smoke-01/report.json`。被忽略的报告 `local/research/p3-01/tool-smoke/smoke-01/report.json` 记 `mode: smoke`、`measurementEvidence: false`，不作为 AC-08 证据：
  - **来源与私有副本：** 基准版本 `manifest-b9bfecb3bf772fbf` 与 EXE 指纹与 manifest 一致；基准安装 11 个、私有副本 11 个 manifest 文件与 2 个影像核验通过；私有副本 60 个文件、0 个链接，运行中只新增 1 个文件（游戏的临时交换文件）；私有配置改 2 行（captures、C 盘），cycles 40000，挂载介质为 manifest 已核验的 `.img`。
  - **对象对应：** 第 61 次 VRT 暂停建立（前 60 次非 32 位保护模式）；CODE 窗口 128 字节在 object 2 偏移 `0x67f2c` 唯一匹配，4 个指针推导 object 4 基址；DATA 窗口 64 字节在 object 4 偏移 `0x66b4`，14 个指针（10 个到 object 2、4 个到 object 4）相符；两对象位移不同，与 [executable](../../../../original/formats/executable.md#bounded-runtime-codedata-object-correlation) 已记的结论一致，无新事实。两个暂停点重验基址均与启动时相同。
  - **断点与暂停：** `loop-breakpoint` 取得登记确认、原生列表恰为 1 行、命中位置等于登记位置，读后寄存器未变；`next-retrace` 为 VRT 停止凭据。4 个样本（每个暂停点 2 个字段，各读 2 遍）全部合格；读前后页所有者一致。完成证据不记读数。
  - **保护与回收：** 受保护文件 201 个、既有证据 6823 个，前后清单无修改、删除或新增，快照在核验通过后删除；基准配置哈希与 P2-12 烟测记录的值相同。回收：SIGTERM 被忽略，宽限期后 SIGKILL，返回码 −9，PID 与进程组均已消失（再次证实协调者报告的宿主事实）。协调者另行核对：运行后没有遗留 DOSBox-X 进程，`local/StarRang` 安装目录、`baseline/` 与两份配置的哈希不变。全程约 24 秒、191 条调试器命令。
- **Rubber-duck：** 首轮 6 项阻塞与 1 项非阻塞全部采纳（研究根独占锁与启动后进程复核、窗口与页查找计入读取预算、证据范围扩为整个研究根并持久化前后清单与无大小上限的快照、CD 介质绑定与只读选项、准备阶段受总时限约束、目录描述符逐级创建与不跟随链接的状态写入、失败样本的证明文件），并补齐有效前缀、运行期读取预算与指针越界的端到端测试。复核后再采纳 2 项：`.sub` 不可作为挂载介质；哈希按 1 MiB 块检查时限。第 3 项（创建后祖先目录被替换为链接）以每次写入前的包含性复核缓解，不改为全量 `openat` 写入：剩余窗口仅为复核与打开之间，且仿真器本身也按路径写入运行目录。
- **Simplify：** 运行 ID/路径段共用 `report.RUN_ID`；EXE 指纹复用 `recipe.exe_fingerprint`；假调试器的屏幕尺寸与数据视图行数取自生产常量；删除未用状态（`Plan.exe_bytes`、`Startup` 的寄存器与次数、`Environment.repository`、调试器计数器、`Screen.text`）；屏幕行按版本缓存；工具身份只哈希生产模块并缓存；断点登记、运行、命中核对与删除归入 `Debugger.run_to_breakpoint`；`_locked` 拆为主体与收尾；`baseline-version` 的意外错误记 `tool-error`。未采纳：复用配方的私有 JSON 钩子与记号正则（错误码不同）、合并安装目录的重复哈希（安装目录约 15 MB，整次运行哈希约 1 秒）、日志缓冲写入（保留崩溃时的日志）、按类型返回可重试性（改动面大）。
- **文档影响：** 测试命令、工具用法与运行时测量指南（含操作者信号文件协议与 `baseline-version`）由 11 写入工程约定、`AGENTS.md`、[工具用法](../../../../guides/tools.md)与运行时测量指南；本项无原版事实或 U 项变化。
