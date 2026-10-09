---
type: status
status: active
phase: all
updated: 2026-10-08
---

# 项目进度

**当前阶段：P2 玩法所需资源管线**（P2-01 切片资源边界与内容契约、P2-02 CCD/IMG 与 ISO9660 按需读取、P2-03 NOB、基准版本识别与输入校验、P2-04 Worker 导入协议与生命周期、P2-05 调色板、索引图像与字体转换、P2-06 切片模型与材质转换、P2-07 驾驶舱、HUD 与战略地图资源、P2-08 核心音效转换与播放适配、P2-09 单任务与战略地图/Warp 数据、P2-10 IndexedDB 最小资源缓存、P2-11 真实导入流程与最小资源查看器、P2-12 资源管线联合验证与本地对照、P2-13 P2 退出评审与 P3 交接已完成，P2 退出评审已通过，下一阶段待授权；P1 本地退出评审已通过，P0 其余项目并行收尾）

本文件是项目总进度入口，只记录当前阶段、阶段状态摘要、任务索引入口、下一步与项目级阻塞，不跟踪阶段退出条件或任务执行状态。阶段范围和退出条件由[总计划 §12](./plan/master-plan.md#12-开发阶段与验收条件)定义，任务状态见各 goal，验收证据见 subtask 文档，最终退出判定见[阶段评审](./reviews/)。

## 阶段总览

| 阶段 | 状态 | 任务 | 评审记录 |
|---|---|---|---|
| P0 基准与可行性 | 可行性评审已通过，其余项目并行收尾 | —（未设置任务索引） | [P0-feasibility](./reviews/P0-feasibility.md) |
| P1 工程与运行骨架 | 本地退出评审已通过 | [P1 tasks](./plan/p1/tasks.md) | [P1-exit](./reviews/P1-exit.md) |
| P2 玩法所需资源管线 | 退出评审已通过 | [P2 tasks](./plan/p2/tasks.md) | [P2-exit](./reviews/P2-exit.md) |
| P3 完整玩法切片 | 任务拆分已批准，未开始实施 | [P3 tasks](./plan/p3/tasks.md) | — |
| P4 Classic 内容完成 | 未开始 | [P4 tasks](./plan/p4/tasks.md) | — |
| P5 Classic 1.0 发布 | 未开始 | [P5 tasks](./plan/p5/tasks.md) | — |
| P6 Enhanced 美化 | 未开始 | [P6 tasks](./plan/p6/tasks.md) | — |

## 下一步

1. P2：P2-01 至 P2-13 已完成，退出评审已通过。
   - [P2-01](./plan/p2/01/goal.md#子任务跟踪)：切片候选与唯一生产切片定义、来源映射边界、完整性/预算/所有权契约及合成契约测试。
   - [P2-02](./plan/p2/02/goal.md#子任务跟踪)：纯字节读取端口、CloneCD/原始扇区/ISO9660 按需读取、浏览器 Blob 与 Node 适配、本地核对 CLI。基准盘 50 个游戏文件经读取链核对一致，结构事实见 [disc-image](./original/formats/disc-image.md)。
   - [P2-03](./plan/p2/03/goal.md#子任务跟踪)：严格 IMFAT 规则与按需封包读取、生产版本白名单与来源指纹、已验证来源产品入口、来源映射核验、底层能力边界与本地核对 CLI。基准盘 9 个 NOB 共 1,857 个条目全部通过校验，结构事实见 [imfat](./original/formats/imfat.md)。

   - [P2-04](./plan/p2/04/goal.md#子任务跟踪)：
     - **Worker 侧：** 双向运行时校验的导入消息协议、Worker 宿主与生产导入作业（经产品入口识别，按读取上报进度）；
     - **主线程侧：** app 作业持有者（单作业状态机、同步取消与释放、旧消息隔离、组结果重新验证与一次性移交）、浏览器模块 Worker 适配；
     - **边界：** Worker 禁用网络 API，生产代码不得依赖测试支持；
     - **验证：** 真实 Chromium Worker 测试只在开发项目运行；在本地基准镜像上，生产作业识别读取 17,255,043 字节。
   - [P2-05](./plan/p2/05/goal.md#子任务跟踪)：
     - **规范图形：** 调色板、索引图像与字体的 payload；项目唯一的调色板展开与暂定最近色规则；字符查找；
     - **转换：** 加固的原版源读取与转换声明，扣除预算后才分配；图形转换步骤共用条目读取；作业新增 `convert-graphics` 阶段（协议版本 2）；
     - **生产：** 5 个 Asset，即两份飞行调色板与 HI 驾驶舱的 3 个 HUD 字库，字符映射只含有证据的同号区间。在本地基准镜像上，图形步骤读取 992,544 字节；
     - **研究：** 最近色规则在 P2-05 时为暂定，记录了 29 个 TEX 的歧义条目；2026-10-06 由 P2-06/12 以 EXE 证据确认度量与并列规则，见 [textures](./original/formats/textures.md) §3；4×6 字库实为 192 个 8 行字形，字库部分为高概率（U-030），见 [hud](./original/formats/hud.md) §1.1。
   - [P2-06](./plan/p2/06/goal.md#子任务跟踪)：
     - **规范内容：** 模型 payload（几何的位置、UV、法线、三角形与角明暗槽，三个部件列表的颜色与贴图引用，以及音效槽；浮点与绕序原样保留）与效果 payload（弹丸标记、导弹体与碎片模板）；`content/models/` 与 `content/effects/` 的纯展开与消费辅助。
     - **转换：** MESH/MODL 定向读取；模型步骤按 P2-09 的机型到模型绑定命名模型，贴图与导弹图像沿用 P2-05 的图形步骤转换，与模型、效果一起放入 `models` 组；效果几何按 2026-10-06 获批的修订从 RENS 条目与 LE 可执行文件读取。新增 `convert-models` 阶段（协议版本 5），发送 `models` 组；`ConverterVersion` 增加 `models-1` 组件。
     - **研究：** 最近色规则由 EXE 确认为 8 位分量的平方欧氏距离，并列取最低序号，见 [textures](./original/formats/textures.md) §3；效果几何来源见 [executable](./original/formats/executable.md)（U-027）。
     - **本地验证：** 在本地基准镜像上，`models` 组为 `group-complete`（44 个 Asset，0 条诊断），四个组共用一个包身份；效果几何经独立读取核对一致。
   - [P2-07](./plan/p2/07/goal.md#子任务跟踪)：
     - **规范内容：** 布局 payload（画幅与按绘制顺序的元素图像引用）与唯一的纯布局合成；CCKD 分组、元素与分组调色板，MFDD 记录与 TABL 图像列表的容器子资源。
     - **生产：** 96 个 Asset：前视驾驶舱与地图边框布局及元素、地图调色板、状态显示背景与叠加图、左显示屏页面背景、仪表条、地图单位标记与放大窗口图标；2026-10-08 的修订增加左显示屏干扰画面（SNIP 10487 的 9 帧）与状态显示屏文字（DIAG 10489，`data` payload）。作业发送 `cockpit-hud-map` 组，`ConverterVersion` 的图形组件为 `graphics-3`。
     - **研究：**
       - 地图调色板是 CCKD 分组调色板；
       - HUD 与地图的绘制路径与透明规则由 EXE 确认；
       - 参考画面的字库与放大窗口图标的对应已记录，见 [cockpit](./original/formats/cockpit.md) 与 [hud](./original/formats/hud.md) §1.2、§2。

       P2-12/27 已追踪雷达接触点、地图圆环标记等未识别元素的来源（代码绘制，交 P3）；SNIP 10487 与 DIAG 10489 按 2026-10-08 的修订转换（见上方“生产”），不再转交 P3（U-030）。
     - **本地验证：** 在本地基准镜像上，`cockpit-hud-map` 组为 `group-complete`，用量在份额内，生产合成与截图比较已记录。
   - [P2-08](./plan/p2/08/goal.md#子任务跟踪)：
     - **转换：** SND 定向解析与规范采样 payload；音频组转换（目录预检、来源核验、预算）；新增 `convert-audio` 阶段，发送 `audio` 组。
     - **生产表：** 18 个 sound Asset 的生产表，开火、导弹、爆炸与 Warp 的每个变体都经开发者在基准 DOSBox-X 中试听确认，见 [audio](./original/formats/audio.md#listening-comparison-p2-0810)。
     - **播放：** `platform/audio/` 的 Web Audio 控制器与浏览器工厂，Chrome 中的真实解锁、隐藏与释放验证。
     - **基准核对：** 本地基准镜像上得到完整的 `audio` 组，用量远低于预算。
   - [P2-09](./plan/p2/09/goal.md#子任务跟踪)：
     - **研究：** 所选任务的字段清单、地图框架与 Warp 目的地选取，见 [scenario](./original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)、[executable](./original/formats/executable.md#strategic-map-projection) 与 [B-001](./original/behavior/B-001-strategic-map.md)；
     - **内容与转换：** 规范任务、机型表与僚机名单 payload；SCEN/SCCT/M2ID 定向解析；唯一的机型到模型绑定；生产映射与子资源核验；
     - **共享机制：** 生产 `ConverterVersion` 与 `ManifestIdentity`；沿用 P2-05 的步骤内读取与份额；
     - **作业：** 新增 `convert-logic` 阶段，发送 `logic` 组；Core 的 `loadMission` 产出冻结的任务初始数据；
     - **本地验证：** 在本地基准镜像上，`logic` 组为 `group-complete`，`loadMission` 成功，逻辑步骤读取 61,152 字节。
   - **P2-08 与 P2-09 合入后：** 作业阶段为 `identify-source` → `convert-graphics` → `convert-logic` → `convert-audio`，协议版本 4；两者共用 P2-09 的 `ManifestIdentity` 推导，同一作业的 `logic` 与 `audio` 组带同一包身份；生产 `ConverterVersion` 为 `osr-import.logic-1.audio-1`（按 P2-08 的组件格式，各转换器一个组件）。
   - [P2-10](./plan/p2/10/goal.md#子任务跟踪)：`platform/storage/` 的资源缓存，缓存键为来源指纹＋转换器版本；完整包在单个事务中原子提交，同源刷新后重新校验再恢复；容量与配额、取消、中断、损坏、连接生命周期等失败都有明确反馈。浏览器证据来自 Chrome 中的隔离合成数据库，其他浏览器归 P5。
   - [P2-11](./plan/p2/11/goal.md#子任务跟踪)：
     - **导入与缓存：** 菜单、导入页面与查看器的页面流转；应用资源持有者按已验证的状态阶梯显示结果，完整包自动提交到 P2-10 缓存，刷新后重新校验再恢复，任务载入 Core 的诊断显示在页面上。
     - **查看器：** 模型、效果、图像、调色板、布局与字库的按需渲染，呈现约定集中在一处并标注置信度；核心音效试听。效果贴图按研究确认的柱面映射显示，导弹只用第 0 个旋转，跨接缝面的插值未确认（用户决定）；效果 payload 为 schema 2。当前生产 `ConverterVersion` 为 `osr-import.graphics-3.logic-1.audio-1.models-3`（P2-06、P2-07 于 2026-10-08 修订后，旧缓存不再恢复，须重新导入）。
     - **生产预览：** 本地 `vite preview` 发送拟定的严格 CSP，Worker 入口与回退、预置缓存的查看路径都在该策略下验证；真实 SWA 的回退与响应头归 P5。
     - **验证：** 合成数据的 Node 与 E2E 测试；本地真实数据的 Node 核对（四组完整、任务可载入、全部场景构建无错误）；用户在 Chrome 中用本地生产预览完成实机核对。操作见[本地导入指南](./guides/local-import.md)。

   下一步按[推荐执行顺序](./plan/p2/tasks.md#推荐执行顺序)：
   - 批次 4、5 已完成。合入后作业阶段为 `identify-source` → `convert-graphics` → `convert-logic` → `convert-audio` → `convert-models`，协议版本 5，四个组共用同一包身份；
   - 批次 6 已完成：P2-11 的 S/AC 已由最终对齐逐项核对，见其 [goal](./plan/p2/11/goal.md#子任务跟踪)。
   - 批次 7：[P2-12](./plan/p2/12/goal.md#子任务跟踪)（资源管线联合验证与本地对照）已完成：联合闭环、失败矩阵、网络审计与产物出站审阅都已通过；原版本地对照逐类完成，结论见[最终对齐](./plan/p2/12/subtasks/26-final-alignment.md#第四次运行2026-10-08通过)。期间合入了用户批准的 P2-06（MESH 贴图坐标按两个连续数组读取）与 P2-07（转换 SNIP 10487 与 DIAG 10489）修订，当前生产 `ConverterVersion` 为 `osr-import.graphics-3.logic-1.audio-1.models-3`。缺少原版基准的少数项（第 2 列表外壳的静态外形、导弹类型 0、2、3 的飞行外观、跨接缝面）经用户批准记为范围例外。
   - [P2-13](./plan/p2/13/goal.md#子任务跟踪)（P2 退出评审与 P3 交接）已完成：在构建与内容身份同 P2-12 的最终候选上重跑了工程、Python、三个项目的浏览器回归、聚合合规与真实数据候选核对，都首次通过；用户在最终候选上复核了导入、刷新恢复与模型、SNIP 帧的查看；以 P2 为负责阶段的 8 个未知项，P2 部分都已关闭或切片不需要，负责阶段移到后续阶段。
   - **下一步：** [P3 任务拆分](./plan/p3/tasks.md)已于 2026-10-08 获用户批准（16 项任务及其依赖与验收覆盖，尚无 spec/goal），按[推荐执行顺序](./plan/p3/tasks.md#推荐执行顺序)从 P3-01 的 spec 开始；阶段切换仍须明确授权。[P2 退出评审](./reviews/P2-exit.md)已于 2026-10-08 确认通过并冻结（高概率判定与范围例外已逐项披露），不自动启动下游任务。交接入口见评审的[对后续阶段的影响](./reviews/P2-exit.md#4-对后续阶段的影响)。
2. P0 收尾（用户）：试玩回答 U-011、U-013，反馈流畅度以校准 cycles（U-021）；确定目标测试设备。U-015 的剩余部分见 [unknowns](./original/unknowns.md)；U-025 的负责阶段为 P3。
3. U-022 的剩余字段：规则语义归 P3，其余任务的字段归 P4（负责阶段见 [unknowns](./original/unknowns.md)）；模型槽位选择已确认，见 [executable](./original/formats/executable.md) §4。
4. P3 行为研究新增 U-031：战役被毁可进入救援，真实失败/重试条件仍未确认，见 [B-005](./original/behavior/B-005-campaign-rescue.md)；不复用练习模式被毁即失败。

## 阻塞项

- 无。
