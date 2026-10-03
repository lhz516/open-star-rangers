---
type: plan
status: active
phase: P1
task: "10"
subtask: "07"
updated: 2026-10-03
---

# 07 — 证据适用性、完整 runner 与使用文档

**契约来源：** [Spec](../spec.md) 的 S-05、S-06；AC-01、AC-09、AC-10、AC-11、AC-12。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 运行最终pnpm check与完整pnpm test:e2e（当前build＋开发/生产普通与开发headed），记录真实版本/origin/项目/结果与构建身份。补验runner断言、构建/启动、缺executable/能力失败路径非零；已有子任务负向证据可复用，不只报发现数量。
- 建立“新增自动覆盖／直接复用／失效需补测”映射，对P1-05–09的HMR、窗口、DPR、稀有故障/取消/回滚证据记录版本、对应路径及相对证据版本的相关差异。没变直接复用，必需失效项才按browser-testing有界补测；临时编辑必须还原，不在常规runner自动编辑源码。
- 更新工程约定的命令/四个类型程序/本地browser准备与CDP路线，结构指南说明E2E、Node回归和纯模块边界。说明需要已有兼容浏览器、不自动下载、单worker/零retry、输出目录、端口/profile所有权、故障处理与覆盖边界。
- 审阅完整diff及当前网站产物，确保Playwright/test入口未进入生产、无原版/用户数据读取、无新增生产控制后门。核对成功/失败后owned进程/profile/探针与临时fixtures收尾，ignored合成报告不进源码/网站。
- 按[简化](../../../../../.agents/skills/simplify/SKILL.md)仅处理本项文档和必要测试接入；发现功能缺口不能用历史证据/弱断言消除。

## 不包含

不重复仍有效的手工HMR/完整DPR/20或50压力矩阵、不生成另一份独立review报告；不代替P1-12合规或P1-14退出，不提交/上传原版或报告。

## 关键文件与契约

- 现有[工程约定](../../../../engineering/README.md)、[结构指南](../../../../engineering/source-structure.md)只更新直接相关执行入口，updated日期同步。
- 本任务goal覆盖表与01–06完成证据为权威，不另建执行状态文档；e2e/配置仅在必需接入问题时修改。
- 复用[P1-07证据](../../07/subtasks/08-final-browser-alignment.md#完成证据)、[P1-08证据](../../08/subtasks/06-final-browser-alignment.md#完成证据)、[P1-09证据](../../09/subtasks/05-browser-input-evidence.md#完成证据)和[最终对齐](../../09/subtasks/07-final-alignment.md#完成证据)，不得改写历史结论。

## 验收标准

- [ ] AC-10：每项历史证据有版本/相关差异/适用判断，必需失效项有新的真实结果，无无效passed复用。
- [ ] AC-01/09/12：pnpm check与完整3项目E2E实际通过，正常场景无意外应用错误，版本/origin/构建可追溯。
- [ ] AC-11：受控失败非零/诊断完整，网站不含Playwright或测试入口、无生产写入/调度/原版读取；owned资源清理完成。
- [ ] AC-12：工程/结构命令与发现范围、browser准备/限制及链接/元数据准确，不宣称跨浏览器或阶段退出。

## 验证方法

使用pnpm check、01落地的pnpm test:e2e，配置负向回归和产物/diff/link检查。浏览器实跑及条件补测按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；仍有效历史矩阵直接引用，必要事实与新验收分开。证据写本项与既有负责子任务，不创建额外markdown报告。

## 完成证据
