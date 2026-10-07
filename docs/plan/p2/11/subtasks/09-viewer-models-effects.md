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

- [ ] AC-11（Node）：几何换算、材质设置与纹理共享和释放如上。
- [ ] AC-13（Node）：三角形数（每个形状与每个 payload 的总数）、位置、颜色截断与量化、无颜色面的处理如上。
- [ ] AC-18（回退）：没有贴图坐标时，导弹贴图元素与带贴图碎片使用颜色或诊断灰色，并带“贴图映射未确认”标记。
- [ ] 呈现约定的三维部分（手性、绕序、光照、效果颜色）实现于一处，源码结构记录各项置信度为未确认或项目选择。
- [ ] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/render`，完成前 `pnpm check`。
- 浏览器像素读回见 11。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
