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

- [x] AC-18：新 schema 往返逐项相等；拒绝路径的 code 正确；展开的贴图坐标等于测试中的计算式；转换器组件与生产 `ConverterVersion` 已递增，相关测试同步。
- [x] AC-18（本地）：新字段与独立读取逐项一致，差异为 0；17 的脚本复跑通过。证据只记计数与判定。
- [x] AC-18（显示）：查看器中带贴图的导弹元素与碎片在已知像素位置（不跨接缝的面）显示期望的纹素，含跨接缝面的项显示接缝插值未确认的标记，旋转选择已去掉，由 E2E 断言。
- [x] 测试与仓库中没有原版值或由其得到的快照；`pnpm check` 与开发项目的相关 E2E 通过。

## 验证方法

- `pnpm exec vitest run src/content/effects src/original-data/conversion src/render src/workers`，完成前 `pnpm check`。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成数据运行开发项目 E2E。
- 本地核对用 `local/StarRang/cd/` 的镜像。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

### 2026-10-07

- **实现：** 效果 payload schema 2：导弹保留 6 个几何常量与旋转缩放，不导入旋转步长；碎片加入 f64 倍数 K。模型转换器组件改为 `models-2`，生产包配置、导入与 E2E 的身份断言同步。UV 按 15 的公式从构造后的 float32 位置以 float64 计算，再舍入为 float32；拒绝零高度、零缩放等造成的非有限 UV。查看器复用模型的贴图租约与释放路径，直接显示纹素；旋转参数、动作与控件均已移除。
- **Node：** 针对效果、转换、查看器、Worker 与导入的首次聚焦检查为 33 文件 / 1,008 测试通过；review 后另补导弹、碎片的损坏贴图拒绝、无 GPU 残留及可继续选择其他条目的测试。表驱动断言独立写出映射公式，覆盖正负比例、轴上有符号零、非有限结果；schema 1 拒绝、schema 2 往返、K 的截断与非有限拒绝、接缝跨度恰好 1/2 与超过 1/2 均有断言。
- **完整工程检查：** 在协调器已集成 14 并扩展写入范围的 `295a1bf` 上 rebase 后，`pnpm check` 通过：TypeScript、ESLint、152 文件 / 4,528 测试、生产构建。保留既有的大 chunk 提示。早期共享机器上并发运行其他 worker 的重型测试时出现多项超时；协调器串行化检查后原命令通过，未提高超时、跳过测试或修改配置。
- **开发浏览器：** macOS Chromium、隔离 context，端口 5148 / 5149；`OSR_E2E_DEV_PORT=5148 OSR_E2E_PREVIEW_PORT=5149 pnpm exec playwright test e2e/viewer-page.spec.ts e2e/import-worker.spec.ts --project=development` 最终 **28/28 通过**。导弹与碎片非接缝面上纹素逐字节一致；采样按源多边形排除整个跨接缝面。合成条目同时覆盖有接缝与无接缝贴图视图，逐项检查警告存在性；不存在旧映射警告、旋转控件与视图字段。一次重跑的既有 AC-24 键盘测试超时并见离开页面后监听计数尚未减一；未改实现或断言，单独重跑及随后完整 28 项均通过。
- **生产浏览器：** rebase 后协调器追加的兼容检查：在上述 `pnpm check` 构建上运行 `OSR_E2E_DEV_PORT=5148 OSR_E2E_PREVIEW_PORT=5149 pnpm exec playwright test e2e/production-preview.spec.ts --project=production`，**6/6 通过**。新 schema 的合成缓存经生产菜单恢复、查看器绘制与试听通过严格 CSP，未注入测试入口。
- **本地原版核对：** `effect-mapping-display-check.ts` 使用独立 LE page-map 读取，核对来源身份、2 个映射字段及保留的 6 个导弹常量，差异分别为 **0 / 0**；3 个 payload 均为 schema 2，旋转步长不存在。复跑 17 的 `import-check.ts` 与 `scene-check.ts`：四组完整、Core 任务载入 PASS；134 条目 / 169 场景，解析失败 0、场景失败 0，几何计数不变。脚本均通过 `node --preserve-symlinks --preserve-symlinks-main local/research/p2-11/<script>.ts local/StarRang/cd/STAR_RANGERS.{ccd,cue,img,sub}` 运行，确保共享本地目录的导入指向本 worker 源码。脚本、计数输出与日志仅留在忽略目录；格式事实见 [executable 本地核对](../../../../original/formats/executable.md#effect-texture-mappings-p2-1115-research)。
- **Review / simplify：** 一次 rubber-duck 对本子任务完整 diff 与本地脚本复核，无阻塞正确性问题。已处理维护文档中的旧标记、旋转控件描述，补足效果贴图失败用例并注明 alpha 丢弃规则；也采纳保留常量的独立比较建议。随后按 simplify 的复用、简化、效率与抽象层次直接检查限定 diff；已有图像展开、共享贴图租约、实体显示与合成组 helper 满足需要，无额外抽象或行为改写。
- **文档影响：** 更新[源码结构](../../../../engineering/source-structure.md)的 payload 布局、字段、转换版本与显示约定、[工程指南](../../../../engineering/README.md)的查看器控件说明、[executable](../../../../original/formats/executable.md)的计数核对证据。`U-027` 的接缝行为仍未确认，本次字段一致性不将其升级；原版未知项、操作指南、冻结架构无新增事实或变更，无需 ADR。未改协调器拥有的 goal / phase / STATUS。
- **合规：** `pnpm check:original` 通过：构建 9、索引及工作树各 799 文件，0 findings；测试仅使用代码生成的任意数据。修改文档的日期与相对文件链接检查、`git diff --check` 通过。浏览器 context 与测试服务器关闭，分配的 5148 / 5149 / 5150 端口无残留监听。
