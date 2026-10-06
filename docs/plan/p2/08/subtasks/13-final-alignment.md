---
type: plan
status: active
phase: P2
task: "08"
subtask: "13"
updated: 2026-10-05
---

# 13 — 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-12 与 AC-01 至 AC-15；[验证策略](../spec.md#验证策略)、[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01、02、03、04、05、06、07、08、09、10、11、12、14、15。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新的功能代码。发现缺口时，在 goal 中新增修复子任务（新 ID），插入本行之前并加入本行的依赖。

- **覆盖：** 逐项核对 goal 的[验收覆盖](../goal.md#验收覆盖)，确认每个 S 与 AC 都有对应子任务的完成证据，证据与 spec 当前文本一致。
- **不变量复核：**
  - **转换与原版隔离：**
    - payload 与 locator 分离，`content/` 与 `platform/` 不触及 `original-data`；
    - 原版字节只经产品入口与 `verifySourceMappings` 取得；
    - 自动测试与 agent 浏览器检查只用代码生成的数据。
  - **组的发送与失败：**
    - 组在全部转换与身份计算之后发送；
    - 发送前的失败不发出组，发送后的失败由持有者丢弃已收的组。
  - **诊断：** 不含样本字节、宿主错误文本或私人路径。生产代码中没有 `ConversionError` 或 `conversion` 错误层；SND 转换与音频预算的每个 `SourceError` 产生路径（`invalid-payload`、`unsupported-payload`、`budget-exceeded`）都有测试，并经宿主到达 `source` 层 DTO。
  - **播放：** 隐藏、挂起、失败与释放后没有发声；控制器至多一个上下文；释放从不创建上下文。
  - **研究与生产表：** 研究门槛与生产表一致；没有用近似样本、猜测的解释或槽位顺序命名补齐。
- **工程检查：**
  - `pnpm check`；
  - `pnpm test:e2e audio-playback.spec.ts import-worker.spec.ts --project=development`，以及受配置变更影响的 production 项目回归；
  - `pnpm check:original`；
  - 依赖清单与锁文件相对任务开始时无变化。
- **文档：**
  - 源码结构指南、工程约定与研究记录同步；
  - [阶段索引](../../tasks.md)的导航正确；
  - 变更文档的 front matter、`updated` 日期、相对链接与锚点检查通过；
  - STATUS 只在阶段摘要或下一步变化时更新。
- **人工证据：** 确认 10 的试听判定与 12 的基准核对证据齐全；它们不能由本子任务的自动检查代替。

## 不包含

- 新的功能、测试或研究；缺口一律成为修复子任务。
- push、部署或云资源修改（不在授权范围内）。

## 关键文件与契约

- **只读核对：** 本任务的全部改动与 [goal](../goal.md)、[spec](../spec.md)、[阶段索引](../../tasks.md)、[STATUS](../../../../STATUS.md)。

## 验收标准

- [ ] 每个 S-01 至 S-12、AC-01 至 AC-15 都有通过的证据，且与 spec 当前文本一致。
- [ ] 上列不变量全部复核通过，并在证据中逐条记录依据。
- [ ] `pnpm check`、上列 E2E、`pnpm check:original` 通过；依赖文件无变化。
- [ ] 文档链接、元数据与内容检查通过；`git status` 中没有 `local/` 内容、研究输出或原版 payload 被跟踪。

## 验证方法

- 运行上列命令并记录结果；逐项审阅子任务证据与 diff。
- 浏览器检查按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，只用合成数据。
- 原版相关项只复核 10、12 的既有证据，不重新试听或读取原版数据。

## 完成证据
