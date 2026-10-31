---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "06"
updated: "2026-10-30"
---

# 06 — 修复后真实内容复跑

**契约来源：** [spec](../spec.md) 的 S-04、AC-07、AC-08（复跑部分）、AC-12，以及[技术决定](../spec.md#技术决定) 3 中“真实内容运行”一项。
**依赖：** 04、18、19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **方法：** 在含 04 修复的候选上，按 [P3-15/07](../../15/subtasks/07-real-content-runs.md#完成证据) 的私有方法，在隔离的本机 Chrome 中运行。使用新建、用后删除的临时 profile，经正式导入页导入 `local/StarRang/cd/` 镜像。
- **配置与运行组合：** 按 [P3-01 的闭环运行](../../01/spec.md#闭环运行)，group 0 / slot 1、原始难度 19：
  - 成功运行：覆盖 L-01 至 L-10，再经重试到 L-02；
  - 失败运行：经正常玩法到失败终态，再经重试到 L-02；
  - 两次运行合计至少一次带僚机、一次不带。

  不注入终态，不用强制胜负、改写内存或自动驾驶后门。
- **记录：** 内容身份（与 05 一致或写明差异）、提交、构建与运行时、种子、输入路径、结果、重试；并与 [B-003](../../../../original/behavior/B-003-campaign-flow.md)、[B-005](../../../../original/behavior/B-005-campaign-rescue.md) 及 P3-11 的条件核对。
- **失败处理：** 运行若遇到规则差异或故障，保留证据并交协调者新增修复项，不在本项修改产品代码。

## 不包含

- 原版 DOSBox-X 运行；合成 E2E（09）。

## 关键文件与契约

- [P3-15/07](../../15/subtasks/07-real-content-runs.md)、[本地导入指南](../../../../guides/local-import.md)、[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。

## 写入范围

- `local/research/p3-16/real-content/**`：私有脚本、记录与截图（被忽略）。

## 验收标准

- [x] AC-08、AC-12：最终候选上的成功与失败运行各自到达终态并完成重试，配置与 P3-01 组合一致，至少一次带僚机、一次不带。
- [x] 内容身份、种子、输入路径与结果已记录，并与 B-003、B-005 和 P3-11 一致；不一致已列为问题。
- [x] 没有使用用户的 Chrome profile；自有进程、端口与临时 profile 已清理；仓库没有原版内容。

## 验证方法

- 本机 Chrome 加 Playwright（经 CDP）或 Computer Use，按 browser-testing 核验真实观测；输出只在 `local/`。

## 完成证据

**2026-10-30（worker，基于认领提交 f2c61924，受跟踪树干净）**

- **候选与环境：** 提交 f2c61924（含 04 的 Core 门禁、18、19），`RULES_VERSION` 12；开发构建 `pnpm dev --host 127.0.0.1 --port 5120 --strictPort`。本机 Google Chrome 156.0.8078.74 以 `--headless=new` 启动，两次浏览器会话各用一个 `mktemp` 新建、用后删除的临时 profile（第二次会话为补跑 s2，重新导入），远程调试只开在 127.0.0.1:5121，Playwright 经 CDP 附着；WebGL 2 可用（ANGLE Metal）。没有使用或改动用户自己的 Chrome profile。
- **导入与内容身份：** 方法同 [P3-15/07](../../15/subtasks/07-real-content-runs.md#完成证据)（正式导入页、受信点击 `Disc files`、CDP `DOM.setFileInputFiles` 设置 `local/StarRang/cd/` 的 CloneCD 四个文件、`Start import`）。两次导入的状态阶梯都为 `Source identified`、`Complete resources, viewable`、`Saved in this browser`、`Mission loads into Core`，识别为 `star-rangers-1995-cd`。开发诊断与四份录制的身份相同：schema 1、`classic-p2-slice`、切片定义版本 7、`osr-import.graphics-6.logic-4.audio-2.models-4`、manifest `sha256:b0ea7efd…aabac`、来源 `sha256:67391efb…ddeb`、origin original-import，与 05 的完整身份及 P3-15/07 一致；任务 `mission/first-campaign`，setupHash `5fb83dccb1efc507`。
- **输入路径：** 三次运行都从主菜单 `Start mission`：G-02/1 `Skip` → 开始页显示 group 0 / slot 1 与固定难度 19，单选框选僚机后 `Start` → G-02/2 `Skip`；诊断与录制的 run 为 group 0 / slot 1、rawDifficulty 19、clockUnitsPerTick 2。飞行只经游戏输入区的受信键盘与鼠标，地图目的地以鼠标点选；驾驶脚本（P3-15/07 的私有脚本，另读通讯投影以导航菜单）只读任务 UI store 的 `getState` 与开发诊断；诊断读取调用面板“Refresh state”的同一处理函数，只更新诊断自己的读取缓存。没有写入 Core、命令队列、任务 store 或游戏状态，没有用命令编辑器、强制胜负、内存改写或自动驾驶后门；录制的命令类型只有下列按键与鼠标所对应的类型。相对 P3-15/07 的私有脚本只加了成功运行开头的停靠段（用于 L-04 的 `f`/`r`/`y` 与 L-08）和地图点选距边缘一像素的约束。
- **成功运行 s1（带僚机，名单第 2 项，种子 1249634149）：** L-03 至 L-08 都在同一页面运行内经过：Warp 到基地附近 → 飞近、`\` 停船 → `f` 进入友方模式（目标为僚机）、`r` 切到基地 → `c` 与菜单自身选项（含 kind 17 的类别 → 该基地 → 命令码 9），tick 2826 `docking-requested`，tick 3165 `docked`（僚机随停）与 G-02/3，基地页 11 行；停靠期间修理、能量与导弹、船体三项完成标志由 false 变为 true，能量回到 400000；`l` → tick 3489 `departed` 与 G-02/4。之后 `t` 选敌、按住 Alt 主炮与 Space 导弹、`m` 地图选点与 `w` Warp（全程 7 次 Warp），玩家击毁全部 16 架计划敌机（kind 7 共 12、kind 8 共 4）。tick 14395 `all-clear`，下一 tick `settlement-started`（success，所选总结为区间索引 2、选择值 0），161 tick（0x140）后完成消息，又 481 tick（0x3C0）后 tick 15038 锁存，tick 15039 退场完成；终局占位只有 G-02/8 `wingman`。结果页：Success、all-clear、救援 `0 of 2`、击杀 16、总结状态 `text`、长度 25。录制命令：toggle-map 14、map-point hover/select 各 7、request-warp 7、target friendly/next 各 1、enemy 17、communications 8、select-number 17、speed zero 1、launch 1、fire primary 2339、secondary 46，及速度命令；俯仰/偏航非零 1903 tick。
- **成功运行 s2（带僚机，名单第 2 项，种子 3478659710）：** 复核指出 s1 没有按 `y`，故在新浏览器会话中补跑一次完整成功运行，停靠段先各按一次 `r`、`y` 再切到基地：`f` → 僚机，`r` → 基地，`y` → 僚机，`r` → 基地（录制 target friendly 1、next 2、previous 1）；tick 2317 `docking-requested`，tick 2656 `docked` 与 G-02/3（僚机不在随停距离内），基地页 11 行、三项完成标志变为 true、能量 400000，tick 2982 `departed` 与 G-02/4。之后 9 次 Warp（后段多次 `request-warp` 因 `insufficient-energy` 被规则拒绝，驾驶脚本重试），16 架计划敌机全部消失（玩家 6、僚机 8、基地 2）；tick 26934 `all-clear`，26935 `settlement-started`（区间索引 2、选择值 0），27096 完成消息（161 tick），27577 锁存（481 tick），27578 退场完成；只有 G-02/8 `wingman`。结果页：Success、all-clear、`0 of 2`、击杀 6、`text`、长度 25。
- **失败运行 f1（不带僚机，种子 142790548）：** 同 P3-15/07 的 F 族：`e`、`s` 把护盾降到 0，接近敌机不还击，每阶段 2400 tick 后连续 Warp 耗尽能量。tick 3318 能量耗尽 → 信标 → 481 tick 后 tick 3799 救援 1（4 个候选，G-02/6）；tick 6847 → tick 7328 救援 2（G-02/6）；tick 10176 第三次耗尽 → 信标到期于 tick 10657 锁存失败，tick 10658 退场完成。终局占位 G-02/7 `energy`；结果页：Failure、third-loss:energy、救援 `2 of 2`、击杀 0、总结状态 `failure`。
- **重试（L-10 → L-02）：** 三个结果页各按 `Restart mission`，都回到 G-02/1，开始页预选上次的选择（第 2 项 / `No wingman`），出发占位变体为 `wingman`/`solo`；新运行 runId 2、tick 从 0 开始、种子不同（s1 后 1337484496、s2 后 2031029866、f1 后 914306300）、阶段 normal、结果 in-progress、击杀全 0、能量 400000，开局对象数与首次相同（带僚机 51、不带 50）；随后用页面 `Pause` 暂停。失败后重开的运行导出 49 tick 的录制。
- **重放核对：** `node tools/replay-check.ts <录制> local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`：s1 `passed: true`、`{ match: true }`、`completed: true`（15039 tick、6953 事件、471 检查点）；s2 同样通过（27578 tick、10252 事件、863 检查点）；f1 同样通过（10658 tick、1889 事件、335 检查点）；重开录制 `passed: true`、`{ match: true }`（49 tick，未完成）。四份录制均为 `osr-game-replay` 3、rulesVersion 12、checkpointInterval 32；SHA-256 前缀 s1 `026625ec…`、s2 `8f67a10a…`、f1 `e463af66…`、重开 `1797eaf6…`。
- **与原版证据核对：** 成功路径的全清 → 0x140 → 完成消息 → 0x3C0 → 锁存、总结区间（无基地被毁，比例 0 → 区间索引 2、选择值 0、25 字节）、返航变体按锁存时僚机状态、重开回到介绍并预选上次僚机与统计清零，与 [B-003](../../../../original/behavior/B-003-campaign-flow.md#测量结果p3-1121) 及 [P3-11/19](../../11/subtasks/19-real-content-check.md#完成证据) 一致；失败路径的前两次损失救援、第三次在 0x3C0 信标到期时失败、救援候选 4 个，与 [B-005](../../../../original/behavior/B-005-campaign-rescue.md#测量结果p3-1121) 及 P3-11/19、/21 一致。两次成功运行的结算时钟、总结选择与终局分支相同，所有离散结果与 P3-15/07 相同；击杀分配不同只来自种子与驾驶。只比较规则时钟单位与离散结果，不比较墙钟（U-021）。三次损失都是能量耗尽，被毁入口（G-02/5、G-02/7 `destroyed`）仍由 P3-11/19、/21 覆盖。没有发现规则差异或 Core 故障，没有需要交回的问题。
- **重试与试跑：** s1、f1 首次即达到终态；s2 是为补 `y` 的补跑（s1 仍有效，不是失败重试）。调试试跑不计入：一次只为读实体表而开始的运行，两次停靠段调试（一次因 tick 0 实体表为空未启动停靠且地图最后一列选点失败，一次停靠成功后按时限中止）。
- **私有材料与清理：** 脚本、README、事件日志、报告、截图、录制、重放与计数结果都在被忽略的 `local/research/p3-16/real-content/`（P3-15 的原脚本未改动）。浏览器与开发服务器已停止，临时 profile 已删除，5118–5129 无监听。
- **复核：** rubber-duck 对照契约与私有报告复核本证据：数字与判定一致；指出 s1 只按了 `r` 而没有 `y`（已以 s2 补跑覆盖），以及“没有写入 store”的说法过宽（诊断读取会更新诊断自己的读取缓存，已改为准确表述，不影响 Core、命令队列或游戏状态）。
- **检查：** 运行后 `pnpm build` 通过，`pnpm check:original` 为 `passed: true`、零 finding（补跑后重跑仍通过）；`git status` 只显示本文件。没有实现代码改动，不需要 simplify。文档影响：只有本文件；导入指南、browser-testing、工程约定与原版记录都无需更新（方法沿用 P3-15/07，没有新的原版事实）。

