---
type: plan
status: active
phase: P3
task: "03"
subtask: "21"
updated: 2026-10-09
---

# 21 — 本地核对工具与基准核对

**契约来源：** [spec](../spec.md) 的 S-16、S-17（工具用法与 `AGENTS.md`）、AC-19、AC-20（工具部分）、AC-18（CLI 输出）；[技术决定](../spec.md#技术决定) 11、13。
**依赖：** 19, 26, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **nob-check：** 扩展 [nob-check.ts](../../../../../tools/nob-check.ts)：
  - 用 14 的生产解码解码 `SR.NOB` 的全部 186 个 ANIM 帧，核对每帧恰好用尽其数据；
  - 核对 EXIC→EXPL→ANIM/SND 与 `CRAFT.NOB` TABL 4003→CINF 的引用；
  - 既有的 NEBC→BITM 核对继续生效；
  - 输出只有计数、失败 code 与观测最大值，不输出像素或数值。

  其余新增解析器带有切片专用的失败关闭规则，只经下面的 CLI 在切片条目上运行。
- **包核对 CLI：** 计划新增的 `tools/package-check.ts`，用与 Worker 相同的 `createImportJob()` 转换 CloneCD 文件组：
  - 对四组运行 `validatePackage`，用读取器解码每个新增角色的 payload，并用 `loadMission` 载入任务；
  - 输出 `osr-package-check`/1 JSON：结论；每个新增角色的 Asset 数；记录、帧、文字与声音的计数；payload 字节；各阶段读取增量；manifest 身份与哈希；限值与观测值的对照；
  - 不输出名称、文字、数值、宿主路径或宿主错误文本；
  - 测试可注入合成白名单，退出码与 [logic-check.ts](../../../../../tools/logic-check.ts) 相同。
- **基准核对**（输出只在 `local/research/p3-03/local-check/`）：
  - 在开发者本机的基准镜像上运行 nob-check 与 package-check；
  - 用只共用光盘与 IMFAT 读取的本地独立读取脚本，按格式文档读取各导入项（含 `data/hud/text` 的 64 个 EXE 区域与 `warp-arrival` 的播放次数，spec 修订 1），与规范数据逐项比较，只记录结论、计数与哈希；
  - 把生产解码的 ANIM 帧渲染为本地图像，与至少一处本地截图（例如 `local/StarRang/captures/` 中的爆炸画面）或参考视频中的爆炸外观比较。记录方法、来源与置信度，单凭视频最高为高概率；比较用图像只临时存放在 `local/`。
- **文档：** 在 [工具用法](../../../../guides/tools.md) 中加入 package-check 一节，并补充 nob-check 的新增核对；按 07 的交接更新 logic-check 一节的事件计数；在 `AGENTS.md` 的命令表中加入 package-check。

## 不包含

- 模块分册、导入指南、文档地图与 U 项：归 22。
- 原版数据进入仓库：本项的全部读数、脚本输出与比较图像都只在 `local/`。

## 关键文件与契约

- [nob-check.ts](../../../../../tools/nob-check.ts)、[logic-check.ts](../../../../../tools/logic-check.ts)（只读，作为 CLI 的先例）、[import-job.ts](../../../../../src/workers/import-job.ts)。
- [工具用法](../../../../guides/tools.md)、[AGENTS.md](../../../../../AGENTS.md)。
- 计划新增：`tools/package-check.ts` 与 `tools/package-check.test.ts`。

## 写入范围

- `tools/nob-check.ts`：ANIM 与新增引用的核对。
- `tools/nob-check.test.ts`：合成封包上的测试。
- `tools/package-check.ts`：包核对 CLI（新建）。
- `tools/package-check.test.ts`：合成白名单上的测试（新建）。
- `docs/guides/tools.md`：两个工具的用法。
- `AGENTS.md`：命令表。
- `local/research/p3-03/local-check/**`：基准核对、独立读取与外观比较的输出（被忽略）。

## 验收标准

- [x] AC-19（CLI）：基准镜像上得到 `complete` 的版本 4 包，`loadMission` 成功，输出字段齐全。
- [x] AC-19（nob-check）：全部 186 个 ANIM 帧恰好用尽数据，新增引用与既有 NEBC/BITM 引用核对通过。
- [x] AC-19（独立读取与外观）：独立读取与规范数据逐项一致；ANIM 帧与截图或视频的外观比较记录了方法、来源与置信度；全部输出只在 `local/`。
- [x] AC-18：CLI 与 nob-check 的输出不含名称、文字、数值、原版字节或私人路径；两个工具的测试用合成数据，不读取 `local/`。
- [x] AC-20（工具部分）：工具用法与 `AGENTS.md` 已更新，`updated:` 与链接有效。
- [x] `pnpm exec vitest run tools` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试使用合成封包与合成白名单。
- 本地运行（原版数据，只在 `local/`）：`node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`、`node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，以及独立读取脚本；证据只记结论、计数与哈希。

## 完成证据

2026-10-09，worker `exec-p3-03-21`，基于认领提交 9c203d6。原版读数与比较图像只在被忽略的 `local/research/p3-03/local-check/`（`out/summary.json` 汇总），这里只记结论、计数与哈希。

- **nob-check（AC-19）：** [nob-check.ts](../../../../../tools/nob-check.ts) 新增三项核对：
  - ANIM：用 14 的 `readAnimationFrames` 校验结构，再用生产解码 `decodeAnimationFrame` 解码每一帧，解码要求每帧恰好用尽其数据；
  - EXIC→EXPL→ANIM/SND：用 `parseExplosionLists`/`parseExplosionRecord` 解析，并核对引用的条目类型；
  - TABL 4003：ID 只属于 `CRAFT.NOB`，含该 ID 时必须是 TABL；18 × 3 个单元都用 `parseCraftTable` 解析，并核对每个单元引用 CINF。

  既有核对不变。输出只有计数、失败 code、观测最大值；ANIM 的计数只取自全部帧都通过的条目。基准（`SR.NOB` 的 SHA-256 前缀 `c469b601`，`CRAFT.NOB` 的为 `85cfd6b5`）的 7 个 NOB 都以退出码 0 通过：
  - `SR.NOB`：ANIM 17 通过，186 帧全部解码；每条目最多 12 帧，最大帧数据 7,411 字节，1,611,264 个像素，其中 299,061 个不透明，与 [textures §6](../../../../original/formats/textures.md#6-anim-explosion-animations-confirmed) 一致；EXIC 3 张列表、17 个 EXPL 引用（17 个不同）；EXPL 引用 17 个不同 ANIM 与 4 个不同 SND；既有的 NEBC 2、BITM 28 等核对仍然通过；
  - `CRAFT.NOB`：54 个单元，引用 21 个不同 CINF，与 [craft §2](../../../../original/formats/craft.md#2-tabl-4003-confirmed) 一致。

  [nob-check.test.ts](../../../../../tools/nob-check.test.ts) 用合成封包覆盖：逐帧解码与计数；帧数据有剩余字节时报 `invalid-payload@archive:/<名>#<ID>/frames[0]/pixels`；EXPL/EXIC 引用其他类型的条目；TABL 4003 单元引用非 CINF；ID 4003 不是 TABL。
- **包核对 CLI（AC-19、AC-18）：** 新建 [package-check.ts](../../../../../tools/package-check.ts)，用 `createImportJob()` 运行与 Worker 相同的作业，流程如下：
  - 对四组运行 `validatePackage`；
  - 解码并 `loadMission` 载入任务；
  - 用各角色的读取器解码 P3-03 的 18 个角色（含依赖闭包中的动画、帧与星云图像）；图像与目标显示屏调色板用 `checkGraphicsBinding` 核对描述符依赖，sound 只接受 schema 2 且不得有依赖（rubber-duck 发现 1，`validatePackage` 不核对这一绑定）；
  - 对照结构限值，并把包的用量与 `PRODUCTION_PACKAGE.limits` 对照。

  输出 `osr-package-check`/1 JSON，退出码与 logic-check 相同；测试可注入合成白名单与作业（`job` 只供测试）。基准上 `passed: true`，得到 `complete` 的版本 4 包：
  - 组：logic 9、models 266、cockpit-hud-map 104、audio 29 个 Asset；转换器版本为 `osr-import.graphics-4.logic-2.audio-2.models-4`，`ManifestIdentity` 为 `manifest:sha256:ac3bdb9c87c9fe4ea74505397b550619209d8204da9e40b3f065b5e77537b9ba`；
  - 角色：19 个（任务与 18 个新增角色）；
  - 限值：52 项全部在内，例如包 Asset 408/812、payload 字节 3,783,074/16,568,320、ANIM 帧 12/32、HUD 文字 64 条（39 条交给格式化）；
  - 声音：event 8 个（7 个 `none`、1 个 `repeat`），hud 3 个（1 个 `none`、2 个 `whole`）。

  [package-check.test.ts](../../../../../tools/package-check.test.ts) 在合成白名单与合成光盘上核对以下各项：字段齐全、四组的 Asset 数、各角色计数与合成数据推导值相等、限值与读取量；mesh 损坏时首个失败的 code 与位置；三种描述符改绑（帧去掉调色板、声音加依赖、调色板加依赖）都报 `binding-mismatch`；默认生产白名单拒绝合成盘、输入不可读与用法错误。输出不含合成文字标记、目录名或宿主路径。修订后在基准上重跑，报告与修订前逐字段相同。
- **独立读取（AC-19，技术决定 13）：** 本地脚本 `reader.ts` 只用 `openVerifiedSource` 的光盘与 IMFAT 读取，不导入项目的格式解析、转换、生产表或 LE 读取器。它按 `docs/original/formats/` 自行读取各项：SCEN 3019 段 2 与 +0x54、TABL 4003 与 CINF、DEBRIS、AICO/TABL 6003/DFPG/脚本、COMM、TABL 10165、TABL 10399、RENS 头部、TEX 11069、TEX 11089 及其调色板、EXIC/EXPL/ANIM（自写编码 1 解码）、NEBC/BITM 与 11 个 SND；EXE 方面自写 LE 读取，覆盖 7 条消息、内置表及其 20 个 fixup，以及按 executable.md 解析出的 64 个 HUD 文字区域。`check.ts` 用内容层读取器解码生产作业的规范数据，逐项比较，结论如下：
  - 246 项、10,954 个叶子，0 处不一致；
  - 比较还覆盖 Asset 集合、每个 Asset 的 kind、角色、组、payload schema 与依赖（rubber-duck 发现 2）；
  - HUD 文字的 64 行按地址配对，键名从 executable.md 逐行转写（发现 3），格式在文档、schema 常量与存储字节三方一致；
  - `warp-arrival` 为 `repeat` 8 次。

  8 个负对照（误读炮记录 +0x08、HUD 区域错位一字节、播放次数读为 1、帧按自下而上存储、事件区间上下界互换、星云图像标成爆炸帧、声音多一个依赖、两个 HUD 键互换）都报出不一致（2–364 处）。
- **外观（AC-19，技术决定 11）：** 方法如下：
  - 把生产解码的 186 帧在所绑定的 `palette/flight/models`（DATA）下渲染；
  - 在 `local/StarRang/captures/` 的全部 132 张截图中，按整数缩放 1–4（每个源像素为 s × s 方块，textures §2）搜索精确同色位置，并对齐整个方块；
  - 截图若处于屏幕闪光，所有颜色为 DATA 的每个 6 位分量加同一个 *k*（由背景色推出，见下文交 22）。

  结果有三处匹配：
  - `srangers_110.png`：`image/explosion/03/06`，缩放 3，无闪光；4,560 个不透明方块中 4,181 个全部像素相同，像素 38,646/41,040（94.2%）；对照：上下翻转 3,323、左右镜像 2,762、最好的其他帧 7,009；
  - `srangers_111.png`：下一帧 `03/07`，缩放 3；方块 5,013/5,356，像素 46,178/48,141（95.9%）；对照：翻转 3,834、镜像 3,356、其他帧 15,044；
  - `srangers_120.png`：`03/04`，处于强闪光，颜色大多压到接近白色，只作弱佐证（像素 22,005/24,255；对照翻转 15,804）。

  前两张截图中，不一致的像素都落在遮挡的舰体剪影、准星与速度文字上（差异图目视确认）。置信度：匹配的帧的解码、行序、透明与直接显示为已确认（模拟器截图中的精确色值相等，不是视频）；其余 183 帧走同一条已由代码确认的解码路径。`srangers_044.png` 中的黄色效果（处于闪光，区域内 76 种颜色全部可由同一个 *k* 解释）不与任何 ANIM 帧匹配，其来源未判明，不影响结论。比较图像、帧导出与差异图只在 `local/research/p3-03/local-check/out/appearance/`。
- **文档（AC-20 的工具部分）：** [工具用法](../../../../guides/tools.md) 作了以下更新，`updated:` 为 2026-10-09，链接与锚点经本地脚本核对有效：
  - 总表加入 package-check 并更新 nob-check；
  - 封包结构核对补充 ANIM、爆炸与机型表的核对与输出；
  - 新增“包核对”一节；
  - 按 07 的交接，逻辑组核对的 `counts`/`limits` 加入事件各项，并写明规则数据 payload 的核对方式。

  [AGENTS.md](../../../../../AGENTS.md) 的命令表加入 package-check，并更新 nob-check 的说明。
- **检查：**
  - `pnpm exec vitest run tools`：21 个文件、304 项通过；
  - `pnpm exec tsc -p tsconfig.node.json --noEmit` 与 ESLint 通过；
  - `pnpm check`：simplify 后重跑，183 个文件、5,852 项测试与生产构建通过；
  - `pnpm check:original`：通过，`findings` 为空。
- **Rubber-duck：** 三项发现都已采纳：(1) package-check 核对图像、调色板与声音的描述符绑定，并加回归测试；(2) 本地比较核对每个 Asset 的元数据与依赖，并加负对照；(3) HUD 文字键按地址从文档转写。
- **Simplify：**
  - **采纳：** 摘要改用 `sha256Fingerprint`；不透明计数改用 `isOpaque`；测试改用 `IMPORT_STAGES`；两个解码包装合并为 `decoded()`；`image(true)`；任务解码改为 `logicAsset()`，返回 `{ report, limits }`；按角色一次分桶；测试共用光盘夹具，三种改绑并发运行。
  - **未采纳：**
    - 与 logic-check 共用 `CheckStop`/`failureOf`/输入打开/读取计量、共用 `writeDisc` 测试辅助：须新建共用模块并修改只读的 logic-check，超出写入范围；
    - 逐帧不重复校验 ANIM 结构：须绕开生产入口 `decodeAnimationFrame`，开销在一秒以内；
    - TABL 4003 一次解析全部单元、验证结果复用解析：须改 `src/`；
    - 并行打开输入：开销可忽略；
    - 共用的 logic 组解码辅助（与 `mission-diagnostics.ts`、logic-check 合并）：须改 `src/`，留作后续整理。
- **文档影响（交 22，不在本行写入范围）：**
  - textures §6 可补外观核对的结论（方法、三张截图、置信度）；
  - executable.md 的 RENS 屏幕闪光可补观测：截图 044 与 120 中整个调色板为 DATA 每个 6 位分量加同一值并截到 63（高概率，两张截图的数据），截图 110/111 中 list 1 的 128×128 帧以缩放 3 绘制（HI）；
  - 工具用法中“包核对”一节可由 22 链到模块分册。
