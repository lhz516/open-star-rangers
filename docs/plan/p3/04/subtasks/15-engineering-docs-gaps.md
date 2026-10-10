---
type: plan
status: active
phase: P3
task: "04"
subtask: "15"
updated: 2026-10-10
---

# 15 — 工程文档、缺省清单与退役记录

**契约来源：** [spec](../spec.md) 的 S-11（文档部分）、S-12、[文档影响](../spec.md#文档影响)、[缺省与标注](../spec.md#缺省与标注)、[合成演示退役](../spec.md#合成演示退役)的“文档与历史链接”；AC-19（文档）、AC-21，AC-18 的退役记录。
**依赖：** 13。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [工程约定](../../../../engineering/README.md)：以正式 Runtime、会话、UI 桥接、任务流程与开发诊断取代“合成 Runtime”“会话端口与错误”“UI 投影与指令反馈”“合成渲染”“页面流转与演示生命周期”中的合成内容；E2E 与针对性检查命令同步（含新增与删除的用例）；记录生产缓存预置与测试入口新增查询键。
- 模块分册：[app](../../../../engineering/modules/app.md)、[ui](../../../../engineering/modules/ui.md)、[platform](../../../../engineering/modules/platform.md)、[render](../../../../engineering/modules/render.md)、[core](../../../../engineering/modules/core.md)（删除合成模块与 `osr/core-synthetic-boundary` 的说明；交接中 P3-04 一项改为指向已交付的接口与运行中衔接的下游责任）。
- [源码结构指南](../../../../engineering/source-structure.md)：当前目录与职责表；新增“P3-04 合成演示退役记录”：列出删除的路径、删除前最后一个包含它们的提交（取自 13 的完成证据）与替代模块，供 16 的历史链接指向。
- [键位文档](../../../../engineering/keyboard-input.md)：当前构建没有游戏键绑定（原版键位由 P3-05 加入）；占位的 Enter/Space/Esc 属于项目界面按键；保留平台键盘源的通用规则；§7 中的离页确认改为已实现。
- [本地导入指南](../../../../guides/local-import.md)：开始任务的条件与流程、缺省说明；[工具指南](../../../../guides/tools.md)：`tools/replay-check.ts` 的用法、文件上限、错误码与退出码。
- 计划新增 `docs/engineering/slice-gaps.md`：按 G ID 记录当前构建中 G-01、G-02/1、G-02/2、G-04、G-06（重开与返回）、G-07 的呈现方式与位置（含 `src/ui/mission/slice-gaps-copy.ts`），G-02 不计时与基准设置的差异并链接 Core 的已知差异；描述当前构建，不是任务状态表。加入[文档地图](../../../../README.md)。
- 每份改动文档更新 `updated:`。在基线上 P3-03 已同步的模块分册、源码结构指南、本地导入指南、工具指南与文档地图之上增量修改，保留其内容（例如 package-check 与重新导入的说明）。

## 不包含

- 历史任务文档、评审与 ADR 的链接改写（16）；`docs/plan/p3/tasks.md` 与 `docs/STATUS.md`（协调者）。

## 关键文件与契约

- 修改：上列 `docs/engineering/`、`docs/guides/` 文档与 `docs/README.md`；计划新增 `docs/engineering/slice-gaps.md`。

## 写入范围

- `docs/engineering/**`：工程约定、模块分册、源码结构指南、键位文档与新增的 `slice-gaps.md`。
- `docs/guides/local-import.md`：开始任务的说明。
- `docs/guides/tools.md`：replay 核对工具。
- `docs/README.md`：文档地图。
- `README.md`：项目简介不再介绍 P1 合成工程演示，改述正式运行骨架与开始任务。

## 验收标准

- [x] AC-21：[文档影响](../spec.md#文档影响)所列文档已同步，不再把合成演示写成当前构建的一部分；`updated:`、链接与锚点正确。
- [x] AC-19（文档）：`slice-gaps.md` 按 G ID 与代码一致，含 G-02 差异。
- [x] 退役记录列出删除路径、删除前提交与替代模块，锚点稳定。
- [x] 文档链接与锚点检查通过；`pnpm check:compliance` 通过。

## 验证方法

- 本地链接与锚点检查（与 P3-01/P3-02 相同的检查脚本，放在 `local/` 或会话目录中运行）、`git diff` 审阅、`pnpm check:compliance`。
- 不适用浏览器与原版对照。

## 完成证据

2026-10-10，worker `exec-p3-04-15`，基于认领提交 `746f4cf2`。只改文档，不读取 `local/` 或原版内容，不涉及原版对照。

- **工程约定（[README](../../../../engineering/README.md)）：** “合成 Runtime”“合成渲染”“页面流转与演示生命周期”改写为[正式 Runtime](../../../../engineering/README.md#正式-runtime)、[渲染表面与视口](../../../../engineering/README.md#渲染表面与视口)与[页面流转与任务生命周期](../../../../engineering/README.md#页面流转与任务生命周期)；“会话端口与错误”“浏览器生命周期复现”“已验证的 CDP 自动化路线”“UI 投影与指令反馈”“键盘源与输入区”保留标题与锚点，内容改为正式会话、正式 UI 桥接与当前没有输入消费者的键盘源；新增[开发诊断与录制导出](../../../../engineering/README.md#开发诊断与录制导出)。另同步：lint 一节删除 `osr/core-synthetic-boundary` 的说明（改为指向退役记录）；测试入口的 `seeds` 查询键与 `TEST_ENTRY_QUERY` 列表、任务场景名；生产预览的任务流程、生产 DOM 无诊断与产物/source map 的开发模块边界（含 12 的反证）；`missionPackage()` 预置；新增“P3-04 任务流程回归”（mission-flow 两个用例、`mission-observations.ts`、`beforeunload` 取证方法与两条聚焦命令）；native-lifecycle（测试入口导入、`DOM.setFileInputFiles`、`NativeTarget.press`、出发保持中的隐藏、页面内的不补跑界限）；WebGL 降级改在查看器上；joint-resources 的三次任务往返（`WEBGL_lose_context` 一行改由查看器路径覆盖）；P2-12 表的 joint-pipeline.development；Fast Refresh 的任务 hook、任务画面与外壳刷新用例；资源平衡的 `timers` 探针、`timer` 比较、监听分组（`synthetic-view` 删除，离页保护属 `other`，Vite 的 `beforeunload` 属 `vite`）与新增控制样本；Core 回归命令改为 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`。P2-11 的 Fast Refresh 说明已更正：P2-11 时持有者的 effect 只依赖 props，外壳刷新实际不会重跑它；现由记忆化的创建函数重跑，先释放任务槽位再销毁持有者（09 的实测）。
- **模块分册：** [app](../../../../engineering/modules/app.md) 新增正式 Runtime、游戏会话、任务流程与所有者（端口、开始资格、流程、所有者、槽位与收尾、开发帧计时、测试支持），任务载入诊断补充共用的 `mission-input.ts`，查看器槽位改为“导入与任务不受影响”；[ui](../../../../engineering/modules/ui.md) 新增游戏 store/桥接/命令反馈、任务页面与缺省标注、开发诊断；[platform](../../../../engineering/modules/platform.md) 新增任务端口的浏览器适配（核心与浏览器连接的划分、共用与各自释放的实例）与键盘源；[render](../../../../engineering/modules/render.md) 删除合成渲染器与 `SYNTHETIC_SURFACE` 的说明；[core](../../../../engineering/modules/core.md) 删除 `core/synthetic/` 与 `osr/core-synthetic-boundary` 的分类说明，交接中的 P3-04 一项改为“已交付”并指向 app 分册的接口，写明运行中衔接（G-02/3 起）由 P3-10、P3-11 按扩展规则确定，P3-05 一项补充 `clear-input` 与 `primaryFire`。
- **源码结构指南：** [source-structure.md](../../../../engineering/source-structure.md) 的目录树与生产文件逐项一致（脚本比对 `git ls-files` 的非测试文件，差异为 0），模块说明表、职责表（新增 `app/mission/`）、调度与装配、Core 内部目录（去掉类别列）、helper 归属、浏览器测试的验收面（interaction-render、browser-replay、webgl-unavailable 等按 12 更新）与扩展方向同步；P1-06 迁移记录中指向已删目录的链接改为指向退役条目。新增 [P3-04 合成演示退役记录](../../../../engineering/source-structure.md#p3-04-合成演示退役记录)：删除前提交 `84a3f454`、最后内容改动 `87690599`（`git log -1 84a3f454 -- <57 个路径>` 核对）、57 个删除路径（`git diff --name-status 84a3f454 b9279121` 核对）按条目列出与替代模块，以及不在删除范围内的设施。供 16 使用的条目锚点：`#r1-合成-core`（`src/core/synthetic/`）、`#r2-合成渲染`（`src/render/synthetic/`）、`#r3-合成-runtime`（`src/app/runtime/synthetic-*`）、`#r4-合成会话`（`src/app/session/synthetic-session*`）、`#r5-演示所有者与槽位`（`src/app/composition/` 的演示所有者、槽位与 hook）、`#r6-合成-ui-层`（`src/ui/game/synthetic-*`、`use-synthetic-game.ts`）、`#r7-演示页面开发面板与画面`（`SyntheticDemoPage.tsx`、`SyntheticDevPanel.tsx`、`SyntheticRenderView.tsx` 与 `src/ui/render/`）、`#r8-e2e-演示观察`（`e2e/support/demo-observations.ts`）、`#r9-lint-规则-osrcore-synthetic-boundary`、`#r10-菜单入口键位与工程文档`（含工程约定中改名小节的旧锚点）。
- **键位文档：** [keyboard-input.md](../../../../engineering/keyboard-input.md) 写明当前构建没有游戏键绑定（原版键位由 P3-05 加入），§2 为任务流程的项目页面按键（占位的 Enter/Space/Esc、repeat 抑制、入口的 repeat 抑制）与保留的查看器诊断键，§3 为保留的平台键盘源通用规则，§4–§6 为 P3-05 接入时的焦点、拦截与清键约定（会话的 `clear-input`），§7 中的 `beforeunload` 离页确认改为已实现；锚点 `#1-适用范围`、`#2-当前绑定表`、`#3-平台键盘源的通用规则`、`#7-尚未实现的键盘能力`、`#资源查看器的诊断键p2-11` 保留。
- **指南：** [本地导入指南](../../../../guides/local-import.md)新增“开始任务”（条件、流程、隐藏与离页、开发服务器的诊断与录制），状态表、失败表与隐私边界同步；[工具指南](../../../../guides/tools.md)新增“录制重放核对”：用法、读取方式、上限 225,969,791 字节的推导表（1,621 + 131,072 × 124 + 262,144 × 107 + 524,288 × 336 + 131,073 × 42，与 `recordingSizeBound()` 的输出一致）、核对顺序、报告形状、封闭错误码与位置、退出码 0/1/2，并引用 14 的 AC-17 行作为 CLI 的真实内容成功路径。
- **缺省清单：** 新增 [slice-gaps.md](../../../../engineering/slice-gaps.md)，按 G ID 记录 G-01、G-02/1、G-02/2、G-04、G-06（重开与返回）、G-07 的呈现与位置（页面、测试 ID 与代码），与 `SLICE_GAPS` 的键和页面中的 `GapNote` 一致（脚本比对：代码与文档都是这 6 个 ID），含 G-02 不计时与基准设置的差异，链接 [Core 已知差异](../../../../engineering/modules/core.md#已知差异)与 B-003；已加入[文档地图](../../../../README.md)。根 [README](../../../../../README.md) 的简介改述正式运行骨架与 `Start mission`，不再介绍 P1 合成工程演示，不新增法律保证。
- **检查：** `node /tmp/p304-check-links.ts` 对全部改动文档、`docs/README.md` 与根 README：846 个链接，0 个失败。全仓库对比改动前后：失败从 476 降为 457（修复 25 个，都是工程文档中指向已删源码的链接）；新增 6 个历史锚点失效，都指向改名的工程约定小节（`#合成-runtime`：p1/04/subtasks/04、05，p1/05/subtasks/02，p3/04/spec.md；`#合成渲染`：p1/07/subtasks/07；`#页面流转与演示生命周期`：p1/09/spec.md），在本项写入范围外，已在 worker 报告中建议由 16 改指向 `#r10-菜单入口键位与工程文档`。`pnpm --silent check:compliance` 退出 0（`passed: true`，0 个发现）；`git diff --check` 通过；每份改动文档的 `updated:` 为 2026-10-10。只改文档，未运行 `pnpm check`。
- **rubber-duck：** 无阻塞问题；五项非阻塞建议均已采纳：开发面板只提交单个命令、连续意图没有输入来源；`FileSaveResult` 按实际的两种 status 与原因描述；任务菜单的 `Continue` 获焦后仍可用 Enter/Space 原生激活；退役记录改为“由 16 改指向”；E2E 验收面的总括句不再覆盖 bootstrap 与 browser-replay，并补充两者的描述。
- **文档影响：** 本项即文档同步。`docs/STATUS.md` 与 `docs/plan/p3/tasks.md`（“代码现状”仍写页面流转含合成演示）的建议见 worker 报告；没有原版事实或 unknowns 的变化。
