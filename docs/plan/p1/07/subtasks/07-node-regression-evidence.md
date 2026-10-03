---
type: plan
status: active
phase: P1
task: "07"
subtask: "07"
updated: 2026-10-02
---

# 07 — Node 回归与一致性证据

**契约来源：** [spec](../spec.md) 的 AC-01–AC-04、AC-06–AC-07、AC-11、AC-13–AC-17；覆盖 S-01–S-07。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 汇总并补齐 Node/Vitest 测试：真实 Core/Runtime/Session、Three.js 场景图、viewport 参数表、状态/故障/释放、replay 不变性和依赖边界。
- 检查所有 DOM-free 生产模块被 Node 测试传递导入；检查源码不存在渲染自调度循环。
- 更新直接相关的工程/源码结构文档，记录实际文件落点、渲染消费者边界和可用检查命令。

## 不包含

- 不替代真实 Chromium WebGL 证据；浏览器项归 08。
- 不新增原版事实、CI、部署或许可证自动门禁。

## 关键文件与契约

- `src/render/**/*.test.ts`、[owner tests](../../../../../src/app/composition/) 及现有 runtime/session tests。
- [工程约定](../../../../../docs/engineering/README.md)、[源码结构指南](../../../../../docs/engineering/source-structure.md)。

## 验收标准

- [ ] 目标测试覆盖纯契约、状态机、失败隔离、释放和 replay，全部通过。
- [ ] `pnpm check`、边界回归、构建（允许记录 Three.js 块体积警告）通过。
- [ ] 未读取/跟踪原版资源，文档日期和链接正确。

## 验证方法

- 目标命令：`pnpm exec vitest run src/render src/app/composition src/ui/game src/app/session src/app/runtime src/core/synthetic`，随后 `pnpm check`。
- 复用 synthetic seed 0、固定输入与 recording/replay；证据写入本 subtask，不把 browser 或人工检查伪装成 Node 结果。

## 完成证据
