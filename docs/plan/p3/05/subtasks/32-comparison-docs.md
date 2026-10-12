---
type: plan
status: active
phase: P3
task: "05"
subtask: "32"
updated: 2026-10-12
---

# 32 — R-23 对照、文档同步与下游交接

**契约来源：** [spec](../spec.md) 的 S-15，[对照（R-23）](../spec.md#对照r-23)、[文档影响](../spec.md#文档影响)、[执行前提](../spec.md#执行前提)“地图交接”与 P3-07 链接；AC-19，以及 AC-02 的“文档与代码逐项一致”。
**依赖：** 07、26、27、28、29、30。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **R-23 离散对照：** 每个原版条目的物理位置、Shift 语义与动作与 Q-01–Q-04 逐项核对；Q-05 样本标明证明的是“物理键到码”还是“码到动作”；已选的浏览器兼容差异单列。项目选择（操纵键、Ctrl 路由、可重复集合与 32/16 节奏、`p`/Esc、地图光标换算与回退）写明理由。已知差异：逐 tick FIFO 而非 DOS 单键轮询/丢键；帧后有界重复而非 BIOS 重复（引用 07 的 Q-06 结论）；上下文切换不保留手动输入；Alt 可与其他动作并用；被毁序列仍可宿主暂停；Esc 的浏览器语义；地图与基地有效轴归零（沿用 P3-06 的披露）。比对中若发现超出已批准取舍的玩法/节奏改变，阻塞相应 AC 并交协调者，不只写“已知差异”。
- **[键位文档](../../../../engineering/keyboard-input.md)：** 成为正式绑定的权威说明，逐键区分原版事实、项目选择与暂缺标注，与 19 的绑定表逐项一致；写明焦点、拦截、清键、地图、全屏与提示的当前实现；§7 中已实现的能力移出；保留 31 写入的实机段落。
- **模块与工程文档：** [platform](../../../../engineering/modules/platform.md)、[ui](../../../../engineering/modules/ui.md)、[app](../../../../engineering/modules/app.md)、[core](../../../../engineering/modules/core.md)（`speed-preset`、版本与已知差异）、[render](../../../../engineering/modules/render.md) 模块说明；[源码结构指南](../../../../engineering/source-structure.md)；[工程约定](../../../../engineering/README.md)（键盘源与输入区、测试入口的新查询键、新 e2e 用例与聚焦运行命令、资源平衡的新监听分组）。
- **P3-07 链接：** P3-07 已合入时，把 04 写下的交叉引用改为指向同一事实记录的正式链接，不复制正文；未合入则保留并在证据中注明。
- **下游交接：** 在键位文档中写明交给 P3-09（Core 同 tick 地图门禁）、P3-10（通讯菜单捕获与优先级、规则 5 的阻塞项）、P3-13（生产几何、光标合成与原版指针外观）、P3-15（完整地图路径与输入层/Core 的联合复验）的具体项。
- 更新所有改动文档的 `updated:`。

## 不包含

- 原版事实本身（04–07）；P3-01/P3-02/P3-04/P3-06 spec（09–11）；slice-gaps（24）。

## 关键文件与契约

- [keyboard-input.md](../../../../engineering/keyboard-input.md)、[modules/](../../../../engineering/modules/)、[source-structure.md](../../../../engineering/source-structure.md)、[README.md](../../../../engineering/README.md)、[key-map.md](../../../../original/input/key-map.md)、[executable.md](../../../../original/formats/executable.md)。
- 输入：19 的绑定表、04–07 的事实、27–30 的验证结果。

## 写入范围

- `docs/engineering/keyboard-input.md`
- `docs/engineering/modules/**`
- `docs/engineering/source-structure.md`、`docs/engineering/README.md`
- `docs/original/input/key-map.md`、`docs/original/formats/executable.md`：P3-07 链接的更正。

## 验收标准

- [x] R-23 的离散对照与已知差异写入键位文档与 core 已知差异；项目选择各有理由。
- [x] 键位文档与 19 的绑定表逐项一致；模块说明、源码结构与工程约定已同步。
- [x] 下游交接项明确；P3-07 链接状态已处理。
- [x] 改动文档的链接与锚点可解析；`pnpm check` 与 `pnpm check:compliance` 通过。

## 验证方法

- 以脚本把键位文档的绑定条目与 `bindings.ts` 对照；链接检查；`pnpm check`、`pnpm check:compliance`。

## 完成证据

- **文档同步：** 重写键位指南，加入 P3-05 正式生产绑定、上下文/修饰与小键盘状态、输入区、focus 与默认行为拦截、能力生命周期、地图输入/光标、`GameInputConsumer.clear(reason)` 唯一清键通道及 FIFO/重复等明确差异；补入 27 headless Pointer Lock/CDP 与 movementX 限制、29 常驻焦点提示槽、30 Computer Use 实测边界、31 物理设备待办占位与 34 阻塞的 Q-05 基地样本。Core 与 app/platform/ui/render 模块说明、源码结构及工程约定已同步到现行消费者与责任边界。
- **下游与交叉引用：** 键位指南具体列出 P3-09（同 tick 地图门禁）、P3-10（通讯捕获/优先级、规则 5 阻塞、基地规则）、P3-13（生产几何/光标/原版外观）、P3-15（完整地图路径联合复验）。`p3-07-weapons-damage-spec` 不在本分支祖先中；键位表、原版键位表与 executable 事实链接保留原分支及 `589d780b` 提交交叉引用，没有复制事实或暗示已合入。
- **证据限制：** 30 的结果只标明本机 macOS Chrome Computer Use 实际观察到的系统快捷键与 Escape Pointer Lock 退出；27 的 CSS 像素结论明确限于 CDP 注入鼠标，不代替物理设备。31 仍等待用户完成实机项；Q-05 基地运行样本在 34 仍 blocked，未勾销或声称 AC-18/Q-05 完成。
- **检查：** `pnpm check` 通过：4 个 TypeScript 项目 typecheck、ESLint、243 个 Vitest 文件/7,305 项测试与 production build 均成功；构建只报告现有的大 chunk 提示。`pnpm check:compliance` 通过（compliance 报告 `passed: true`）。对 9 份变更文档逐一核对相对 Markdown 目标与标题锚点，均存在；`git diff --check` 通过。所有改动文档的 front matter `updated` 为 `2026-10-10`。
- **2026-10-12 验收勾选收尾：** 38 以生产绑定、键位指南、模块/源码/工程说明及上述实际检查逐项核对，补勾四条验收；没有把勾选当作新运行证据。修正指南中 `KeyP` 错误排除 Alt 的措辞（项目 Alt 本就独立并行）和 `Numpad2` 的 G-08 上下文名称；逐 code 检查发现漏列 `NumpadDivide`，补入现有绑定，同时明确 `KeyS`/`KeyG` 的 Shift 增减语义，没有改实现。P3-07 的 `589d780b` 仍不是本分支祖先，保留交叉引用；31 当时的限制保留，当前实机缺口和基地缺口分别由 37、34 的后续证据处理。`pnpm check:compliance` 本次重跑通过；最终完整工程/e2e 检查仍由 33 执行。
