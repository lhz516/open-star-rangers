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

- [x] 目标测试覆盖纯契约、状态机、失败隔离、释放和 replay，全部通过。
- [x] `pnpm check`、边界回归、构建（允许记录 Three.js 块体积警告）通过。
- [x] 未读取/跟踪原版资源，文档日期和链接正确。

## 验证方法

- 目标命令：`pnpm exec vitest run src/render src/app/composition src/ui/game src/app/session src/app/runtime src/core/synthetic`，随后 `pnpm check`。
- 复用 synthetic seed 0、固定输入与 recording/replay；证据写入本 subtask，不把 browser 或人工检查伪装成 Node 结果。

## 完成证据

- **AC-16：** 新增 [synthetic-renderer-replay.test.ts](../../../../../src/render/synthetic/synthetic-renderer-replay.test.ts)：同一 seed 11、50 Hz、录制间隔 1 与 4 的脚本（`moveX` 1/−0.5/0.25、accepted 与 rejected 的 add/remove、0 tick 帧、补跑帧、pause/resume、暂停时布局变化、restart）在不接渲染器、绘制中、运行中第 2 帧绘制失败、上下文已丢失、无布局五种模式下运行；四种渲染模式的 Core 事件流（含 commandId）与两次运行的完整录制（record、事件、checkpoint 与状态哈希）都与不接渲染器时相等，录制 replay 一致，渲染器分别处于 ready/failed/context-lost/ready，绘制次数分别为 >15、3、0、0，会话始终 running 且无错误。
- **覆盖汇总（S-01–S-07 的 Node 部分）：** 依赖与边界（01）、布局/插值/相机/外观（02）、场景映射、绘制时机、失败隔离、上下文与释放（03）、表面生命周期（04）、owner 装配与回滚（05）、replay 不变性（本项）均有邻接测试；DOM-free 渲染模块全部在 Node 类型程序中，浏览器工厂与 `.tsx` 不在其中（边界回归）。
- **检查：** 目标命令 `pnpm exec vitest run src/render src/app/composition src/ui/game src/app/session src/app/runtime src/core/synthetic` 34 个文件/938 个测试通过；`pnpm check` 通过（3 个 TypeScript 程序、ESLint、40 个测试文件/1029 个测试、生产构建）。构建主块 798.06 kB（gzip 215.61 kB），Vite 输出 500 kB 块体积警告，按 spec 只记录。
- **资源与文档：** 测试只用代码生成的合成数据，不读取 `local/`；`git ls-files` 无图片/封包/二进制，`local/` 保持忽略。[工程约定](../../../../engineering/README.md#合成渲染) 新增“合成渲染”章节（依赖、DOM-free 模块、绘制时机、校验与失败隔离、状态与诊断、释放顺序、测试替身与目标命令、浏览器取证方法）；源码结构指南已在 02–06 同步。变更文档的相对链接经脚本检查全部存在，`updated` 为 2026-10-02。
- **审阅：** rubber-duck 指出 failed 模式在接线前已失败、比较流于形式，已改为接线并绘制后在运行中失败，并断言绘制 3 次；文档体积数字已改为实测值。本子任务只新增验证测试与文档，无实现代码，未运行 simplify。
