---
type: plan
status: active
phase: P3
task: "09"
subtask: "27"
updated: 2026-10-14
---

# 27 — 最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-12、AC-01 至 AC-16。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新的功能代码。发现缺口时，由协调者新增修复子任务：新 ID，插入本项之前，并加入本项的依赖。

- **覆盖：** 按 [goal 的验收覆盖](../goal.md#验收覆盖)，逐项核对 S-01 至 S-12、AC-01 至 AC-16 都有完成证据。
- **关卡：** D-01 的批准记录在 P3-02、P3-03 spec，D-02 在本任务 spec；每项批准都早于依赖它的实现或正式采样，D-02 还早于看到新版的连续行为结果。
- **契约不变量：**
  - `src/core` 保持纯净；没有开放字段、万能事件载荷、空调用点或无人调用的入口；
  - 每条命令恰一个结果，按前一命令生效后的上下文判定；连续轴按最终上下文；
  - 地图信息只由 Core 的地图谓词导出；目标、雷达与 Render State 未加全局迷雾过滤；
  - Warp 是 Core 中可断言的能量、位置与阶段变化；进度与规则位姿不依赖渲染；纯表现随机不消耗世界 RNG；
  - 未确认的原版规则没有以默认值实现；未接入的 P3-11 流程没有被宣称已运行。
- **候选一致：** 23、25 的候选 `src/` 树与当前一致；不一致时核对其后的改动是否影响所测行为，有影响的由协调者新增重跑子任务。
- **研究：** Q-01 至 Q-12 各自达到门槛或按 spec 阻塞并有恢复条件；U 项已更新，负责阶段未改。
- **工程检查：**
  - `pnpm exec vitest run src/core src/content src/original-data tools/engineering-boundaries.test.ts`；
  - `pnpm check`；
  - `pnpm check:compliance`；
  - `pnpm test:e2e -- e2e/mission-flow.development.spec.ts e2e/mission-flow.production.spec.ts`；
  - 若改动了 `tools/baseline/`，运行 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`。
- **文档与原版隔离：** 改动的文档 `updated:`、链接与锚点有效；仓库中没有原版内容、反编译输出、读数或截图；`node tools/task-state.ts p3/09` 没有计划问题。

## 不包含

- 新功能、规则或文档内容的补写（交给修复子任务）。
- push、合并或部署。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md)、[P3-02 spec](../../02/spec.md)、[P3-03 spec](../../03/spec.md) 与 01 至 26 的完成证据。

## 写入范围

无。

## 验收标准

- [ ] S-01 至 S-12、AC-01 至 AC-16 逐项有证据，没有未披露的缺口。
- [ ] D-01、D-02 的批准记录齐全且时序正确；上列契约不变量逐项通过；23、25 的候选与当前一致，或差异已处理。
- [ ] 上列工程检查全部通过。
- [ ] 文档链接、元数据与原版隔离核对通过；`node tools/task-state.ts p3/09` 没有计划问题。

## 验证方法

- 运行上列命令并记录结果；审阅 `git status`、`git diff` 与提交的文件列表。
- 对照 spec 与各 subtask 的完成证据逐项核对。

## 完成证据
