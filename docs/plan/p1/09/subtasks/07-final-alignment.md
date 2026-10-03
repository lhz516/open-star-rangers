---
type: plan
status: active
phase: P1
task: "09"
subtask: "07"
updated: 2026-10-02
---

# 07 — 最小键盘输入与隔离最终对齐

**契约来源：** [Spec](../spec.md) 全部 S-01 至 S-07、AC-01 至 AC-16、技术决定及不包含范围。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只验证，逐项核对 Spec→goal 覆盖→实际交付→当前有效证据；不写新功能。缺口使用稳定新 ID 修复子任务，插在本行前并加入依赖。
- 核对：code 规范化、轴/命令/控制分流、通知限制、全部暂停清键、空表 repeat 无效、keyup 清理与拦截分离、资格恢复、不恢复旧 run/owner、pending 及独立错误保留。
- 核对所有获取/回滚/释放路径与先失效再撤销；明确逻辑隔离不等于物理监听回收，失败仍锁存。
- 05 证据必须对应最终代码：开发/生产的交互与焦点、真实 hidden、往返/StrictMode/HMR、同 owner Restart/Exit→Start、监听归属与清理结果。稀有失败与仅窗口路径按 Spec 的指定证据分层，不能伪造浏览器 passed。
- 在最终代码运行 `pnpm check`；检查任务完整 diff、受保护模块、配置/依赖、录制格式、文档/导航及无原版内容。

## 不包含

- 新功能代码、在本项修缺口、改 Spec/放宽验收或生成额外报告。
- P1-10 runner/跨模块全量回归、实机/原版保真或 P1 阶段退出判定。
- push、云/部署；无代码改动不调用 simplify。

## 关键文件与契约

- [Spec](../spec.md)、[goal](../goal.md)、01–06 全部完成证据及其列出的实际源码/测试。
- [工程约定](../../../../engineering/README.md)、[独立键位文档](../../../../engineering/keyboard-input.md)、[源码结构指南](../../../../engineering/source-structure.md)与[阶段索引](../../tasks.md)。
- 只读核对 [Core](../../../../../src/core/)、[Runtime](../../../../../src/app/runtime/)、[Session](../../../../../src/app/session/)、[package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml)相对任务起点无改动。

## 验收标准

- [ ] 7 个 S 与 16 个 AC 全有真实且当前有效的完整证据；无未执行项、失败项或必需检查 blocked 被当通过。
- [ ] 轴、命令、控制、焦点、通知、回滚/失效与错误保留不变量满足获批 Spec，没有新的时钟/队列/权威状态。
- [ ] AC-08/09/13 开发及生产证据、AC-10 真实 hidden 及指定生产失焦、AC-11 StrictMode/HMR/往返/运行替换齐全。
- [ ] AC-14/15 的完整差异与独立文档对齐通过；上游测试未删除、跳过或放宽，无受保护模块/依赖/格式变更。
- [ ] AC-16 最终 `pnpm check` 通过，临时编辑、探针、浏览器/服务器及 synthetic 文件已按所有权清理。
- [ ] tracker、依赖及所有子任务证据一致；本项不交付新代码，不把任务完成等同阶段退出。

## 验证方法

- `pnpm check`；对照 goal 的每个 S/AC 行核验 01–06 证据与实际测试/接线，记录当前源码版本及完整任务差异。
- 优先复用 05 的最终有效结果；如受影响代码发生变化或证据缺失，按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)重验指定用例，不重复无关浏览器检查。
- 文档/元数据/链接、ID 与依赖图核对；所有 tracker 行 completed 后，`node tools/task-state.ts p1/09`才应路由为 done。这只是工作流结论，不能代替上述证据。

## 完成证据
