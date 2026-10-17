---
type: plan
status: active
phase: P3
task: "12"
subtask: "17"
updated: 2026-10-17
---

# 17 — 模型、光照与明暗级

**契约来源：** [spec](../spec.md) 的 S-04、AC-07；[模型、光照与第 2 列表](../spec.md#模型光照与第-2-列表)；Q-02、Q-12。
**依赖：** 02, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/lighting/`：按 02 的结论，从 `ImagePayload.indices` 与源 `PalettePayload.entries` 生成明暗级，再按 `nearestColourMap` 的规则映射到 DATA；不从 `expandImage` 的已量化 RGBA 推回源色。
- 两盏灯取 `data/scene-settings`；着色、抖动、贴图采样与环绕按 Q-02；部件标志按 Q-12 解释 `sourceFlags`；最终颜色是 DATA 中的一项；不用 tone mapping 或颜色空间转换。
- 以 `src/render/flight/lighting/` 导出供 23 接入的绘制 pass；可复用 `modelPartItems` 的几何，但材质语义按 Q-02、Q-12。
- 测试：每个光照方向、明暗级边界、贴图与无贴图部件、各标志值的独立期望 DATA 索引；能区分“先量化再着色”的错误。

## 不包含

- 受击闪烁（18）。
- 接入渲染器（23）；浏览器读回（25）；原版画面比较（26）。

## 关键文件与契约

- 现有：[model-payload.ts](../../../../../src/content/models/model-payload.ts)、[model-parts.ts](../../../../../src/content/models/model-parts.ts)、[image-payload.ts](../../../../../src/content/graphics/image-payload.ts)、[expand-image.ts](../../../../../src/content/graphics/expand-image.ts)、[flight-data-content.ts](../../../../../src/content/flight/flight-data-content.ts)。
- 计划新增：`src/render/flight/lighting/`。

## 写入范围

- `src/render/flight/lighting/**`：明暗级、光照 pass 与测试。

## 验收标准

- [x] AC-07（Node 部分）：独立期望的 DATA 索引与颜色全部通过；保留源索引与色表。
- [x] `pnpm exec vitest run src/render/flight/lighting` 通过。

## 验证方法

- Node 测试；合成内容来自 [models.test-support.ts](../../../../../src/content/models/models.test-support.ts)。

## 完成证据

2026-10-17，worker `exec-p3-12-17`（基于 d57c027d）。没有运行基准环境（DOSBox-X）；为核实归一化与面法线的逐位算法，在私有 Ghidra 副本上只读反汇编了 `0x94938`、`0x8777c`、`0x97b14`、`0x94b1c`、`0x7ae80` 与 `0x81d74` 的片段，输出只在 `local/research/p3-12/lighting/out/w17-*`。

- **实现（`src/render/flight/lighting/`）：**
  - [lighting-math.ts](../../../../../src/render/flight/lighting/lighting-math.ts)：按基准环境的舍入（双精度运算、f32 存储就近偶数）实现 LS2/LS3/LS6/LS7：单色强度、环境字节 min(255, RHE(256·I))、`0x948a4` 与 `0x94938` 两种归一化、面法线 `0x97b14`、L′ = F(normalise(−X.x, −U.x, −D.x)·k)（k = F(3·I_d)，取绘制位姿的 f32 轴）、亮值 RHE(256·d)（d ≤ 0 为 0）与明暗级 (值 + 0x80) >> 8。
  - [shade-ramps.ts](../../../../../src/render/flight/lighting/shade-ramps.ts)：`data/scene-settings` → I_d、环境字节、a = 字节/256；只接受单光快速路径（0 < I_d ≤ 1）与非负环境级，其余以 `ContentContractError` 在运行开始前拒绝。梯度项 min(255, chop(c·a + c·((i/(N−1))·F(1−a))))，从源色（部件颜色或 TEX 自身调色板项）生成，每级各一次 `nearestColourMap` 到 DATA；不经 `expandImage` 的量化 RGBA。
  - [model-surfaces.ts](../../../../../src/render/flight/lighting/model-surfaces.ts)：部件质量 = min(RENS +0x18, 第 0 列表标志低字节 / 第 1 列表 2 / 第 2 列表首部件标志)，只支持 1、2、3（0 线框与 4 拒绝）；每三角形角一个顶点，保留存储的角序、绕序与 UV；质量 2 用面法线、3 用 `normals[slot]`（`0x94938` 归一化，槽号 ≥ 顶点数的角为零法线即亮值 0）、1 不受光；贴图保留源索引并按自身调色板建梯度（须不透明、索引在调色板内、按 DATA 最近色显示），无贴图用部件颜色；梯度按键共享；`LitPartBuilder` 供 18（第 2 列表）与 20（第 1 列表）复用；`plan` 为 GPU 预算（顶点 = 角数，纹素 = 各贴图与各梯度集各一次）。
  - [model-lighting-layer.ts](../../../../../src/render/flight/lighting/model-lighting-layer.ts)：`FlightLayer`（`world` 层位，用 `frame.world.camera`）：按场景的实体次序绘制 `model` 表现实体的第 0 列表部件，位姿为绘制位姿；L′ 每实体每帧在 CPU 精确计算，经 `onBeforeRender` + `uniformsNeedUpdate` 作为共享材质的逐对象 uniform；顶点着色器以 GPU 单精度算 d 与 roundEven(256·d)（仅在 256·d 距半整数数个 f32 步长内可能与原版不同）；平面/不受光部件用 `flat` 变量，Gouraud 与 UV 乘 w 再乘 `gl_FragCoord.w` 得屏幕空间线性插值；UV 取小数部分重复、最近纹素、单级；像素 = 梯度纹理（DATA 颜色）中的一项，无 tone mapping/颜色空间转换。几何、材质、贴图与梯度纹理都经运行的 `FlightGpuCache`。
- **剔除方向：** 原版保留屏幕顺时针、(b − a) × (c − a) 朝向相机的三角形（RS4）；相机空间 x 右、y 上、z 向远处，相对 WebGL 是镜像，所以这些是 WebGL 的背面，材质用 `BackSide`（测试以实际投影矩阵证明：朝相机三角形的 NDC 有向面积为负、RS4 判式为正）。这与 16 交接中“正面为逆时针（屏幕顺时针）”的写法不同，交 23/28 注意。
- **明确限度（非像素等价）：** 三维按设备像素由 WebGL 连续光栅化绘制（ADR-0009），不是原版的定点光栅化：行取整后的剔除判定（行取整相同的细三角形）、16.16 截断步进且无亚像素预步进时贴图/明暗边界旁的像素、16 位定点深度的平局（RS2–RS5、LS7）可能不同；Gouraud 屏幕空间插值本身为高概率（L-G1）。颜色、明暗级、纹素与剔除方向在其余像素上按规则。梯度表满时的共用（LS4，高概率不触发）与 +0x202C 键未建模。
- **Node 测试（AC-07 Node 部分）：** `pnpm exec vitest run src/render/flight/lighting`：4 个文件 28 项通过。独立期望在测试内另写：梯度式、逐项暴力最近色（DATA 分量清低两位、严格小于、低索引优先，不调用 `nearestColourMap`）。覆盖：六个光照方向（世界 −x 依次落到模型 ±x、±y、±z，检出光向反向、转置与轴错位），每方向对平面贴图部件逐角逐纹素、不受光贴图部件、Gouraud 无贴图部件逐角的亮值（384、307、230、0）与 DATA 索引；明暗级边界（I_d = 0.5 时 n·L = 1 → 384/级 2，1/3 → 128/级 1，0 与 < 1/512 → 0，级边界 127/128、383/384、639/640）；chop 边界（a = 0.125、c = 36、级 1 真值 15 得 14）；“先量化再着色”陷阱调色板（正确 2，错误路径 1）；标志 1/2/3 在设备字节 3 与 2 下、0x8000_0003 高位忽略、质量 0/4 拒绝；越界槽号为零法线；贴图保留源索引；内容拒绝（缺贴图/调色板/DATA、直接显示、最近色目标不是 DATA、有掩码、索引越界、光照越界）；图层的绘制集合与次序、位姿矩阵、逐实体 L′ uniform、几何/材质/纹理共享与缓存计数等于 plan（加合成自身的 3 个顶点）、变体（FLAT/TEXTURED/BackSide/深度）、离表回收与未知模型拒绝、无世界视角。
- **浏览器冒烟（读回验收归 25）：** 临时入口页（已删除）在本机 Chrome（端口 5153）用合成内容绘制三个旋转 45° 的单部件模型并逐像素读回：着色器编译（2 个程序）、无错误；平面贴图部件全部像素属于级 1 的梯度颜色（L′ = (−1.0607, 0, −1.0607)，亮值 272），Gouraud 部件只有级 0/1，不受光贴图部件为四种原色的最近 DATA 色，背向三角形未绘制。开发服务器已停止。
- **工程检查：** `pnpm check` 通过（typecheck、lint、358 个文件 10334 项测试、构建；块体积警告为既有）。
- **rubber-duck：** CPU 光照算术、源色梯度、法线槽与部件质量未发现问题。三项像素等价意见（行取整剔除、定点跨度步进、16 位深度平局）未改为软件光栅化：与 ADR-0009 的设备像素绘制及 16 的“恰在边界上除外”一致，改为在图层说明与本证据中明确列为限度，由 25/26 的可比区处理。
- **simplify：** 采纳：面法线每三角形算一次、去掉逐角临时数组与子数组视图、贴图索引不再复制（非普通 ArrayBuffer 时才复制）、位姿矩阵每实体算一次、先校验全部模型再改动场景、`normaliseScaled` 复用 `0x948a4` 的尾段、`lightScale` 去掉未用参数。未采纳：与 `scene/projection.ts` 的私有 `roundHalfEven`、查看器的私有 `dataTexture`、Core 的归一化共用（都在写入范围外，且 Core 的归一化是不同的原版例程）；按模型的网格池与帧戳（当前规模不需要）；把 `ShadeRamps` 与键合并、去掉第 1/2 列表的通用性（18、20 需要）。
- **文档影响：** 写入范围内无文档需改。交 27（`docs/original/**`）：executable LS6 可补充本次只读核实的逐位细节——`0x94938` 先除以最大分量绝对值（1/m 为双精度，结果存 f32），再乘 1/√F((x²+y²)+z²)（`0x8777c`），最大分量 < 1e-4 时不变；`0x80c14` 用 `0x94938` 归一化逐角法线；`0x97b14` 取顶点 1 − 顶点 0 与顶点 2 − 顶点 0（差存 f32），叉积 `0x94b1c` 各分量为 F(e.y·f.z − e.z·f.y) 等；光向 `0x7ae80` 取光帧 z 轴取负，经 `0x9463c` 变换后由 `0x948a4` 归一化。交 28：render 模块说明与源码结构增加 `lighting/`（`prepareModelSurfaces`、`ModelLightingLayer`、`LitPartBuilder` 与限度），并更正 16 交接中关于正面绕序的写法（模型用 `BackSide`）。STATUS 与 tasks.md 无需修改。
- **交接（供 23、18、20）：** 23 以 `prepareModelSurfaces({ data: 'palette/flight/models', models, images, palettes }, settings)` 在运行开始前准备（拒绝即拒绝开始），把 `surfaces.plan` 计入 `beginRun` 的 GPU 计划，再 `addLayer(new ModelLightingLayer(surfaces, run.resources))`。合成生产包的 `PRODUCTION_SCENE`（`src/original-data/conversion/flight-data.test-support.ts`）沿用 `SYNTHETIC_SCENE` 的 `lightType3Colour` [0.3, 2⁻¹⁴⁹, −1.5]（I_d < 0），按本层会被拒绝；23 接入时须把合成包的方向光改为 (0, 1] 内的强度并使环境级非负（不在本子任务写入范围）。18 用 `LitPartBuilder.part(model, 2, 0, partQuality(model, 2, 0, deviceByte), …)` 取得受击外壳的不受光梯度；20 用列表 1、质量 2。

