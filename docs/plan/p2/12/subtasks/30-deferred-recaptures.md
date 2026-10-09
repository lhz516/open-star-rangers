---
type: plan
status: active
phase: P2
task: "12"
subtask: "30"
updated: 2026-10-08
---

# 30 — 修复：延后的补拍与受影响项重判

**契约来源：** [spec](../spec.md) 的 S-08、[原版本地对照](../spec.md#原版本地对照)；AC-14、AC-15、AC-17、AC-21（跨接缝外观）、AC-22。由 [26](./26-final-alignment.md) 第一次运行新增（execute-goal §5），对应 [15](./15-user-captures.md#完成证据) 中用户决定“记录缺口，相应验收保持 blocked，稍后补拍重做”。
**依赖：** 27, 28, 29, 31。
**执行方式：** 需用户：用户在基准 DOSBox-X 中补拍；agent 按 15 的义务记录登记，并按技术决定 8 的修订完成视觉判定、按 16、17 的脚本完成逐像素与覆盖核对。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **补拍（用户）：** 按 15 记录的“无法取得”义务补拍，只拍仍缺的义务：
  - C-01 第二个方向（手性）；C-03 两种敌机各自的碎片；C-04 僚机与基地碎片；C-06 两种敌机与基地开火；C-07 各种导弹的侧面与后方、敌机导弹；C-08 轻、中、重损伤，闪烁的亮与灭，带条形图的页面；C-09 4×6 字库文字（HI；在 F2、目标显示屏与通讯菜单中查找）；C-10 逐单位的地图标记、跃迁目标与其他标记；
  - 27 指出某个 U-030 元素需要截图才能定论时，一并补拍；
  - [32](./32-b001-selection-box.md#完成证据) 的两个取证帧：左键点击后被框的单位同时显示在主地图与放大窗口中（方框在哪一处）；选取框只覆盖部分单位时的信息小窗（是否只列这些单位）；
  - 跨接缝的效果面与第 2 列表外壳的静态外形：若补拍仍不能给出严格基准，写明范围依据（例如只在受击帧以点阵出现），按判定分类记录，不当作通过。
- **登记：** 按 15 的 `obligations.ts`、`record.ts` 与接受规则登记，`--complete` 通过；截图只在 `local/`。
- **重判（agent）：** 在 29 之后的候选上重做受补拍影响的判定：21 中因缺少基准为“无法判定”的 V-1、V-2、V-3 与 V-4 项；17 中因 C-07 至 C-10 为“无法判定”的 23 个图像、`palette/missile` 与 `font/hud/4x6`；跨接缝外观。差异按 22 的方式区分呈现约定与责任任务。
- **回填：** 新的原版事实写入唯一权威位置（mesh、hud、textures、cockpit、unknowns），带置信度与候选适用性。同时按 32 的观察更正 hud 的两处措辞：选中方框的判定比较三个分量（目标点的 z 可来自最近的图标，见 executable），信息小窗的范围是放大窗口范围内的单位（`0x4c5ec`）。

## 不包含

- 已有判定且不受补拍影响的项；转换修复（回责任任务）；P3 运行时规则。

## 关键文件与契约

- 15 的义务记录与接受规则；16、17、21、22 的完成证据；[本地导入指南的原版本地对照](../../../../guides/local-import.md#原版本地对照p2-12)。

## 写入范围

- `local/research/p2-12/baselines/**`、`local/research/p2-12/session/**`、`local/research/p2-12/hud/**`、`local/research/p2-12/layouts/**`：补拍登记、判定明细与脚本输出（被忽略）。
- `docs/original/formats/mesh.md`、`docs/original/formats/hud.md`、`docs/original/formats/textures.md`、`docs/original/formats/cockpit.md`、`docs/original/unknowns.md`：新事实回填。
- `docs/original/formats/executable.md`：效果来源节中导弹与弹丸记录的对照结论（2026-10-08 放宽）。
- `docs/original/behavior/B-001-strategic-map.md`、`docs/original/behavior/B-005-campaign-rescue.md`：地图上的跃迁目标标记与救援动画的观察（2026-10-08 放宽）。

## 验收标准

- [x] 15 记录的每个“无法取得”义务都有合格截图，或有用户同意的范围依据；`--complete` 通过。
- [x] AC-14、AC-15、AC-17 的必需项没有因缺少基准而“无法判定”；跨接缝外观有判定或范围依据。（2026-10-08 按用户批准的范围例外满足，见完成证据末尾）
- [x] 文档不含原版内容；链接与元数据有效，`pnpm --silent check:original` 通过。

## 验证方法

- 用户补拍；agent 登记、视觉判定与本地脚本；文档检查。

## 完成证据

- **候选与查看器：** 绑定 31 的候选记录 `final-31`（提交 `8ca0ed3`，构建与内容身份同 `02fd66f`）。运行检出为认领提交 `12b2650`，自候选以来只改了文档。视觉对照按技术决定 8 的修订由 agent 完成，按用户在 21 中的选择使用 agent 自己的 Playwright Chromium（独立 profile）：本检出的本地生产预览 `127.0.0.1:5198`（`pnpm build` 后 `pnpm preview`，带 CSP），经真实生产 Worker 导入光盘，作业 279 ms、保存 29 ms，四组完整，任务可载入，页面显示的身份等于候选。逐项判定只在被忽略的 `local/research/p2-12/session/record-30.md`。
- **登记（验收 1）：**
  - 13 的 `baseline-inventory.ts` 增加 `--candidate <label>`，经 31 的共用校验 `candidate/record.ts` 绑定候选；P2-07 修订新增的 9 个 SNIP 帧按 31 的做法归为动画帧。15 的 `record.ts` 只对技术决定 8 修订交给 agent 的 C-05、C-12 接受 agent 的逐义务确认；`record-selftest.ts` 增加 3 个用例，19 个全部通过。
  - `node --preserve-symlinks --preserve-symlinks-main local/research/p2-12/baselines/baseline-inventory.ts --candidate final-31 --complete`：`PASS`。132 张截图都是 640×480 8 位 RGB，冻结的 92 张不变；记录 100 行，缺少的义务为 0；`capture-accepted.json` 由 16 张增至 28 张（`097`、`109`–`111` 与 `128`–`135`）。
  - C-05、C-12 的“无法取得”行改为 agent 在查看器中的对应（C-05：`098`、`044`、`121`；C-12：10 个贴图中 9 个在 `067`、`072`、`128`、`020`、`018`、`008`、`010`、`011`、`013` 中可见，贴图 03 只在视频中正面可见）。仍没有截图文件的 8 个义务各有用户批准的依据：视频基准（C-03、C-06 敌机二，C-10 跃迁目标，C-12 贴图 03）、用户回忆（C-04 基地）、用户说明或决定（C-04 僚机，C-07 后方与敌机导弹）。
- **二维与贴图覆盖（AC-17）：**
  - 17 的 `coverage.ts --candidate final-31` 新增右侧显示屏的 SNIP 整帧比较；`direct.ts` 对多个叠加图取不一致像素最少的叠放顺序，并识别空格后的消息光标。两次运行 `PASS` 且相同，负对照（叠加图 4 换成 5）退出码 1。脚本的 `PASS` 只覆盖同源与直接对照：它对 18 个图像与 `font/hud/4x6` 仍报“无法判定”，最终判定是 `record-30.md` 按下述方法逐项改判的。
  - 直接对照：状态显示屏背景 2，叠加图 0、1、4，SNIP 帧 0 与 5，地图标记 7、8、14（按用户辨认的单位，`hud/map-box-30.ts`）与 27（在 EXE 给出的地图状态点上）。
  - 同源与转换规则链（与 17 的“不需画面基准”项、31 的 SNIP 帧相同的做法）：叠加图 2、3、5、8，仪表条 0、3，地图标记 0、26、28 与放大窗口图标 26–28。
  - `image/missile`、`palette/missile`：外观随 V-2 导弹类型 1 判为一致（高概率）。
  - `font/hud/4x6`：与来源逐字节相等；HI 不画它（已确认，EXE），画面对照不适用。一个只读 Ghidra 子任务追踪了全部文字调用，明细在被忽略的 `hud/font4x6-30/report.md`。
  - 事实与计数见 [hud 的覆盖检查](../../../../original/formats/hud.md#slice-coverage-check-and-u-030-impact-p2-12)、[§1.1](../../../../original/formats/hud.md#11-glyph-layout-and-character-maps-likely) 与 [SNIP 10487](../../../../original/formats/hud.md#snip-10487-confirmed-structure-p2-1227)。17 的 25 个“无法判定”项都已有判定。
- **模型（AC-14）：** 列表 1 与列表 2 的判定见 [mesh §3](../../../../original/formats/mesh.md#p2-12-viewer-comparison-v-1)：
  - 列表 1：基地为一致（高概率，用户回忆）；敌机一为一致（高概率，`098` 与视频）；敌机二为一致（高概率，视频基准）；MODL 10383 只依等价链判为一致（高概率），没有可归属的碎片；僚机由玩家列表 1 覆盖。
  - 手性：机型左右对称，按 spec 只记不能确认。
- **EXE 研究（协调者决定，2026-10-08）：** 两个只读 Ghidra 子任务（各用项目副本，输出在被忽略的 `hud/effects-30/` 与 `hud/debris-30/`），结论只写在 [executable](../../../../original/formats/executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)。按 spec 必判范围，弹丸记录 3、4、5、7、8、9，导弹类型 4–8 与无贴图碎片形状 0–2 判为切片之外、已确认不使用（共 17 项）。
- **效果（AC-15）：** 弹丸记录 0、1、2、6 一致（记录 6 以 `128` 直接对照）；导弹类型 1 一致（高概率，`099`）；带贴图碎片形状 0、1 维持一致。21 对导弹类型 5 的判定作废（`099` 是类型 1）；30 早先以视频对照记录 5 的判定来自后面的关卡，不作为切片证据。
- **仍未解决（验收 2 未勾选）：** 下列项为“无法判定（缺少基准）”，使 AC-14、AC-15、AC-21 与 AC-22 保持 blocked。每项给用户两种选择：批准残余的范围依据，或提供新的基准。“用户不再寻找”不作为依据。
  - **第 2 列表的静态外形（AC-14，4 项）：** 敌机的外壳只以受击帧的点阵出现（[mesh §2](../../../../original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries)），基地与玩家的外壳没有截图或视频帧。缺少的证据：能看清外壳完整轮廓的一帧。
  - **导弹类型 0、2、3（AC-15）：** 第一关会用（[executable](../../../../original/formats/executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)），没有截图或视频帧。缺少的证据：每种类型飞行中的一帧。
  - **跨接缝外观（AC-15、AC-21）：** 导弹与带贴图碎片的跨接缝面都没有可分辨的画面（`098` 中碎片只有约 10–40 像素）。缺少的证据：导弹的后方或斜后方近景，以及敌机爆炸的近距离碎片帧。
  - 手性按 spec 只记“不能确认”，不计入缺口。
- **回填（AC-22）：** [hud](../../../../original/formats/hud.md)（HI 不用 fonts/2；右侧显示屏的 SNIP；补拍中的背景、叠加与叠放；按单位辨认的地图标记与记录 26、27；32 交来的两处更正）、[mesh](../../../../original/formats/mesh.md)（§2 第 2 列表；§3 的列表判定、贴图可见性、逃生舱的用户观察）、[executable](../../../../original/formats/executable.md#effect-presentation-sources)（碎片产生路径、武器表与第一关的开火者、`099` 的导弹类型；分配器第十个调用点与 `0x23ac8` 的调用点数更正）、[B-001](../../../../original/behavior/B-001-strategic-map.md#交互已确认)（方框位置与信息小窗的用户判断、跃迁目标与状态点标记）、[B-005](../../../../original/behavior/B-005-campaign-rescue.md)（`093` 与逃生舱的用户说明）、[unknowns](../../../../original/unknowns.md)（U-027、U-030 的现状与链接）。textures 与 cockpit 没有新的格式事实，不需修改。写入范围按协调者在 `bff322b` 的放宽。
- **检查：** `pnpm build` 后 `pnpm --silent check:original` 通过（`passed: true`，0 项发现）；本地链接检查 hud、mesh、unknowns 与本文件，失效 0；`git diff --check` 通过；改动中没有颜色名称、颜色值、像素值、原版文字或反编译输出。
- **清理：** 公开视频的临时帧（`local/research/p2-12/video-30/` 中的帧图与拼图）已按 spec 删除，保留用户的判断记录 `judge/answers.json` 与脚本；查看器截图、协调者为用户评审生成的查看器图（`guess-30/viewer/`）与 `.playwright-mcp/` 已删除；预览服务器与浏览器已停止。
- **Rubber-duck：** 3 项阻塞、2 项非阻塞，全部处理：
  - 范围依据的门槛：验收 2 改为未勾选，未解决项与可选的恢复方式如上；
  - 一事一处：本文件与 unknowns 只留判定、计数与链接，事实只在 hud 与 mesh；
  - 证据与现状不符：清理在提交前完成，`git diff --check` 重跑，并写明脚本 `PASS` 与人工改判的区别；
  - MODL 10383 改为只依等价链；
  - 地图上用的是指针矩形（放大窗口范围），不是选中方框。
  - 之后按协调者对未解决项的决定做了 EXE 研究并改判；记录 27 的含义因用户说明 `004` 中没有设定跃迁目标而降为未确认。
- **Rubber-duck（研究后的增量）：** 2 项阻塞、1 项非阻塞，全部处理：U-027 中 21 的导弹类型 5 判定标为作废；本文件与 B-005 去掉与 executable、mesh 重复的事实，只留判定、计数与链接；executable 中“其他截图显示同一导弹名称”改为列出所看的截图。
- **文档影响：** 工程约定与指南不需修改：本地脚本的新选项只在被忽略的目录中，本地导入指南的对照步骤不变。STATUS 与阶段索引由协调者决定。
- **用户决定（2026-10-08，协调者补记）：** 用户以“很难拍到完整的画面”为由，批准把“仍未解决”中的三类记为本任务的范围例外，已记入 [spec 判定分类](../spec.md#判定分类)。这些项不再是必需项，判定记为“无法判定（用户批准的范围例外）”。据此验收 2 满足：必需项中没有因缺少基准而无法判定的项，跨接缝外观有经批准的范围依据。
