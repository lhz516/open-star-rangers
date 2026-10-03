---
type: plan
status: active
phase: P2
task: "01"
subtask: "04"
updated: 2026-10-03
---

# 04 — 资源组与完整性验证

**契约来源：** [spec](../spec.md) 的 S-07、S-08；AC-06、AC-07。
**依赖：** 02、03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现纯验证入口，检查唯一 ID、kind/role、依赖存在、重复依赖、自引用/环、角色基数、来源/研究状态、payload identity 和组身份。
- 区分 `group-complete` 与 package `complete`；组级结果保留规范有序、无重复的跨组外部要求，全包只在四组身份一致且所有要求解析时通过。
- 使用稳定错误 code 和安全路径诊断；失败不补默认资源、不写可伪造 complete 标志、不产生成功形回退。

## 不包含

- 不解析原版字节、不执行转换、不写 IndexedDB、不接入 Core/Renderer/Audio。
- 不实现 P2-11 查看器或 P2-12 联合浏览器验证。

## 关键文件与契约

- 依赖 02 的 `content/` 类型和 03 的来源状态/映射。
- 计划新增 `src/content/` 验证模块与邻接测试。

## 验收标准

- [ ] 每个必需组能独立输出闭包结果；全包能拒绝缺失或不一致的跨组身份。
- [ ] 环、重复、缺失引用、payload/版本/manifest/source 不一致和未确认必需来源均返回稳定诊断。
- [ ] 完整性由输入推导，调用者无法通过传入或修改 `complete` 绕过验证。

## 验证方法

- Node/Vitest 表驱动正负 fixture，覆盖每个组、3/4 组和跨组引用。
- 不适用 browser-testing；浏览器接线归 P2-11/12。

## 完成证据
