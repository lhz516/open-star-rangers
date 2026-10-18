---
type: plan
status: active
phase: P3
task: "12"
subtask: "23"
updated: 2026-10-17
---

# 23 — 绘制 pass 接入渲染器

**契约来源：** [spec](../spec.md) 的 S-02、S-12、S-15；AC-07、AC-08、AC-09、AC-10、AC-13、AC-14、AC-15、AC-16、AC-23 的集成部分。
**依赖：** 17, 18, 19, 20, 21, 22, 31。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 17 至 22 的 pass 按 Q-03 定稿的层次接入 16 的合成与 15 的渲染器；每帧只读 `renderFrame()`、表现模块的当前状态与最新 projection。
- 按视角选择绘制内容（地图、基地与 0x13 不画世界；不可达视角按契约错误）；屏幕闪光最后作用于完整游戏画面。
- 资源：各 pass 的 GPU 资源进入 15 的运行内缓存与预算，释放后计数归零。
- 测试：记录表面上的完整帧（F1、Warp、被毁视角、带闪光）层次与资源计数；重试暖态计数相等。

## 不包含

- 浏览器回归（25）。

## 关键文件与契约

- 16 的合成、15 的渲染器与 17 至 22 的 pass。

## 写入范围

- `src/render/flight/renderer/**`：pass 接入。
- `src/render/flight/composition/**`：层次登记。
- `src/render/flight/scene/**`：按视角选择。
- `src/app/mission/**`：运行内容的解码与接线（星云图像、模型表面等）。
- `src/original-data/conversion/flight-data.test-support.ts`：合成生产 RENS 的光照字段落在研究过的范围内。
- `src/original-data/conversion/production-flight-graphics.test-support.ts`、`src/original-data/conversion/production-models.test-support.ts`：合成生产包的图形与模型落在各 pass 支持的范围内（受击闪烁尺寸、128×128 星云、同尺寸爆炸帧、部件标志与第 2 列表外壳）。

## 验收标准

- [x] 各 pass 按层次接入，按视角正确选择；资源进入缓存与预算，释放归零。
- [x] `pnpm exec vitest run src/render` 与 `pnpm typecheck` 通过。

## 验证方法

- Node 测试（记录表面）。

## 完成证据

