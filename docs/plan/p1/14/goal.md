---
type: plan
status: accepted
phase: P1
task: "14"
updated: 2026-10-10
related: [ADR-0008, ADR-0012, ADR-0014, ADR-0015]
---

# P1-14：P1 退出评审与交接 — Goal

## 目标与来源

交付用户于 2026-10-03 批准并同日修订的 [Spec](./spec.md) 的 S-01 至 S-07、AC-01 至 AC-14：以当前候选版本的本地检查和有效历史证据形成 P1 draft 退出评审，已定位的契约内缺陷在本 Goal 独立修复项闭环，交接后续责任。本文件不改变判据；证据完整的评审交付不等于 P1 通过，负责人确认与阶段切换均不由 Goal 批准或执行代替。

## 代码现状与前提

- 规划基线 HEAD 为 `e5383d8`，执行起点为 `831d231`（干净工作树/索引，见01）；规划新增本 Goal、六项证据文档，执行已新增[draft退出评审](../../../reviews/P1-exit.md)。现有源码未重写，未发现需独立修复项的既定P1缺陷，不预建空修复文件或新功能；最终差异/身份见06。
- [合成 Core](../../../engineering/source-structure.md#r1-合成-core)、[snapshot](../../../engineering/source-structure.md#r1-合成-core)、[replay](../../../engineering/source-structure.md#r1-合成-core)已提供纯输入/命令/事件、投影、两种状态读取及 `osr-synthetic-replay`/1。其单位、规则和版本不成为正式玩法/存档契约。
- [Runtime](../../../engineering/source-structure.md#r3-合成-runtime)、[Session](../../../engineering/source-structure.md#r4-合成会话)、[UI store](../../../engineering/source-structure.md#r6-合成-ui-层)和[App](../../../../src/app/App.tsx)已形成命令/控制分流、帧后反馈、只读消费及菜单/合成场景闭环，输入/渲染的落点见[结构指南](../../../engineering/source-structure.md)。
- [package.json](../../../../package.json)已有工程、E2E、三合规命令；[Python 测试](../../../../tools/ghidra/test_patch_watcom_cspec.py)只用临时合成 XML，独立于 `pnpm check`。无缺失 runner 或新增依赖前提。
- [Playwright 配置](../../../../playwright.config.ts)已有 development、production、development-headed，单 worker/零重试/严格端口；[环境 helper](../../../../e2e/support/environment.ts)支持现有兼容浏览器和端口覆盖。规划发现数为 21（10/10/1），执行时按实际配置核对，不把列表或旧 18+3 结果当本轮通过。
- [合规 CLI](../../../../tools/compliance/cli.ts)、[报告](../../../../tools/compliance/report.ts)、[分发工具](../../../../tools/compliance/distribution.ts)、[声明生成器](../../../../tools/compliance/notices.ts)已有七范围聚合、完整文本与身份核对，合法多文档 lock 无修复任务；人工来源/全文审阅仍需保留。

### 跨任务与环境前提

| 前提 | 完成依据与执行前核对 |
|---|---|
| P1-01 工程边界 | [Goal](../01/goal.md#子任务跟踪)、[最终证据](../01/subtasks/06-final-alignment.md#完成证据)；包含独立 Python 合成测试 |
| P1-02 纯 Core | [Goal](../02/goal.md#子任务跟踪)、[最终证据](../02/subtasks/05-final-alignment.md#完成证据) |
| P1-03 snapshot/replay | [Goal](../03/goal.md#子任务跟踪)、[最终证据](../03/subtasks/07-final-alignment.md#完成证据) |
| P1-04 Runtime | [Goal](../04/goal.md#子任务跟踪)、[最终对齐](../04/subtasks/06-final-alignment.md#完成证据)；同时核对其全部 tracker 行 |
| P1-05 Session | [Goal](../05/goal.md#子任务跟踪)、[最终证据](../05/subtasks/08-final-alignment.md#完成证据) |
| P1-06 UI 闭环 | [Goal](../06/goal.md#子任务跟踪)、[最终证据](../06/subtasks/09-final-alignment.md#完成证据) |
| P1-07 渲染 | [Goal](../07/goal.md#子任务跟踪)、[最终浏览器证据](../07/subtasks/08-final-browser-alignment.md#完成证据)；同时核对后续 tracker 行 |
| P1-08 菜单 | [Goal](../08/goal.md#子任务跟踪)、[最终证据](../08/subtasks/06-final-browser-alignment.md#完成证据)；同时核对后续 tracker 行 |
| P1-09 输入 | [Goal](../09/goal.md#子任务跟踪)、[最终证据](../09/subtasks/07-final-alignment.md#完成证据) |
| P1-10 联合回归 | [Goal](../10/goal.md#子任务跟踪)、[汇总](../10/subtasks/07-evidence-docs-alignment.md#完成证据)、[最终证据](../10/subtasks/08-final-alignment.md#完成证据) |
| P1-12 合规 | [Goal](../12/goal.md#子任务跟踪)、[实际审阅](../12/subtasks/08-local-evidence-docs.md#完成证据)、[最终证据](../12/subtasks/09-final-alignment.md#完成证据) |
| 当前工具链与输入 | [工程约定](../../../engineering/README.md)：项目 Node/pnpm、Git、已安装锁定依赖、本地许可全文和 Python 标准库可用；缺依赖才按 frozen lock 恢复，不升级或自动联网补许可 |
| 真实浏览器能力 | 已安装兼容 Chrome/Chromium、隔离 context、正常 WebGL 与 headed 原生 hidden 路线；按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md)核验，不借用个人 profile 或未知服务器，缺必需能力不能替代通过 |
| 判据与原版边界 | [总计划 §12](../../master-plan.md#12-开发阶段与验收条件)、[评审约定](../../../reviews/README.md)、[未知项](../../../original/unknowns.md)和 Spec；不读原版文件，无 GitHub/Azure、云或原版实机对照前提 |

规划时前置任务路由均为 done；01 必须核验批准、全部 tracker 行和证据，不能只看此表或旧最终项。P0/发布级实机要求只交接，不豁免。

**本次提交约定：** 用户于 2026-10-03 允许无代码子任务不单独 commit，或仅 commit 文档。当前六项仍为验证/文档项，可合并保存证据后仅提交文档，也可不创建提交；不为 checkbox 生成空提交。发现后新增的代码修复项须单独本地提交，不适用无代码例外。各项证据与 tracker 必须真实保存到仓库文档，最终明确提交或未提交状态，不能以跳过 commit 为由省略验证或清理。获批规划修订本身未执行；本轮明确execute-goal后按此例外合并文档提交。

### 按需聚焦修复

归原责任定位，在本 Goal 新增聚焦修复项并闭环验证，遵循 [Spec 技术决定9](./spec.md#技术决定)：

- 发现具体缺陷后，先记录原任务/受影响 AC、复现和根因，再创建真实的 `NN-<repair>.md`、tracker 行及覆盖表映射。新 ID 从未使用的编号继续分配（当前下一号为07），初始 pending；不生成没有缺陷的占位项。
- 依赖按真实需要设置。若发现项因缺陷 blocked，修复项以已取得的复现为前提，不依赖该 blocked 行或最终对齐；依赖不受该缺陷阻塞的基线/其他修复项，避免循环和执行死锁。缺定位证据或需改契约时仍blocked，不猜测实现。
- 代码修复和回归仅在新增项内交付；01–05保持各自核验/文档职责，06始终只验证。修复后发现项重验，受影响的05评审或其他已完成项需重新核对，在 tracker 中明确恢复待验证状态并记录原因，新证据记录变化而不删除旧正确证据；已执行项目的 ID 不重编号。
- 新修复项插入06之前；06依赖所有行，05在判定前依赖所有影响其结论的修复项。若缺陷由05/06发现，按真实依赖重新核验受影响项，但修复项不得反向依赖受阻的05/06。
- 每个代码修复有针对性回归、`pnpm check`及受影响的浏览器/合规或 Python 检查、独立审查/限定 [simplify](../../../../.agents/skills/simplify/SKILL.md)和本地提交；最终输入/产物和历史适用性随修复更新。新玩法、格式/兼容或冻结架构变更不由本条批准。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 01：前置、候选和覆盖映射；05、06：正式判定及最终身份 |
| S-02 | 02、03、04；缺陷定位后加入实际修复项 | 02：工程/Python；03：完整浏览器；04：当前聚合；修复项：回归/受影响重验；06：最终身份及闭环 |
| S-03 | 01、03 | 01：逐类适用性；03：失效浏览器补验；02、04：各自当前证据；06：闭合 |
| S-04 | 04 | 04：合规/来源/全文；03：生产文件；06：最终四范围 |
| S-05 | 05 | 05：新 draft 评审；06：结论、确认状态与证据一致 |
| S-06 | 05 | 05：设施/替代项/后续责任与全部未关闭 U 项；06：交接不越界 |
| S-07 | 05、06 | 05：相关指南/STATUS 下一步；06：链接、最终扫描、清理与持久状态 |
| AC-01 | 01 | 01：11 项批准/tracker/证据及候选环境；06：最终差异 |
| AC-02 | 01、05 | 01：七条件和全部主要交付映射；05、06：正式逐项判定 |
| AC-03 | 02 | 02：pnpm check 与独立 Python 实测、版本/退出码；06：仍对应最终输入 |
| AC-04 | 03 | 03：发现与完整三项目执行/失败重跑；06：无漏验或掩盖 |
| AC-05 | 03 | 03：真实反馈/像素/输入/控制/资源/native/WebGL-off；01、06：历史边界 |
| AC-06 | 02、03 | 02：Node replay 正/负；03：同记录浏览器结果和比较器；06：一致性边界 |
| AC-07 | 01、03 | 01：来源/变化/复用表；03：必需失效项实际补验；06：无悬空项 |
| AC-08 | 04、06 | 04：七范围聚合 shape/exit/coverage；06：最终四范围扫描与身份 |
| AC-09 | 04 | 04：实际分发/全文/权利/人工审阅；03：当前生产文件可读性；06：保持有效 |
| AC-10 | 01、02、03、04、05；缺陷定位后加入实际修复项 | 各项记录原因/责任/恢复，修复项：根因/回归/重验/代码提交；05汇总，06：真实失败、未取得证据及修复闭环 |
| AC-11 | 05 | 05：四部分/draft/结论一致；06：不预授确认或有条件豁免 |
| AC-12 | 05 | 05：全部非已确认/不再需要 U 项与负责阶段、P0/P2/P3/P5入口；06：无事实复制 |
| AC-13 | 05 | 05：STATUS 下一步与指南对齐；06：元数据/链接/无阶段切换 |
| AC-14 | 01、02、03、04、05、06；缺陷定位后加入实际修复项 | 当前六项保持核验/文档；修复项仅必要代码/回归；06：全 diff、输入身份、自有资源及提交状态 |

当前六项的“实现子任务”指证据或评审文档交付；实际代码/回归由发现后新增的修复项负责，并在覆盖表填入其真实ID，全部由06最终复核。取得明确的测量失败可支持完整“不通过”评审；缺必需观测/执行则相关项仍 blocked，不以记录未验证代替完成。没有具体缺陷时，条件性修复要求以无缺口证据核验，不制造空修复项。

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖全部 completed 后开始；证据只写相应 subtask 文档。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-candidate-evidence-map.md](./subtasks/01-candidate-evidence-map.md) | — | completed |
| [02-engineering-replay-checks.md](./subtasks/02-engineering-replay-checks.md) | 01 | completed |
| [03-browser-exit-checks.md](./subtasks/03-browser-exit-checks.md) | 01 | completed |
| [04-compliance-artifact-review.md](./subtasks/04-compliance-artifact-review.md) | 01 | completed |
| [05-exit-review-handoff.md](./subtasks/05-exit-review-handoff.md) | 01, 02, 03, 04 | completed |
| [06-final-alignment.md](./subtasks/06-final-alignment.md) | 01, 02, 03, 04, 05 | completed |

02/03/04只需要01的候选及适用性，不互相制造前置；执行仍顺序进行，因各命令共用 dist，须核对实际测试/审阅产物身份。05需要全部证据和相关修复闭环才能作判定，06仅验证且依赖所有其他行。生产缺口归原责任定位，在本 Goal 按上述规则新增修复项，不重新打开旧Goal或改写历史证据；规划修订保持ID与当时pending状态，当前执行状态只见tracker。

## 执行记录

## 审批

用户于 2026-10-03 明确批准本 Goal 的完整计划：当前六个验证/文档子任务及按需新增的 P1 契约内聚焦修复项，并要求本地提交 P1-14 规划文档；获批时所有现有子任务为pending，随后用户明确调用execute-goal执行，当前状态只见tracker。批准不代表验收完成、不代替阶段评审结论确认，也不授权阶段切换、push 或部署。
