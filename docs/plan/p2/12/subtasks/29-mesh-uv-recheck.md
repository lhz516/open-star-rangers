---
type: plan
status: active
phase: P2
task: "12"
subtask: "29"
updated: 2026-10-08
---

# 29 — 修复：MESH 贴图坐标修复后的新候选复核

**契约来源：** [spec](../spec.md) 的[候选身份](../spec.md#候选身份)（候选变化）与“发现转换或内容缺陷”；S-08、S-11；AC-01、AC-12、AC-14、AC-21。由 [26](./26-final-alignment.md) 第一次运行新增（execute-goal §5）。
**依赖：** —。
**外部前提：** 责任任务 P2-06 修复 MESH 贴图坐标块的读取并递增模型转换器版本（按 spec“不包含”修订 P2-06 的 spec/goal 并经用户批准，不在本 goal 内实现）。
**执行方式：** 自动：前提满足后，agent 的脚本全部重跑；V-1 受影响项的视觉复核由 agent 经 Computer Use 完成（技术决定 8 的修订）。用户只需在新候选上导入或恢复（若 agent 不能代为导入）。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [22](./22-presentation-verdicts.md#完成证据) 判定基地贴图方向差异来自 MESH 贴图坐标的读取，影响全部坐标不全相同的带贴图模型部件。P2-06 修复后，按候选身份：
  - 记录新候选 `{ commit, buildFingerprint, contentIdentity }`，重跑 [12](./12-candidate-check.md#完成证据) 的候选核对；
  - 重跑 agent 可运行的脚本：16 的布局比较、17 的覆盖核对、18 的任务核对，以及 [11](./11-outbound-compliance-review.md#完成证据) 的出站扫描（含 `--control`）；结论与原候选不同时，写明差异与影响；
  - 在新候选的本地生产预览中复核 V-1 的 10 个带贴图模型项（各模型列表 0、1）：贴图方向与细节；可再尝试手性。21 中按错误映射判为“一致”的 5 项在此重新判定；
  - 更新 [mesh §1](../../../../original/formats/mesh.md#texture-coordinate-block-order-confirmed) 中读取器状态，并删去[源码结构](../../../../engineering/modules/render.md#资源查看渲染)与[本地导入指南](../../../../guides/local-import.md#查看器操作与限制)中“当前候选的模型贴图与原版不同”的限制说明。
- 复核不通过时，相应 AC 保持 blocked，回 P2-06 或 22。

## 不包含

- P2-06 的修复本身；V-2 效果、二维项与音效（不经 MESH 贴图坐标）；30 的补拍。

## 关键文件与契约

- 22 的完成证据（受影响项清单与恢复条件）；12、16、17、18、11 的本地脚本命令。

## 写入范围

- `local/research/p2-12/recheck/**`：新候选的复核记录与汇总（被忽略）。
- `local/research/p2-12/candidate/**`、`local/research/p2-12/layouts/**`、`local/research/p2-12/hud/**`、`local/research/p2-12/mission/**`、`local/research/p2-12/outbound/**`：重跑脚本在原目录写出的本地输出（被忽略），不改脚本。
- `docs/original/formats/mesh.md`：读取器状态与复核结论。
- `docs/engineering/source-structure.md`、`docs/guides/local-import.md`：删去或更新模型贴图的限制说明。

## 验收标准

- [x] 新候选已记录，12 的候选核对与 11、16、17、18 的脚本在新候选上重跑并通过，或差异已记录。
- [x] V-1 的 10 个带贴图模型项在新候选上有判定；AC-14 中贴图坐标造成的缺口已解除，或保持 blocked 并写明恢复条件。
- [x] 文档不含原版内容；链接与元数据有效，`pnpm --silent check:original` 通过。

## 验证方法

- 本地脚本输出与 agent 视觉复核；文档检查。

## 完成证据

- **新候选（AC-01）：** worker 基点即认领提交 `02fd66f929b24ef1512bd1eed710be6376d27082`，工作树干净。
  - `buildFingerprint` 为 `sha256:ec5af1f5d9d46fe3d9654d8715151682e2ca7d7f6c6c0b06e189b35bdac1f690`（9 个文件，按 [12](./12-candidate-check.md#完成证据) 的算法）。
  - `contentIdentity`：schema 1，`classic-p2-slice` 定义版本 3，`ConverterVersion` `osr-import.graphics-3.logic-1.audio-1.models-3`，manifest 身份 `manifest:sha256:6d91667b375fd2b7f1201ec76400fcdced5b735f48660f85161e0446ddacfad5`，来源 `original-import` / `source:sha256:fd97bcea…81be`（与旧候选相同）。
  - 环境：Node v22.22.0，pnpm 12.8.1，macOS 26.6（arm64），Apple M2。
  - 与 12 的候选 `97b70de` 相比：6 个 model payload 改变，新增 10 个 Asset（P2-07 的 `image/hud/display-interference/frame-0` 至 `frame-8` 与 `data/hud/status-display/messages`），其余 149 个指纹不变。`MissionSetup` 摘要仍是 `sha256:714f3bff…a6f0`。
  - 本地明细在被忽略的 `local/research/p2-12/recheck/`（`record.md` 汇总；旧输出备份在 `prev/`、`outbound-prev/`）。
- **脚本重跑（在检出根目录，参数同各子任务的证据）：**

  | 子任务 | 结果 | 与原记录的差异及影响 |
  |---|---|---|
  | 12（`--label final-29`，再以 `final-29b` 重跑） | 退出码 1，两次相同 | 只有 2 项断言失败，都由新增的 `data/hud/status-display/messages` 引起：它不经脚本列出的应用消费者解码，也不在切片角色与任务引用的闭包内（角色 `status-messages` 不是切片角色，没有被依赖）。其余断言全部通过：作业完成，四组完整，全包 `complete`；两个子进程的身份、payload 与 `MissionSetup` 深度相同；两次调用的候选记录与构建清单相同。计数：165 个 Asset，依赖边 185 条，闭包 164/165。新增 Asset 的判定归 [31](./31-hud-resource-gap.md) |
  | 11（扫描与 `--control`） | 0；对照 `PASS`（49 种） | Worker chunk 的来源由 78 增至 81，新增的都是应用模块（status-messages 的 payload 与源读取、可执行文件区域）。两个 chunk 的自由全局引用集合不变（26、86）。新增命中只有 ES 内置对象、`data`/`content`/`mask` 等对象键与一个限值名，HTML/CSS 的发现相同。依赖文件自 `e5383d8` 未变。出站结论不变：应用的数据外发为 0，依赖中能携带本地资源外发的可达调用为 0 |
  | 16（`--label final-29`） | 退出码 1 | 3 项失败都是候选绑定：脚本固定读取 12 的旧记录 `candidate/candidate.json`。比较结果与原 `layouts.json` 逐字段相同：前视 46 张、地图 10 张，差异 0。本次构建指纹与身份等于新候选 |
  | 17 | 绑定旧记录，在新增的 9 个 SNIP 图像处异常退出 | 独立读取没有 SNIP 的读法。退出前已核对：6 个模型按内容各等于其绑定，155 个部件中 137 个带贴图，17 个贴图 Asset 与贴图表一致。原来的 123 个二维 Asset 的 payload 指纹全部不变，原判定按 payload 相同延续。新增项归 31 |
  | 18（`--label final-29`） | 退出码 1 | 绑定旧记录，失败即关闭，未运行 M-1、M-2、M-4。另外，脚本的独立 MESH 读取按原始字节比较贴图坐标块，即已被更正的“每顶点一对”。即使改正绑定，M-2 在新候选上也会失败 |
  | 18 的改写副本（补充的本地核对，只在 `recheck/`，原脚本不变；能否作为 18 的重跑证据，见报告中的问题） | 退出码 0（`PASS`） | 只改两处（diff 在 `recheck/mission-check-final-29.diff`）：候选记录改为 `final-29.json`；贴图坐标块按两个连续数组重组为每顶点一对。M-1 差异 0（271、30、106 个字段）；M-2 的 6 个机型绑定都等于 M2ID 指定的 MODL，含完整几何字节；贴图 15 对、声音 13 对一一对应；M-4 的 418 个字段差异 0。除候选字段外，报告与原 `mission-check.json` 相同。负向：保留交错读取时，6 个绑定都找不到内容相同的 MODL，退出码 1 |

- **视觉复核（AC-14、AC-21；技术决定 8 的修订）：** agent 用 Playwright 驱动的 Chrome（独立 profile）打开本检出的本地生产预览（`127.0.0.1:5189`，带 CSP）。
  - **执行方式：** 修订的文字写的是 Computer Use；本次按协调者转达的用户选择（2026-10-08），由 agent 使用自己的 Playwright 浏览器，与 21 相同。
  - **导入：** 经真实生产 Worker 导入光盘，作业 264 ms，保存 35 ms，四组完整，任务可载入。同源刷新后恢复并校验 32 ms，查看器显示的 manifest 身份与转换器版本等于新候选。
  - **对照：** 视角按 21 的操作序列，必要时增加角度与缩放；基准为 21、22 列出的本地截图。基地有本地截图，没有使用视频帧。
  - **截图处理：** 截图与拼图只临时存放在被忽略的 `recheck/tmp/`，判定后已删除；每张都确认实际显示后才判定。

  | 对照项 | 基准 | 判定 | 理由 |
  |---|---|---|---|
  | `model/base-1` 列表 0 | `srangers_067.png` | 一致 | 贴图 02 的条带沿八角筒体外缘连续，04 的窗缝沿窄圆筒周向排列，与截图一致。21 记录的约 90° 差异已消失 |
  | `model/enemy-ship-1` 列表 0 | `srangers_020.png` | 一致 | 发光圆盘为带亮心的圆形发光（交错读取时为条纹），翼上板块分段与截图一致 |
  | `model/enemy-ship-2` 列表 0 | `srangers_018.png`、`101`、`102` | 一致 | 在与 018 可比的角度下，上表面的条与板呈梳状汇向中脊；2×2 窗与 101、102 的侧面纵向条一致 |
  | `model/player-ship` 列表 0 | `srangers_008.png` | 一致 | 翼上板块的布局、机头的横向带、板块纹理与尾部两个发光一致 |
  | `model/player-ship` 列表 1 | `srangers_121.png`、`044` | 一致（高概率；门形图案的方向经等价链） | 带烧痕的板块碎片、方块面的框形图案一致；坐标只沿一个方向变化的面显示条纹，121 中的薄碎片也是这样。方块面的门形图案在查看器最大缩放（约 6 倍）下仍太小，方向不可分辨 |
  | `model/friendly-craft-1` 列表 0 | `srangers_011.png` | 一致（高概率；贴图方向与细节经等价链） | 轮廓、部件与颜色来源直接对照一致。中部贴图块在 011 中只有约 40 像素宽，贴图方向与细节不可分辨 |
  | `model/base-1` 列表 1 | — | 无法判定 | 没有基地被毁的截图；与 21 相同，不受坐标读取影响 |
  | `model/enemy-ship-1` 列表 1 | `srangers_098.png` | 无法判定 | 098 中的碎片太小，不能归属到该列表；与 21 相同 |
  | `model/enemy-ship-2` 列表 1 | — | 无法判定 | 没有截图；与 21 相同 |
  | `model/debris` 列表 1 | `srangers_098.png` | 无法判定 | 不能与敌机碎片区分；与 21 相同 |

  - **等价链：** 截图或查看器分辨不出贴图方向或细节的两项，判定依据对全部部件都成立的证据（与 [mesh §3](../../../../original/formats/mesh.md#p2-12-viewer-comparison-v-1) 的“Shared reading”相同）：
    - 18 的改写副本证实，5 个机型模型转换后的几何（含坐标字节）等于按两个连续数组读取的 MODL 与 MESH；15 个 TEX 与 image Asset 一一对应，尺寸与像素索引相同；
    - 贴图图像与调色板等于独立的源读取（[17](./17-hud-texture-coverage.md#完成证据)），它们的 payload 在新候选上不变；
    - EXE 的 MESH 载入对全部条目相同（P2-06，已确认）；
    - 查看器对全部模型使用同一呈现路径，其轴向与行序在上表前四项上与截图一致（高概率；u 向镜像不能区分）。

    其中第一点依赖改写副本，若协调者不接受它，这两项改回“无法判定”。

    21 中按错误映射判为“一致”的 5 项（两种敌机、僚机与玩家的列表 0，玩家的列表 1）已全部重判，见上表。
  - **手性：** 仍不能确认。对照的机型左右对称，修正后的贴图也没有提供截图中可分辨的不对称特征。
  - **其他观察：** 未见原版中不可见的面；采样与重复方式没有新的观察。
  - **废弃的尝试：** 曾用 CDP 提高设备像素比以看清方块细节，画布变为空白；已撤销并刷新恢复，这次尝试没有用于判定。
  - **结论：** AC-14 中贴图坐标造成的缺口已解除；AC-21 的“方向”行三维部分复核为一致（高概率）。
    - AC-14 仍有不属于本项的缺口：4 个列表 1 项缺少截图（[30](./30-deferred-recaptures.md) 的补拍）、第 2 列表外壳的静态外形、手性。
    - 完整的 AC-21 仍因跨接缝外观未验证等 V 系列缺口而 blocked。
    - 验收第 1 条按“差异已记录”成立。AC-01 没有在新候选上重新成立：12 的 2 项失败都在新增的 DIAG Asset 上，待 31 判定或脚本按新 Asset 调整后重跑。
- **文档更新：**
  - [mesh §1](../../../../original/formats/mesh.md#texture-coordinate-block-order-confirmed) 的读取器状态后新增复核一条：独立字节核对为已确认，查看器对照为高概率。旧锚点 `texture-coordinate-block-order-likely-p2-12` 仍被 goal 与 24 引用，保留别名；本文件的链接已改指新锚点。
  - [mesh §3](../../../../original/formats/mesh.md#p2-12-viewer-comparison-v-1) 的表格以本项的贴图判定取代 21 的，并新增“Shared reading”一条，写明等价链。
  - [源码结构的呈现约定](../../../../engineering/modules/render.md#资源查看渲染)：引言、“方向”行与“模型贴图（三维）”行删去“当前候选与原版不同”，改记复核结果与置信度。
  - [本地导入指南的呈现限制](../../../../guides/local-import.md#查看器操作与限制)：删去模型贴图一条；第 2 列表、手性、跨接缝插值与光照的说明保留。
  - 未改 `local/research/p2-12/session/record.md`（不在写入范围）：其中 5 行“待复核”的新判定在 `recheck/record.md`。
- **未改仓库代码：** 本地脚本与改写副本都不提交，不需要 simplify。
- **检查：** 只有文档修改，不运行构建与测试。
  - 会话内的临时脚本按 GitHub 锚点规则检查 4 份改动文档：`updated:` 都在，471 个相对链接与锚点没有问题；对照样本能检出缺失文件与错误锚点。
  - `pnpm --silent check:original` 通过，0 条发现。
  - diff 中没有颜色名称、颜色值或原版内容。
  - 预览服务器与浏览器已停止，临时截图与 `.playwright-mcp/` 已删除。
- **rubber-duck：** 3 项阻塞、2 项非阻塞，全部处理。
  - **执行方式：** 指出技术决定 8 的修订写的是 Computer Use。已注明本次按协调者转达的用户选择使用 Playwright，与 21 相同；由协调者确认是否需要在执行记录中写明。
  - **18 的改写副本：** 原脚本的重跑仍记为失败；改写副本改记为补充的本地核对，是否接受它作为 18 的重跑证据，作为问题交协调者。
  - **等价链：** 原先只说明了方向。已补上贴图图像、调色板与 TEX 对应的同源证据，以及共同的呈现路径；两项判定标为高概率，并写明不接受改写副本时改回“无法判定”。
  - **验收边界：** 已写明 AC-01 未在新候选上重新成立，完整的 AC-21 仍 blocked。
  - **源码结构：** 已限定为“没有发现贴图方向的差异”，逐项的原版观察只留在 mesh。
