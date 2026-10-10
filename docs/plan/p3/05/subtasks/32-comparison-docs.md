---
type: plan
status: active
phase: P3
task: "05"
subtask: "32"
updated: 2026-10-10
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

- [ ] R-23 的离散对照与已知差异写入键位文档与 core 已知差异；项目选择各有理由。
- [ ] 键位文档与 19 的绑定表逐项一致；模块说明、源码结构与工程约定已同步。
- [ ] 下游交接项明确；P3-07 链接状态已处理。
- [ ] 改动文档的链接与锚点可解析；`pnpm check` 与 `pnpm check:compliance` 通过。

## 验证方法

- 以脚本把键位文档的绑定条目与 `bindings.ts` 对照；链接检查；`pnpm check`、`pnpm check:compliance`。

## 完成证据
