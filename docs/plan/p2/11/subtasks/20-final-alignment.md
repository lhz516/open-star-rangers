---
type: plan
status: active
phase: P2
task: "11"
subtask: "20"
updated: 2026-10-07
---

# 20 — P2-11 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-13、AC-01 至 AC-24，以及[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec 与各子任务的完成证据，逐项形成 S/AC 覆盖表。确认[行为与边界](../spec.md#行为与边界)的每一行、[状态阶梯](../spec.md#状态阶梯)的每个状态、[失败反馈](../spec.md#失败反馈)的每个类别，都有对应的测试或证据。
- **不变量核对：**
  - `app/`、`render/`、`ui/` 不导入 `original-data`；从 `src/main.tsx` 出发的生产模块图不含 `original-data` 与测试支持；
  - 只经 `content/` 的读取与消费函数取数据，没有第二套解码、调色板展开或布局合成；
  - 页面只显示经实际验证的状态；全站没有禁用词，也不显示原版文字；
  - 缓存只经 P2-10 的适配器；只提交完整的导入包；恢复只按预期包配置筛选；
  - 呈现约定集中在一处，源码结构记录各项置信度；
  - 新增主线程模块不使用网络 API；没有 Blob URL、`HTMLImageElement` 或 2D Canvas 显示原版图像；
  - 合成演示独立可用。
- **工程检查：**
  - `pnpm check`、`pnpm test:e2e`（全部项目）、`pnpm check:original`；
  - 文档链接与元数据检查；
  - `node tools/task-state.ts p2/11` 与 tracker 一致；
  - `package.json`、`pnpm-lock.yaml` 与 `.nvmrc` 没有变化。
- **提交范围：** 审阅 goal 的全部提交，确认没有原版内容、二进制样本、反编译输出、截图或 `local/` 输出。
- **人工与研究证据：**
  - 19 的用户核对对应最终的生产 `ConverterVersion`；若 16 在 19 之后改变了它，19 须按其说明重新确认；
  - 15、16 若为 blocked，本子任务不能完成，等待用户决定。
- **文档：** 更新 STATUS 的阶段摘要与下一步；核对源码结构、工程约定、本地导入指南、README、executable 与 unknowns。
- **只核对，不实现：** 发现缺口时，按 execute-goal 的补救流程新增子任务。

## 不包含

- 新功能、网络审计与原版保真对照（P2-12）、P2 退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与各子任务的完成证据；[STATUS](../../../../STATUS.md)。

## 验收标准

- [x] S-01 至 S-13、AC-01 至 AC-24 都有对应的实现与验证证据。
- [x] 上列不变量全部成立，或已有补救子任务。
- [x] AC-23：`pnpm check`、全部 E2E、`pnpm check:original` 与文档检查通过；依赖清单与锁文件没有变化；`node tools/task-state.ts p2/11` 与 tracker 一致。
- [x] 提交中没有原版内容或 `local/` 输出；19 的证据对应最终构建。

## 验证方法

- 逐项审阅与命令输出；浏览器部分按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 复跑全部 E2E。
- 不适用新的原版对照。

## 完成证据

核对于 2026-10-07，在 goal 分支 `agents/execute-goal-goal-md` 上，其余 23 个子任务全部 completed 之后进行。

