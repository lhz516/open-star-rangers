---
type: plan
status: active
phase: P1
task: "14"
subtask: "01"
updated: 2026-10-03
---

# 01 — 候选基线与历史证据适用性

**契约来源：** [Spec](../spec.md) 的 S-01、S-03；AC-01、AC-02、AC-07、AC-10、AC-14。
**依赖：** 无。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核验 [Goal 跨任务前提](../goal.md#跨任务与环境前提)的11项 Spec/Goal 批准、全部 tracker 行和实际完成证据；记录执行起点 revision、工作树/索引差异、相关环境/配置及用户自有改动。
- 对照总计划七项 P1 退出条件与阶段索引的全部主要交付，建立条件/责任/现有证据/本轮验证落点映射，不以 done 或任务数量代替通过。
- 从 P1-10 的适用性表追溯最新 HMR、原生窗口焦点、Session 首帧/旧回调、DPR/上下文/压力、菜单锁存、输入/取消/回滚证据，核对来源版本至候选的相关实现/配置差异，明确直接复用或需要02/03/04补验。
- 特别识别 P1-12 的 App 静态文字、构建插件、依赖/lock及项目路由变化，不能声称生产树全部零差异。记录证据冲突、影响和原责任/恢复条件；发现已定位的P1契约内缺陷按 [Goal 聚焦修复规则](../goal.md#按需聚焦修复)新增独立项，本项不写补丁或预写未来重跑结果。

## 不包含

- 不运行完整工程/E2E/合规链（分别归02/03/04），不创建阶段评审（归05）。
- 不改上游 tracker/历史证据、游戏/观测代码、依赖或原版记录，不审批阶段、不联网研究或执行外部操作。

## 关键文件与契约

- 只读[总计划 §12](../../../master-plan.md#12-开发阶段与验收条件)、[阶段覆盖](../../tasks.md#6-阶段验收覆盖)、[工作流](../../../../engineering/agent-workflow.md)和前置 Goal/证据；本项只写本文件完成证据及本任务 tracker。
- [P1-10 适用性](../../10/subtasks/07-evidence-docs-alignment.md#新增自动覆盖历史证据适用性)、[P1-09 实测](../../09/subtasks/05-browser-input-evidence.md#完成证据)、[P1-12 实际审阅](../../12/subtasks/08-local-evidence-docs.md#完成证据)为入口，最终对应当前[App](../../../../../src/app/App.tsx)、[装配](../../../../../src/app/composition/)、[Session](../../../../../src/app/session/)、[渲染](../../../../../src/render/)、[输入](../../../../../src/platform/input/)、[Vite](../../../../../vite.config.ts)及[lock](../../../../../pnpm-lock.yaml)。
- 适用性记录必须有证据链接/版本、相关路径差异、判断及后续验证落点，不复制旧观测值或创造另一份实时退出清单。

## 验收标准

- [x] AC-01：全部前置批准、tracker与证据已核验，候选及环境可追溯；不一致有明确原因，不能作为已满足前提继续。
- [x] AC-02：七条件及全部主要交付都有责任/证据和本轮落点；此处映射不代替05正式判定。
- [x] AC-07：每类历史证据有来源版本、相关差异及适用理由；需补验的项完整交给02/03/04，补验结果不在本项虚构。
- [x] AC-10/14：冲突/缺口的影响、原责任与恢复明确，已定位缺陷交独立修复项，不因依赖发现项的blocked状态形成死锁；本项无生产修改/新事实/用户数据访问，链接/元数据/diff准确。

## 验证方法

- 只读 `node tools/task-state.ts p1/NN --json`、实际批准/tracker/证据、Git revision/status/相关路径 diff；路由只是结构旁证，必须核对实际文本。
- 比较 P1-10 到 P1-12 再到候选的实改路径及行为影响，优先采用最新 P1-09 HMR/窗口证据，不机械重用旧 hook HMR。
- 本项不操作浏览器；需要补验时在03按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)执行。仅验证/文档，无实现代码，故不需代码 simplify；检查本项文档、元数据、相对链接和变更范围。

## 完成证据

### 候选、前置与结构

- 2026-10-03：执行候选 `831d231`，起点 worktree/index 干净，无用户改动；相对 `e5383d8` 只有九个已批准规划文件，生产输入未变。本项仅修改本文件及 Goal tracker，不提前运行02–04。
- Node 22.22.0、pnpm 12.8.1、Python 3.12.3、Git 2.40.0、Playwright 1.63.0；macOS arm64，已安装 Chrome 154.0.8037.95。4173/4174 未被监听；配置为独立 context、1280×800/DPR1、single worker/retries0/strict ports、不复用服务器。浏览器实际能力由03执行证明，不由版本或空闲端口代替。
- 逐文本核对 Goal 前提表链接的11份 Spec/Goal 审批、全部85行 tracker 和每行非空完成证据；各自最终对齐及后增项保持 completed：01/02/03/04/05/06/07/08/09/10/12 分别为6/5/7/7/8/10/10/8/7/8/9行。11个路由均 done，仅作结构旁证。P1-06 AC-08 的历史更正明确基于用户采用推荐答案授权、未另获逐字确认，沿当前 accepted/无未决契约及互斥故障断言评审；没有伪造新的批准或改写历史。
- 本 Goal 六文件/六行一一对应、依赖与文件完全一致、图无环；06最后且依赖其他全部行，S-01–07/AC-01–14覆盖完整。文档预检10篇/291本地链接及锚点、日期/元数据通过。

### 条件与全部交付映射

| 总计划条件／阶段交付责任 | 现有证据入口与本轮落点 |
|---|---|
| 合成场景浏览器运行；Render State 插值、布局及真实画面 | P1-07最终证据、P1-10/03–04；03当前开发/生产像素、布局、资源 |
| React 经 Core 反馈；projection/Zustand桥接 | P1-02/06最终证据、P1-10/03；02当前Node反馈，03接受/拒绝及投影/像素 |
| 重启/暂停无重复循环；Runtime固定步长/队列/Event Bus/控制、Session及StrictMode/HMR | P1-04/05/09最终证据、P1-10/04/06及下表复用；02当前Node边界，03完整联合资源/native |
| Core无浏览器运行；工程目录/确定性lint/合成基线 | P1-01/02最终证据；02四类型程序、lint和Node测试 |
| 同输入事件流/状态hash一致 | P1-03/04/05/06最终证据、P1-10/05；02 Node正/负，03同版本浏览器参考与比较器 |
| 本地工程检查和构建 | P1-01最终证据；02 `pnpm check`与独立Python，03/04各自fresh build |
| 仓库/构建原版hash与许可 | P1-12/08/09；04七范围聚合/全文人工审阅，06最终四范围扫描 |
| 菜单/导入占位诚实、输入活动界面/失焦隔离 | P1-08/09最终证据；02现有失败/锁存/输入断言，03完整菜单/键盘/native/WebGL-off |
| 退出判定及后续交接 | 05正式评审、06最终覆盖；本表不预判退出 |

### 历史适用性（仅影响分析）

以 [P1-10适用性表](../../10/subtasks/07-evidence-docs-alignment.md#新增自动覆盖历史证据适用性)为入口，实际逐路径 Git diff 核对：

| 类别／来源版本 | 相关差异与判断 | 本轮落点 |
|---|---|---|
| [Session首帧/旧回调](../../05/subtasks/07-browser-lifecycle-evidence.md#完成证据)，最终 `8fb36e8` | 该版本到候选 Runtime、synthetic-session、browser-host 零差异；只新增独立RollbackError，不影响正常首帧/旧回调 | 复用真实rAF/监听证据；02当前故障/录制，03当前native |
| [DPR/restore/压力](../../07/subtasks/08-final-browser-alignment.md#完成证据)，最终 `4908e3d` | render差异仅renderer及browser工厂将回滚失败改用RollbackError，正常布局/DPR/相机/外观/绘制不变；测试同步增强 | 复用DPR仿真、restore、20Restart/50marker；03重验当前布局/GPU；保留restore后dispose的已披露Chrome/Three警告，不称已消除 |
| [菜单稀有锁存](../../08/subtasks/06-final-browser-alignment.md#完成证据)，最终 `dc20039` | 后续P1-09输入接线不改变flow/lifecycle锁存；P1-12 App仅静态权利文字 | 稀有故障仍按Node/审阅层次复用，02运行当前断言；03重验正常/降级/往返 |
| [最新窗口焦点/新owner HMR](../../09/subtasks/05-browser-input-evidence.md#完成证据)，源码 `1261ab2` | 到候选composition/input/ui/render零差异，App仅增加静态rights段，DemoScreen key/effect及lifecycle未变；Vite增加build-only合规插件，React开发插件未变；工具版本未升级 | 复用visible下真实窗口blur/focus与临时key新owner Fast Refresh；不把旧hook注释刷新当新owner。03当前DOM布局/输入覆盖静态段影响，无必需失效HMR项 |
| 细粒度取消/rollback/故障/IME/modifiers/旧callback | P1-05–09最终证据；相关生产路径按上述diff核对，P1-12不修改这些断言或实现 | 02当前完整测试，不把Node故障标browser通过 |
| [P1-10完整runner](../../10/subtasks/07-evidence-docs-alignment.md#完成证据)，`8839ab1` | P1-12新增rights/production-assets测试及development排除assets；普通runner阈值/重试/资源实现未改，build插件/解析依赖/lock peer键有真实变化 | 旧18与后续3不能相加；03实际完整当前21发现/执行、当前生产身份 |
| [许可全文/完整来源产物](../../12/subtasks/08-local-evidence-docs.md#完成证据)，`250019a` / 最终 `e5383d8` | 到候选src/tools/e2e/config/package/lock零差异，只有规划文档 | 04 fresh聚合与当前identity逐项核对后才复用不变全文/来源；06新增文档范围扫描 |

- 本项未发现已定位的P1生产缺陷，不创建07占位。发现的直接说明滞后（阶段索引仍称无Playwright/E2E，工程早期Runtime/Session段落仍称未接页面）交05按真实现状更正；不影响当前代码契约，不重开原Goal。
- 文档影响：本项仅归档候选与影响映射，接口/操作无变；工程/导航的上述直接更正由05负责，STATUS确认前只改下一步，原版与ADR不改。本项无实现代码，故不需simplify。
- rubber-duck独立核对完整本项diff、85行前提、版本/diff及历史适用性，无阻塞或非阻塞问题；tracker的in-progress是审查期间状态，审查结束后改completed。文档按获批无代码例外先保存，最终06统一本地文档提交。
