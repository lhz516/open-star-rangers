---
type: plan
status: active
phase: P2
task: "12"
subtask: "22"
updated: 2026-10-07
---

# 22 — 呈现约定判定与修正

**契约来源：** [spec](../spec.md) 的 S-11、[呈现约定判定](../spec.md#呈现约定判定)、技术决定 11；AC-21。
**依赖：** 16, 17, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 21 的 V-1、V-2 判定与 16、17 的二维结果，逐行判定[源码结构](../../../../engineering/source-structure.md#资源查看渲染)中的呈现约定：方向（UV 原点，必判）、坐标轴与手性、正面绕序与双面渲染、过滤与环绕、效果的跨接缝插值（区分算法未知与实际外观未验证）、效果颜色、颜色空间与透明。相机与诊断光是项目选择，只记录冲突。
- **修正：** 只在证据达到高概率或已确认，且能用现有呈现接口表达时，修改 [viewer-presentation.ts](../../../../../src/render/viewer/viewer-presentation.ts)：
  - 同步单元测试，期望由独立计算得到；同步 E2E 像素期望（[viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts)、[viewer-observations.ts](../../../../../e2e/support/viewer-observations.ts)，生产用例受影响时含 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)），不只把当前结果更新成新基准；
  - 更新源码结构中该行的选择与置信度，以及[本地导入指南](../../../../guides/local-import.md)的呈现限制说明；
  - 不改 payload、schema 或转换器，不递增 `ConverterVersion`，不需重新导入。
- **超出现有接口的差异：** 例如需要逐角 UV、几何展开或新的数据输入时，记录缺口与责任任务，相应 AC 为 blocked，由协调者新增修复子任务；不用错误的近似补丁。
- 列出受修正影响的用户对照项与新候选，交 23 复核。没有修正时记录“无修正”，并仍更新源码结构中已判定行的置信度。

## 不包含

- 用户复核（23）；原版文档回填（24）；产物审阅（11）。

## 关键文件与契约

- [viewer-presentation.ts](../../../../../src/render/viewer/viewer-presentation.ts) 及 `src/render/viewer/` 的测试；[源码结构：资源查看渲染](../../../../engineering/source-structure.md#资源查看渲染)。

## 写入范围

- `src/render/viewer/**`：呈现函数与其单元测试。
- `e2e/viewer-page.spec.ts`：像素期望。
- `e2e/support/viewer-observations.ts`：期望计算。
- `e2e/production-preview.spec.ts`：受影响时的生产像素期望。
- `docs/engineering/source-structure.md`：呈现约定表的选择与置信度。
- `docs/guides/local-import.md`：呈现限制说明。

## 验收标准

- [ ] AC-21：判定表每行区分项目选择、已验证外观与未知算法；方向（UV 原点）有必判结论。
- [ ] 修正集中在呈现模块，测试期望独立计算；超出接口的差异已记录并转责任任务。
- [ ] 未修正的未确认项在查看器与源码结构中仍标明未确认。
- [ ] 有代码修改时 `pnpm check` 与 `pnpm exec playwright test e2e/viewer-page e2e/production-preview` 的相应项目通过；只有文档修改时做链接与元数据检查。

## 验证方法

- `pnpm test -- src/render/viewer`、`pnpm check`、受影响的开发与生产 E2E（按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成数据）。
- 原版判定依据来自 16、17、21；修正后的原版复核由 23 完成。

## 完成证据
