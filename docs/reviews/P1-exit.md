---
type: review
status: draft
phase: P1
updated: 2026-10-03
related: [ADR-0008, ADR-0012, ADR-0014, ADR-0015]
---

# P1 本地退出评审与交接

> 待项目负责人明确确认本记录的实际结论；尚未 accepted/冻结。本次 Spec/Goal 批准、推荐答案授权和执行均不构成结论确认或阶段切换授权。

## 1. 结论

**建议结论：通过。** 当前候选已取得全部七项 P1 本地退出条件及主要交付的有效证据：工程与独立 Python、完整三项目浏览器回归、聚合原版隔离/许可与人工来源/全文审阅通过；历史证据按相关实现差异复用。未发现需新增代码修复项的既定 P1 缺陷。后续阶段遗留不构成“有条件通过”，也不豁免其各自验收。

本记录只评审[总计划 §12](../plan/master-plan.md#12-开发阶段与验收条件)的 P1；CI/部署依据[ADR-0012](../decisions/ADR-0012-local-p1-defer-ci-deployment.md)归 P5。本地合成通过不是原版玩法、资源导入、发布设备/系统快捷键、法律/名称、秘密扫描或严格 clean-room/首次公开认证。

### 候选与证据身份

- 日期2026-10-03，执行起点 `831d231`，起点工作树/索引干净；到本记录的变化仅本Goal验证/评审/直接相关文档，无生产源码、测试、配置或依赖变化。[06最终核验](../plan/p1/14/subtasks/06-final-alignment.md#完成证据)已取得新评审文档后的四范围扫描通过证据；本Goal文档按无代码例外统一准备本地提交，实际hash在交付报告给出，不授权结论确认。
- macOS darwin/arm64；Node22.22.0/pnpm12.8.1/Python3.12.3/TS6.0.3/Vite8.3.1/Vitest5.0.3/Playwright1.63.0/Chrome154.0.8037.95。普通浏览器1280×800/DPR1，窄布局480×900；开发4173/生产4174，均127.0.0.1固定origin、隔离context。headed/native和WebGL-off使用独立自有browser，非个人profile。
- [01候选/前提/历史适用性](../plan/p1/14/subtasks/01-candidate-evidence-map.md#完成证据)：11前置Spec/Goal批准、85行完成及实际证据核对，非以done或accepted替代。
- [02工程/Python/Node replay](../plan/p1/14/subtasks/02-engineering-replay-checks.md#完成证据)：`pnpm check`四类型程序/lint/56文件1272测试/build、Python3测试，均exit0。
- [03完整浏览器](../plan/p1/14/subtasks/03-browser-exit-checks.md#完成证据)：fresh build后21/21（development10、production10、headed1），零skip/flaky/意外错误，首次通过无重跑；不是旧18+3相加。
- [04当前聚合/全文人工审阅](../plan/p1/14/subtasks/04-compliance-artifact-review.md#完成证据)：七范围completed、零findings、passed=true/exit0；实际产物/240输入/7shipped/9许可文本及人工作用边界核对。

## 2. 退出条件逐项核对

判据唯一来源为总计划P1行，责任映射见[阶段覆盖](../plan/p1/tasks.md#6-阶段验收覆盖)。以下不创建新的判据或subtask tracker。

| 退出条件 | 责任／证据 | 判定与理由 |
|---|---|---|
| 合成场景在本地浏览器运行 | P1-07/08/09、P1-10；[03](../plan/p1/14/subtasks/03-browser-exit-checks.md#完成证据) | 通过。两构建真实合成像素与位移、4:3布局/缩放通过，不以Canvas/HTTP存在作证 |
| React指令经Core反馈 | P1-02/06；[02](../plan/p1/14/subtasks/02-engineering-replay-checks.md#完成证据)、[03](../plan/p1/14/subtasks/03-browser-exit-checks.md#完成证据) | 通过。按钮/键盘经现有命令路径，接受/接受/拒绝与唯一身份、帧末投影/实体/marker像素一致，无乐观成功 |
| 重启/暂停无重复循环 | P1-04至09、P1-10；[01历史映射](../plan/p1/14/subtasks/01-candidate-evidence-map.md#历史适用性仅影响分析)、[03](../plan/p1/14/subtasks/03-browser-exit-checks.md#完成证据) | 通过。两项目各三往返及同owner换run，rAF≤1、9输入/3Session/6render、GPU2/0/1不增长、菜单净0、旧context释放；native真实hidden自动暂停、visible仍暂停、显式继续；有效新ownerHMR/首帧证据复用 |
| Core可无浏览器测试 | P1-01/02；[02](../plan/p1/14/subtasks/02-engineering-replay-checks.md#完成证据) | 通过。纯程序无DOM/Node，确定性/边界正负诊断及真实Core Node测试当前运行通过 |
| 同输入replay事件流与状态hash一致 | P1-03至06、P1-10；[02](../plan/p1/14/subtasks/02-engineering-replay-checks.md#完成证据)、[03](../plan/p1/14/subtasks/03-browser-exit-checks.md#完成证据) | 通过。Node正负/JSON及固定hash、浏览器同4tick记录精确events/checkpoints、真实match与tick2 checkpoint mismatch、非法format/version拒绝；仅此版本/样本，不推广跨引擎普遍一致 |
| 本地工程检查通过 | P1-01及各实现；[02](../plan/p1/14/subtasks/02-engineering-replay-checks.md#完成证据) | 通过。四TypeScript程序、ESLint、Vitest、production build及独立Python全部exit0；保留既有chunk警告 |
| 仓库/构建原版hash与依赖许可通过 | P1-12；[04](../plan/p1/14/subtasks/04-compliance-artifact-review.md#完成证据)、[06最终范围](../plan/p1/14/subtasks/06-final-alignment.md#完成证据) | 通过。当前聚合七范围全完成、零finding、实际分发/全文人工核对有效；新增评审文档后的最终四范围由06记录，不冒称扫描Git历史、片段或法律认证 |

### 全部主要交付责任覆盖

| 阶段索引交付 | 证据及边界 |
|---|---|
| 工程骨架/目录/确定性lint/合成基线 | 01核验P1-01前提、02当前边界/工程/Python；无扩大纯模块环境 |
| 独立Core及step返回事件 | P1-02最终证据与02当前Node；Core唯一权威，不含宿主副作用 |
| 快照/hash/固定输入replay | P1-03最终证据及02/03；保留synthetic版本/单位，不解释为正式玩家存档 |
| Runtime固定步长/队列/Event Bus及控制 | P1-04/05最终证据及02当前时钟/通知/取消/故障，03暂停/换run/native；控制不依赖Core继续step |
| UI projection/Zustand/React | P1-06最终证据、02反馈/原子边界及03真实反馈；只读reader、关键结果及时发布、无第二世界 |
| Three按Render State插值 | P1-07最终证据及03画面/布局/GPU；01核对DPR/restore/压力有效历史差异 |
| 生命周期/StrictMode/HMR | P1-05至09证据及03联合资源；最新P1-09新ownerHMR/原生窗口焦点复用，不拿旧hook注释刷新代替 |
| 菜单/导入原型诚实 | P1-08及03两构建；未实现导入明确拒绝成功表述，稀有锁存/回滚归02 Node及01有效原证据 |
| 最小输入与界面/失焦隔离 | P1-09及03；trusted键、元素失焦/hidden/repeat/fresh规则，IME/modifiers/部分回滚由02 Node，不称系统快捷键验收 |
| 工程与本地构建 | 02/03/04实际已有命令，各fresh build身份相同；不需要CI |
| 本地原版隔离/许可/声明 | 04完整范围/全文/来源、03production三文件可读；能力限制不可用passed豁免 |
| 退出判定/交接 | 本记录及[05](../plan/p1/14/subtasks/05-exit-review-handoff.md#完成证据)、06最终核对；批准/执行状态/退出结论分别维护 |

### 问题、恢复与能力边界

- 无当前必需失败、缺失观测、未闭合修复或需新增07占位；若最终输入/源码改变，06必须使受影响检查及历史适用性重新成立，不套用旧成功。当前首次工程/Python/E2E/聚合均通过，无原因不明的重跑抵消。
- Vite既有500kB chunk警告保留，包体优化归P5；非P1失败。P1-07已披露的“上下文restore后dispose”Chrome/Three警告及DPR仿真范围按01原证据保留，不伪称本轮消除或真实多显示器通过。
- 本机联合资源扩展均可用且旧context确实lost；没有把缺可选扩展当通过。原生窗口恢复证据仅覆盖其原观察，窗口按住清轴/稀有失败不冒称本轮浏览器测过。
- hash仅识别manifest已登记的完整文件；未登记/片段/变换/解码/截图仍须完整来源与产物审阅。当前人工全文审阅由不变源/文本/产物身份承接P1-12，不是工具passed替代。名称/许可/秘密/首次公开另行确认。
- 直接说明滞后已在05纠正（Runtime/Session已接页面、Playwright/E2E已存在、评审确认时冻结）。原版记录/冻结ADR及上游完成证据不改写；无新原版事实。

## 3. 遗留事项

以下为2026-10-03对[unknowns权威登记表](../original/unknowns.md)的责任索引，不复制研究结论、不提升置信度或新关闭事项。30条中25条非“已确认/不再需要”；已确认（含限定范围状态）U-002/006/007/012/024不重复列入。各项均不阻塞合成P1，但必须在相应原版资源/正式规则工作纳入前按原证据/研究计划解决，不能以本评审豁免。

| ID | 权威状态 | 负责阶段 | 对交接的影响 |
|---|---|---|---|
| U-001 | 进行中 | P0（结构）/ P2（切片所需类型） | 资源契约按需研究，不由合成fixture填未知 |
| U-003 | 高概率 | P0 | 内容范围及后续验收依据仍待原记录核实 |
| U-004 | 部分确认 | P2（音效）/ P4（音乐） | 不把已有研究等同浏览器媒体管线 |
| U-005 | 未确认 | P4之后 | 可选兼容研究不影响P1合成快照 |
| U-008 | 未确认 | P0 / P3 | 正式运动契约不得套用合成数值 |
| U-009 | 部分确认 | P0 / P3 | 正式确定性/数值设计须按证据 |
| U-010 | 未确认 | P0 | 后续流程与媒体边界待研究 |
| U-011 | 部分确认 | P0 | 完整键位以原版权威记录为准 |
| U-013 | 未确认 | P0 | 正式保存时机不得从演示推断 |
| U-014 | 部分确认 | P0 / P4 | 正式存档/结算契约后续设计 |
| U-015 | 部分确认 | P0 | 基准运行剩余研究不因P1关闭 |
| U-016 | 高概率为OPL3 | P0 | 参考媒体环境仍需核实 |
| U-017 | 未确认 | P0 | 基准版本范围依原记录 |
| U-018 | 未确认 | P2 | 资源转换纳入前核实 |
| U-019 | 未确认 | P2 | 资源转换纳入前核实 |
| U-020 | 未确认 | P2 | 格式字段不猜测 |
| U-021 | 进行中 | P0 | 基准环境/目标设备仍需校准 |
| U-022 | 部分确认 | P2（切片任务的剩余字段） | 切片任务契约的直接研究入口 |
| U-023 | 高概率 | P2 | 切片数据使用前核实 |
| U-025 | 部分确认 | P3 | 正式战略规则不能用近似成功替代 |
| U-026 | 部分确认 | P3 | 正式Warp规则依原证据 |
| U-027 | 高概率（部分） | P2 | 模型转换/用途按证据设计 |
| U-028 | 部分确认 | P3（光照）/ P2（槽位） | 表现与内容责任分开 |
| U-029 | 未确认 | P2 | 切片驾驶舱/地图资源入口 |
| U-030 | 未确认 | P2 | 切片字体/HUD资源入口 |

P0尚需用户行为/键位/存档试玩、cycles与目标设备收尾；[P0可行性通过](./P0-feasibility.md)不是P0整阶段退出。完整键位、真实设备、多引擎、存储/离线/升级、性能/长时、CI/部署与公开确认不属于本Goal已取得证据。

## 4. 对后续阶段的影响

### 可复用设施与必须替换的合成项

| 设施／落点 | 可复用原则 | 必须另按正式契约设计的部分 |
|---|---|---|
| Core确定性/快照/replay及测试 | 纯step返回事件、显式输入/seed、状态/事件精确验证 | mover/marker、单位、命令/事件、synthetic snapshot/replay版本不是正式玩法/存档；不直接改名伪装通用 |
| app/runtime、app/session | 队列/帧后事件、控制分流、唯一调度/身份隔离、停止/回滚/释放 | 真实第二场景出现后才设计复用，不提前泛型化 |
| ui/game、app/composition | 只读projection/store、Core确认反馈、运行/owner边界、清理锁存 | 开发面板/菜单/五键/采样值不是原版界面、完整输入或飞行HUD |
| render、platform/input/browser | 消费Render State、插值/布局/DPR/上下文生命周期与平台输入隔离 | 合成几何/颜色/相机须替换；Classic驾驶舱/HUD按投影直绘，不引入第二世界/循环 |
| original-data | 现有纯解析器/代码合成样本可复用，事实链接original | 无浏览器导入、规范内容、Worker/缓存管线；`content/`、`workers/`仍计划落点 |
| e2e、tools/compliance、工程边界测试 | 当前独立命令、真实失败、隔离/清理、报告/完整声明设施 | 后续源码/资产/依赖改变须重验；不把本机结果等同发布矩阵/法律保证 |

架构与当前目录唯一维护于[结构指南](../engineering/source-structure.md)，输入规则见[键位指南](../engineering/keyboard-input.md)。保持Core权威、Runtime执行模拟、Session拥有调度，UI/Render只读；本评审不变更冻结决定，不需ADR。

- **P0收尾：** 继续权威未知项研究与用户实机证据，不重新盘点/复制原版内容。
- **[P2规划入口](../plan/p2/tasks.md)：** 只实现玩法切片所需本地导入/解析/转换、规范内容与缓存；按上述U项优先核实切片字段/资源。真实截图对照/安全坏输入/无上传必须实际取得，不能用P1合成替代。
- **[P3规划入口](../plan/p3/tasks.md)：** 可与P2重叠，但正式运动/目标/武器/地图/Warp/基地/结果闭环及原版对照不可豁免；临时资源必须明确，退出仍需原版内容。
- **P4及以后：** 按总计划承接完整内容、媒体和存档；上表未知项owner保持，不发明任务ID。
- **[P5规划入口](../plan/p5/tasks.md)：** 承接CI/门禁/检查保护及真实SWA部署；第11节真实设备/浏览器/性能/输入/恢复/隐私/发布门槛、许可名称和首次公开确认仍未执行，需另行授权外部操作。
- **负责人关卡：** 先明确确认本记录实际结论，再据结论更新STATUS的P1摘要/评审列并冻结记录；切换当前阶段是另一个明确授权。当前仍P1进行中，仅STATUS下一步指向本draft；本Goal不调用下游规划skill、不push/部署。
