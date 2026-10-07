---
type: plan
status: active
phase: P2
task: "11"
subtask: "09"
updated: 2026-10-06
---

# 09 — 模型与效果的渲染

**契约来源：** [spec](../spec.md) 的 S-07、S-09（坐标、绕序、光照、效果颜色）、AC-11（Node）、AC-13（Node）、AC-18（未确认时的回退显示），以及[查看项与渲染](../spec.md#查看项与渲染)中的模型与效果、[呈现约定](../spec.md#呈现约定)、[效果贴图坐标](../spec.md#效果贴图坐标)的“达不到高概率时”。
**依赖：** 08, 24。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **模型：**
  - 只经 `readModelPayload`、`modelPartItems`、`expandModelTextures` 取数据，显示所选部件列表（0、1 或 2），并为每个列表附上 spec 规定的置信度说明。
  - 几何：位置的 z 取反，索引与 UV 原样；材质双面、默认不受光照、最近邻、按材质 `repeat` 环绕；可切换中性方向光，并标明不是原版光照。
  - 纹理：按 image Asset ID 共享，引用计数归零后释放；几何按模型分别创建。
  - 视图：绕两轴旋转、缩放与复位，按 spec [查看器操作](../spec.md#查看器操作)的步长与范围；相机按包围球取景，包围盒不产生任何规则。
- **效果：**
  - 只经 `readEffectPayload` 与 `expandProjectiles`、`expandMissiles`、`expandDebris` 取数据，按记录、导弹类型与碎片形状分别列出。
  - 多边形面以第一个角为中心扇形三角化。
  - 颜色：三个浮点按 RGB 截断到 [0, 1]，按 round(v × 255) 量化，同时提供原值供页面显示。没有颜色的面，在没有可用贴图坐标时用固定的中性诊断灰色，并带“贴图映射未确认”标记。
  - 导弹元素的旋转映射序号（0–31）作为视图参数保留，16 完成前不影响画面。
- **Node 测试：**
  - 模型：位置为 z 取反，索引与 UV 原样，材质设置正确；两个模型共用一个贴图时只创建一个纹理，最后一个释放后纹理计数为零；
  - 效果：每个形状的三角形数等于各面“角数 − 2”之和；每个 payload 全部形状的三角形总数等于 `effectExpansionSize(payload).triangles`，导弹附加元素计入；位置为展开结果的 z 取反；颜色截断与量化；没有颜色的面为诊断灰色并带标记；
  - 视图参数改变时恰好绘制一次。

## 不包含

- 效果贴图坐标的研究与实现（15、16）；页面与像素读回（11）。

## 关键文件与契约

- 修改与扩展 08 新增的 `src/render/viewer/` 模块及测试。
- 复用：[model-payload.ts](../../../../../src/content/models/model-payload.ts)、[model-parts.ts](../../../../../src/content/models/model-parts.ts)、[effect-payload.ts](../../../../../src/content/effects/effect-payload.ts)、[expand-effects.ts](../../../../../src/content/effects/expand-effects.ts)；测试数据 [models.test-support.ts](../../../../../src/content/models/models.test-support.ts)、[effects.test-support.ts](../../../../../src/content/effects/effects.test-support.ts)。

## 验收标准

- [x] AC-11（Node）：几何换算、材质设置与纹理共享和释放如上。
- [x] AC-13（Node）：三角形数（每个形状与每个 payload 的总数）、位置、颜色截断与量化、无颜色面的处理如上。
- [x] AC-18（回退）：没有贴图坐标时，导弹贴图元素与带贴图碎片使用颜色或诊断灰色，并带“贴图映射未确认”标记。
- [x] 呈现约定的三维部分（手性、绕序、光照、效果颜色）实现于一处，源码结构记录各项置信度为未确认或项目选择。
- [x] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/render`，完成前 `pnpm check`。
- 浏览器像素读回见 11。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **范围说明：** 10 只实现了二维条目，所以 09 一并把所有者扩展到模型与效果（见 goal 执行记录），spec 与验收标准不变。
- **实现（`render/viewer/`）：**
  - [viewer-view.ts](../../../../../src/render/viewer/viewer-view.ts) 的纯函数 `applyViewAction`：
    - 两轴各每步 15°，取模 360；
    - 缩放每步 1.25 倍，限制在 1/8 至 8 倍；复位只恢复旋转与缩放；
    - 光照开关；导弹贴图旋转序号 0–31，16 之前不改变画面。
  - [viewer-effects.ts](../../../../../src/render/viewer/viewer-effects.ts)：`effectViews` 按弹丸记录、导弹类型（机身、尾翼、元素与附加元素）、碎片形状列出视图；`fanTriangles` 以第一个角为中心扇形三角化。
  - [viewer-solids.ts](../../../../../src/render/viewer/viewer-solids.ts) 的三维显示：
    - 模型位置与法线的 z 取反，索引与 UV 原样；效果几何按扇形三角化；
    - 相机按包围球取景，停在球外，缩放只改变相机的 `zoom`；
    - 内容绕球心旋转；模型可在不受光照与中性光之间切换材质；
    - 构建失败时归还全部贴图租用。
  - [viewer-textures.ts](../../../../../src/render/viewer/viewer-textures.ts)：模型贴图按 image Asset ID 引用计数。
  - [viewer-renderer.ts](../../../../../src/render/viewer/viewer-renderer.ts) 新增 `model` 与 `effect` 两种查看项，以及 `setView`：只在画面改变时绘制一次；诊断带视图。
  - **呈现约定的三维部分** 全部在 [viewer-presentation.ts](../../../../../src/render/viewer/viewer-presentation.ts)：
    - 相机视场、z 取反、双面；
    - 模型贴图的重复环绕；贴图部件显示纹素（白色乘纹素）；
    - 中性光（π × 0.4 环境光与 π × 0.6 方向光，因为 Three.js 0.186 的 Lambert BRDF 除以 π）；
    - 效果颜色的截断与量化、诊断灰色 128 与“贴图映射未确认”标记（`effectAppearance`）。
- **实现（`app/viewer/`）：**
  - [viewer-items.ts](../../../../../src/app/viewer/viewer-items.ts) 列出模型与效果（角色为 `projectile`、`missile`、`debris` 的 data Asset）。`resolveEntry` 一次读取并展开一个条目，给出全部变体与 `item(variant)`：
    - **模型：** 变体为部件列表 0–2，附部件数、内容与置信度（列表 0 完整模型高概率，列表 1 碎片已确认，列表 2 未确认）；
    - **效果：** 变体为各视图，附每个形状的外观。
  - [viewer-owner.ts](../../../../../src/app/viewer/viewer-owner.ts) 的 `select(id, variant)` 缓存所选条目的解析结果；`changeView(action)` 经渲染器改变视图，视图跨条目保留。快照新增变体、全部变体与视图。
- **测试：**
  - [viewer-solids.test.ts](../../../../../src/render/viewer/viewer-solids.test.ts) 共 17 条：
    - **视图：** 旋转取模，缩放上下限，复位只恢复旋转与缩放，同值返回同一对象，无效动作抛 RangeError。
    - **模型：**
      - 位置与法线 z 取反，索引与 UV 原样；
      - 材质双面、不受光照、不做 tone mapping；贴图为重复环绕、最近邻、无 mipmap、`NoColorSpace`、不翻转，字节等于 `expandImage` 的结果；
      - 贴图部件为白色，未贴图部件为颜色字节；
      - 取景时全部顶点在视野内；8 倍缩放与旋转下全部顶点仍在近、远平面之间，且确实放大。
    - **贴图与光照：**
      - 两个共用贴图的模型只有一个纹理，切到不用它的列表后纹理计数为零，`show(null)` 后全部为零；
      - 显示构建失败时归还租用，且不销毁他人仍在使用的纹理；
      - 光照开关各绘制一次，使用 Lambert 材质并有方向光；
      - 旋转、缩放与复位各绘制一次；贴图旋转序号、二维项的视图与效果的光照不绘制。
    - **效果：**
      - 扇形三角化；
      - 三种合成 payload 的每个视图逐个显示：位置为 z 取反，每个形状的三角形数为各面“角数 − 2”之和，颜色等于外观；全部视图的顶点与三角形总数等于 `effectExpansionSize`，导弹附加元素计入；
      - 颜色截断与量化（例如 0.25 → 64、1.75 → 255、−0 → 0）；导弹元素为诊断灰色并带标记，带贴图碎片用颜色并带标记，无贴图碎片不带标记；
      - 换项后 GPU 计数只取决于当前项。
  - [viewer-renderer.test.ts](../../../../../src/render/viewer/viewer-renderer.test.ts)（14 条）补上不可用渲染器的视图诊断。
  - [viewer-owner.test.ts](../../../../../src/app/viewer/viewer-owner.test.ts) 新增 5 条（共 24 条），以真实的模型、贴图与效果 payload 组成模型组：
    - **列表：** 条目列出效果、图像与模型；
    - **模型：** 各部件列表的显示与说明，不存在的列表、负数与二维项的非零变体都不改变快照；模型 payload 或其贴图无法读取时只标记该项；
    - **效果：** 各视图与外观，切换同一条目的变体复用解析结果（变体数组为同一对象）；
    - **视图：** 视图经渲染器改变并绘制一次，跨条目保留，无效动作抛错。
  - **证伪：** 以下每种改动都使测试失败：
    - 去掉 z 取反、改变扇形顺序；
    - 不共享贴图、不归还租用；
    - 取景过近、相机以移动代替 zoom；
    - 向下取整量化、为不改变画面的视图变化绘制；
    - 去掉“贴图映射未确认”标记、去掉光照材质、绕过解析缓存。
- **检查：**
  - `pnpm exec vitest run src/render/viewer src/app/viewer`：95 条通过；
  - `pnpm check`：151 个文件 4,488 条测试，构建通过。
- **Rubber-duck：** 1 个阻塞问题，已修复：缩放靠移动相机，约 2.9 倍以上相机进入包围球，前方几何落到相机后面。改为相机停在球外、以 `zoom` 放大，并补 8 倍缩放加旋转的测试。其余（资源所有权、所有者状态、呈现约定、测试）没有问题。
- **Simplify：** 采纳：
  - 包围球中心改用 `Box3`；相机宽高比用 `VIEWPORT_ASPECT`；
  - 所有者测试改用渲染测试支持的合成模型（新增贴图与声音选项）；
  - 去掉渲染器从不读取的模型项 `list`；去掉可由原值推出的 `diagnosticGrey`；
  - `effectViews` 不再重复复制数组；
  - 一次解析条目的全部变体并在所有者中缓存，切换部件列表或效果视图不再重读 payload、重展开贴图；
  - 相机视场、贴图部件的颜色与效果外观移入 `viewer-presentation.ts`，使呈现约定集中一处；
  - 显示的 `view()` 改为统一的必需方法，二维显示返回 false。

  未采纳：
  - 去掉贴图旋转序号：子任务契约要求把它作为视图参数保留；
  - 视图只由所有者持有：渲染器需要最新视图来构建新显示，所有者把它交给页面，两者由 `changeView` 同步；
  - `effectViews` 移到 `app/` 或 `content/`：渲染测试需要用它核对三角形总数，且 `render/` 不能导入 `app/`；
  - 用 `BufferGeometry.scale(1, 1, -1)` 代替 `toViewerSpace`：它会把法线归一化，也会把约定分散到呈现模块之外；
  - 光照材质延迟创建、按字段拆分视图更新、预计算扇形索引长度：材质在绘制前不占 GPU，其余开销可忽略。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)：
  - 目录树加入四个新文件；
  - “查看器所有者”加入模型、效果、变体与视图；
  - “资源查看渲染”加入三维项、模型贴图共享、视图与按需绘制规则；
  - 呈现约定表加入三维各行及其置信度。

  goal 执行记录记下范围说明。工程约定与 STATUS 无需改动。
