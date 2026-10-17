---
type: plan
status: active
phase: P3
task: "12"
subtask: "22"
updated: 2026-10-17
---

# 22 — Warp 隧道效果

**契约来源：** [spec](../spec.md) 的 S-11、AC-15；[Warp 隧道效果](../spec.md#warp-隧道效果)；Q-11。
**依赖：** 06, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **前提：** 当前分支包含 P3-09 的 `RenderState.warp`（同 10 的前提）。
- 计划新增 `src/render/flight/warp/`：只在视角 1 且 `warp` 非空时绘制；由序号、进度、n、u、L 与 15 个控制点按 Q-11 推出几何、颜色与贴图；按 pass 推进的部分每 tick 一次；表现抽取用表现随机源；序号变化时重置，`warp` 变为 null 时停止；不读写 Core 的 Warp 状态。
- 导出供 23 接入的 pass；测试覆盖开始、推进、重置、停止与表现抽取。

## 不包含

- Warp 规则（P3-09）。
- 接入与浏览器读回（23、25）。

## 关键文件与契约

- 计划新增：`src/render/flight/warp/`。
- 输入：P3-09 的 `RenderWarp`。

## 写入范围

- `src/render/flight/warp/**`：隧道效果 pass 与测试。

## 验收标准

- [x] AC-15（Node 部分）：绘制条件、推进、重置与停止符合 Q-11；不读写 Core 状态。
- [x] `pnpm exec vitest run src/render/flight/warp` 通过。

## 验证方法

- Node 测试。

## 完成证据

**实现（`src/render/flight/warp/`）：**

- `warp-templates.ts`：WT2 的 50 个环模板，按代码规则用默认 Watcom 序列（复用 `DefaultSeedRand`）丢弃 1128 次后的 2000 次抽取，模块载入时建一次，不碰表现随机源。50 × 20 × 3 的 f32 表的 SHA-256 前 16 位为 `1a16c020dbb5710a`，与 06 的独立模型（`local/research/p3-12/warp-tunnel/tools/effect-model.py`）一致。
- `warp-tunnel.ts`（`WarpTunnel`）：按 tick 推进的部分。由调用方每个成功 Core tick 调用一次 `step(renderState)`，tick 必须递增，否则 `invalid-state`；0 tick 帧不调用，也就不抽取。视角 1 且 `warp` 非空时：新 `serial` 先抽 40 次模板选择（rand % 50），并把游标置 0；然后按游标 k₀ 得到本 pass 的模板 pick[(k₀ + i) mod 40]，再按环位 30、20、10 × j 的次序抽 60 次环边（rand % 10 < 5），最后游标 +1 mod 40。`warp` 为 null 或视角不是 1 时立即停止：pass 为 null，不抽取。只读 Render State 的视角与 `warp.serial`；几何不读进度、n、u、L。
- `warp-tunnel-image.ts`（`WarpTunnelImage`）：一次绘制。
  - 环位：第 1–4 段，每段 10 个，t 为 f32 累加，段 s 用点 s − 1 … s + 2 调 P3-09 的 `evaluateWarpPath`；路径不变时缓存。
  - 模板变换与投影：变换按 `0x56e34`；投影按 `0x56dc0` 与 WT5，比例 800、中心 (320, 158)，chop 截断，超出 i32 的值取 −2³¹。点在相机平面上或之后时 x := −1，y 保留。
  - 距离与颜色：d² 按 WT4，亮度级 k = chop(52·min(1, …))；两个梯度为 63, 61, 60 … 1，按 DATA 的位复制把 6 位转为 8 位，边为绿、中为灰。
  - 画线：从环位 39 画到 1，同一 j 先画环边后画轨道。
  - 输出：640 × 315 的 RGBA 逻辑图像，未画处透明，只覆盖列 1–638、行 1–314。
- `warp-line.ts`：WT6 的拒绝条件、`0x51ab4` 的整数裁剪（先 x 后 y，两次截断除法），以及 3 像素宽的 Bresenham（边、中、边的次序，后画覆盖先画）。
- `warp-tunnel-layer.ts`（`createWarpTunnelLayer({ cache, random })` → `WarpTunnelLayer`，槽位 `warp-effect`，`WARP_TUNNEL_GPU_PLAN`：201,600 texel、4 顶点、6 索引、0 渲染目标）：
  - 绘制条件：只在当前 Render State 为视角 1、带 `warp`、有世界，且已推进过该 Warp 的 tick 时返回一遍逻辑相机绘制，不测也不写深度；所画 Render State 的 tick 或序号与最后一次 `step` 不符时为 `invalid-state`。
  - 相机：用世界的绘制相机（插值）。绘制相机恰为上一 tick 或当前 tick 的相机（观察实体的位置相同，且其库正交化行向量与绘制行向量相同）时，改用该 tick 存储的游戏行向量，即 WT4 的相机。只有 tick 之间的插值帧用插值后的正交行向量；插值是项目的取舍（技术决定 1）。
  - 重画：pass、相机都不变的重画帧不重新栅格化，也不抽取。

**有意差异（按 06 的建议契约）：** 新 `serial` 时游标置 0、投影暂存清为 (0, 0)；原版两者都从上一次 Warp 延续。游标在统计上不可区分；暂存只影响 WT6 中罕见的“指向左缘的轨道”。原版的“每 pass”在项目中为“每成功 Core tick”（技术决定 1、7），投影与颜色随显示帧所用的相机重算。开始、末段 5% 与撞壁的闪光归 21，本项不实现。

**交 23 的接入说明：** 运行开始时以运行的表现随机流（由 23 决定，应与星云、速度尘埃共用同一流）调用 `createWarpTunnelLayer({ cache, random })`，用 `addLayer` 接入，并把 `WARP_TUNNEL_GPU_PLAN` 加入运行的 GPU 计划。帧消费者在绘制前按次序对 `frame.report.outputs` 的每个 `render` 调用 `layer.step(...)`。静止帧（report 为 null）不调用。

**验证：**

- `pnpm exec vitest run src/render/flight/warp`：5 个文件、34 项通过。覆盖以下内容：
  - 模板：半径、z 范围、角度抖动与模型哈希。
  - 画线：拒绝条件，裁剪的截断与右、下边，x/y 主轴，点次序，界内。
  - 梯度与亮度级：k(1000) = 1、k(2000) = 4、k(4000) = 19，约 6532 起为 52。
  - 环位：边环位 30/20/10 与 60 次抽取；段 s 的求值；路径平移后旧第 2–4 段的环位不变。
  - 投影：按 800 比例与截断。
  - 图像：颜色只取自两个梯度；环边受抽取控制；相同输入画出相同图像。
  - 投影暂存：在相机平面后保留 y，新序号时清零。
  - 合成路径：用 `setUpWarpPath` 生成的路径与路径上的相机，近亮远暗。
  - 推进：开始时 40 + 60 次抽取；每 tick 60 次与游标轮转，40 后回绕；换序号重置；null 时立即停止，不抽取；同 tick 或更早的 tick 被拒绝；不改动 Render State。
  - 图层：GPU 计划与释放，不用深度，绘制条件，重画帧不重填、不抽取，插值相机重填但不抽取，停止与重置，tick 不符时拒绝；相机恰为某 tick 的相机时用存储行向量，插值时用绘制行向量。
- `pnpm check`：通过（363 个文件、10,370 项测试，构建成功）。
- 实际 Warp 的浏览器读回归 25。

**Rubber-duck：** 两项发现均已采纳。
- `texture.image.data` 的 `Uint8Array<ArrayBufferLike>` 类型错误（以及测试中只作类型使用的导入）：已修正。
- 绘制相机的库正交行向量不等于 WT4 的游戏行向量：已改为在 tick 对齐的帧用存储行向量，并加了非正交存储行向量的回归测试。

审阅确认以下各项与契约一致：序号重置、投影暂存的保留、null 时立即停止、tick 校验、每 tick 推进与 0 tick 重画。

**Simplify：** 已采纳：
- 去掉画线中每次调用的数组与闭包；
- 去掉 `WarpTunnel` 冗余的 `#serial`、图层缓存键中冗余的 `warp`；
- 收窄未用的导出，删除测试中的同义反复与重复的辅助函数。

未采纳：
- 与星云共用的纹理四边形助手：越出写入范围，交 28 或后续；
- 由场景直接给出 tick 的游戏相机（替代 `effectCamera` 的精确相等推断）：越出写入范围，建议 23 或 28 考虑在 `WorldView` 中加入；
- 脏行范围上传、模板惰性构建：目前没有可测的收益。

**文档影响：** 没有新的原版事实（实现按 WT1–WT9；模板哈希只证明与 06 的模型一致，WT2 所说的运行时读数仍未做），`docs/original/` 不变。工程文档中飞行图层（含 19 的星云层）尚未记录，交 28：
- 在 `docs/engineering/modules/render.md` 增加 `src/render/flight/warp/` 的模块说明（`step`/`passes` 契约、GPU 计划、上述有意差异、针对性测试命令）；
- 在 `docs/engineering/source-structure.md` 列出该目录。

STATUS 与 phase `tasks.md` 无需变化。
