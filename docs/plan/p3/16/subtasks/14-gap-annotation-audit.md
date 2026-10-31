---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "14"
updated: "2026-10-30"
---

# 14 — 缺省与标注审计

**契约来源：** [spec](../spec.md) 的 S-07、AC-13、[缺省与范围判定](../spec.md#缺省与范围判定)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项核对 G-01 至 G-10（含 G-02/1 至 G-02/10）：已有的范围或批准依据（[P3-01 缺省清单](../../01/spec.md#缺省清单)与审批节、阶段索引），界面标注（`data-gap` 与文案），以及文档（[slice-gaps](../../../../engineering/slice-gaps.md)）。G-09、G-10 引用 P3-06 检查点 C 的既有排除，并核对闭环不依赖自动驾驶或强制调试。G-08 包含 F1 重绘差异的披露。
- 核对临时资源与近似规则：没有未替换的临时资源，也没有未披露的近似规则（[ADR-0007](../../../../decisions/ADR-0007-narrow-p2-overlap-p3.md)）。
- **取证方式：** 在当前候选的开发与生产构建中用合成内容取证，按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。[P3-15/09](../../15/subtasks/09-annotation-audit.md#完成证据)、[12](../../15/subtasks/12-f1-disclosure.md#完成证据) 的证据只有在其候选到当前候选之间没有 UI 文案或标注的改动时才可复用；04 只改 Core，复用时写明依据。

## 不包含

- 新增或重新定义 G 项；修改标注（漏标时交修复项）。

## 关键文件与契约

- [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)、[MissionParts.tsx](../../../../../src/ui/mission/MissionParts.tsx)、[slice-gaps](../../../../engineering/slice-gaps.md)。

## 写入范围

- `dist/**`：生产构建（被忽略）。
- `local/research/p3-16/gaps/**`：页面记录（被忽略）。

## 验收标准

- [x] AC-13：每个 G 项（含 G-02 子项）都有依据、界面位置与文档位置；G-09、G-10 引用既有排除并核对闭环不依赖它们。
- [x] AC-13：没有漏标、未替换的临时资源或超范围的项；如有则判为失败并交修复。

## 验证方法

- 开发与生产构建的合成页面核对，或写明复用依据；对照权威 G 清单。

## 完成证据

**结论（2026-10-30，worker 14，候选 `9ab62872`，含 04 的 `2500ceef`，`RULES_VERSION` 12）：AC-13 两项满足。** G-01 至 G-10（含 G-02/1 至 G-02/10）在当前候选的 development 与 production 中都有与 `SLICE_GAPS` 逐字相同的界面标注、权威清单中的依据与 slice-gaps 中的文档位置；G-09、G-10 只引用 P3-06 检查点 C 的既有排除，所选闭环不按 `a`/F11（当前候选上重跑的 production 完整合成闭环与两构建的局部场景），production 中没有测试入口与开发诊断；没有漏标、超范围的 G 项、未替换的临时资源或未披露的近似规则。本结论只覆盖缺省与标注，不代表第五项退出条件或 P3 退出的判定（由 16 的评审给出）。

### 取证方式与复用依据

- **新取证，不只复用：** `3f48fddb`（[P3-15/09](../../15/subtasks/09-annotation-audit.md#完成证据) 复审的基线）到候选之间 `git diff --stat -- src e2e` 只有 Core（04 的 Warp 门禁与地图投影的调用）与 render（P3-15/13 共用的逻辑像素规则，含画出 G-03 页 5 标签的 [cockpit-layer.ts](../../../../../src/render/cockpit/composition/cockpit-layer.ts)）；`src/ui/**`、`e2e/**`、[slice-gaps](../../../../engineering/slice-gaps.md) 与 [P3-01 spec](../../01/spec.md) 都没有改动。文案与标注因此不变，但画布中的 G-03 标签与地图 `N/A` 的绘制路径变了，所以在当前候选上重跑而不是只写复用依据。
- **环境：** macOS、本机 Google Chrome（Playwright 1.63 `channel: chrome`，headless，每个用例独立上下文，1280 × 800，DPR 1）。只用代码生成的合成内容：development 为 5144 上的测试入口（`mission-startable`、`mission-docking` 合成导入或 `endingPackage` 变体），production 为本工作树 `pnpm build` 后 5143 上的 `pnpm preview`，以 `seedProductionCache` 按生产身份写入同样的合成包并经主菜单 “Open saved resources” 恢复。
- **脚本：** P3-15/09 的私有审计脚本改为本工作树路径与端口后在 `local/research/p3-16/gaps/`（git 忽略）重跑，另加 G-09/G-10 的闭环记录（见下）。`annotations.audit.ts` 4 个用例 × 2 个构建：**8 passed（4.0 min）**。每页读取所有可见 `.slice-gap[data-gap]`，G ID 集合须等于预期，且每条整段文字须与 `SLICE_GAPS` 的 “标题（G ID）. 说明” 相等（`expect.soft`，任一不符即失败）。观测在 `results/<build>-<case>.json`，合成截图在 `shots/<build>/`。
- **既有用例重跑（同一候选、同一 `dist`，`OSR_E2E_DEV_PORT=5142 OSR_E2E_PREVIEW_PORT=5143`；完整闭环见 G-09、G-10 一节）：** [cockpit.development.spec.ts](../../../../../e2e/cockpit.development.spec.ts) “pages 2–5 …” 与 [cockpit.production.spec.ts](../../../../../e2e/cockpit.production.spec.ts) “production incoming …”（G-03 页 5 标签的像素与摘要）：2 passed；[map-picture.production.spec.ts](../../../../../e2e/map-picture.production.spec.ts) “E = 0 …（Δ-06）”（地图 `N/A` 标记）：1 passed。待做的修复项 20 只改 development 的 map-picture 用例与其支持代码，不涉及这一条。
- **单元：** `npx vitest run src/ui/mission/mission-copy.test.ts src/ui/mission/slice-gaps-copy.test.ts`：14 passed。
- **清理：** 所有服务器由 Playwright 启停；结束后 5142–5144 无监听，没有遗留浏览器。

### 逐项审计

“两构建”指 development 与 production 都在本次运行中看到同一标注且文字逐字相等。依据列的定义均见 [P3-01 缺省清单](../../01/spec.md#缺省清单)；文档列均指 [slice-gaps 当前构建的缺省项](../../../../engineering/slice-gaps.md#当前构建的缺省项) 的同名行。

| 项 | 范围/批准依据 | 界面位置与本次观测（两构建） | 文档 | 结论 |
|---|---|---|---|---|
| G-01 音乐 | 第五项退出条件明文允许 | 开始配置页、飞行与基地任务壳的缺省说明；状态栏短标签 “No music (G-01)” | G-01 行 | 通过 |
| G-02/1 介绍 | 同上（过场可跳过）；实例按 P3-01 [衔接媒体](../../01/spec.md#衔接媒体) | 占位页 “Introduction placeholder (G-02/1)”；之后开始配置页与任务壳的说明（含 “project choice rather than the original length”） | G-02/1 行、[G-02 不计时](../../../../engineering/slice-gaps.md#g-02-不计时与基准设置的差异) | 通过 |
| G-02/2 出发 | 同上 | “Departure placeholder (G-02/2)”，`data-variant="wingman"`、“Departure with a wingman.”；`solo` 变体由 P3-04/10 的流程覆盖（`src/ui` 之后未改） | G-02/2 行 | 通过 |
| G-02/3 入港 | 同上 | 合成 `mission-docking` 按 `c`、`2`、`2` 停靠后 “Docking placeholder (G-02/3)” | G-02/3 行 | 通过 |
| G-02/4 离港 | 同上 | 基地页按 `l` 后 “Launch placeholder (G-02/4)” | G-02/4 行 | 通过 |
| G-02/5 被毁救援 | 同上 | `endingPackage('failure')` 开局被毁、逃生舱之后 “Rescue after destruction placeholder (G-02/5)” | G-02/5 行 | 通过 |
| G-02/6 能量救援 | 同上 | 同一运行 Backspace 耗尽能量、信标等待后 “Rescue after running out of energy placeholder (G-02/6)” | G-02/6 行 | 通过 |
| G-02/7 失败过场 | 同上 | “Mission failure placeholder (G-02/7)”，`energy` 变体，“Ending 1 of 1; …”；`destroyed` 变体由 P3-11/18 与单元测试覆盖 | G-02/7 行 | 通过 |
| G-02/8 返航 | 同上 | `endingPackage('success-cutscene')`：“Return placeholder (G-02/8)”，`wingman`，“Ending 1 of 2; …” | G-02/8 行 | 通过 |
| G-02/9 任务过场 | 同上 | 同一运行 “Mission cut-scene placeholder (G-02/9)”，“Variant: the mission's cut-scene row 16.” | G-02/9 行 | 通过 |
| G-02/10 授勋 | 同上；勋章归 P4 | 失败与成功两张结果页的 G-02/10 说明 | G-02/10 行 | 通过 |
| G-03 头像、动画、语音 | 总计划的头像许可与 P3 阶段边界 | 停靠回复时左显示屏 `leftPage` 5，标签 `DOCKING REPLY` / `G-03 PROJECT`（画布像素由上面两条 cockpit 用例在当前候选断言）；基地页 G-03 说明，消息行 `data-origin="project"` 且写 “(project summary, not the original line)” | G-03 行 | 通过 |
| G-04 简报与僚机页 | [阶段索引“本阶段不做”](../../tasks.md#本阶段不做)：闭环必经页面以标注的项目界面代替 | 开始配置页；目标区块 `data-gap="G-04"`、“Objectives and limits (project text) (G-04)” | G-04 行 | 通过 |
| G-05 基地画面 | 同上 | 停靠后 “Base service (G-05)” 与 G-05 说明 | G-05 行 | 通过 |
| G-06 结果页与重开 | 同上 | 失败与成功结果页、任务菜单的 G-06 说明；“not the original statistics page”；成功总结 “from your imported data”。运行故障后 `mission-ended` 的 G-06 本次未到达，仍按 P3-15/09 以代码（`EndedNotice`）核对，`src/ui` 之后未改 | G-06 行 | 通过 |
| G-07 菜单与战役设置 | 同上 | 主菜单、开始配置页 “19 (fixed, G-07)”、任务菜单 | G-07 行 | 通过 |
| G-08 其他视角与 F1 | 阶段索引把其余视角移交 P4；P3-01 G-08 行 2026-10-30 修订（[审批](../../01/spec.md#审批)）与 [P3-15/12](../../15/subtasks/12-f1-disclosure.md#完成证据) | F2–F10、Home、PageUp、ArrowLeft/Right/Down 与 Numpad7/9/4/5/6/2 共 20 键都显示 G-08 提示且整段相等；文案含 F1、Up、keypad 8、整驾驶舱重绘与 P4。F1、ArrowUp、Numpad8 不显示提示、无 alert；development 事件日志各一条 `cockpit-front · rejected · not-implemented`（tick 815、828、840） | G-08 行与 [G-08 与 F1 前视](../../../../engineering/slice-gaps.md#g-08-与-f1-前视) | 通过 |
| G-09 自动驾驶 | P3-01 [审批](../../01/spec.md#审批) 2026-10-10 检查点 C 修订；[P3-06 技术决定 7](../../06/spec.md#技术决定)（M-06） | `a` 显示 “Autopilot missing (G-09). …” 整段相等 | G-09 行 | 通过；闭环独立性见下 |
| G-10 飞行中灵敏度 | 同一修订；P3-06 技术决定 8（M-03） | F11 显示 “In-flight sensitivity switching missing (G-10). …” 整段相等 | G-10 行 | 通过；闭环独立性见下 |

代码中出现的 G ID 字面量（`src` 非测试文件）恰为上表 19 个（G-01、G-02/1–10、G-03 至 G-10），`SliceGapId` 之外没有其他 G ID；可见标注的集合在每页都与预期相等，没有多出或缺少的标注。

### G-09、G-10：引用既有排除并核对闭环不依赖

- **既有排除：** 只引用 P3-06 检查点 C 写入 P3-01 清单的排除（自动驾驶 `a`、飞行中切换灵敏度 F11），不重新定义“与飞行无关”，也不扩大范围：绑定只拦截 `KeyA` 与 `F11`（[bindings.ts](../../../../../src/ui/game-input/bindings.ts) 的 G-09、G-10 两行）；Core 没有自动驾驶命令或状态，规则总走“自动驾驶关闭”的分支（[flight-control.ts](../../../../../src/core/systems/flight-control.ts) 速度辅助的注释，[collision.ts](../../../../../src/core/systems/collision.ts) CR-09）。
- **审计脚本的局部场景：** 停靠/基地/离港、失败结局（两次救援与第三次损失）、成功结局（含任务过场）三个局部场景在两构建中都走到结果页或离港后的飞行，记录到的全部按键只有 `c`、`2`、`2`、`l` 与 `Backspace`，没有 `a`/`KeyA`/`F11`；production 中 `osrTestEntry` 不存在、`mission-dev-panel` 与 `dev-*` 元素为 0。
- **完整合成闭环（当前候选上重跑）：** [joint-loop.production.spec.ts](../../../../../e2e/joint-loop.production.spec.ts) 的两个用例——成功（有无僚机：起飞、飞行、选目标、射击、地图与 Warp、停靠与离港、结果与 Restart）与失败（有无僚机：被毁与能量救援、第三次损失、结果与 Restart）——以 `OSR_E2E_DEV_PORT=5142 OSR_E2E_PREVIEW_PORT=5143` 在本工作树的 production preview 上运行：**2 passed（3.6 min）**，含 04 的 Warp 门禁。用例与其支持代码按下的键只有 `t`、`f`、`m`、`w`、`]`、`\`、Backspace、`c`/`2`/`2`、`l` 与 Alt，没有 `a` 或 F11；它只以可信输入推进、没有强制结局或状态写入，且逐页断言没有开发诊断（`mission-dev-panel`、`dev-*` 为 0）与录制导出。因此所选闭环在当前候选上既不借助自动驾驶，也不借助强制调试。

### 临时资源与近似规则

- **检索：** `rg -i` 检索 `src/` 非测试文件的 `approximat|temporary|stand-in|interim|TODO|FIXME`，并对 `3f48fddb..HEAD` 中 `src` 的新增行另检索 `placeholder|project choice|not the original|substitut|G-0x|Δ-0x|not-implemented|fallback|heuristic`。
- **临时资源：没有。** `temporary` 只在开发诊断的下载元素与导入读缓冲（[mission-ports.ts](../../../../../src/app/mission/mission-ports.ts)、[file-save.ts](../../../../../src/platform/files/file-save.ts)、[source-reader.ts](../../../../../src/original-data/disc/source-reader.ts)），不是游戏资源。
- **近似规则：没有未披露的。** `approximation` 的命中是 EXE 中 f64 常量的说明（[warp-path.ts](../../../../../src/core/rules/warp-path.ts)、[warp-templates.ts](../../../../../src/render/flight/warp/warp-templates.ts)）与格式化器“报错而非近似”的说明（[text-format.ts](../../../../../src/render/cockpit/raster/text-format.ts)）。`not-implemented` 的 Core 用途仍只有 F1 `cockpit-front`（上表 G-08 已披露）与尚未实现的投影分区类型。
- **新出现的项目差异（已批准、已披露，不是近似规则）：** 04 加入的 MW-04 第 1a 步——本 tick 已有待提交的玩家 `dock`/`depart` 时 `request-warp` 为 `ignored`/`wrong-context`——由 P3-16 技术决定 4 批准，写入 [P3-02 MW-04](../../02/spec.md#mw-04-命令原因码与内部请求)、[MW-12 已批准的差异](../../02/spec.md#mw-12-随机数前置研究与已批准的差异)、[P3-09 spec](../../09/spec.md)、[P3-10 spec](../../10/spec.md) 与 [core 已知差异](../../../../engineering/modules/core.md#已知差异)。它不是 G 项，不需要界面标注；P3-15 的[对照汇总](../../15/comparison-summary.md)早于它，交 13/16 列入退出评审的差异披露。
- 其余项目选择与已批准差异（占位 3,000 ms、键位节奏、32 Hz 步长、P3-12 至 P3-14 的已批准差异、地图 `N/A` 即 Δ-06 等）与 P3-15/09 的分类相同，未因本候选改变；完整差异清单归 13 与 16。

### 复用条件、rubber-duck 与文档影响

- **最终候选复用：** 只有当之后的提交（目前待做的 18、19、20、15）既不改标注本身（`src/ui/**`、`src/ui/game-input/bindings.ts`、`src/render/cockpit/**`、地图信息带的绘制、slice-gaps、P3-01 的缺省清单），也不改页面的可达性与构建输入（`src/app/**`、Core 的流程、转换与结果系统、生产包与缓存恢复、依赖与构建配置）时，本记录才可作为最终候选的 AC-13 证据；否则在最终候选上重跑同一私有脚本、上述 3 条既有用例与 joint-loop 的 production 用例，或以 09 在最终候选上通过的浏览器回归（含 joint-loop）为前提。按各行的写入范围，18 改 `src/original-data/**` 的读取器（属导入链，须由 09 的回归确认），19 改 `src/render/**` 的爆炸精灵着色器（如触及 cockpit 或地图绘制则须重跑），20 只改 development 的 map-picture 测试，15 只改 unknowns。
- **rubber-duck：** 一个阻塞意见与一个非阻塞意见，均已采纳：(1) 审计脚本只覆盖局部场景，完整闭环的独立性原先只静态检查并推给 09——已在当前候选上重跑 joint-loop 的 production 两个用例（2 passed）并把措辞改为“局部场景”；(2) 最终候选的复用条件过窄——已加入页面可达性与构建输入，否则以重跑或 09 的回归为前提。复核确认：04 的差异是已批准、已披露的项目差异，不需要界面标注，交 13/16 披露正确；G 项全部覆盖；G-09、G-10 的引用正确；链接无误。
- **文档影响：** slice-gaps、P3-01 清单、键位文档与 core 分册仍与当前构建一致，无需修改；04 的差异已在 core 已知差异中，不属 slice-gaps（非 G 项、无界面标注）。建议的协调者文档变动只有上面“新出现的项目差异”交 13/16。
