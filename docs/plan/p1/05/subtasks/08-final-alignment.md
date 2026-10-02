---
type: plan
status: active
phase: P1
task: "05"
subtask: "08"
updated: 2026-10-02
---

# 08 — 完整会话契约最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-08、AC-01 至 AC-14、技术决定 1–13与“不包含”范围。
**依赖：** 01, 02, 03, 04, 05, 06, 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对 spec→goal 覆盖→实际实现→01–07 完成证据，尤其状态表、通知 FIFO/错误出口、runId+commandId、暂停折叠/重锚、取消/清理及安全故障恢复。
- 运行最终 pnpm check，保留 P1-04 既有正常帧/录制/错误测试。生命周期操作只能显式改变 app 状态，Core 世界/RNG/记录形状不变。
- 复核 07 的真实 Chromium rAF/hidden/监听撤销证据必须已取得；Node、派发事件和占位壳不能填补真实 hidden 缺口；用户手动证据记录实际引擎/origin与观测。
- 清理失败计数不是回收成功证明；检查 cleanupFailed 与后续错误独立、重复退出/销毁不重复清理、旧回调/句柄无新世界权限、无异步回调偷偷吞错。
- 复核 runId MAX_SAFE_INTEGER 分配前守卫的代码证据，不新增公共恢复/编辑接口。
- 检查目标范围、提交文件与数据隐私：无原版内容/读取、无新依赖/runner、无 App/main 接线、无存储/云/部署。工程及指南与最终 API/方法一致。
- 全部验收通过后在本项记录 P1-04 与本任务的最终证据，供 P1 阶段评审核对；按 [ADR-0014](../../../../decisions/ADR-0014-status-summary-only.md)，不更新 STATUS 退出项。含 React StrictMode/HMR 的联合无重复循环及其他消费者要求仍由后续任务提供证据。
- 只做验证/文档；发现缺口新增稳定新 ID 的修复项，插在本项前、加依赖，不在此写功能或修改 spec。

## 不包含

- 新功能、P1 阶段退出评审、真实下游消费者或 P1-10。
- 无 push、云资源或部署；无实现改动不执行 simplify。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md)与01–07文档。
- 01–06 计划交付的 app/platform 文件及 [Core](../../../../../src/core/synthetic/synthetic-scene.ts)、[replay](../../../../../src/core/synthetic/synthetic-replay.ts)（只读核验）。
- [工程约定](../../../../engineering/README.md)、07 实际更新的操作说明、[阶段索引](../../tasks.md)与 [ADR-0014](../../../../decisions/ADR-0014-status-summary-only.md)。
- 当前文件位置与独立目录迁移验证见[源码结构指南](../../../../engineering/source-structure.md#p1-06-前迁移记录)；历史计划路径按对应关系定位，不将目录检查计为本项完成。

## 验收标准

- [ ] 全部 8 个 S 和 14 个 AC 有当前有效的完整证据，不用部分子任务或文档 accepted 冒称完成。
- [ ] 完整 pnpm check 通过、上游回归没有删除/跳过/放宽；runId 上限审阅准确。
- [ ] 生命周期、通知、错误、资源与录制不变量一致，无第二循环或错误成功 fallback。
- [ ] 实际 Chromium hidden/rAF/监听证据齐全；没有混同模拟/BFCache/StrictMode/HMR/发布设备结论。
- [ ] 范围/文档/隐私检查通过，自有临时验证资源已清理，所有交付有对应证据。
- [ ] 本项完整记录 GameRuntime 证据且未修改 STATUS 退出条件；联合要求明确留给后续任务和 P1 阶段评审。

## 验证方法

- `pnpm check`，逐项核对 S/AC 与 01–07 测试/审阅/浏览器结果，文档链接/元数据与 tracker 一一对应。
- 只读审阅目标起始基线和本目标提交文件，分离并行工作。工作流要求本项 rubber-duck 复核契约与证据；不重新委派相同实现审阅。
- 浏览器证据使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 已在 03/07 取得的实际记录；缺失则不能通过，不将实机/原版/云检查凭空加入本目标。

## 完成证据