- **实现：** [flight-passes.ts](../../../../../src/render/flight/renderer/flight-passes.ts) 的 `prepareFlightContent` 每个资源包一次（无 GPU）：准备 17 的模型表面、18 的护盾外壳、20 的对象外观，检查闪光记录（21）、爆炸帧（直接显示于 DATA、同一动画尺寸一致）与星云图像（128 × 128、不透明、直接显示），并以新增的 `addGpuPlans`（[flight-gpu-cache.ts](../../../../../src/render/flight/renderer/flight-gpu-cache.ts)）汇总各 pass 的 GPU 计划；内容错误在分配前拒绝开始。`attachFlightPasses` 按 FC2 槽位接入：星云、星点、速度尘埃、世界（光照模型 → 受击护盾 → 弹丸/导弹/碎片）、爆炸精灵、Warp 效果，并以 `setScreen` 安装屏幕闪光；`dispose` 移除各层并停止精灵的 tick 跟踪。视角选择沿用 16 的合成与场景（地图、基地、0x13 不画世界；不可达视角为 `unsupported-view`）。
- **随机流与逐 tick 推进：** [flight-run.ts](../../../../../src/render/flight/renderer/flight-run.ts) 只建一个 `presentationRandom(seed)`，同时交给表现模块（EXPL 子集与选择）、星云起点、护盾、闪光、速度尘埃与 Warp 效果；不另建同种子的流，未改表现模块。帧消费者逐个 tick 先 `presentation.advance` 该 tick，再按护盾、闪光、速度尘埃、Warp 的次序推进各 pass（速度尘埃取该 tick 的步末相机），然后绘制；无 tick 的帧（含 report 为 null 的静止帧）不推进、不抽取。逐 tick 交错使共享随机流在 1、5 tick 帧与插入 0 tick 帧时分配给同一消费者（AC-17；rubber-duck 指出整帧先推进表现模块会因分组改变抽取归属，已修正，回归测试在回退修正后失败）。代价：批次中不连续的 tick 在其前面的 tick 已处理后才使消费者故障（会话本来就因此故障）。`wireFlightRun` 返回 `effects` 供 20 的层使用。
- **内容解码：** [flight-content.ts](../../../../../src/app/mission/flight-content.ts) 解码 `models` 组的全部 model、image、palette Asset（逐项核对描述符绑定），以及唯一的 `flight-palette`（DATA）、`hit-shimmer` 图像、`projectile`/`missile`/`debris` 效果数据与 `debris` 模型；[flight-consumer.ts](../../../../../src/app/mission/flight-consumer.ts) 每个所有者解码并准备一次，失败由下次开始重试。
- **合成生产内容：** `flight-data.test-support.ts` 的 `PRODUCTION_SCENE` 改为方向光强度约 0.69、环境光约 0.27、闪光级别 40/63/24 与有限非零持续时间；经协调者批准扩大写入范围（114c1878）后，`production-flight-graphics.test-support.ts` 的护盾阈值改为与模型纹理同尺寸 4 × 2、星云改为 128 × 128、爆炸帧在同一动画内同尺寸，`production-models.test-support.ts` 的列表 0 部件标志改为 1–3、玩家列表 2 外壳改为带 TEX 11073 纹理的品质 1。合成 `mission-startable` 包的计划为 texels 920,862、vertices 27,085、indices 36,888、渲染目标 1（加合成自身共 2）。
- **测试（Node，记录表面）：** [flight-passes.test.ts](../../../../../src/render/flight/renderer/flight-passes.test.ts) 9 项：计划等于各 pass 计划之和；分配前拒绝缺图、帧尺寸不一、帧非直接显示、星云尺寸或掩码不符、缺 DATA、闪光级别 64、方向光 0；F1 完整帧的层次为清除 → 星云 → 星点 → 速度尘埃 → 光照模型 → 护盾 → 对象 → 精灵（自身目标 + 复制）→ 画布清除 → 闪光，世界层限于 F1 视口，玩家受击后闪光 `add` > 0，资源不超出计划；Warp 帧无星云与精灵、速度尘埃在世界之后、隧道之前且不清深度；被毁视角含玩家模型与精灵、全屏视口；地图、基地、0x13 只有清除与闪光，视角 2 为 `unsupported-view` 并锁存；静止帧与 0 tick 帧不调用 `RandStream.next`、画面与闪光不变，5 tick 帧逐 tick 推进；1×5、5、2+0+3 分组的抽取数、爆炸选择、闪光、护盾与速度尘埃图像一致；两次相同运行的暖态资源与表面计数相等，释放后为零。[flight-run.test.ts](../../../../../src/render/flight/renderer/flight-run.test.ts) 7 项与 [flight-consumer.test.ts](../../../../../src/app/mission/flight-consumer.test.ts) 9 项（真实所有者与会话：F1 帧含星云、星点、速度尘埃、光照模型并以闪光收尾；`hit-shimmer` 的下一架构版本拒绝开始并回滚）通过。
- **检查：** `pnpm exec vitest run src/render src/app/mission` 通过；`pnpm check` 通过（381 个文件、10,577 项测试、lint、typecheck、build）。
- **浏览器：** 在 5169/5170 端口用临时规格（已删除）走合成 `mission-startable` 包进入飞行，Chromium 中 F1 画布 640 × 481 有 19,621 个非黑像素（星点与合成星云），控制台只有 E2E 夹具允许的 favicon 404。协调者要求的现有 Playwright 套件（mission-flow 开发与生产、base-interaction、webgl-unavailable）15 项全部通过。完整浏览器回归归 25。
- **原版数据本地核对：** 在 `local/` 中对本地 CloneCD 镜像运行导入与 `prepareFlightContent`（输出只有计数）：models 组 6 个模型、219 张图像、18 个调色板，准备通过，计划 texels 3,034,317、vertices 40,840、indices 36,888、渲染目标 1，均在 FS-07 预算内。
- **Rubber-duck：** 两项均采纳：逐 tick 交错（见上）；把星云与爆炸帧的纯内容检查移到 `prepareFlightContent`，使其在任何分配前失败。
- **Simplify：** 采纳：共享 `addGpuPlans`（渲染器的合成计划也用它）、DATA 调色板在准备时取出一次、pass 推进改为接收表现相机而非经订阅侧通道取 tick、合并 payload 的读取与绑定检查。未采纳：从 `src/app/resources` 导出解码器（超出写入范围）、按引用懒解码（真实包一次解码规模小，每个所有者一次）、每 tick 的小数组分配。
- **文档影响：** 本子任务范围内无需更新的文档；飞行渲染器的工程文档已按 15 的交接归 28，建议见报告。

