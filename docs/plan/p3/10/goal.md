---
type: plan
status: accepted
phase: P3
task: "10"
updated: 2026-10-14
related: [ADR-0004, ADR-0006, ADR-0015, ADR-0017, B-004, B-006, U-009, U-010, U-021, U-022, U-030, U-031]
---

# P3-10：通讯、基地交互与补给 — Goal

## 目标与来源

实现用户于 2026-10-14 批准的 [spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-18：

- 原版研究 Q-01 至 Q-11，事实写入 `docs/original/`；
- 三个[实施关卡](./spec.md#实施关卡)：D-01 共享契约与运行中衔接（含种类 `0x4000` 的责任）、D-02 连续行为判据、D-03 逻辑媒体边界，各在依赖它的工作开始之前定稿并取得用户批准；
- 规则数据输入与创建时检查；通讯菜单与命令路由；命令投递、基地回应、无线电队列与来电页；通讯反应与僚机报告；停靠请求、等待与停靠；基地服务与完全修理；离港与停靠中的系统；`communications` 分区；快照、replay 与容量；
- Runtime 与会话的运行中衔接保持；G-02/3、G-02/4 占位、G-05 基地页面与 G-03 文字；浏览器回归；本地真实内容核对；原版预实验、正式运行与对照结论；文档与交接。

本文件不重新定义行为契约。共享字段的最终形状由 D-01 写入 [P3-02 spec](../02/spec.md) 与 [P3-04 spec](../04/spec.md) 后为准；本 goal 只规定由哪个子任务实现。

## 代码现状与前提

- **已有代码（P3-02 至 P3-07 交付）：**
  - [pipeline.ts](../../../../src/core/systems/pipeline.ts) 的 `mission-flow`、`communications-reply`、`base-interior` 阶段为空，注释标出 P3-10 的位置；`Request` 联合与 `handleRequest` 是请求处理的入口。
  - [flight-control.ts](../../../../src/core/systems/flight-control.ts) 的 `judgeCommands` 是唯一命令循环：飞行中的 `select-number` 在此被判为 `ignored`/`wrong-context`，基地/地图中的 `select-number`、`confirm-selection` 交给 [commands.ts](../../../../src/core/systems/commands.ts) 的 `judgeCommand`，后者对 `communications`、`launch`、`navigate-selection` 给出 `rejected`/`not-implemented`。
  - [player-state.ts](../../../../src/core/world/player-state.ts) 的 `InteractionContext`（视角 6 为 `base`）与左页 0–6 的类型；[entity-table.ts](../../../../src/core/world/entity-table.ts) 的 `baseInteraction` 与 `docked` 活动；[world-state.ts](../../../../src/core/world/world-state.ts) 的 `MissionStatus` 只有 `built`；[projection.ts](../../../../src/core/projections/projection.ts) 的 `communications` 分区为 `not-implemented`，`MenuContentReference` 与 `OptionUnavailableReason` 为 `never`。
  - P3-07 的固定调用点：[damage.ts](../../../../src/core/systems/damage.ts) 模块注释中的 `0x3c208`、`0x3c0f4`；[spawn.ts](../../../../src/core/systems/spawn.ts) 的 `0x38cd4`；[area.ts](../../../../src/core/systems/area.ts) 的僚机报告位置；[mounts.ts](../../../../src/core/rules/mounts.ts) 的 `repairListMounts` 与 `listStatus`。
  - [create-world.ts](../../../../src/core/world/create-world.ts) 的 `CreateWorldInput` 与 `CONTENT_INPUT_FIELDS`；[rule-data.ts](../../../../src/core/world/rule-data.ts) 的 `RuleDataInputs` 尚不含菜单与服务项；[mission-input.ts](../../../../src/app/resources/mission-input.ts) 的 `ruleDataInputs`、[mission-owner.ts](../../../../src/app/mission/mission-owner.ts)、[replay-check.ts](../../../../tools/replay-check.ts) 与 `e2e/support/` 的合成包是其消费者。
  - 内容读取器 [comm-menus.ts](../../../../src/content/rule-data/comm-menus.ts) 与 [base-repair-items.ts](../../../../src/content/rule-data/base-repair-items.ts) 只做结构检查。
  - 会话：[game-runtime.ts](../../../../src/app/runtime/game-runtime.ts)（每帧至多 5 tick，帧后派发）、[game-session.ts](../../../../src/app/session/game-session.ts)（只有初始 G-02/2 的 `transition` 与 `complete-departure`）、[mission-owner.ts](../../../../src/app/mission/mission-owner.ts) 的占位计时；界面 [PlaceholderPage.tsx](../../../../src/ui/mission/PlaceholderPage.tsx)、[MissionShell.tsx](../../../../src/ui/mission/MissionShell.tsx)、[slice-gaps-copy.ts](../../../../src/ui/mission/slice-gaps-copy.ts)；键位 [bindings.ts](../../../../src/ui/game-input/bindings.ts) 已绑定 `c`/`x`/数字/Enter/`l`/上下。
- **计划新增：** `src/core/rules/` 与 `src/core/systems/` 下的 `comm-menus`、`communications`、`radio`、`base-response`、`comm-reactions`、`docking`、`base-service`、`full-repair`、`base-interior`；`src/core/world/comm-input.ts`；`src/core/projections/communications.ts`；`src/ui/mission/BasePage.tsx`；`e2e/base-interaction.spec.ts`；被忽略的 `local/research/p3-10/<主题>/`。名称可在实现时调整，职责以各 subtask 为准。
- **跨任务前提：**
  - P3-02 至 P3-07 已完成（各自 goal 全部 completed，见 [STATUS](../../../STATUS.md)），本 goal 消费其契约与实现。
  - P3-08、P3-09、P3-11 尚未开始：本 goal 只交付自己的状态与入口，不建无人消费的空回调，不宣称僚机命令效果、基地中地图或救援已运行（[依赖与交付边界](./spec.md#依赖与交付边界)）。若它们在本 goal 执行期间并行开工并修改同一共享契约或 Core 文件，协调者先合并已获批的上游修订，08 在其上增补，不并存两套修订。
  - 种类 `0x4000` 的责任由 08 闭合：移交 P3-08 获批时，协调者修改阶段索引中 P3-08 的范围说明；留在本任务时，协调者新增实现子任务，插入最终对齐之前。
- **环境（起草时核对）：**
  - 本 worktree 没有 `node_modules`：执行前运行 `pnpm install --frozen-lockfile`。
  - `local` 已链接到主仓库的 `local/`；Ghidra 一律 `-noanalysis -readOnly`，在 `local/research/p3-10/<主题>/` 中使用私有只读副本。
  - DOSBox-X 基准环境同一时间只有一个会话操作，由协调者安排 01 至 05、09、25 中需要运行的部分。
- **原版证据：**
  - 01 至 05 由 agent 用只读 Ghidra、本地数据与必要的运行读数取得，只写各自的 findings；06 统一写入 `docs/original/`。spec 起草时的本地数据核对由 01 复核、06 归档。
  - 09、25 先用模拟器内的按键、修饰位与设备输入配方完成飞行、选点与停靠（[模拟器内输入](../../../guides/runtime-measurement.md#模拟器内输入)）；只有当前合规途径无法满足某个具体操作时，记录障碍再请用户做最小操作（P3-05/34 的用户停靠是先例）。
  - 达不到 spec 门槛的研究项按 spec 阻塞，不按猜测实现。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
| --- | --- | --- |
| S-01 | 08、11、12 | 08：P3-02/P3-04 修订获批；11：类型、序列化、比较器与版本的 Node 测试；12：输入接线；28：契约一致 |
| S-02 | 13、19 | 13：菜单与路由的正式 step 测试；19：分区；23：浏览器 |
| S-03 | 14 | 14：投递与基地回应的 Node 测试 |
| S-04 | 14、15 | 14：队列与来电页；15：反应与报告的 Node 测试 |
| S-05 | 16 | 16：子状态与到期的 Node 测试 |
| S-06 | 16 | 16：门禁与停靠执行的 Node 测试 |
| S-07 | 17 | 17：服务与完全修理的 Node 测试 |
| S-08 | 18 | 18：离港的 Node 测试 |
| S-09 | 08、21 | 21：Runtime/Session/owner 的竞态矩阵；23：浏览器 |
| S-10 | 22 | 23：浏览器中的占位、G-05 与标注 |
| S-11 | 01–07、09、10、25、26 | 06：事实入档；10：D-02；26：R-17 至 R-19 的结论 |
| S-12 | 22、27 | 28：链接、元数据与交接核对 |
| AC-01 | 08、11 | 11：边界与版本拒绝；28：`pnpm check` |
| AC-02 | 12 | 12：limit/limit+1、拒绝、别名与 setupHash |
| AC-03 | 13 | 13：同 tick 序列、键与门禁的独立期望 |
| AC-04 | 14 | 14：投递、覆盖、回复分支 |
| AC-05 | 14、19 | 14：队列与来电规则；19：读模型完整、冻结、可恢复 |
| AC-06 | 15 | 15：调用点、限频、条件抽取的原像计数 |
| AC-07 | 16 | 16：等号与跨阈值、取消与过期回复 |
| AC-08 | 16 | 16：首个合格基地门禁、僚机距离、成功转移 |
| AC-09 | 17 | 17：服务状态、时序、补给上限、完全修理的字段 |
| AC-10 | 18 | 18：主动/自动离港、重复请求、放置序号 |
| AC-11 | 18 | 18：停靠中各系统的联合测试 |
| AC-12 | 20 | 20：两次停靠/离港的 replay、版本拒绝、容量 |
| AC-13 | 21 | 21：帧屏障、凭证、取消与竞态 |
| AC-14 | 22 | 23：本机 Chrome 的完整流程与断言（browser-testing） |
| AC-15 | 24 | 24：两种僚机配置的私有真实内容核对 |
| AC-16 | 01–07 | 06：入档与 U 项；28：`pnpm check:compliance`、git 审阅 |
| AC-17 | 09、10、25、26 | 10：判据获批；25：≥2 次合格运行；26：结论 |
| AC-18 | 27 | 28：文档链接与元数据、`pnpm check` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
| --- | --- | --- |
| [01-menus-delivery-research.md](./subtasks/01-menus-delivery-research.md) | — | pending |
| [02-radio-incoming-research.md](./subtasks/02-radio-incoming-research.md) | — | pending |
| [03-reactions-reports-research.md](./subtasks/03-reactions-reports-research.md) | — | pending |
| [04-docking-launch-research.md](./subtasks/04-docking-launch-research.md) | — | pending |
| [05-base-service-research.md](./subtasks/05-base-service-research.md) | — | pending |
| [06-original-facts.md](./subtasks/06-original-facts.md) | 01, 02, 03, 04, 05 | pending |
| [07-media-model-gate.md](./subtasks/07-media-model-gate.md) | 02, 03, 06 | pending |
| [08-shared-contract-gate.md](./subtasks/08-shared-contract-gate.md) | 01, 02, 03, 04, 05, 06, 07 | pending |
| [09-original-pilot-runs.md](./subtasks/09-original-pilot-runs.md) | 02, 04, 05 | pending |
| [10-tolerance-gate.md](./subtasks/10-tolerance-gate.md) | 07, 09 | pending |
| [11-contract-foundation.md](./subtasks/11-contract-foundation.md) | 08 | pending |
| [12-rule-data-inputs.md](./subtasks/12-rule-data-inputs.md) | 01, 05, 11 | pending |
| [13-comm-menus-routing.md](./subtasks/13-comm-menus-routing.md) | 12 | pending |
| [14-delivery-radio-incoming.md](./subtasks/14-delivery-radio-incoming.md) | 02, 07, 13 | pending |
| [15-reactions-reports.md](./subtasks/15-reactions-reports.md) | 03, 14 | pending |
| [16-docking-request-dock.md](./subtasks/16-docking-request-dock.md) | 04, 14 | pending |
| [17-base-service.md](./subtasks/17-base-service.md) | 05, 16 | pending |
| [18-launch-docked-systems.md](./subtasks/18-launch-docked-systems.md) | 04, 17 | pending |
| [19-comm-projection.md](./subtasks/19-comm-projection.md) | 13, 14, 17 | pending |
| [20-replay-limits.md](./subtasks/20-replay-limits.md) | 15, 18, 19 | pending |
| [21-runtime-transition-hold.md](./subtasks/21-runtime-transition-hold.md) | 11, 18 | pending |
| [22-ui-base-page-gaps.md](./subtasks/22-ui-base-page-gaps.md) | 19, 21 | pending |
| [23-browser-verification.md](./subtasks/23-browser-verification.md) | 20, 22 | pending |
| [24-real-content-check.md](./subtasks/24-real-content-check.md) | 20 | pending |
| [25-original-formal-runs.md](./subtasks/25-original-formal-runs.md) | 06, 10 | pending |
| [26-comparison-conclusions.md](./subtasks/26-comparison-conclusions.md) | 20, 24, 25 | pending |
| [27-docs-handoff.md](./subtasks/27-docs-handoff.md) | 20, 22, 23, 26 | pending |
| [28-final-alignment.md](./subtasks/28-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

## 审批

用户于 2026-10-14 明确批准本 goal（“approve the goal and commit”）。批准范围：上述 28 个子任务及其依赖、写入范围与执行方式。这不代表实现完成，也不替代 spec 批准。

07、08、10 的执行方式保持“需用户”：spec 规定 D-01 至 D-03 的定稿由用户明确批准，用户批准本 goal 时没有给出预先授权。以后若用户授权 agent 直接批准推荐方案（P3-07 的先例），协调者把这三项改为“自动”并记录授权原话。
