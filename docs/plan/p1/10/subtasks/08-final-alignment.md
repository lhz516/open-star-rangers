---
type: plan
status: active
phase: P1
task: "10"
subtask: "08"
updated: 2026-10-03
---

# 08 — 最终覆盖与边界对齐（仅验证）

**契约来源：** [Spec](../spec.md) 的 S-01 至 S-06；AC-01 至 AC-12。
**依赖：** 01, 02, 03, 04, 05, 06, 07。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项核验Spec全部S/AC与01–07真实证据，确认没有以bootstrap/Node/旧手工报告代替新runner必需浏览器测量。
- 检查工程与完整E2E在最终树通过，开发/生产/开发headed各有实际结果；类型/lint/Vitest边界、frozen锁、生产产物隔离保持。
- 核对关键阈值与输出：移动≥1s、像素≥9/±3、稳定≥3样本/≥300ms、各3轮/9输入/3生命周期/rAF≤1/GPU无增长/菜单净0、布局≤1px、replay真实match/mismatch、原生hidden与WebGL降级。
- 核对AC-10证据适用性、错误非零、资源所有权清理、文档元数据/链接与审批；不tick任何阶段退出。发现缺口添加新ID补救项在本行前并成为依赖，本项不交付新功能代码。

## 不包含

不写feature/helper/config代码、不修行为、不降低阈值、不扩大浏览器/设备/原版范围。无云/CI/push/发布授权，不重写上游历史证据。

## 关键文件与契约

只读[Spec](../spec.md)、[Goal](../goal.md)与01–07的交付/完成证据；本项只记录验收结果并维护唯一tracker，相关文档若有缺口归补救项。

## 验收标准

- [x] S-01至S-06、AC-01至AC-12全部有适用且可追溯证据，无未完成必需browser判据或待解决错误。
- [x] pnpm check、pnpm test:e2e与frozen锁证据对应最终树，源/产物中无Playwright测试入口或原版内容、无生产行为/纯模块边界变化。
- [x] 所有owned资源/临时源码编辑/fixtures收尾，工程文档及链接准确，历史证据适用性与新测量区别明确。
- [x] 01–07均完成，最终对齐只验证，无新增feature，无P1/P5退出/跨引擎保真声明。

## 验证方法

复核07最终命令与产物身份；若后续变更使其失效，重跑pnpm check及pnpm test:e2e，不能套用旧成功。浏览器证据核验/必要补测按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，[简化](../../../../../.agents/skills/simplify/SKILL.md)只审查本项验证文档，不重构生产代码。审阅完整diff、目标文件、tracker图与S/AC覆盖，无原版/实机新实验。

## 完成证据

- 2026-10-03：最终实现HEAD`8839ab1`，随后`f3a04ba`仅文档；任务获批基线`ec9e666`。01–07各有已验证本地提交，所有验收框已满足，未把accepted或bootstrap当整项完成。本项只核验文档/覆盖，不交付feature/helper/config代码。

