---
type: plan
status: active
phase: P2
task: "01"
subtask: "05"
updated: 2026-10-03
---

# 05 — 预算与数据所有权契约

**契约来源：** [spec](../spec.md) 的 S-09、S-10；AC-08、AC-09。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 固定 schema 1 的十二个预算维度，定义 limits/usage 的非负安全整数形状；缺失、未知、负数、非整数、超限和安全整数加法溢出均拒绝。
- 定义 plain data、TypedArray/ArrayBuffer payload 的复制、冻结、结构化克隆与转移边界；发送方转移后不得继续使用，共享消费者不得互相修改。
- 保持预算与 payload identity、资源组和完整性结果的可诊断关联。

## 不包含

- 不决定各解析器的具体资源预算数值；P2-02 至 P2-09 在各自不可信输入边界批准限值。
- 不实现 Worker transfer、IndexedDB 事务、Web Audio 或 GPU 生命周期。

## 关键文件与契约

- 计划新增 `src/content/` 预算/所有权类型与纯校验模块；邻接测试随本子任务维护。
- [工程 TypeScript 配置](../../../../../tsconfig.core.json)禁止宿主 API。

## 验收标准

- [ ] 十二个预算维度固定且每次结果都显式给出，不适用维度为 0。
- [ ] 等于上限通过，超过、缺失、未知和溢出失败，并返回稳定 code/limit/observed。
- [ ] 深层输入和输出容器修改不会改变定义、验证结果或后续调用。

## 验证方法

- Node/Vitest 覆盖边界数值、MAX_SAFE_INTEGER 加法、嵌套数组/对象、ArrayBuffer/TypedArray 所有权。
- 不适用 browser-testing；Worker 实际转移由 P2-04 验证。

## 完成证据
