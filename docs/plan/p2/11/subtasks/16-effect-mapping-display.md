---
type: plan
status: active
phase: P2
task: "11"
subtask: "16"
updated: 2026-10-07
---

# 16 — 效果贴图坐标的表示与显示

**契约来源：** [spec](../spec.md) 的 S-10（实现）、AC-18，以及[效果贴图坐标](../spec.md#效果贴图坐标)的“达到高概率或已确认时”、[持久化与兼容](../spec.md#持久化与兼容)的转换器版本递增。
**依赖：** 11, 15, 17, 24。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只在 15 的结论达到高概率或已确认时进行；否则本子任务随 15 为 blocked。

- **payload：** 效果 payload 递增 schema，加入 15 确定的映射参数，不改变既有字段的语义：导弹只需第 0 个旋转映射的参数（旋转缩放；第 0 个旋转的角度为 0，不导入旋转步长），碎片需 15 记录的倍数 K，包围盒按 15 的结论由形状得到。读取器只接受新 schema，旧 schema 报 `unsupported-payload-schema`；截断、越界与非有限值报 `invalid-effect-payload`。
- **展开：** `content/effects` 为导弹贴图元素（只用第 0 个旋转映射，原版只应用它）与带贴图碎片输出贴图坐标：按 64 位浮点计算，舍入为 32 位；结果非有限时报 `invalid-effect-payload`。
- **转换：** 效果步骤从 15 确定的 EXE 区域读取新参数，校验规则与既有效果数据一致；生产效果声明与映射同步。模型转换器组件递增（例如 `models-2`），生产 `ConverterVersion` 与 01 的生产包配置随之改变，相关测试同步。
- **显示：** 查看器据贴图坐标贴图，去掉这些面的“贴图映射未确认”标记，并去掉贴图旋转序号的选择与视图参数。跨接缝面按[呈现约定](../spec.md#呈现约定)线性插值，含这种面的项标明 “Seam interpolation unconfirmed”。结论依赖运行时状态时，只显示静止姿态下的坐标并加以说明。
- **本地核对：**
  - 按 P2-06/19 的方法在本地基准上独立读取新字段，与效果步骤的结果逐项比较，差异为 0；
  - 复跑 17 的本地脚本，确认结果不变（四组完整、任务可载入、场景构建无错误）。
- **测试：**
  - Node 表驱动：只用代码生成的任意参数，期望值在测试中按公式写成计算式；
  - 开发项目 E2E：带贴图的导弹元素与碎片在已知像素位置显示期望的纹素，像素只取不跨接缝的面；含跨接缝面的合成项显示接缝插值未确认的标记。

## 不包含

- 光照、明暗级与模式字（P3）。
- 15 未通过时的任何猜测实现。

## 关键文件与契约

- 修改 [effect-payload.ts](../../../../../src/content/effects/effect-payload.ts)、[expand-effects.ts](../../../../../src/content/effects/expand-effects.ts)、[effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts)、[effect-declarations.ts](../../../../../src/original-data/conversion/effect-declarations.ts)、[production-effects.ts](../../../../../src/original-data/conversion/production-effects.ts)、[convert-models.ts](../../../../../src/original-data/conversion/convert-models.ts) 的 `MODEL_CONVERTER_COMPONENT`、01 的生产包配置，以及 09 的效果渲染；同步各自的测试与测试支持。
- 本地脚本放在被忽略的 `local/research/p2-11/`。
- 文档：[源码结构](../../../../engineering/source-structure.md)中的效果 payload 布局与呈现约定的跨接缝一行，以及 [executable](../../../../original/formats/executable.md) 的本地核对结论。

## 写入范围

- `src/content/`：效果 payload、展开与契约校验，以及合成内容测试支持。
- `src/original-data/`：效果步骤、声明、生产效果、模型转换器组件与转换测试支持。
- `src/workers/`：生产包配置与依赖 `ConverterVersion` 的测试。
- `src/app/`：查看器条目与解析、测试入口，以及依赖 `ConverterVersion` 的测试。
- `src/render/viewer/`、`src/ui/viewer/`：效果贴图的显示与标记。
- `e2e/viewer-page.spec.ts`、`e2e/import-worker.spec.ts`、`e2e/support/viewer-observations.ts`：开发项目 E2E。
- `docs/engineering/source-structure.md`：效果 payload 布局与呈现约定。
- `docs/engineering/README.md`：查看器 E2E 说明中的贴图映射标记与旋转选择（执行中扩展）。
- `docs/original/`：executable 的本地核对结论与 unknowns。
- `local/research/p2-11/`：本地核对脚本与输出（被忽略，不提交）。

## 验收标准

- [ ] AC-18：新 schema 往返逐项相等；拒绝路径的 code 正确；展开的贴图坐标等于测试中的计算式；转换器组件与生产 `ConverterVersion` 已递增，相关测试同步。
- [ ] AC-18（本地）：新字段与独立读取逐项一致，差异为 0；17 的脚本复跑通过。证据只记计数与判定。
- [ ] AC-18（显示）：查看器中带贴图的导弹元素与碎片在已知像素位置（不跨接缝的面）显示期望的纹素，含跨接缝面的项显示接缝插值未确认的标记，旋转选择已去掉，由 E2E 断言。
- [ ] 测试与仓库中没有原版值或由其得到的快照；`pnpm check` 与开发项目的相关 E2E 通过。

## 验证方法

- `pnpm exec vitest run src/content/effects src/original-data/conversion src/render src/workers`，完成前 `pnpm check`。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成数据运行开发项目 E2E。
- 本地核对用 `local/StarRang/cd/` 的镜像。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
