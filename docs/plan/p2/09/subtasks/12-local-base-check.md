---
type: plan
status: active
phase: P2
task: "09"
subtask: "12"
updated: 2026-10-05
---

# 12 — 本地基准核对 CLI

**契约来源：** [spec](../spec.md) 的 S-14、AC-14、AC-13（CLI 输出隐私）、AC-15（工具指南）；[验证策略](../spec.md#验证策略)中的原版对照。
**依赖：** 10, 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **CLI：** 新增 `tools/logic-check.ts`，参数为 CloneCD 文件组路径：
  - 以 `fs.openAsBlob` 打开文件，组装为导入文件，运行与 Worker 相同的生产作业模块（`createImportJob`，默认产品入口与生产转换）；
  - 对收到的 `logic` 组运行 `validateGroup`，以 04 的字节解码入口解码 payload，再以 `loadMission` 载入；
  - stdout 输出一份 `osr-logic-check`/1 JSON，只含：结论、首个失败的 code 与结构位置、声明数、名称备用池条目数、编组数、成员位置数与布局元素数、生成矩形数、非 null 的放置引用、成员回指与 AI 目标计数、僚机选项数、机型条目数及各阵营计数、各 payload 字节数、`convert-logic` 的读取增量（最后一次进度减去识别结束时的读取量）、`ManifestIdentity` 与 payload 指纹，以及结构观测值与限值的对照；
  - 不输出名称、坐标、字段值、宿主路径或宿主错误文本。测试可注入合成白名单。
- **合成测试：** `tools/logic-check.test.ts` 用 05 的合成封包与合成光盘验证正向输出形状、失败输出（如 `unsupported-payload`）与隐私（输出不含 `MARKER`）。
- **本地运行：** 在开发者本机运行 `node tools/logic-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，把计数与 scenario 的[来源概况](../../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)和[切片字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)核对。输出只留在 `local/research/p2-09/`。
- **文档：** 在[工具指南](../../../../guides/tools.md)新增本工具的用法与输出说明；若计数产生新的结构事实，按流程写入 `docs/original/`。
- **前提：** `local/StarRang/cd/` 有开发者的 CloneCD 文件组。缺少时本地运行部分为 blocked，不能用合成数据代替。

## 不包含

- 视觉或听觉对照；P2-12 的独立原版对照。
- 在浏览器中使用原版数据。

## 关键文件与契约

- **复用：** [import-job.ts](../../../../../src/workers/import-job.ts) 的 `createImportJob`；[completeness.ts](../../../../../src/content/completeness.ts) 的 `validateGroup`；04 的解码入口；11 的 `loadMission`；参照 [source-check.ts](../../../../../tools/source-check.ts) 的输出与错误约定。
- **计划新增：** `tools/logic-check.ts`、`tools/logic-check.test.ts`。
- **本地新增：** `local/research/p2-09/` 下的运行输出（被忽略，不提交）。

## 验收标准

- [ ] AC-14：本地运行中组为 `group-complete`，`loadMission` 成功；输出包含规定的计数、读取增量与哈希；计数与 scenario 来源概况及 01 的字段清单一致；结构观测值都在限值之内（否则按 spec 修订限值并重新批准）。
- [ ] AC-13：合成测试与本地输出都不含名称、坐标、字段值、`MARKER` 或私人绝对路径。
- [ ] `pnpm exec vitest run tools/logic-check.test.ts`、`pnpm typecheck`、`pnpm lint` 与 `pnpm --silent check:original` 通过；`git status` 显示 `local/` 下的文件未被跟踪。
- [ ] 工具指南已更新，链接与元数据检查通过。

## 验证方法

- Node 合成测试；本地运行命令与计数写入证据，不粘贴原版内容。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据
