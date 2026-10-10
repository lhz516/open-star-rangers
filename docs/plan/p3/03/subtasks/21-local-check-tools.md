---
type: plan
status: active
phase: P3
task: "03"
subtask: "21"
updated: 2026-10-09
---

# 21 — 本地核对工具与基准核对

**契约来源：** [spec](../spec.md) 的 S-16、S-17（工具用法与 `AGENTS.md`）、AC-19、AC-20（工具部分）、AC-18（CLI 输出）；[技术决定](../spec.md#技术决定) 11、13。
**依赖：** 19, 26, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **nob-check：** 扩展 [nob-check.ts](../../../../../tools/nob-check.ts)：
  - 用 14 的生产解码解码 `SR.NOB` 的全部 186 个 ANIM 帧，核对每帧恰好用尽其数据；
  - 核对 EXIC→EXPL→ANIM/SND 与 `CRAFT.NOB` TABL 4003→CINF 的引用；
  - 既有的 NEBC→BITM 核对继续生效；
  - 输出只有计数、失败 code 与观测最大值，不输出像素或数值。

  其余新增解析器带有切片专用的失败关闭规则，只经下面的 CLI 在切片条目上运行。
- **包核对 CLI：** 计划新增的 `tools/package-check.ts`，用与 Worker 相同的 `createImportJob()` 转换 CloneCD 文件组：
  - 对四组运行 `validatePackage`，用读取器解码每个新增角色的 payload，并用 `loadMission` 载入任务；
  - 输出 `osr-package-check`/1 JSON：结论；每个新增角色的 Asset 数；记录、帧、文字与声音的计数；payload 字节；各阶段读取增量；manifest 身份与哈希；限值与观测值的对照；
  - 不输出名称、文字、数值、宿主路径或宿主错误文本；
  - 测试可注入合成白名单，退出码与 [logic-check.ts](../../../../../tools/logic-check.ts) 相同。
- **基准核对**（输出只在 `local/research/p3-03/local-check/`）：
  - 在开发者本机的基准镜像上运行 nob-check 与 package-check；
  - 用只共用光盘与 IMFAT 读取的本地独立读取脚本，按格式文档读取各导入项（含 `data/hud/text` 的 64 个 EXE 区域与 `warp-arrival` 的播放次数，spec 修订 1），与规范数据逐项比较，只记录结论、计数与哈希；
  - 把生产解码的 ANIM 帧渲染为本地图像，与至少一处本地截图（例如 `local/StarRang/captures/` 中的爆炸画面）或参考视频中的爆炸外观比较。记录方法、来源与置信度，单凭视频最高为高概率；比较用图像只临时存放在 `local/`。
- **文档：** 在 [工具用法](../../../../guides/tools.md) 中加入 package-check 一节，并补充 nob-check 的新增核对；按 07 的交接更新 logic-check 一节的事件计数；在 `AGENTS.md` 的命令表中加入 package-check。

## 不包含

- 模块分册、导入指南、文档地图与 U 项：归 22。
- 原版数据进入仓库：本项的全部读数、脚本输出与比较图像都只在 `local/`。

## 关键文件与契约

- [nob-check.ts](../../../../../tools/nob-check.ts)、[logic-check.ts](../../../../../tools/logic-check.ts)（只读，作为 CLI 的先例）、[import-job.ts](../../../../../src/workers/import-job.ts)。
- [工具用法](../../../../guides/tools.md)、[AGENTS.md](../../../../../AGENTS.md)。
- 计划新增：`tools/package-check.ts` 与 `tools/package-check.test.ts`。

## 写入范围

- `tools/nob-check.ts`：ANIM 与新增引用的核对。
- `tools/nob-check.test.ts`：合成封包上的测试。
- `tools/package-check.ts`：包核对 CLI（新建）。
- `tools/package-check.test.ts`：合成白名单上的测试（新建）。
- `docs/guides/tools.md`：两个工具的用法。
- `AGENTS.md`：命令表。
- `local/research/p3-03/local-check/**`：基准核对、独立读取与外观比较的输出（被忽略）。

## 验收标准

- [ ] AC-19（CLI）：基准镜像上得到 `complete` 的版本 4 包，`loadMission` 成功，输出字段齐全。
- [ ] AC-19（nob-check）：全部 186 个 ANIM 帧恰好用尽数据，新增引用与既有 NEBC/BITM 引用核对通过。
- [ ] AC-19（独立读取与外观）：独立读取与规范数据逐项一致；ANIM 帧与截图或视频的外观比较记录了方法、来源与置信度；全部输出只在 `local/`。
- [ ] AC-18：CLI 与 nob-check 的输出不含名称、文字、数值、原版字节或私人路径；两个工具的测试用合成数据，不读取 `local/`。
- [ ] AC-20（工具部分）：工具用法与 `AGENTS.md` 已更新，`updated:` 与链接有效。
- [ ] `pnpm exec vitest run tools` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试使用合成封包与合成白名单。
- 本地运行（原版数据，只在 `local/`）：`node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`、`node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，以及独立读取脚本；证据只记结论、计数与哈希。

## 完成证据
