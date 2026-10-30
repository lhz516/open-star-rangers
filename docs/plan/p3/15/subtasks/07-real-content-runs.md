---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "07"
updated: "2026-10-29"
---

# 07 — 本地原版内容的成功/失败与重试

**契约来源：** [spec](../spec.md) 的 S-05、[行为与边界](../spec.md#行为与边界)“私有本地内容的完整任务运行”、[持久化与兼容](../spec.md#持久化与兼容)；AC-07。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在隔离的本机 Chrome 配置文件（不触碰用户现有站点数据）中，经正式导入页从 `local/StarRang/cd/` 的本地光盘镜像导入切片资源包；记录内容身份（包身份、manifest 与来源指纹的截断哈希、切片定义版本）与构建/提交。
- 按所选切片配置（group 0 / slot 1、原始难度 19；成功路径带僚机，失败路径可不带）分别走到成功与失败终态，并各自重试进入新运行。可在开发构建中只读读取状态辅助导航与瞄准，输入只经游戏输入区与页面控件；不写 Core 状态、不用调试结果。
- 核对：结果、总结选择、救援次数与终局分支与 [B-003](../../../../../docs/original/behavior/B-003-campaign-flow.md)、[B-005](../../../../../docs/original/behavior/B-005-campaign-rescue.md) 及 [P3-11/19](../../../../../docs/plan/p3/11/subtasks/19-real-content-check.md)、[P3-11/21](../../../../../docs/plan/p3/11/subtasks/21-comparison-conclusions.md) 的证据相符；涉及时间的比较注明 P3-11 原版样本为 `fixed 40000 cycles`（U-021）。
- 录制、截图、日志与笔记只存于 `local/research/p3-15/real-content/`；公开证据只写判定、计数、截断哈希与链接。

## 不包含

- 合成 E2E（01–04）；修改导入或规则代码；运行原版 DOSBox（只在发现确需补采的原版事实时，由协调者追加修复项）。

## 关键文件与契约

- [本地导入指南](../../../../../docs/guides/local-import.md)、[原版证据指南](../../../../../docs/guides/original-evidence.md)、[package-check.ts](../../../../../tools/package-check.ts)、[replay-check.ts](../../../../../tools/replay-check.ts)（可选的本地重放，只在本机）。

## 写入范围

- `local/research/p3-15/real-content/**`：私有运行记录与录制。

## 验收标准

- [x] AC-07：成功与失败两种实际流程均到达终态并各自完成重试；内容身份、设置、输入路径与结果已记录，并与 P3-11/B-003/B-005 的证据互相核对。
- [x] 不一致项作为差异交回责任任务；无法取得时登记阻塞、已尝试途径与恢复条件，不以合成 E2E 替代。
- [x] 仓库中没有原版内容、截图、录制或解码输出；`pnpm check:original` 通过。

## 验证方法

- 本机隔离浏览器实测（可用 Playwright 驱动本机 Chrome 或 Computer Use）；如录制导出，可在本机以 `node tools/replay-check.ts` 重放核对，结果只存 `local/`。

## 完成证据

**2026-10-29（worker，基于认领提交 3939be4d，受跟踪树干净）**

- **环境：** 本机 macOS 上已安装的 Google Chrome 156.0.8078.74，以 `--headless=new` 与本次新建、用后删除的临时 profile 启动（远程调试只开在 127.0.0.1），Playwright 1.63 经 CDP 附着；WebGL 2 可用（ANGLE Metal）。没有使用或改动用户自己的 Chrome profile 与站点数据。被测为开发构建：`pnpm dev --host 127.0.0.1 --port 5121 --strictPort`，与开发诊断同源。
- **导入与内容身份：** 经正式导入页：主菜单 `Import original game data` → 受信点击 `Disc files` 打开原生文件选择器 → 选择 `local/StarRang/cd/` 中同名的 CloneCD 四个文件（CDP 连接下 Playwright 拒绝传输 50 MB 以上的文件，故经协议的 `DOM.setFileInputFiles` 为该选择器的同一输入设置本机路径，页面收到正常的 change 事件）→ `Start import`。状态阶梯为 `Source identified`、`Complete resources, viewable`、`Saved in this browser`、`Mission loads into Core`，识别为 `star-rangers-1995-cd`。开发诊断读出的内容身份：schema 1、`classic-p2-slice`、切片定义版本 7、`osr-import.graphics-6.logic-4.audio-2.models-4`、manifest `sha256:b0ea7efd…aabac`、来源指纹 `sha256:67391efb…ddeb`（来源与 [P3-11/19](../../11/subtasks/19-real-content-check.md#完成证据) 相同；切片定义 6 → 7、图形组件 `graphics-5` → `graphics-6` 与 manifest 不同，来自 P3-13 引入的 P3-03 修订 4）；任务 `mission/first-campaign`，setupHash `5fb83dccb1efc507`（与 P3-11/19 相同）。
- **设置与输入路径：** 两次运行都从主菜单 `Start mission` 开始：介绍占位 G-02/1 用 `Skip` 结束，开始配置页显示 group 0 / slot 1 与固定难度 19，用僚机单选框选择后点 `Start`，出发占位 G-02/2 用 `Skip` 结束；诊断确认运行配置为 group 0 / slot 1、原始难度 19。飞行只经游戏输入区的受信键盘与鼠标：私有脚本按 P3-11/19 的驾驶方法改写为实时驾驶，只读任务 UI store 与开发诊断（事件日志，以及“Refresh state”同一处理函数的状态读取，直接调用以免焦点离开输入区）来导航与瞄准，按住项目操纵键转向、按住 Alt 开主炮，单次按键提交 Space、`t`、速度键、`e`/`s`、`c`/数字（命令僚机）、`m`、`w`，地图目的地以鼠标在主地图上点选（无头 Chrome 中 Pointer Lock 未生效，走既有的无锁绝对位置回退，选点前读回光标像素核对）。没有写入 Core 或 store、没有使用开发命令编辑器或调试结果；两份录制的命令只有上述按键与鼠标对应的类型。结束页的录制由面板的 `Export recording` 按钮导出。
- **成功运行（带僚机，名单第 2 项，`data-wingman=1`，种子 4108195642）：** 击毁全部计划敌机（玩家 9、僚机 7，共 16），tick 16986 全清，下一 tick `settlement-started`（成功，所选总结为区间索引 2、选择值 0），161 tick（322 单位，0x140 等待）后完成消息，又 481 tick（962 单位，0x3C0 结果延时）后锁存，tick 17630 退场完成；没有在结算等待中 Warp，首个窗口直接以完成消息结束（同 P3-11/19 的 `s1-nowarp`）。终局占位只有 G-02/8 `wingman`（僚机未损失），没有 G-02/9。结果页：Success、原因 all-clear、救援 `0 of 2`、击杀 9，总结状态 `text`，文字长度 25（与 P3-11/19 中比例 0 → 第 3 区间、选择值 0、25 字节一致；四座基地无一被毁，比例为 0）。
- **失败运行（不带僚机，种子 2666992570）：** 护盾降到 0 后接近敌机不还击，每阶段 2400 tick 后改为连续 Warp 耗尽能量（P3-11/19 F 族的方法）。tick 2847 能量耗尽 → 信标 → 481 tick 后能量救援 1（4 个候选，G-02/6）；tick 6580 第二次耗尽 → 救援 2（G-02/6）；tick 15611 第三次耗尽 → 信标到期于 tick 16092 锁存失败，tick 16093 退场完成。终局占位 G-02/7 `energy`；结果页：Failure、原因 third-loss:energy、救援 `2 of 2`、击杀 0、总结状态 `failure`。
- **重试：** 两个结果页各按 `Restart mission`：都回到 G-02/1，开始页预选上次的选择（成功后为第 2 项，失败后为 `No wingman`），出发占位变体相应为 `wingman`/`solo`；新运行 runId 2、tick 从 0 开始、种子不同（3783355299、2339758234）、阶段 normal、结果 in-progress、击杀全 0、能量满值、开局实例化的对象数与首次运行相同（带僚机 51、不带 50）；随后用页面 `Pause` 暂停并结束。失败后重开的运行另导出 51 tick 的录制，`node tools/replay-check.ts` 仅凭其配置与输入重放一致（`passed: true`、`{ match: true }`），说明新运行没有继承旧状态。
- **重放核对：** 成功与失败两份录制都用同一 CloneCD 文件组经 `node tools/replay-check.ts` 重放：`passed: true`、`{ match: true }`、`completed: true`（成功 17630 tick、9774 事件、552 检查点；失败 16093 tick、2178 事件、504 检查点）；身份键与上文相同。结果只存私有目录。
- **与原版证据核对：** 结果、总结选择、救援计数与终局分支均与 [B-003](../../../../../docs/original/behavior/B-003-campaign-flow.md#测量结果p3-1121)（全清 → 0x140 结算等待 → 完成消息 → 0x3C0 结果延时；比例按基地被毁选区间；返航变体按锁存时僚机状态；重开回到介绍并预选上次的僚机、统计清零）、[B-005](../../../../../docs/original/behavior/B-005-campaign-rescue.md#测量结果p3-1121)（前两次损失救援、第三次失败；能量耗尽后约 15 秒即 0x3C0 的信标等待；第三次损失在信标到期时于任务流程中失败）以及 [P3-11/19](../../11/subtasks/19-real-content-check.md#完成证据)、[P3-11/21](../../11/subtasks/21-comparison-conclusions.md#完成证据) 的新版运行与判定一致，没有发现差异，无需交回责任任务。本项只比较规则时钟单位与离散结果，不比较墙钟时长；P3-11 的原版样本取自 `fixed 40000 cycles`，受 U-021 约束，本项不把它们当作无条件的时间基准。三次损失都是能量耗尽，被毁入口（G-02/5、G-02/7 `destroyed`）未在本次浏览器运行中出现，由 P3-11/19、/21 覆盖。
- **私有材料：** 脚本、事件日志、报告、截图、录制与重放结果都在被忽略的 `local/research/p3-15/real-content/`（README 列出脚本与次序；调试与中途放弃的运行在 `out/trials/`，不计入：两次驾驶调试，以及两次失败尝试——一次未先打开能量页使护盾键被忽略，一次只接近敌机未遭损失）。临时 profile 已删除，开发服务器与浏览器已停止。
- **复核：** 本会话不能启动 rubber-duck 类型，改用只读 code-review 子代理按 AC-07 复核本证据与私有报告：所有数字、判定与身份一致，输入方式（只读状态读取、导入页的文件选择）与仓库隔离均无问题；唯一意见是身份说明误把版本变化归于“P3-13 的修订 4”并漏写转换器变化，已更正。
- **检查：** `pnpm build` 后 `pnpm check:original` 通过；`git status` 只显示本文件。没有实现代码改动，不需要 simplify；文档影响：只有本文件，指南、工程约定与原版记录都无需更新（没有新的原版事实）。
