---
type: plan
status: active
phase: P3
task: "01"
subtask: "10"
updated: 2026-10-09
---

# 10 — 数据闭包

**契约来源：** [spec](../spec.md) 的 S-06、AC-10、AC-14；[数据闭包](../spec.md#数据闭包)、[对下游任务的约束](../spec.md#对下游任务的约束)的 P3-03 行。
**依赖：** 02, 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **静态追踪：** 从 spec 列出的起点（`0x3266c`、`0x66c00`、`0x3ed0d`/`0x3cfbb`、`0x4ca80`/`0x49e00`、`0x2cbb4`、`0x39f34`、`0x6affc`、`0x1766b4`、`0x6a024`）出发，用只读 Ghidra 追踪所选任务中可达的载入：常量 ID、由数据表给出的 ID（例如 TABL 4003 到 CINF 4037）与闭环读取的 EXE 数据表。
- **运行时核对：** 静态结论不确定或 ID 在运行时计算时，由协调者用 02 的工具在私有基准运行中对载入函数设断点，核对实际请求的 ID；未观察到请求不等于证明不使用。
- **覆盖已知线索：** CINF 4037 的武器与机型记录、RENS 10751 中 P2 未导入的头部字段、SCEN 3019 段 2 的事件触发与消息、COMM.NOB 的通讯菜单表、EXPL/EXIC 与其引用的 ANIM、NEBC 与其 BITM、AISTUFF.NOB、SCCT 槽位的 MUSC，以及救援对象与救援船（B-005、U-028）。本项自行追踪它们的来源；05 若已完成，可参考其身份线索，但不以 05 为前提。
- **决定表：** 每项记录来源（文件、类型与条目，或 EXE 对象与偏移）、载入或消费地址、闭环用途与 L/R/V 关联、置信度、受影响的 U 项、已交付时的 Asset ID 与内容身份（`ContentIdentity`，见 [P2 退出评审](../../../../reviews/P2-exit.md#候选与证据身份)）、处理决定（P3-03 导入／已交付／代码规则或绘制，无新增资源／G 缺省，P4 补齐／有证据证明闭环不使用／待研究）与负责任务。Smacker 的处置以 08 的定类为准。决定表写在本项完成证据中，作为 P3-03 spec 的输入。
- **完成门槛：** 间接调用、运行时计算的 ID 与未追踪路径逐项记录；影响闭环的待研究来源或引用为零，否则本项 blocked。规则语义未明而来源与结构范围已确定的项，可带 U 项交负责任务。
- **记录：** 原版结构事实写入对应的格式文档（英文，如 imfat、hud、audio、scenario、executable）；受影响 U 项（例如 U-001、U-020、U-028）的线索更新，负责阶段不改。脚本与输出在 `local/research/p3-01/closure/`。

## 不包含

- 解析器、内容契约与切片定义的修订：归 P3-03。
- 规则语义的研究与实现：归负责的规则任务。

## 关键文件与契约

- [executable §4](../../../../original/formats/executable.md#4-code-landmarks)、[武器记录](../../../../original/formats/executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)、[效果来源](../../../../original/formats/executable.md#effect-presentation-sources)；[imfat](../../../../original/formats/imfat.md)；[audio](../../../../original/formats/audio.md)；[hud](../../../../original/formats/hud.md)；[scenario](../../../../original/formats/scenario.md)。
- 已交付内容：[slice-definition.ts](../../../../../src/content/slice-definition.ts) 与[生产包配置](../../../../../src/workers/production-package.ts)（只读）。
- 08 的完成证据（Smacker 的定类）；02 的工具；05 的完成证据（如已有）。

## 写入范围

- `docs/original/formats/*.md`：闭环载入数据的结构事实。
- `docs/original/unknowns.md`：受影响 U 项的线索（负责阶段不改）。
- `local/research/p3-01/closure/**`：研究脚本、Ghidra 输出、配方、私有运行目录与报告（被忽略）。

## 验收标准

- [x] AC-10：决定表覆盖全部起点、已知线索与 L/R/V 必需依赖；每项有来源、用途、引用边界、置信度与处置；已交付项绑定 Asset ID 与内容身份；“不使用”有证据；无新增资源的代码绘制单独归类。
- [x] 影响闭环的待研究来源或引用为零，否则本项 blocked；覆盖限制已写明。
- [x] 原版事实已写入格式文档；没有原版字节、文字或反编译代码；修改的文档 `updated:`、链接与锚点有效。

## 验证方法

- 只读 Ghidra 的载入调用分析；必要时用工具在私有基准运行中核对实际请求的 ID（报告只在 `local/`）。
- 以已交付的切片定义核对“已交付”项；文档链接与锚点检查。不涉及浏览器。

## 完成证据

**2026-10-09 — worker（`exec-p3-01-10`，基于认领提交 `686b1d9`）。** 静态完成，未做基准运行（宿主不能操作 DOSBox-X 进入任务，见 goal 执行记录）；所有结论来自只读 Ghidra 与本地数据，事实写在 [executable 的数据闭包一节](../../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)及下列格式文档。

### 方法与覆盖

- **载入接口（已确认）：** 同步载入 `0x6affc`（及跳转 `0x65e20`、`0x2cdd4`），按类型的 `0x65e28`（TEX）、`0x65e44`（MESH）、`0x65e84`（MODL 连同部件与音效），异步 `0x65d10`／`0x6b828`（经 `0x1766b4` 的按类型载入回调），驻留登记 `0x6a024`（不载入），封包打开 `0x6ac98`（按目录 `flags` 预载）。原始扫描找到 `0x6affc` 的 68 处直接调用及各包装函数、`0x6b3c0`、`0x6b420`、`0x6bc70` 的全部调用；这些函数的地址在映像中没有任何 32 位出现，因此没有经指针的间接调用。
- **常量 ID：** 对 9 个封包全部条目 ID 与 `COMMFACE` 的 20001–20995 做全映像 32 位扫描，得到 145 个代码立即数与数据对象中的 3 张 ID 表（`0x174c28`、`0x175478`、`0x175e8c`–`0x175ec7`），逐个归到载入点；其余命中不是操作数（`0x5b058`–`0x5b26e` 的 VESA 功能号、`0x53414`／`0x8a200` 的采样率）。
- **数据给出的 ID：** SCCT→SCEN／MUSC、TABL 4003→CINF、M2ID→MODL→MESH／TEX／SND、EXIC→EXPL→SND／ANIM、NEBC→BITM、TABL 10099→CCKD、TABL 10171→BITM、CINC→SONG、AISTUFF 程序表→TABL／DFPG、`COMMFACE` 的 4 个 TABL→TABL→CMOV。对闭环载入的其余条目（COMM、CINF 4037、DEBRIS 4501、SCENARIO TABL、RENS、DIAG、HUD 与地图 TABL、TABL 10165／10399／11375）扫描对齐的 32 位值，没有等于条目 ID 的值。
- **一致性核对：** 9 个按 ID 播放的音效恰为 `SR.NOB` 中 `flags` 为 0x50 的 9 个 SND；5 张通讯菜单恰为 `COMM.NOB` 中 0x50 的 5 个 TABL；`flags` 0x10 的 4 个条目都由启动初始化读取（[imfat §2](../../../../original/formats/imfat.md#2-directory-entry-36-bytes-confirmed-flags-meaning-unconfirmed)）。
- **spec 起点：** `0x3266c`（状态 2 的建造、状态 4 的完成消息、救援与失败的片段表）、`0x66c00`（SCEN／MUSC、CINF、星云、EXIC）、`0x3ed0d`／`0x3cfbb`（位于启动初始化 `0x3ec70` 内：RENS、导弹、受击闪烁、碎片、调色板）、`0x4ca80`／`0x49e00`（HUD 组、地图 TABL；由 HUD 初始化 `0x49440` 与视角切换 `0x3f158` 调用）、`0x2cbb4`（通讯菜单）、`0x39f34`（片段与 SONG）、`0x6affc`、`0x1766b4`、`0x6a024` 全部追踪，结果见下表。
- **本地产物（被忽略）：** `local/research/p3-01/closure/`：`ghidra_scripts/ClosureProbe.java`、`probe.sh`、`out/p1`–`out/p56`、`out/id-immediates.txt`、`out/nob-entries.txt`；`id-tables.ts`、`aistuff-comm.ts`、`commface-lists.ts`、`data-id-refs.ts`、`model-meshes.ts`、`tabl-10165.ts`、`slot-musc.ts`、`delivered.ts` 与其 `out/*.json`／`.tsv`（只含条目 ID、偏移、计数与 Asset ID）。Ghidra 用 `-noanalysis -readOnly` 打开私有副本，内存中的函数与 `__watcall` 均丢弃。

### 决定表

**已交付项的内容身份：** 均为 [P2 退出评审](../../../../reviews/P2-exit.md#候选与证据身份)记录的 `ContentIdentity`：schema 1，切片 `classic-p2-slice` 定义版本 3，`ConverterVersion` `osr-import.graphics-3.logic-1.audio-1.models-3`，manifest `manifest:sha256:6d91667b375fd2b7f1201ec76400fcdced5b735f48660f85161e0446ddacfad5`，来源 `source:sha256:fd97bcea3c3aee835c9058419469786587a4580e96b431bb9ce9c127ff2181be`；与当前 [`PRODUCTION_PACKAGE`](../../../../../src/workers/production-package.ts) 的转换器版本与来源指纹一致。Asset ID 取自 `src/original-data/conversion/` 的生产映射表。

处置缩写：**交付**＝已交付；**导入**＝P3-03 导入；**代码**＝代码规则或绘制，无新增资源；**G**＝G 缺省，P4 补齐；**不用**＝有证据证明闭环不使用。“置信度”指来源与用途的结论；字段含义另见 U 项。

| # | 来源 | 载入／消费 | 闭环用途与 L/R/V | 置信度 | U 项 | 已交付 Asset ID | 处置 | 负责 |
|---|---|---|---|---|---|---|---|---|
| 1 | `SCENARIO.NOB` SCCT 3123（group 0 / slot 1、僚机 5 条） | 启动 `0x66bbc`；建造 `0x66c00`、`0x6721c` | L-01、L-02；R-02、R-03 | 已确认 | U-022、U-023 | `mission/first-campaign`、`data/wingman-roster` | 交付 | P3-02、P3-04 |
| 2 | SCEN 3019 头部与段 0、1、3、5、6 | `0x66c00`、`0x68d2c`、`0x67678` | L-02；R-02、R-05 | 已确认 | U-022 | `mission/first-campaign` | 交付 | P3-02 |
| 3 | SCEN 3019 段 2：事件触发、3 个区间、消息与总结选择字节 +0x10 | `0x6977c`、`0x695c0`、`0x69c54`、`0x69e1c` | L-09；R-20、R-21；总结文字在 G-06 页面 | 访问已确认，含义高概率 | U-022 | 无（P2 未转换段 2） | 导入（扩展任务内容） | P3-11 |
| 4 | M2ID 10649 | 启动 `0x65ba0`；`0x65ca4` | L-02；V-01 | 已确认 | U-028 | `data/craft-types` | 交付 | P3-02、P3-12 |
| 5 | MODL 10743、11063、10373、10611、11399 及其 MESH、15 个 TEX、模型音效槽的 SND（含逃生舱：10743 第 1 列表部件 0／TEX 11009；第 2 列表外壳） | 对象可见时 `0x3d4e4`→`0x65d10`；音效 `0x55534` | L-02–L-09；V-01、V-02、V-06；R-07 | 已确认（逃生舱身份高概率） | U-027、U-028 | `model/player-ship`、`model/enemy-ship-1`、`model/enemy-ship-2`、`model/base-1`、`model/friendly-craft-1`、`image/model-texture/01`–`15` 与 `palette/model-texture/01`–`15`、`sound/fire/*`、`sound/missile`、`sound/explosion/player`、`sound/explosion/other`、`sound/model-clip/01`–`06` | 交付 | P3-12、P3-14 |
| 6 | 碎片：MODL 10383、TEX 10151 与 EXE 区域 | 启动 `0x3e430`；`0x3e590` | L-05；V-02；R-10 | 已确认 | U-027 | `model/debris`、`image/model-texture/16`、`palette/model-texture/16`、`data/debris-visuals` | 交付 | P3-12 |
| 7 | 弹丸：RENS 10751 记录与 EXE 区域 | `0x3fa30`、`0x3fb1c` | L-05；V-02；R-07 | 已确认 | U-027 | `data/projectile-visuals` | 交付 | P3-12 |
| 8 | 导弹：TEX 10377 与 EXE 区域 | `0x444ac`、`0x4457c` | L-05；V-02 | 已确认 | U-027 | `image/missile`、`palette/missile`、`data/missile-visuals` | 交付 | P3-12 |
| 9 | DATA 11075 | 启动 `0x3ec70` | 全部画面 | 已确认 | U-028 | `palette/flight/models`、`palette/flight/cockpit-hud-map` | 交付 | P3-12、P3-13 |
| 10 | CCKD 10103（TABL 10099 第 0 项）槽 0、2 与字库 | `0x49440`→`0x497a0`、`0x49848` | L-03、L-06；V-04、V-05 | 已确认 | U-029 | `layout/cockpit/front`、`layout/map/frame`、`image/cockpit/front/*`、`image/map/frame/*`、`palette/map/screen`、`font/hud/*` | 交付 | P3-13 |
| 11 | CCKD 10103 槽 7（布局 8，被毁视角，无元素） | `0x3f158`→`0x49848` | L-09；V-01 | 已确认 | — | — | 代码 | P3-12 |
| 12 | HI 飞行 HUD 组 `0x175e8c`：MFDD 10473、BITM 10467、TABL 10479、SNIP 10487（+EXE `0x175ed8`）、DIAG 10489（+EXE `0x171e58`） | `0x4ca80`、`0x4d50c`、`0x4ce30` | L-03；V-04 | 已确认 | U-030 | `image/hud/status-display/*`、`image/hud/display-page/background`、`image/hud/gauge-bar-1/*`、`image/hud/display-interference/*`、`data/hud/status-display/messages` | 交付 | P3-13 |
| 13 | TABL 10461、11401 | `0x49e00`、`0x49f8c` | L-06；V-05 | 已确认 | U-030 | `image/map/unit-marker/*`、`image/map/zoom-icon/*` | 交付 | P3-13 |
| 14 | SND 10401（Warp 开始，按 ID 播放）；SND 10213、10215、10217、10219（EXPL 音效） | `0x2be00`→`0x55924`；EXPL `0x55534` | L-05、L-07；V-06 | 已确认 | U-004 | `sound/warp`、`sound/explosion/blast-v1`–`v4` | 交付 | P3-14 |
| 15 | `CRAFT.NOB` TABL 4003（按槽与组的 CINF ID 与伤害倍率） | 启动 `0x2ce90`；`0x2cf38`、`0x2cf0c`→`0x30150` | L-05；R-07、R-09 | 已确认（结构与用途） | U-001 | 无 | 导入 | P3-03；规则 P3-07 |
| 16 | CINF 4037（10 条炮、9 条导弹、按种类位的 20 条机型记录与弹体记录） | `0x2cf38`；`0x2d2d8`、`0x2d400`；机型 +0x54、+0x9C 用于基地修理计时，+0xA4 用于 Warp 间隔 | L-03–L-08；R-04、R-07、R-09、R-15、R-16、R-19 | 记录数组已确认，字段多数未确认 | U-001、U-008、U-026 | 无 | 导入 | P3-03；P3-06、P3-07、P3-09、P3-10 |
| 17 | RENS 10751 头部 +0x00–+0x54（两盏灯颜色、渲染设置、三种屏幕闪光） | `0x3cfbb`、`0x3d0b0`、`0x3df90`、`0x3e0cc`、`0x48d64`、`0x48dbc`、`0x48e14` | L-03、L-05；V-01、V-02 | 用途已确认，含义高概率／未确认 | U-027、U-028 | `data/projectile-visuals` 只含记录 | 导入 | P3-03；P3-12 |
| 18 | `DEBRIS.NOB` TABL 4501（按种类位 20 组 {指针, 数量}，96 字节碎片参数记录） | 启动 `0x246a0`；`0x249dc`←`0x25124` | L-05、L-09；R-10；R-08、R-09（难度路径 6）；V-02 | 载入与索引已确认，字段未确认 | U-001、U-027 | 无 | 导入 | P3-03；P3-07、P3-12 |
| 19 | TEX 11069（受击闪烁的阈值贴图；第 2 列表网格 10745、11065、10375、10397 只给大小，属已交付模型） | 启动 `0x41c00`；命中消息→`0x42514`、`0x41dcc`、`0x42664` | L-05；V-02、V-03（第 2 列表的受击显示） | 代码已确认，与截图对应高概率 | U-027 | 无 | 导入 | P3-03；P3-12 |
| 20 | EXIC 10211、EXPL 17 条与其 ANIM 17 条（10183–10209、11383–11387） | 建造 `0x23520`（三表各取 5、5、3 条，起点随机）；`0x2409c` | L-05、L-09；R-10；V-02 | EXIC／EXPL 已确认；ANIM 编码未确认 | U-001 | 音效见 #14；ANIM 无 | 导入 | P3-03；P3-07、P3-12 |
| 21 | NEBC 10661 与 15 个 BITM | 启动 `0x484f0`；建造 `0x486e4`（起点＝时钟样本 mod 15）；`0x489d0` | L-03；V-01 | 已确认；调色板 DATA 高概率 | U-018 | 无 | 导入 | P3-03；P3-12 |
| 22 | `AISTUFF.NOB` AICO 6001、TABL 6003 及其引用的 25 条（22 TABL、3 DFPG） | 启动 `0x5db80`、`0x649c8`；`0x5dbc8`→`0x64b1c`、`0x632a4`、`0x5e940` | L-03–L-08；R-11、R-12 | 载入结构已确认，内容未确认 | U-001、U-022 | 无 | 导入 | P3-03；P3-08 |
| 23 | EXE 内置 AI 程序表 `0x1762f8`（10 × 0x54） | `0x64b1c` 的回退 | R-11 | 形状已确认 | U-022 | 无 | 导入（EXE 区域） | P3-03；P3-08 |
| 24 | `COMM.NOB` TABL 2003、2005、2013（按目标种类与门禁选菜单）、2007、2009 | `0x2cbb4`、`0x2c850`、`0x2c9d0`←`0x27b44` | L-08；R-12、R-17；V-04 | 载入与选择已确认，内容未确认 | U-001 | 无 | 导入 | P3-03；P3-10、P3-08、P3-13 |
| 25 | TABL 10399 第 8 项（被毁视角标签） | 启动 `0x45420`；`0x45de0` | L-09；V-04 | 已确认 | U-030 | 无 | 导入（第 0–7 项见 #41） | P3-03；P3-12、P3-13 |
| 26 | TEX 11089（飞行中右侧目标显示屏的 3D 场景背景） | `0x42b04`→`0x85730` | L-04；V-04 | 载入已确认，角色高概率 | U-030 | 无 | 导入 | P3-03；P3-13 |
| 27 | 按 ID 播放的 SND：11087（选目标）、11381（换武器）、10485（按键与通讯菜单）、10463（地图设目的地）、10181（Warp 到达）、10167 与 10169（基地内部的选择键与执行键）、10055（运行时创建 Xpon 类对象） | `0x55924`；发送者见 [audio](../../../../original/formats/audio.md#sounds-played-by-id-and-hud-sounds-p3-0110) | L-03、L-04、L-05、L-06、L-07、L-08；V-06 | 已确认；10055 在切片中是否可达未确认 | U-004 | 无 | 导入 | P3-03；P3-14 |
| 28 | SND 10455、10457（HUD 提示音） | 启动 `0x45420`；`0x46ecc`←`0x45de0`、`0x3f158` | L-03、L-04；V-06 | 代码已确认，含义高概率 | U-004 | 无 | 导入 | P3-03；P3-13、P3-14 |
| 29 | SND 10409（9 型仪表，导航显示屏上方的条带） | 启动 `0x4eaa0`；该仪表的函数在标志 `0x175f10` 置位时循环播放 | L-03；V-06 | 载入与播放已确认，含义未确认 | U-004 | 无 | 导入 | P3-03；P3-13、P3-14 |
| 30 | EXE 字串：完成消息 `0x17106c`、信标消息 `0x171094`、速度辅助开关 `0x170db8`／`0x170dc8`、摇杆灵敏度 `0x170ddc`／`0x170df8`／`0x170e14`（经 `0x4e9e8` 显示） | `0x3266c` 状态 4、`0x33464`、`0x264a0` | L-09；R-21、R-22、R-04、R-23；V-04 | 已确认 | — | 无 | 导入（EXE 区域） | P3-03；P3-11、P3-06、P3-05、P3-13 |
| 31 | TABL 10165 的规则字段：11 条记录的子系统选择值 +0x6C（0–9 为单个子系统，33、34 为两组） | 停靠 `0x38ff4`；`0x39664`、`0x39cb4`、`0x398ec` | L-08；R-19 | 布局与用途已确认 | U-030 | 无 | 导入（只取 +0x6C；+0x70–+0x78、图像与文字见 #37） | P3-03；P3-10 |
| 32 | 镜头表 `0x174b88`／`0x174bdc`、被毁相机常量、种类掩码、流程延时、显示页周期 `0x175c7c`、键码表 `0x74f30`、HUD 组与座舱组的 ID 表 | 各规则函数 | R-01–R-23 的代码部分；V-01、V-04 | 已确认 | — | — | 代码 | P3-02、P3-05、P3-11、P3-12、P3-13 |
| 33 | Warp 画面（模式 1，F1 相机）与地图、迷雾、目标框等代码绘制 | `0x50508`、`0x3ee58`、`0x49f8c` 等 | L-06、L-07；V-02、V-05 | 已确认 | U-025、U-026 | — | 代码 | P3-09、P3-12、P3-13 |
| 34 | MUSC 3005（槽位音乐）；CINC 各行的 SONG | `0x66c00`；`0x39f34` | G-01 | 已确认 | U-004 | 无 | G | P4 |
| 35 | CINC 10095 与 `FLICS/*.SMK`（出发、入港、离港、救援、失败、成功各行，按 08 定类） | 启动 `0x39e74`；`0x39f34` | L-02、L-08、L-09；G-02 | 已确认 | U-010 | 无 | G | P4（占位与衔接归 P3-04、P3-10、P3-11） |
| 36 | `COMMFACE.NOB`／`COMMFAC2.NOB`（ID 基 20000；TABL 20011、20019、20983、20985→TABL→CMOV）；COMM TABL 2001、2011（说话者名→头像序号） | 启动 `0x65ba0`→`0x3bcf0`；`0x3c618`、`0x3c7bc`、`0x3c828` | L-08；G-03（动画承载的规则信息仍须以文字呈现） | 已确认 | U-006 | 无 | G | P4 |
| 37 | 基地内部（视角模式 6）的画面：CCKD 10097、MFDD 10475、BITM 10469、TABL 10481、TEX 11091、TABL 10171 与 BITM 10157／10159／10161、BITM 10163、TABL 10165 的图像、+0x70–+0x78（两个指针与小整数，角色未确认）与文字 | `0x3f158`、`0x38ff4`、`0x4f480`、`0x39d40`、`0x39d5c`、`0x39dd8` | L-08；G-05 | 已确认 | U-018、U-029、U-030 | 无 | G | P4（修理与补给规则见 #16、#31；基地内的音效见 #27） |
| 38 | `OPTIONS.NOB` TABL 5007、DPLU 5003、`0x174c28` 的 18 个 MESC；SND 10405 | `0x33b28`；`0x33e8c`、`0x34c08` | G-04、G-06、G-07 | 已确认 | U-001 | 无 | G | P4 |
| 39 | SCENARIO TABL 3011、3013、3015、3017（统计页与晋升） | 启动 `0x3a850`；`0x3bc04`、`0x3bc28`、`0x3b8dc`、`0x3b7b8` | L-09；G-06（所选任务勋章由 P3-11 在 G-06 下决定，见 08） | 已确认 | U-014 | 无 | G | P4；P3-11 |
| 40 | `SRANGER.CFG`、`SRSAVE*.SAV`、`SRHISCOR.RAW` | `0x37ed0`、`0x38644`、`0x3aae4` 等 | G-06、G-07 | 已确认（用途） | U-005、U-013、U-014 | 无 | G | P4 |
| 41 | TABL 11375（外部视角相机参数）；TABL 10399 第 0–7 项 | 启动 `0x30ec0`；子模式 1–5、7 的相机；`0x45de0` | G-08 | 已确认 | U-030 | 无 | G | P4 |
| 42 | NEBC 10039 与 BITM 10041–10051 | `0x487a0`＝作弊表 `0x174ee8` 第 26 行 | — | 已确认 | U-019 | 无 | 不用 | — |
| 43 | AISTUFF 组 1、组 2 独有的 TABL 6005、6007 与 16 条 | 启动载入；难度组 0 不选用（难度路径 3） | — | 已确认 | — | 无 | 不用 | — |
| 44 | MESH 10311（MODL 10309，种类 `0x200`，切片无此种类）；LO 套件 CCKD 10101、MFDD 10477、BITM 10471、TABL 10483、DIAG 10491（切片配置为 HI） | `0x41c00`；`0x4ca80`、`0x497a0` | — | 已确认 | U-006 | 无 | 不用 | — |
| 45 | 运行时救援船对象 | `0x67b98` 不调用分配器（05） | L-09 | 已确认 | U-028、U-031 | — | 不用（救援船只在 `RESCUE.SMK`，见 #35） | — |
| 46 | 波次模式数据（SCEN 头 0x0C 非零时，难度路径 9） | `0x68f4c` 等 | — | 已确认（SCEN 3019 为 0） | — | — | 不用 | — |

**L/R/V 覆盖：** L-01：#1、G-04；L-02：#1、#2、#4、#5、#35；L-03：#9、#10、#12、#16、#17、#21、#28、#29、#30；L-04：#5、#26、#27；L-05：#5–#8、#14–#20、#27；L-06：#13、#27、#33；L-07：#14、#16、#27、#33；L-08：#16、#24、#27（含 10167、10169）、#31、#36、#37；L-09：#3、#5、#11、#18、#20、#25、#30、#35、#39；L-10：重建同一来源，无新增数据。R-01 无数据（代码与时钟）；R-02、R-03、R-05：#1、#2；R-04：#16、#30；R-06、R-13、R-14、R-18、R-23：代码（#32、#33）与已交付任务数据；R-07：#7、#15、#16；R-08、R-09：#15、#16、#18；R-10：#6、#18、#20；R-11、R-12：#22、#23、#24；R-15、R-16：#16、#33；R-17：#24；R-19：#16、#31；R-20、R-21：#3、#30；R-22：#5、#30。V-01：#5、#9、#17、#21；V-02：#6–#8、#17–#20；V-03：#5（第 2 列表外壳 4 项）、#6 与 #8（导弹与带贴图碎片的外观、跨接缝面）、#19（第 2 列表的受击显示）；V-04：#10–#12、#24–#26、#30；V-05：#13、#33；V-06：#14、#27–#29。

**运行时计算的 ID（逐项）：** SCCT 槽→SCEN／MUSC（组与关卡号）；TABL 4003→CINF（槽与组）；M2ID→MODL（对象种类）；NEBC 起点＝建造时的时钟样本 mod 15；EXIC 三表起点为 `rand()`；TABL 10171 三选一为 `rand() % 3`；HUD 组与座舱组按视角模式与分辨率；通讯菜单按目标种类与门禁；`COMMFACE` 按说话者名；CINC 行按流程与僚机；AISTUFF 运行时按列表随机取 ID（`0x5e940`，列表即已载入的列表）。

**覆盖限制：** 由上述载入函数以外的基址计算出的指针访问不排除；AI 解释器 `0x64cb8` 只按载入器的列表追踪（其外没有载入调用点）；EXPL 每次爆炸的选择（`0x2409c`）、按键 0x100000 消息的逐键含义、`0x46ecc` 的数值来源、`0x38780` 在切片中的可达性只到“来源已确定”为止，语义随 U 项交负责任务；没有基准运行核对实际请求的 ID（宿主限制），“未观察到请求”不作为不使用的证据，上表“不用”均有代码或数据依据。影响闭环的“待研究”来源或引用：0 项。

### 文档与审阅

- 原版事实（英文）：[executable](../../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)（新节；`0x6affc`、`0x65ba0`、`0x1766b4` 行；RENS 头部一句）、[hud](../../../../original/formats/hud.md#2-tabl-entries-in-srnob-contents-likely)（TABL 10165、10399、11375；NEBC、EXIC；把 `0x4ca80` 的“机型字节 6”更正为视角模式 6）、[cockpit](../../../../original/formats/cockpit.md#group-directory-confirmed-structure-on-all-three-entries)（10097 的使用）、[textures](../../../../original/formats/textures.md#4-bitm-bitmaps-confirmed-structure)、[mesh](../../../../original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries)（第 2 列表的受击效果）、[audio](../../../../original/formats/audio.md#sounds-played-by-id-and-hud-sounds-p3-0110)、[imfat](../../../../original/formats/imfat.md#2-directory-entry-36-bytes-confirmed-flags-meaning-unconfirmed)（`flags` 的载入与释放语义、跨条目引用）、[scenario](../../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)。
- U 项（负责阶段未改）：U-001、U-018、U-027、U-028、U-029、U-030 补线索；U-020 由“未确认”改为“部分确认”。
- 文档中只有地址、条目 ID、计数与结构；没有原版字节、文字或反编译代码（本地读到的 EXE 字串只记地址）。
