---
type: plan
status: active
phase: P2
task: "01"
subtask: "03"
updated: 2026-10-03
---

# 03 — 原版来源映射边界

**契约来源：** [spec](../spec.md) 的 S-05、S-06、S-10、S-11；AC-04、AC-05、AC-10、AC-13。
**依赖：** 01、02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/original-data/` 计划新增来源映射契约，表达光盘相对路径、NOB entry ID/type、子资源定位、source fingerprint 占位、置信度、U 项和 Asset ID 映射。
- 保持 locator 只属于原版数据层；content、Core、Renderer、Audio 和缓存消费契约只看到规范 ID、payload identity 和来源判别。
- 对一对多/多对一映射、类型冲突、缺定位和未确认必需来源提供安全诊断；不输出原版内容。

## 不包含

- 不实现 CCD/IMG、ISO9660、哈希算法、NOB 随机读取或 payload 转换。
- 不升级 U 项状态，不把研究推断改成事实文档。

## 关键文件与契约

- [imfat.ts](../../../../../src/original-data/imfat.ts)是当前 entry 形状的复用依据。
- 计划新增 `src/original-data/` 来源映射类型/验证文件及邻接测试；具体文件名由实现时按 owner 决定。

## 验收标准

- [ ] locator 能表达规范 Asset 到一个或多个原版子资源的映射，并保留置信度和 U 项。
- [ ] 规范内容类型和下游消费者无法导入 locator 或 NOB 定位字段。
- [ ] 合成测试覆盖缺失、冲突、未确认必需来源和一对多/多对一映射。

## 验证方法

- Node/Vitest 合成映射 fixture、工程边界检查与源码依赖检查。
- 不适用 browser-testing；本子任务不接入浏览器。

## 完成证据
