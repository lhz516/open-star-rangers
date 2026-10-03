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

- [x] 全部 8 个 S 和 14 个 AC 有当前有效的完整证据，不用部分子任务或文档 accepted 冒称完成。
- [x] 完整 pnpm check 通过、上游回归没有删除/跳过/放宽；runId 上限审阅准确。
- [x] 生命周期、通知、错误、资源与录制不变量一致，无第二循环或错误成功 fallback。
- [x] 实际 Chromium hidden/rAF/监听证据齐全；没有混同模拟/BFCache/StrictMode/HMR/发布设备结论。
- [x] 范围/文档/隐私检查通过，自有临时验证资源已清理，所有交付有对应证据。
- [x] 本项完整记录 GameRuntime 证据且未修改 STATUS 退出条件；联合要求明确留给后续任务和 P1 阶段评审。

## 验证方法

- `pnpm check`，逐项核对 S/AC 与 01–07 测试/审阅/浏览器结果，文档链接/元数据与 tracker 一一对应。
- 只读审阅目标起始基线和本目标提交文件，分离并行工作。工作流要求本项 rubber-duck 复核契约与证据；不重新委派相同实现审阅。
- 浏览器证据使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 已在 03/07 取得的实际记录；缺失则不能通过，不将实机/原版/云检查凭空加入本目标。

## 完成证据

- 2026-10-02：基线为 `8d02001`（相对 `b23683b` 仅新增 P1-06 规划文档与阶段索引链接，无代码、依赖或配置变化）。`pnpm check` 通过：三个 TypeScript 程序、ESLint、27 个测试文件 / 598 项 Vitest、Vite 生产构建。
- **覆盖：** 01–07 的验收框全部已勾选并有证据。各 AC 的子任务来源与 goal 覆盖表一致：AC-01 {01,04}、AC-02 {04,05}、AC-03 {03,04,06}、AC-04 {02,04,06}、AC-05 {02,04,05,06}、AC-06 {05,06}、AC-07 {03,04,07}、AC-08 {02,04,05}、AC-09 {05,06,07}、AC-10 {01,05,06}、AC-11 {04,06}、AC-12 {06}、AC-13 {03,07}、AC-14 {01–07}。S-01 至 S-08 分别由上述实现与测试覆盖，没有以文档 accepted 代替证据。
- **上游回归：** P1-04 最终提交 `7c576ff` 的 7 个 Runtime 测试文件迁到 `src/app/runtime/` 后，与原文件相比只有 import 与 `vi.mock` 路径行不同。Core 文件迁到 `determinism/`、`synthetic/` 后只改了导入路径；全仓测试无 `.skip`、`.only`、`.todo`。自 `7c576ff` 以来 package.json、锁文件、Vite/TS/ESLint 配置、App 与 main 均无变化。Core 中没有 React、Zustand、Three.js 或 DOM 引用。
- **runId 上限：** [`#canAllocate`](../../../../../src/app/session/synthetic-session.ts) 在 `#nextId === Number.MAX_SAFE_INTEGER` 时抛出“runId exhausted”，因此最多签发 `MAX_SAFE_INTEGER − 1`。restart 先调用 `#canAllocate` 再 `#end`，耗尽时不会关闭旧运行；没有公开的身份修改入口或测试后门。
- **不变量：** 唯一请求与身份/代次隔离（04、06）、通知 FIFO 与唯一错误出口（05、06）、暂停折叠与重锚（02、04、06）、逆序且至多一次的清理和持续的 cleanupFailed（05、06）、故障成功前缀与 replay 一致（06），均有直接测试；Runtime.frame 失败时没有成功形状的帧报告或自动重试。
- **浏览器：** 07 补测在外部 headed Chromium 154 中经 CDP 独立 context 取得真实 hidden。依次观测到：自动 paused/hidden，tick 稳定为 478、pending=0；隐藏期间 resume 被拒绝；回到 visible 后仍 paused；显式 resume 首帧 0 tick、状态对 478/478、alpha=0，随后推进且 maxPending=1；dispose 后三个监听各撤销一次。临时探针、context、浏览器与 Vite 均已清理。pagehide/pageshow 只证明绑定，不涉及 BFCache；StrictMode、HMR 与真实消费者没有被宣称通过。
- **文档与隐私：** P1-05 文档与工程文档的本地链接只有 spec 中 `STATUS.md#运行骨架` 一处失效。它是[迁移记录](../../../../engineering/source-structure.md#验证)中保留的历史锚点，不修改已批准的 spec。仓库中没有 `local/` 文件、二进制或原版内容。
- **GameRuntime 证据与 STATUS：** spec 的 AC-14 和技术决定 13 原要求勾选 STATUS 的 GameRuntime 项；按 [ADR-0014](../../../../decisions/ADR-0014-status-summary-only.md)，该叙述保留为历史，证据留在本项（P1-04 [最终证据](../../04/subtasks/06-final-alignment.md#完成证据)加上本任务 01–08），由 P1 阶段评审判定。STATUS 只更新“下一步”摘要，不新增或勾选退出项。“重启/暂停无重复循环（含 StrictMode 与 HMR）”这一联合要求仍由 P1-06 至 P1-10 及阶段评审核验。
- **rubber-duck：** 结论为可以完成，无阻断问题，也不需要修复子任务。两条非阻断建议已采纳：记录实际基线 `8d02001`；STATUS 的下一步改为推进 P1-06。本项只做验证与文档，没有实现改动，因此不执行 simplify。
- **文档影响：** 更新本项证据、goal tracker 与 STATUS 的下一步。工程约定、源码结构与指南已描述最终 API，无需修改；原版事实与冻结决定没有变化。
