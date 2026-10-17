---
type: plan
status: active
phase: P3
task: "12"
subtask: "21"
updated: 2026-10-17
---

# 21 — 爆炸精灵与屏幕闪光

**契约来源：** [spec](../spec.md) 的 S-09、S-10、AC-13、AC-14；[爆炸精灵与屏幕闪光](../spec.md#爆炸精灵与屏幕闪光)；Q-03、Q-06、Q-09。
**依赖：** 03, 04, 13, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/sprites/`：帧号与隐藏按 textures §6 与 X4（复用或核对 `explosionFrame`）；以投影位置为中心、按 Q-09 的整数缩放（在逻辑像素中计算）；透明游程不画、DATA 直接显示；深度与遮挡按 Q-03、Q-09；选择来自 12 与 13。
- 计划新增 `src/render/flight/flash/`：三种闪光的触发（由 `hit`、实际爆炸激活与 13 的闪光请求驱动）、持续、抽取节奏、并发与级别按 Q-06 与 `data/scene-settings`；调色板空间变换作用于完整 4:3 游戏画面（含 P3-13 的层），不作用于黑边与 React 控件；第 0、1 类闪光每次抽取 r ≥ 0 时整个游戏画面上移 (r AND 0xFFFE)/2 个逻辑行，r = −1 保持上一次平移，结束时复位为 0，第 2 类不平移，露出的行为基色黑（spec 2026-10-17 修订）；只取任务时钟，暂停时冻结。
- 导出供 23 接入的 pass；测试覆盖帧号边界、缩放边界、遮挡、闪光触发与覆盖规则，以及平移行数、r = −1 保持、结束复位与第 2 类不平移。

## 不包含

- 接入与浏览器读回（23、25）。

## 关键文件与契约

- 现有：[explosions.ts](../../../../../src/core/rules/explosions.ts)、[flight-data-content.ts](../../../../../src/content/flight/flight-data-content.ts)。
- 计划新增：`src/render/flight/sprites/`、`src/render/flight/flash/`。

## 写入范围

- `src/render/flight/sprites/**`：爆炸精灵 pass 与测试。
- `src/render/flight/flash/**`：屏幕闪光与测试。
- `src/render/flight/composition/**`：游戏图像的深度纹理与 `CompositionFrame` 中的深度访问，供精灵按块左上像素做遮挡测试（FC8）。

## 验收标准

- [x] AC-13（Node 部分）：帧号、隐藏、中心、缩放、透明与遮挡符合规则。
- [x] AC-14（Node 部分）：三种闪光的触发、持续、节奏、级别与调色板变换符合 Q-06；第 0、1 类的画面平移符合 spec；暂停冻结。
- [x] `pnpm exec vitest run src/render/flight/sprites src/render/flight/flash` 通过。

## 验证方法

- Node 测试。

## 完成证据

- **实现：**
  - `src/render/flight/flash/screen-flash.ts`：与 GPU 无关的全局闪光状态，每个成功 tick 推进一次，次序按 SF1–SF5、WT3/WT4/WT7、HS1。调度阶段：改变视角模式的 `view-switched` 使显示的表回到 0（每次选择驾驶舱布局都安装布局调色板，cockpit.md）；`warp-started` 启动第 2 类。更新只在视角 1、8、0xC–0x12 中进行（严格比较的结束、无符号严格的抽取节奏、chop 级别、级别 SAR 1 为表号、r ≥ 0 写全局偏移、r = −1 保持、结束写 0）。更新之后的启动：视角 1 的 `warp-wall-contact` 启动第 0 类；玩家实体存在时，本 tick 的闪光检查请求启动第 1 类，随后不在 0x11 中、原因不是 parked 的玩家 `hit` 启动第 0 类；视角 1 中 D(D(n + u) ÷ L) > 0.95 启动第 2 类。启动只替换状态，不改调色板与偏移。等级不在 0–63 或持续时间为 0/非有限的记录在运行开始前以 `invalid-input` 拒绝。
  - `src/render/flight/flash/flash-screen-stage.ts`：经 `setScreen` 接入的屏幕阶段。对整幅游戏图像的每个分量 c 取 v = c >> 2，输出 e(min(v + 2k, 63))，表 0 原样复制；整幅画面上移 round(行数 × 缩放) 个设备行，露出的行按黑色经同一变换（原版的索引 0），黑边与 React 控件在画布之外。
  - `src/render/flight/sprites/sprite-rules.ts`：FC6/X4 帧记录（只有在 0xC–0x12 中激活的爆炸有记录，在其他视角中的帧变化到下一次变化才生效，隐藏为最终状态）；FC7 投影（1 < z < 3800、以 R 为两轴比例的 chop 中心、视口含端点、K = F((F − 1) ÷ (F − 2))、键 chop(65535 t)、按变体缩放、s ≤ 0 不入队）；FC8 排序按库函数 `0x85b2a` 的完整过程复现（按本地反汇编核实，2–15 项的区间先做间隔 3 的插入，再做间隔 1 的插入；更长的区间按中项、首中末三项的中值或 n SHR 3 间隔的三组中值选枢轴，三路划分后先处理较小的一侧）；按块裁剪（x ≥ 0、y ≥ 0、x + s < 640、y < B − s）。
  - `src/render/flight/sprites/explosion-sprites.ts`：`sprites` 槽位的 `FlightLayer`。每个动画的帧在 DATA 下直接展开（要求 `display: 'direct'` 与传入的调色板），堆叠成一张纹理，首次绘制时创建；每个精灵画一个裁剪后的四边形，按排序后的队列次序绘制。遮挡按 FC8 整块判定：每个不透明源像素的 s × s 块，在其左上逻辑像素（取含该像素中心的设备像素，`blockDepthPixel`）的世界深度不小于 d ÷ 65535 时整块绘制，否则整块不画，不写深度；因不能在写入同一帧缓冲时采样其深度，精灵先画进本层自己的渲染目标（清为不透明黑，画到的像素 alpha 为 0），再由第二个 pass 复制进游戏图像。位置按帧的 alpha 在上一 tick 与当前 tick 之间混合（与世界相同的折叠规则）；GPU 资源全部来自本运行的缓存，`explosionSpritesGpuPlan` 给出预算（含 +1 个渲染目标与复制用三角形）。须在运行的第一个 tick 之前创建。
  - `src/render/flight/composition/`（协调者在 `1f298e77` 扩大写入范围）：游戏图像的深度由渲染缓冲改为 24 位 `DepthTexture`（精度与原来相同，其他层的行为不变），`CompositionFrame.depth` 给出它；合成本身仍只占 1 个渲染目标，运行总计划（4 个）中精灵占 1 个。
- **测试：** `pnpm exec vitest run src/render/flight/sprites src/render/flight/flash`：3 个文件、62 项通过；`pnpm exec vitest run src/render/flight`：28 个文件、316 项通过（含合成的深度纹理、帧中的深度与随布局释放）。三个着色器（精灵、复制、闪光）按 three 的 GLSL 前缀在本机 Chrome 的 WebGL2 中编译并链接成功（临时脚本放在会话目录，未提交）。覆盖帧号边界（0、1、2 与第 n 帧隐藏）、在地图中激活从不绘制、在地图中的帧变化延后、记录清理与键重用、额外爆炸的创建次序、各变体的缩放边界、深度窗口与视口端点、65535 以上的键、排序（含 16 项相等键的库函数次序与 16–200 项的有序性）、块放置与左/上/右/下裁剪、堆叠纹理的 DATA 颜色与透明、四边形深度与源坐标、位置混合与折叠、缓存复用；闪光的命中、第 1 类、Warp 开始与撞墙、结束窗口（严格）、各种不触发情形、0x11 中的第 1 类、地图与基地中的触发、间隔 ÷ 2 + 1 tick 的节奏、r = −1 保持、结束复位、替换不复位、第 1 类与第 2 类首次更新清除平移、基地中不更新且视角切换显示布局调色板、u32 回绕、无 tick 不变与 tick 次序拒绝、调色板分量映射与设备行取整。块深度像素映射（含缩放 1.5、行自下而上与缓冲边界）、两个 pass 的目标/清除/相机、复制材质与精灵图像随布局重取均有断言。变基到目标分支 `e11fd86c` 后 `pnpm check`：370 个文件、10460 项通过，生产构建成功。
- **rubber-duck：** 采纳：位置改为按 alpha 混合；16 项及以上按库函数快速排序复现相等键次序（原为稳定排序）。FC8 的整块左上角遮挡：协调者选方案 B，已按上文实现；针对该改动的第二次窄范围审阅未发现问题（核对了反馈环安全、y 翻转、flat varying、alpha 标记与预算）。记录为残余：同一 tick 中 Core 爆炸与碎片爆炸的激活次序（仅影响相等键）；导弹爆炸命中与同 tick 闪光检查的先后不建模（只影响最后一次启动）。迟创建的图层无法恢复已有爆炸，改为在创建时拒绝已有爆炸的运行。
- **simplify：** 视角常量改用 core 的已有常量，`hasUpdate` 复用 `isSpriteView`；`step` 只扫描一次事件；精灵记录一次查找给出帧与次序；去掉每帧的 `Object.freeze`；排序间隔提为常量；运行中的闪光直接引用记录。未采纳：与 16 共用全屏三角形与位置混合（须改 16 的文件）。
- **文档影响：** 本子任务写入范围内只有本文档。建议交 28：`docs/engineering/modules/render.md` 与源码结构说明加入 `render/flight/sprites/` 与 `render/flight/flash/`，以及 23 的接线要求（精灵图层在第一个 tick 之前创建；闪光每个 tick 以 `flashRequests(tick)` 推进；屏幕阶段经 `setScreen`；合成生产 RENS 的闪光记录须在受支持的范围内，现为 −2³¹ 与 2³¹ − 1 的等级会被拒绝）。建议交 27：FC8 补充库排序的细节（三数取中的比较分支、递归中短于 16 项的子区间同样用两次插入、先处理较小的一侧），以及“每次视角切换安装布局调色板，使闪光表回到 0”的推论（高概率，依据 cockpit.md 的调色板说明与 PV2 的 `0x3f158`）。
