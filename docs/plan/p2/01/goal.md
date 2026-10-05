---
type: plan
status: accepted
phase: P2
task: "01"
updated: 2026-10-04
---

# P2-01：切片资源边界与内容契约 — Goal

## 目标与来源

实现已批准的 [P2-01 spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-13：取得选定任务候选的本地资格证据，建立纯 `content/` 规范内容契约、`original-data/` 来源映射边界、四组资源和依赖闭包验证、版本/来源身份、预算/所有权规则及合成测试。候选资格证据尚未取得；若首选和确定性回退均不合格，相关子任务必须保持 blocked，不能以临时资源完成。

## 代码现状与前提

- [imfat.ts](../../../../src/original-data/imfat.ts)、[payloads.ts](../../../../src/original-data/payloads.ts)和[synthetic.ts](../../../../src/original-data/synthetic.ts)已提供原版格式解析/合成字节基础，但没有 Asset ID、内容清单或来源映射契约。
- [08](./subtasks/08-base-content-contract.md) 已新增纯 `src/content/` 基础契约及相邻合成测试；正式切片定义、来源选择与完整性/预算验证仍由后续子任务实现，继续保持纯模块边界。
- [P2 tasks](../tasks.md)、[P0 可行性评审](../../../reviews/P0-feasibility.md)及 [U-003/U-022/U-023](../../../original/unknowns.md)提供研究范围；本地合法原版数据只读研究留在 `local/`，公开文档仅记录安全结构结论。
- 外部前提：必须能访问开发者本地基准数据以取得候选资格证据；无数据或语义无法区分时，01 进入 blocked，不能用合成 fixture 代替。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01、02 | 07 核对本地资格证据与唯一生产切片定义一致 |
| S-02 | 01、02 | 07 核对回退选择链与重新批准记录 |
| S-03 | 01、02 | 06 角色基数正负测试 |
| S-04 | 08、02 | 08/06 Asset ID 语法、稳定性与引用测试 |
| S-05 | 08、02、03 | 08/06 版本、manifest 与来源判别测试 |
| S-06 | 03 | 07 来源隔离与文档事实归属检查 |
| S-07 | 04 | 06 依赖闭包与完整性推导测试 |
| S-08 | 08、04 | 08/06 资源组、组级/全包与混装拒绝测试 |
| S-09 | 05 | 06 十二维预算、溢出与缺失维度测试 |
| S-10 | 08、02、05 | 08/06 结构化克隆与 TypedArray 所有权测试 |
| S-11 | 01、03 | 07 U 项置信度与下游责任链接检查 |
| S-12 | 08、06 | 07 合成隔离、纯模块与工程检查 |
| AC-01 | 01、02 | 07 候选结论与生产定义一致性复核 |
| AC-02 | 02 | 06 角色与组基数断言 |
| AC-03 | 08、02 | 08/06 Asset ID 稳定性与跨资源引用断言 |
| AC-04 | 08、02、03、09 | 08/06 身份字段与合成/原版来源判别断言；09 类型级排除对方字段 |
| AC-05 | 03 | 06 locator 映射、冲突与缺失诊断断言 |
| AC-06 | 04 | 06 完整性推导与不可伪造布尔断言 |
| AC-07 | 04 | 06 四组独立、跨组要求与混装拒绝断言 |
| AC-08 | 05 | 06 预算维度、边界与溢出断言 |
| AC-09 | 08、05、09 | 08/06 所有权隔离与 transfer 失效断言；09 结果容器不引用调用者输入 |
| AC-10 | 01、03 | 07 本地资格证据与 U 项状态复核 |
| AC-11 | 06 | 07 `pnpm check:original`与 diff 审阅 |
| AC-12 | 08、06 | 08/07 `pnpm check`与依赖/锁文件无变化检查 |
| AC-13 | 03、10 | 07 文档链接、元数据与导出一致性检查；10 spec 只链接原版事实 |
| 风险恢复与阻塞门禁 | 07 | 07 `node tools/task-state.ts`与最终 diff 审阅 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [08-base-content-contract.md](./subtasks/08-base-content-contract.md) | — | completed |
| [01-candidate-qualification.md](./subtasks/01-candidate-qualification.md) | 08 | completed |
| [02-slice-content-contract.md](./subtasks/02-slice-content-contract.md) | 01 | completed |
| [03-source-mapping-boundary.md](./subtasks/03-source-mapping-boundary.md) | 01, 02 | completed |
| [04-completeness-validation.md](./subtasks/04-completeness-validation.md) | 02, 03 | completed |
| [05-budget-ownership-contract.md](./subtasks/05-budget-ownership-contract.md) | 02 | completed |
| [06-synthetic-contract-tests.md](./subtasks/06-synthetic-contract-tests.md) | 02, 03, 04, 05 | completed |
| [09-isolation-origin-remediation.md](./subtasks/09-isolation-origin-remediation.md) | 03, 04, 08 | completed |
| [10-spec-fact-links.md](./subtasks/10-spec-fact-links.md) | 01 | completed |
| [07-final-alignment.md](./subtasks/07-final-alignment.md) | 01, 02, 03, 04, 05, 06, 08, 09, 10 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务；ID 固定，不在执行中重排。

## 执行记录

- **2026-10-03 — Subtask 01 blocked:** 首选 slot 0 的结构已确认，但六个非玩家 M2ID 槽位的敌我/基地语义、任务结果条件和战略地图/Warp 空间语义不足以满足已批准的资格门槛；同一 U-022 缺口也阻止无猜测地选择确定性回退。
  Evidence: 本地 `SCENARIO.NOB` 结构统计、M2ID/SCCT 交叉核对及 rubber-duck 审查；安全证据保存在 `local/research/p2-01/`，结论记录于 `docs/original/formats/scenario.md`。
  Affected acceptance: S-01、S-02、S-03、S-11；AC-01、AC-10；subtask 01 前两项。
  Resume when: U-022 已定位并验证阵营、基地能力、结果条件和空间字段，或用户批准修订后的切片资格契约。

- **2026-10-03 — Subtask 01 blocker updated:** 用户补充试玩后，原先建议的练习玩法候选已排除；进入 S-02 的战役回退资格研究，不再等待练习模式通关。模式到 SCCT/SCEN 的对应仍须核实，未选定或锁定替代任务。
  Evidence: [B-002](../../../original/behavior/B-002-practice-mode.md) 的用户观察与本地截图核对。
  Affected acceptance: S-01、S-02；AC-01、AC-10。
  Resume when: 战役回退候选满足原资格门槛，并按必需 Asset 数、依赖边数、group/slot 字典序完成选择；替代候选的 spec 已重新审阅、批准并与 goal 对齐。

- **2026-10-03 — Subtask 01 blocker narrowed after campaign evidence:** 战役玩法覆盖疑问已有证据，当前阻塞缩小为基准配置/结构身份、完整机型与资源闭包、S-02 排序和替代候选审批；不再要求重复证明已有的基地、地图/Warp 或结算界面。
  Evidence: [subtask 01 资格覆盖表](./subtasks/01-candidate-qualification.md#当前资格证据覆盖) 与其中链接的原版行为记录。
  Affected acceptance: S-01、S-02、S-03；AC-01、AC-10。
  Resume when: 取得所选基准配置的合格任务与闭包/排序证据，替代候选经 spec 修订、重新审阅和批准；U-031 的精确救援/失败规则留给 P3，不作为要求全部关闭的额外 P2 门槛。

- **2026-10-03 — Subtask 01 selection-contract prerequisite identified:** 全槽位来源 profile 已完成，但 S-02 要求先按规范 Asset/边数选择，当前尚未明确源条目到规范 Asset 的拆分/合并与固定/隐式依赖；不能拿来源计数替代。跨组比较的字典序兜底也不能自动保留此前期望的中间组配置。
  Evidence: [scenario 来源 profile](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)；本地结构断言及现有封包/payload 检查通过。
  Affected acceptance: S-01、S-02；AC-01、AC-10。
  Resume when: 补齐完整规范划分与排序证据，或用户决定修订回退选型关卡，再经 spec 修订、审阅和批准；在此之前 tracker 保持 blocked。

- **2026-10-03 — Selection rule retained by user:** 用户明确选择保留现有全战役规范 Asset 排序规则，不采用优先固定中间组第一关的替代关卡。后续需先明确规范资源划分和全部必需引用，再执行原 S-02 比较；来源 profile 只作为辅助证据。本选择不批准任何候选，也不改变 spec 或 subtask 依赖。

- **2026-10-03 — Model Asset granularity selected by user:** 用户选择每个模型一个规范 Asset，网格几何并入模型 payload，几何版本与所有权由模型管理，不把原版 MESH 条目直接计为独立 data Asset。原版解析可以复用共享几何的读取/解码，但输出模型不能共享可由消费者修改的二进制视图。此实现细化不改变 S-02 排序、原版隔离或候选审批关卡；完整规范图仍在研究中。

- **2026-10-03 — Prerequisite split approved by user:** 用户明确批准从 02 拆出候选无关的基础契约作为前置项。新增稳定 ID 08，01 依赖 08，02 仍依赖完成资格选择的 01；07 依赖全部非最终项。原有编号、状态与证据保留，spec/S-02 不变。

- **2026-10-03 — Subtask 08 blocked on required validation:** 基础契约实现、164 项针对性测试、类型/lint/单独构建及原版隔离通过，但两次默认 `pnpm check` 分别有 26/16 项工具测试超时；原断言/deadline 未改。本项尚不满足完整检查通过的验收，不标 completed、不提交、不推进依赖项。
  Evidence: 单独工程边界 suite 在当前树为 29 通过/3 超时；无本项代码的干净 HEAD 副本在同样 `--maxWorkers=1`、原 deadline 下也出现 31 通过/1 超时，证明至少一项超时在旧树可重现，不据此断言全部失败均无关。本轮默认检查为 1420 通过/16 失败，无内容契约断言失败。
  Affected acceptance: subtask 08 最后一项；AC-12 的最终工程检查。
  Resume when: 在可满足既有 deadline 的环境中重跑 required checks 并全部通过；不得放宽 timeout、跳过失败测试或停止非本任务进程来伪造通过。

- **2026-10-03 — Test scheduling change approved by user:** 全部 60 文件/1436 项测试在串行模式下通过，默认并发仍产生工具 deadline 超时。用户明确批准将 Vitest 文件调度改为串行，保持测试发现、断言和 timeout 不变；独立 E2E 设置不变。此变更纳入 08 的验证修复范围，不以单独通过替代默认完整检查，须重新运行 `pnpm check`。

- **2026-10-03 — Subtask 08 validation still blocked after scheduling fix:** 默认串行/单 worker 已落实且 typecheck/lint 通过；最新完整测试为 1436 通过/1 超时，合规 CLI 聚合用例约 47.3 秒超过原 45 秒。没有放宽 deadline，也不以先前串行全量通过或单独 suite 通过宣称当前默认检查通过。
  Evidence: 08 的父任务追加验证与本地检查输出；新增调度回归包含在 1437 项中。
  Affected acceptance: 08 最后一项、AC-12；禁止完成提交或推进 01。
  Resume when: 默认 `pnpm check` 在原 deadline 下完整通过；若需更改合规测试/工具而非调度，应先明确授权其新增范围。

- **2026-10-03 — Subtask 08 validation blocker resolved:** 用户批准的有界合规性能修复仅改变临时 fixture 的配置加载方式；真实检查、扫描范围、断言和 deadline 不变。默认 `pnpm check` 已完整通过（60 文件/1437 项），08 验收满足。01 仍需完成规范候选图和原 S-02 排序，未锁定替代候选，不把 08 完成解释为资格研究完成。

- **2026-10-03 — Subtask 01 resumed:** 08 已验证并持久化，候选无关的资源单位前提已满足；01 恢复规范图研究，而非要求其研究结果在开始前已经完成。已完成检查不重复运行。本轮先核实固定 HI 图形目录与部分规范单位，具体证据见 01；未完成的隐式引用和候选审批仍保留，不修改 S-02 或标记资格通过。

- **2026-10-04 — Subtask 01 bounded graph research continued:** 补齐可重放的模型/图像引用投影及模型音效样本绑定，覆盖全部候选并显式保留未完成状态；安全事实与覆盖限制见 [01 证据](./subtasks/01-candidate-qualification.md#完成证据)。未运行已通过的全量工程检查，未把部分图相加当作全包排序，也未批准或锁定替代候选。01 继续研究，02–07 不越过依赖门禁。

- **2026-10-04 — Runtime evidence collection continued after local probe fixes:** 静态缓存来源和敌我 consumer 均停在明确证据边界；已转为隔离副本中的有界运行时探针。修复原探针的按键通道、截止时间与历史断点解析错误后，DPMI 发现返回边界已实际验证，不把这些自动化缺陷误记为用户介入前提。LE 运行时映射、初始化前观察点和来源赋值仍未取得；01 继续进行中，不通过资格或推进依赖项。验证与隔离证据见 [01](./subtasks/01-candidate-qualification.md#完成证据)。

- **2026-10-04 — Subtask 01 blocked on source-linked runtime evidence:** 前置 08 已满足，但静态与隔离运行时研究尚不能绑定缓存表现来源及权威玩家相对敌我判定；纠正控制器后，目标中断 hook 仍未暴露实际受保护模式 LE 入口和 object 映射。停止重复这一失败策略，不把未知来源/边数记为 0。
  Evidence: [01 的静态边界与运行时尝试证据](./subtasks/01-candidate-qualification.md#完成证据)；attempt 04 控制验证通过，attempt 05 未建立应用映射，初始化前写入覆盖仍为 0/16 bytes，来源赋值和敌方基数未取得。没有以用户再按 F10 或重复普通战役试玩作为恢复条件。
  Affected acceptance: S-01、S-02、S-03、S-11；AC-01、AC-10；01 前两项。02–07 的依赖仍未满足。
  Resume when: 取得可核实的受保护模式 LE 应用入口/object 映射与初始化来源赋值，或同等强度的独立来源绑定证据；取得目标对象身份绑定的玩家相对 IFF/攻击决策及可推广的输入不变量。之后完成全规范图、原 S-02 排序及替代候选重新审阅/批准。仅控制器可响应或中断返回可验证，不足以恢复为资格通过。

- **2026-10-04 — Subtask 01 research resumed under the user-approved staged plan:** 用户明确批准先只验证实际程序入口/运行时地址映射，再追资源来源、敌我判定与完整排序。恢复研究不等于资格通过，不要求尚待取得的研究结果先成为开始研究的前提；08 依赖已完成。新路径将“运行中应用的映射验证”与“初始化前写入捕获”分开，可先在已初始化但暂停的应用中核实映射，不重复已失败的中断 hook，也不同时扩展到完整加载器/玩法追踪。映射取得后仍须独立证明初始化前观察时机与来源赋值。原 S-02、角色门槛、替代候选审批及 02–07 依赖不变；若本轮新路径不能取得证据，记录实际缺口而非猜测地址。

- **2026-10-04 — Staged mapping milestone verified:** 新的定时暂停方法已取得运行中应用的 CODE/DATA 来源关联；两处独立窗口逐字节核对通过，纠正了“所有 LE 对象共享同一地址偏移”的错误假设。权威事实与检查范围见 [executable](../../../original/formats/executable.md#bounded-runtime-codedata-object-correlation)。本轮只关闭已检查对象的地址关联缺口，未观察应用入口执行、初始化前写入或资源来源赋值，未解锁敌我/排序/候选审批门槛。01 继续研究，下一小步是基于每次运行验证的映射收集来源赋值证据，不把本轮地址硬编码到后续探针。

- **2026-10-04 — Assignment observation remains context-qualified:** 后续探针验证了部分可读目标及真实观察点注册，但跨模式报警未通过同一内存查找身份/完整字值核对。失败读取不能补零，注册地址覆盖也不能冒充来源赋值。边界与对早期输出的澄清见 [executable](../../../original/formats/executable.md#watch-registration-and-address-space-availability-boundary)。下一步在有界控制中跳过未验证上下文，并只在已重新核实的页面上恢复观察；不增加“必须显示某个控制寄存器 UI 字段”之类的新 P2 前提。

- **2026-10-04 — Bounded observation controller verified, activation evidence still missing:** 原生控制链已完成暂停观察、返回合格上下文、独立内存身份核对、完整字读取与重新注册的三个循环；实际检查范围见 [executable](../../../original/formats/executable.md#watch-registration-and-address-space-availability-boundary)。这个启动窗口内没有取得合格赋值或来源身份，不据此裁剪资源。停止重复相同启动捕获，下一步只定位/激活能创建相关表现资源的最小原版上下文；研究样本不等于批准生产候选，不扩展到胜负/AI 公式或完整任务试玩。

- **2026-10-04 — Subtask 01 blocked on a verified presentation activation input:** 已取得映射与可工作的有界观察控制链，但相同启动窗口没有激活待追踪资源；最短已有玩法证据是从原版练习入口进入首次驾驶舱/3D 画面，见 [B-002](../../../original/behavior/B-002-practice-mode.md)。它只作为表现激活参考，不重新选定练习任务或声称 SCCT 绑定。当前未验证相关菜单热键或可靠的按钮输入；内置键盘调度能力不是鼠标点击证明，一次不含原版游戏的输入实验发生模拟器原生退出，输入派发仍未确认。停止猜测键序或重复启动实验。
  Evidence: [01 激活依赖记录](./subtasks/01-candidate-qualification.md#完成证据)；既有映射/观察证明保持有效，实际创建和来源仍未取得。本轮询问一次隔离副本中的最小协作操作，但没有可用用户应答；不将其记为用户拒绝或批准新候选。
  Affected acceptance: S-01、S-02、S-03、S-11；AC-01、AC-10；01 前两项。
  Resume when: 能在隔离副本、映射和页面保护就绪后，执行已核实的练习入口按钮/热键，只推进到首次驾驶舱画面，或取得同等强度的其他表现创建上下文证据。用户只需这一激活动作，不需飞行、开火、通关或操作寄存器。随后仍须核实创建者/来源，完成敌我资格、规范图、原 S-02 排序与替代审批；这不是把研究样本批准为生产切片。

- **2026-10-04 — Research resumed on an observed startup interval change:** 用户现已可协作并批准开始隔离操作。实际采集在用户点击练习入口之前就取得一处合格字值变化并暂停，因此本次不再要求该点击；原版窗口已安全结束，原用户数据未变。事实与局限见 [executable](../../../original/formats/executable.md#qualified-startup-interval-change-before-manual-activation)。01 恢复研究，下一小步只绑定这个非零上下文的创建者/来源；没有将区间变化当作捕获写指令、来源 ID 或候选资格，也没有改变原 S-02 或开始依赖未满足的下游。

- **2026-10-04 — Completion-hook strategy bounded, alternate source proof selected:** 完成流程和真实 code hook 注册已有证据，但其有界窗口没有取得实际 wrapper/consumer/payload 实例；请求载体的数值也未证明是 archive ID，见上述 executable owner。停止重复这一回调捕获策略，改为先核实生产者的记录布局/转换，再仅在已核实的所有权、完整数据与可验证 locator（允许等价集合）条件下尝试图像/调色板来源比较。只比较 header、尺寸或运行时 handle 不算来源证明；若布局/转换未明，则保留准确缺口，不生成猜测的 Asset 或计数。

- **2026-10-04 — Full image equivalence verified; equivalent locators retained:** 完整运行时读取已通过身份、页面和稳定性保护，内容与已检查来源中的一个精确等价族匹配；该族已有代表位于所有候选的模型来源闭包。事实与历史来源局限见 [textures](../../../original/formats/textures.md#checked-runtime-image-equivalence-and-exact-source-aliases)，读取保护见 [executable](../../../original/formats/executable.md#qualified-full-span-image-capture)。按已批准的 [来源契约](./spec.md#清单来源与版本)，保留多个等价 locator，而不是任意选一个请求 ID、因多个目录 ID 计为多个图像，或把“必须抓到唯一原版请求 ID”增加为本次内容等价证明的门槛。实际请求/创建者仍未确认，不显示为历史来源已验证；不同语义角色/版本所有权也不能仅按 hash 自动合并。精确来源别名已纳入 [部分模型/图像投影](../../../original/formats/mesh.md#exact-source-image-alias-projection-partial)，通过重建/引用断言，尚未提供完整规范计数。下一步继续剩余表现资源、敌我资格、完整规范图及原 S-02 排序。01 仍为 in-progress，02–07 未解锁，替代候选尚未获批。

- **2026-10-04 — Subtask 01 qualification evidence complete; fallback selected, approval pending:** 有界掩码立即数搜索找到玩家飞行按键的敌/友目标模式，由此取得玩家相对敌我分类与输入不变量，并把用户第一关试玩经难度全局值绑定到 group 0 / slot 1；事实见 [executable](../../../original/formats/executable.md#player-target-modes-and-enemy-classification) 与 [scenario §4](../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)。S-02 检查 51 个战役槽位：45 个按敌机数量下界不合格，6 个通过结构门槛；按规范闭包的包含关系选出 group 0 / slot 1（SCEN 3019），论证见 [01](./subtasks/01-candidate-qualification.md#当前资格证据覆盖)。该回退候选改变任务与必需闭包；按 S-02 及“切片候选选择”第 5 步，须先修订 spec 选择记录、经另一模型审阅，再由用户重新批准。在此之前 01 保持 in-progress，02–07 不开始；绝对全包总数与固定资源来源映射归 02/03。

- **2026-10-04 — Subtask 01 completed:** spec [候选选择记录](./spec.md#候选选择记录)经另一模型审阅，没有新的契约决策；用户明确批准修订，spec 恢复 accepted。01 的三项验收均已满足，rubber-duck 的 5 个发现均已处理并复核，证据见 [01](./subtasks/01-candidate-qualification.md#完成证据)。下一项为依赖已满足的 02，按已批准候选实现唯一生产切片定义；绝对规范总数与来源映射分别由 02/03 完成。

- **2026-10-04 — Subtask 02 completed:** 唯一生产切片定义、S-03 角色/组/数量范围及唯一构造边界已实现并通过完整工程检查，证据见 [02](./subtasks/02-slice-content-contract.md#完成证据)。rubber-duck 审查后，核心音效改为至少 1 个，唯一性改用名义类型加类型检查器规则。02 验收第 4 项按依赖关系限定为契约层保证：几何字节变化导致 payload 身份失配、共享源网格视图隔离这两项字节层证明，由 04/05 实现、06 验证（AC-06/AC-09），因为 03–05 依赖 02，不能反过来作为 02 的前置。06 的工作范围已加入对应用例，目标级验收不降低。下一项为 03（来源映射边界）。

- **2026-10-04 — Final alignment failed; remediation added:** 07 的第一次核对由 rubber-duck 复查，发现以下未满足的验收，记录见 [07](./subtasks/07-final-alignment.md#完成证据)：
  - **AC-04：** 同时带有 `fixtureId` 与 `sourceFingerprint` 的具名对象仍能通过 `ContentOrigin` 的类型检查（运行时已拒绝）。
  - **AC-09：** 全包结果直接引用传入定义的组数组；`assetSourceStates` 直接引用映射的 U 项数组。调用者使用可变的克隆时，修改会影响先前的结果。
  - **AC-13：** spec 的候选选择记录复述了 SCEN 条目与 M2ID 槽位→角色等原版事实，而不是只链接权威记录。

  此前提前写入的完成声明（本文件与 STATUS）已撤回。按补救流程新增子任务：
  - 09 修复上述代码缺口；
  - 10 修订 spec 的事实归属。用户已于 2026-10-04 选择修订 spec：保留 group 0 / slot 1 的选择，原版事实改为链接；修订稿须经另一模型审阅，并由用户重新批准。

  候选、契约与 S/AC 均不改变。07 回到 pending，依赖全部其他子任务，补救完成后重跑。

## 审批

用户于 2026-10-03 明确批准关联 spec 与本 goal，批准范围为上述 7 个子任务的拆分、依赖关系和验收覆盖。批准不代表实现完成；执行仍须逐项取得证据，候选资格未满足时相关子任务保持 blocked。

同日用户明确批准保留 S-02、模型几何归属及新增前置项 08 的拆分方案；当前共 8 个子任务。批准本身不构成实现证据，也不批准替代候选。

2026-10-04 用户明确批准 spec 修订中的回退候选 group 0 / slot 1；子任务拆分、依赖与验收覆盖不变。

2026-10-04 最终对齐未通过后，按 execute-goal 的补救流程新增子任务 09、10，并让 07 依赖它们；契约与验收要求不变。同日用户明确批准 spec 的事实归属修订：原版事实改为链接，候选与契约不变。
