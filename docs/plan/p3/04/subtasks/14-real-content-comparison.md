---
type: plan
status: active
phase: P3
task: "04"
subtask: "14"
updated: 2026-10-09
---

# 14 — 真实内容核对与对照记录

**契约来源：** [spec](../spec.md) 的 S-12（对照部分）、[对照](../spec.md#对照)、[验证策略](../spec.md#验证策略)的实机/原版对照；AC-17、AC-20。
**依赖：** 08, 09, 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **AC-17 私有真实内容实验：** agent 启动自有开发服务器与独立的开发浏览器（关闭通用 trace 与截图采集），重新导入 `local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`（基线上的转换器版本来自 P3-03，旧版本的缓存不提供恢复，不依赖既有缓存）；带僚机与不带僚机各开始一次正式运行并进入飞行；从开发诊断核对玩家 1 个、种类位 1 的对象恰在带僚机时存在、tick 前进；分别导出录制，以生产 CLI `node tools/replay-check.ts <录制> <同一 CloneCD 文件组>` 核对一致。记录候选提交、转换器版本、完整内容身份、配置、种子、Chrome、Node 与 V8 版本。录制、报告与任何派生输出只存放在 `local/research/p3-04/`；公开证据只含计数、身份与判定。
- **AC-20 对照记录：** 按 spec 的[对照](../spec.md#对照)，在完成证据中记录：
  - R-13 控制子集：依据 [B-001](../../../../original/behavior/B-001-strategic-map.md#打开与关闭已确认) 与[时基](../../../../original/formats/executable.md#simulation-time-base-p3-0106)；引用 03 的 Node 证据与 11 的原生隐藏证据；判定只记“Runtime 暂停控制子集通过”，披露原版扣时的至多 2 个时钟单位残差与 32 Hz、后台策略等项目选择，不声称完整 R-13 或关闭 U-021。
  - L-01、L-02、L-10 的流程部分：对照 [B-003 出发](../../../../original/behavior/B-003-campaign-flow.md#出发l-02)与[重开](../../../../original/behavior/B-003-campaign-flow.md#重开任务p3-0104)；披露 G-02 不计时、出发前创建 tick 0 世界、独立任务重试不保留战役状态的差异；说明结果后重试、完整起飞与画面尚待负责任务。
  - 不关闭 U-010、U-021、U-031，不写入 `docs/original/`。
- 若浏览器自动化无法取得所需操作，按[原版证据获取](../../../../guides/original-evidence.md)记录尝试与原因并阻塞，不用合成结果代替。

## 不包含

- DOS 原版运行或新的原版事实研究（spec 不要求）；文档同步（15）。

## 关键文件与契约

- 使用：`tools/replay-check.ts`（08）、开发构建的诊断与导出（07、09）。
- 证据来源：03、11 的完成证据；[B-001](../../../../original/behavior/B-001-strategic-map.md)、[B-003](../../../../original/behavior/B-003-campaign-flow.md)、[executable](../../../../original/formats/executable.md)。

## 写入范围

- `local/research/p3-04/**`：真实内容实验的私有输出（git 忽略）。

## 验收标准

- [ ] AC-17：带与不带僚机各一次正式运行，玩家与僚机数量正确、tick 前进；两份导出录制经生产 CLI 与同一文件组核对一致；绑定候选、身份、配置、种子与运行时版本；输出只在 `local/research/p3-04/`。
- [ ] AC-20：R-13 控制子集与 L 流程部分的结论、依据、置信度与已知差异记录在完成证据中，区分项目调度通过、已有原版依据与未完成的下游玩法。
- [ ] 仓库中没有新增原版内容或派生输出（`git status` 与 `pnpm check:compliance`）。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的方法操作开发构建（真实内容只在本地实验中使用，不纳入自动测试）；CLI 输出 JSON 报告存于 `local/research/p3-04/`。
- 对照为文档与证据核对，不需要新的 DOS 运行。

## 完成证据