| Spec项 | 最终证据与精确判据 |
|---|---|
| S-01、AC-01 | [01](./01-local-e2e-runner.md#完成证据)、[07](./07-evidence-docs-alignment.md#完成证据)：独立runner/4类型程序/lint、3项目实际18通过、frozen与未升级工具链；Vitest仍src/tools .test.ts |
| S-02、AC-02 | [03](./03-interaction-render-smoke.md#完成证据)：两构建原生menu/Tab/Enter/Space/按钮、heading/region/help/focus及菜单/导入隔离，导入明确未实现 |
| AC-03 | [02](./02-readonly-browser-probes.md#完成证据)、[03](./03-interaction-render-smoke.md#完成证据)：左右持有≥1100ms，DOM位移与真实mover图像中心同向；mover/marker≥9、颜色±3；N/X/X为唯一同run递增身份的accepted/accepted/rejected，真实投影/像素/实体一致 |
| AC-04 | [03](./03-interaction-render-smoke.md#完成证据)、[06](./06-native-lifecycle-fallback.md#完成证据)：P/按钮paused tick/draws稳定；恢复/失焦/换run从首新投影起4样本跨≥360ms、tick递增而x不变；真正trusted repeat不恢复、fresh数值位移>0.1 |
| S-03、AC-05 | [02](./02-readonly-browser-probes.md#完成证据)、[04](./04-joint-resource-regression.md#完成证据)：开发/生产各3轮移动/N联合观测，9输入/3Session/6render精确组成、rAF≤1、同owner身份无增长、两kind预热GPU2/0/1相等、菜单净0；6旧canvas断开且支持扩展实际lost，旧组先撤销 |
| AC-06 | [03](./03-interaction-render-smoke.md#完成证据)：同canvas/run 1280×800→480×900，真实容器/设备参数代入现有布局；CSS四边≤1px、buffer完全一致且4:3取整≤1px，实体可见、一次N仅一Core结果 |
| S-04、AC-07 | [05](./05-browser-replay.md#完成证据)：固定4输入seed0/50Hz/interval1，浏览器events/checkpoints逐项等于同版本Node；生产compare真实match与合法hash tick2/checkpoint mismatch，生产校验拒绝非法format/version |
| AC-08 | [06](./06-native-lifecycle-fallback.md#完成证据)：自管headed/CDP双tab实际hidden→visible，hidden自动暂停、回前台仍暂停，显式可信P后旧repeat稳定、新按下移动；缺实际hidden的独立负向真实退出1 |
| S-05、AC-09 | [02](./02-readonly-browser-probes.md#完成证据)、[06](./06-native-lifecycle-fallback.md#完成证据)、[07](./07-evidence-docs-alignment.md#完成证据)：默认错误采集与实测正常场景；独立WebGL-off浏览器具体unavailable、CoreN接受/controls/返回再进，白名单只限具体创建诊断 |
| S-06、AC-10 | [07](./07-evidence-docs-alignment.md#完成证据)：明确版本/对应路径/相关差异/新自动覆盖/历史适用性；最新P1-09 window/HMR与不变DPR/故障边界复用，没有必需失效证据或重复自动改源码 |
| AC-11 | [01](./01-local-e2e-runner.md#完成证据)、[06](./06-native-lifecycle-fallback.md#完成证据)、[07](./07-evidence-docs-alignment.md#完成证据)：真实失败非零/定位、所有权隔离、实际产物58sources无测试入口，无production state/内部step/frame/存储/原版读取 |
| AC-12 | [07](./07-evidence-docs-alignment.md#完成证据)及本项：完整check/18E2E/frozen、清理、工程/结构文档与links准确；阶段摘要只调整下一步，不声称P1/P5退出 |

- **最终工程证据：** 07完整命令运行于当前最终实现树，随后无实现/config/依赖变化，故有效；`pnpm check`47文件/1192通过、`pnpm test:e2e`18/18（development9/production8/headed1）、frozen通过。JS与map的精确SHA256/环境/origin只在[07](./07-evidence-docs-alignment.md#完成证据)维护，不重复另一份产物清单。纯模块/Node仍无DOM，现有测试未删/skip/放宽，唯一既有bundle警告保留。
- **完整范围与清理：** 相对获批基线，src/Vite/原版记录/纯模块与Node tsconfig零差异；只有开发依赖3包、独立测试与必要接入/文档。未把generated report、二进制或local/内容纳入commit。当前普通/自管browser/context/targets/profile已关闭，自有端口无监听，临时负向fixture输出删除；预先存在的VS Code工具Chrome未操作，没有临时HMR源码编辑。
- **文档影响：** 工程/结构说明与当前runner一致；本项更新STATUS下一步为P1-12已批准Goal及后续P1-14评审，仍不声明本地合规/阶段退出完成。P1-12规划目录无变化，router仍execute-goal/01。没有新原版事实或冻结决定，不需要ADR或代码simplify。
- **最终审阅与文档检查：** rubber-duck逐项核对S/AC、阈值、3项目发现、47测试文件、产物hash/58sources、根锁3包及零生产diff，无阻塞/非阻塞问题。其进程归属无法仅靠事后快照独立证明的提示，已用本轮`ps`的Chrome启动时间00:03与父进程VS Code、请求起点01:55核对：该既存实例不属于本轮，不关闭。14篇文档/355本地链接与锚点、元数据和diff-check通过；tracker图/全部覆盖有效，标全completed后router应为done，本项提交后再次确认。
