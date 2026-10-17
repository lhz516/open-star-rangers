---
type: plan
status: active
phase: P3
task: "12"
subtask: "31"
updated: 2026-10-17
---

# 31 — 星点与速度尘埃

**契约来源：** [spec](../spec.md) 的 S-15、AC-23；[星点与速度尘埃](../spec.md#星点与速度尘埃)；Q-14。
**依赖：** 10, 12, 16, 30, 32。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/starfield/`：按 30 的结论实现星点方向表（用原版 C 库 `rand` 默认序列的独立确定生成器重现同一张表，不使用也不推进表现随机源，与种子无关）、只按相机行旋转的投影、DATA 直接显示的单像素与清除；速度尘埃的 50 个粒子（每 pass 全部处理）、重生（表现随机源）、颜色、按 FS-12 份额的整层跳过（初始化后份额 ≤ 1）与近处粒子亮度，F1 与被毁视角中为单像素，Warp 中为线段。
- 推进节奏按 30 与 spec [技术决定](../spec.md#技术决定) 1、7：按 tick 推进的部分每个成功 tick 一次，0 tick 帧不抽取随机数。只读 Render State（含 32 实现的 FS-12 速度份额）、12 的表现相机与 D-01 已定的事实，不在表现层猜测速度。
- 导出供 23 接入的 pass（层次按 FC2 与 16 的合成：F1 中星点在三维世界之前，Warp 中速度尘埃在世界之后、隧道之前）；地图、基地与 0x13 不绘制。
- 测试：方向表与种子无关并与确定序列一致、生成时表现随机源不推进；注入随机源下的重生、独立期望的投影坐标与颜色、份额决定整层跳过与近处亮度（含边界、重置后的首次初始化、被毁视角的爆炸前、有效跟随与跟随实体离表为 0）、线段端点、F1/被毁/Warp 都绘制而地图/基地/0x13 不绘制、0/1/5 tick 推进一致、0 tick 帧不抽取。

## 不包含

- 接入与浏览器读回（23、25）；真实内容配对与判定（26、27）。

## 关键文件与契约

- 30 的完成证据与 `local/research/p3-12/stars-dust/findings.md`；12 的表现随机源与相机；16 的逻辑画面与合成。
- 计划新增：`src/render/flight/starfield/`。

## 写入范围

- `src/render/flight/starfield/**`：星点与速度尘埃 pass 与测试。

## 验收标准

- [x] AC-23（Node 部分）：方向表、投影、颜色、清除、整层跳过与亮度、重生与线段符合 Q-14 的独立期望；只用表现随机源，不改 Core 状态或 RNG。
- [x] `pnpm exec vitest run src/render/flight/starfield` 通过。

## 验证方法

- Node 测试。

## 完成证据

**实现：** 新增 `src/render/flight/starfield/`：

- `star-field.ts`：`WatcomRand`（状态从 1 开始，×0x41C64E6D + 0x3039 mod 2³²，取位 16–30）只供建表，表现随机源不参与；`starTable()` 按 SD2 的次序与 f32 存储点生成 500 项（π′、2π′ 用 f64 常量 3.1415927、6.2831854），模块内缓存一次；`drawStars(rows, bottom, plot)` 按 SD3 只用相机行旋转、z′ ≥ K、−S < x′ < S、hd′ = 81 与 hw = 320 的映射、+0.5 向零取整，行 0…bottom。
- `speed-dust.ts`：`SpeedDust.step({render, events, camera})` 每个成功 tick 一次（`camera` 为该 tick 的 `PresentationTick.afterStep`，tick 须一致且递增）。按 SD5：该 tick 任何 `view-switched` 满足 viewMode ≠ fromViewMode 或 viewMode = 0x11 时复位一次；只在视角 0xC–0x12 与 1 且 `observedEntityId` 非 null 时运行；未初始化时按当前视角的盒初始化（150 次抽取，在份额检查之前）；`speedShare` ≤ 1 时到此为止（不抽取、不改状态、无绘制）；否则 50 个粒子逐个用 `0x56dc0`（`pointInFrame`）与门禁投影（比例 right、中心 right >> 1、bottom >> 1、向零取整，越界为整数不定值）判定，重生 4 次抽取（x、y、r % 100 < 60、z）且该遍不画；亮度在 0x11 与 1 为 7、其他为 (5 × 份额) idiv 100，颜色夹在 2–7；Warp 中上一遍已画的粒子画线段。`drawDustLine` 按 `0x5ad00`（两端都画，|dx| > |dy| 时沿 x，误差初值 2|d_minor| − |d_major|，≥ 0 时走次轴）。抽取只来自注入的表现随机源，并校验为 0–32767。
- `starfield-layers.ts`：`createStarFieldLayer({cache, palette})`（槽 `stars`，每帧用 `frame.world.scene.camera.rows` 与视口 bottom，行或 bottom 变化时才重填）与 `createSpeedDustLayer({cache, palette, random})`（槽 `dust`，`step(tick)`；绘制最近一次 step 的标记，帧的当前 Render State 不是该 tick 时为 `invalid-state`；0 tick 帧不重填、不抽取）。两层把逻辑像素写入 640 × 480 的 RGBA 图像（DATA 调色板直接显示，不透明），不测试也不写深度；逻辑像素索引 y × 640 + x，因此 sx = 640 写到下一行第 0 列、越过画面末尾时丢弃（同原版无裁剪的帧缓冲写入）。GPU 计划 `STAR_FIELD_GPU_PLAN`、`SPEED_DUST_GPU_PLAN` 各为 640 × 480 texels、4 顶点、6 索引。

**测试（31 项，`pnpm exec vitest run src/render/flight/starfield` 通过）：**

- `star-field.test.ts`：生成器前四个值 16838、5758、10113、17515（默认序列）；表的 SHA-256 等于 30 的独立期望 `1aa3406e…2754`，S = 0.4472135901451111、K = 0.7926233410835266，颜色 i % 6 + 1；表不接受任何随机源、冻结且唯一；单位行时 F1 画 57 个（sx 37–605，sy 12–311）、0x11 画 68 个（30 的预测）；7 组相机行 × 两个 bottom 与测试内另写的 SD3 转写逐项一致；S 之下最大的 f32 给出 sx = 640，bottom 行包含、bottom + 81 排除。
- `speed-dust.test.ts`：测试内另写一份不引用被测模块的 SD5 转写，以脚本化的整数序列在 F1、Warp（含线段）、0x11 与视角切换的 133 个 tick 中逐 tick 核对标记、抽取次数与粒子世界位置；手算锚点（全取 16384 时粒子位于 (0.000916, 0.000916, 150.0046)，画在 (319, 157)，颜色 7）；份额 100/60/39/2 的近处颜色 7/5/3/2，0x11 在份额 2 时为 7，回绕超过 100 的份额仍夹为 7；F1 在 L1 距离 175、0x11 在 250 的颜色分界；初始化后份额 1、0、−5 时抽取 0 次、状态与粒子不变；复位后份额 ≤ 1 也初始化（150 次），同 tick 两次切换只初始化一次，切到同一视角不复位、0x11 → 0x11 复位；Warp 与其他视角的初始化盒；重生的 4 次抽取与近/远深度、该遍不画；被毁视角用 Core 的 `cameraSpeedShare` 得到的爆炸前 A(30)、跟随碎片的份额都绘制，跟随实体离表为 0 时不抽取、无绘制；视角 6、8、0x13 与没有玩家实体时不抽取、不初始化；相机 tick 不符、tick 不递增与越界的随机值被拒绝；线段算法的端点、走向与相等时沿 y。
- `starfield-layers.test.ts`：两层在运行的 GPU 缓存中按计划分配、槽位、用逻辑相机、不测试也不写深度、释放后为 0；调色板少于 8 项被拒绝；星点图像的不透明像素与 `drawStars` 的结果逐一相同、颜色为调色板值；没有世界时不绘制，行与 bottom 不变时不重填；sx = 640 的换行与越界丢弃；速度尘埃在第一次 step 前不绘制、标记写成 DATA 颜色、帧与 step 的 tick 不符时拒绝、份额 ≤ 1 的 tick 无绘制、Warp 线段光栅化；同一序列下逐 tick 推进与 1、5 tick 一帧推进的图像与抽取次数相同，0 tick 帧不抽取、不重填。

**检查：** `pnpm check` 通过（typecheck、ESLint、Vitest 370 个文件 10429 项、production build）。只读 Render State、事件与表现相机，不改 Core 状态或 RNG；星点表不使用、不推进表现随机源。

**rubber-duck：** 一次审阅，对照 spec、FC2、SD1–SD8、30 的计算步骤与 16、22 的接入约定，未发现需要修改的问题。之后补了一项把被毁视角三种 FS-12 状态与整层跳过联系起来的测试。

**simplify：** 采纳：`RAND_SCALE` 代替两处自定义的 F(1/32767)；颜色上限由 `speed-dust.ts` 的 `DUST_MOST_COLOUR` 统一；近处亮度判定只算一次；图像写入改为预先算好的 32 位颜色、只清除上次写过的像素，每像素不再分配。未采纳：导出 `warp-tunnel-image.ts` 私有的 `chop`（在写入范围外）；合并线段的两个分支与建表的两遍（与原版结构一一对应，便于核对）；测试用的只读访问器。

**交 23 的接入说明：** 运行开始时 `createStarFieldLayer({cache, palette: DATA 调色板})` 与 `createSpeedDustLayer({cache, palette, random: 运行的表现随机流})`（与星云、Warp 同一流），`addLayer` 接入两层并把 `STAR_FIELD_GPU_PLAN` 与 `SPEED_DUST_GPU_PLAN` 加入运行的 GPU 计划；每帧绘制前对 `report.outputs` 的每项按次序调用 `dust.step({render: o.render, events: o.events, camera: 该 tick 的 PresentationTick.afterStep})`，静止帧不调用。星点无需推进。

**文档影响：** 原版事实与 U 项没有新增（全部沿用 30 写入的 SD1–SD8）。工程文档的源码结构与 render 模块说明尚未列出 `src/render/flight/` 的子目录（15 已交 28），建议 28 一并加入 `starfield/`（星点与速度尘埃两层及其 step 契约）。STATUS 与阶段 `tasks.md` 不需要改动。