- **覆盖核对：** 其余 23 个子任务的验收项全部勾选，都有完成证据。goal [验收覆盖](../goal.md#验收覆盖)的每一行都已逐项对照：实现子任务全部 completed，验收标准或完成证据引用该 ID 的子任务如下。
  | ID | 证据所在子任务 |
  |---|---|
  | S-01、AC-01 | 06、21；往返见 13，生产项目见 14、21 |
  | S-02、AC-02、AC-03 | 07 |
  | AC-04 | 05（文案表）、07（失败场景 E2E） |
  | S-03、AC-05 | 02、03 |
  | S-04、AC-07、AC-08 | 03、06、07、12 |
  | S-05、AC-09 | 01、03、06 |
  | S-06、AC-10 | 04、11 |
  | S-07、S-09、AC-11 至 AC-13 | 08、09、11、24 |
  | AC-14 | 08、10、11 |
  | S-08、AC-15 | 10、11、22 |
  | S-12、AC-06、AC-16 | 02、03、10、13、22 |
  | S-10、AC-17、AC-18 | 15、16；未贴图时的回退显示见 09、11 |
  | S-11、AC-19 | 14、21 |
  | AC-20 | 17、23 |
  | AC-21 | 19 |
  | S-13、AC-22 | 05、07、18；原版文档见 15、16 |
  | AC-24 | 11、16 |
  | AC-23 | 本子任务，见下方“工程检查” |

  [行为与边界](../spec.md#行为与边界)、[状态阶梯](../spec.md#状态阶梯)与[失败反馈](../spec.md#失败反馈)分别由 02、03 的真值表、05 的文案表与 07、12 的 E2E 覆盖，各子任务证据已逐行列出。spec 于 2026-10-07 按用户决定修订了 S-10、呈现约定与 AC-18（见 spec 审批），16 按修订后的要求完成，没有复用旧要求的证据。spec 的 S-10、当前依据与 AC-17 仍沿用研究前“平面映射”的说法，15 已确认碎片实为柱面映射；goal 执行记录（2026-10-06，15 的结论）已说明契约要求照常适用，原版事实以 executable 与 U-027 为准。
- **不变量：**
  - **模块边界：** `app/`、`render/`、`ui/` 的生产代码不导入 `original-data`，只有注释与 test ID 提到这个词；[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 检查从 `src/main.tsx` 出发的页面模块图不含 `original-data` 与测试支持，而 Worker 的模块图含 `original-data`。
  - **单一解码：** `app/`、`ui/`、`render/viewer/` 没有 `DataView` 或逐字节读取；数据只经 `content/` 的读取与消费函数取得。
  - **页面文字：** 页面只显示经实际验证的状态（02、03 真值表）；禁用词只出现在声明“不可玩”的源码注释中，页面文字由 [compliance-text.spec.ts](../../../../../e2e/compliance-text.spec.ts) 检查。
  - **缓存：** `platform/storage/` 之外没有 IndexedDB；只提交完整包（03），恢复只按预期包配置筛选（03、12）。
  - **呈现约定：** 集中在 [viewer-presentation.ts](../../../../../src/render/viewer/viewer-presentation.ts)；[源码结构](../../../../engineering/source-structure.md)逐项记录了置信度，包括跨接缝插值一行。
  - **网络与图像：** 18 的边界测试证明主线程新模块不使用 5 种网络 API；源码中没有 `createObjectURL`、`Blob`、`HTMLImageElement`、`new Image` 或 2D Canvas。
  - **合成演示：** 合成演示独立可用，演示用例全部包含在 E2E 中。
- **工程检查（AC-23）：**
  - `pnpm check`：152 个文件、4,531 条测试，typecheck、lint 与构建通过；
  - `OSR_E2E_DEV_PORT=5160 OSR_E2E_PREVIEW_PORT=5161 pnpm test:e2e`：三个项目共 102 条全部通过，同一天连续两次，换用端口是因为 4174 被用户的手工预览占用；
  - `pnpm check:original`：通过，0 条发现（构建 9、索引 800、工作树 800、未跟踪 0）；
  - goal 期间新增或修改的 50 篇文档：本地链接与锚点、front matter 均通过。只有 generate-goal 模板中的占位链接，这些链接相对于生成后的文档，属预期；
  - `node tools/task-state.ts p2/11` 与 tracker 一致；
  - **依赖文件：** 以本任务的改动为准，三个文件没有变化：
    - goal 分支相对其基点 `main`（`18d3fa4`）的 diff 不含 `package.json`、`pnpm-lock.yaml` 或 `.nvmrc`，合并后这三个文件不变；
    - 从 `924081d` 起，触及这三个文件的唯一提交是 `ff06c01`（只给 lint 脚本加 ESLint 缓存参数，不涉及依赖）。它来自用户另行合入 `main` 的 `lhz516-optimize-test-checks` 分支，不属于 P2-11，因此没有回退。rubber-duck 认为按字面应计入并修订 AC-23；协调者未采纳，理由同上。如用户认为应按字面计入，需修订 AC-23。
- **提交范围：** 从第一个 P2-11 提交 `924081d` 到当前共 49 个提交：
  - 没有二进制文件，没有 `local/` 路径，没有图像、音频或光盘文件；
  - 新增行中没有成串的十六进制字节；
  - 原版文档只记地址、结构、公式、计数与判定。
- **人工与研究证据：**
  - 15 已确认，16 已完成；
  - 19 的用户核对对应最终生产 `ConverterVersion`（`models-2`，`bb31160` 之后只有测试与文档提交），在 Chrome 154.0.8037.98 中完成，记录了作业、保存与恢复耗时。
- **文档：**
  - 在 [unknowns](../../../../original/unknowns.md) 的 U-027 中补记 16 的导入与显示，保持“部分确认”；
  - 更新 [STATUS](../../../../STATUS.md) 的阶段摘要与下一步，指向 P2-12；
  - 核对 README、源码结构、工程约定、本地导入指南与 executable，与实现一致。
- **Rubber-duck：** 一次审阅，阻塞问题三项：
  - 覆盖表缺 AC-04：已补；
  - STATUS 早于 tracker 宣告完成：二者在同一提交中更新；
  - 依赖文件：未采纳，理由见“工程检查”。

  非阻塞问题一项：spec 仍写“平面映射”。按上文记录，不改已批准的 spec 文本。
- **剩余事项（不属于本任务）：**
  - 呈现约定的原版截图判定与网络审计归 P2-12；
  - 真实 SWA 的回退与响应头归 P5；
  - P2 退出判定归 P2-13。
