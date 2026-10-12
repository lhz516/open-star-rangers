---
type: plan
status: active
phase: P3
task: "05"
subtask: "37"
updated: 2026-10-12
---

# 37 — AC-18 实机残余证据

**契约来源：** [spec](../spec.md) AC-18、AC-09、AC-14；[验证策略](../spec.md#验证策略)。
**依赖：** 30、31、36。
**执行方式：** 需用户：工具不能覆盖的物理按键/系统快捷键路径，先尝试可验证的 Computer Use 原生路径。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用 36 的生产绑定入口，核对原生未锁 Escape 关闭地图；不声称合成上下文证明生产 Core 地图门禁。
- 对既有 Option/方向键/开火记录逐项核对，仅对仍缺有效归因的组合补最小实机操作。
- 核对实际 Keyboard Lock 路径与解除后原生 Cmd/Ctrl 行为；API 申请/内部状态不是实际拦截证明。先核实工具原生快捷键正对照，无法覆盖时请求物理操作。
- 保留 30/31 已取得证据与限制；无证据时明确 blocked，不豁免 AC-18。

## 写入范围

- `docs/engineering/keyboard-input.md`：实机证据段落。
- `local/research/p3-05/real-device/**`：合成画面、原生操作与 replay 记录，不入库。

## 验收标准

- [x] AC-18 的未锁地图 Escape 有原生输入与关闭结果。
- [x] Keyboard Lock 实际获得/解除及解除后的非游戏快捷键有可区分证据。
- [x] Option/方向键/开火并用各必需项有真实操作、实际结果与归因；原有 Fn/操纵证据完整保留。
- [x] 文档明确区分物理输入、Computer Use、浏览器合成事件与 Core 模拟上下文；无法取得的项不标通过。

## 验证方法

- 原生快捷键正对照、逐项操作与只读观察；必要时用户物理操作。

## 完成证据

- **2026-10-12，原生未锁地图 Escape：** macOS Chrome 自有无痕窗口，origin `http://127.0.0.1:5251`，36 的入口 `/e2e/entries/map-input.html?manual=1`，生产绑定、合成上下文/几何，Pointer Lock 为 `unsupported`。先用 Computer Use 原生 Cmd+L 核对地址栏选中完整 URL，再打开地图、聚焦 Game controls，发送原生 Escape 后刷新只读观察：context `flight`、map `off`，唯一命令为 `toggle-map`（id 1、clock 1362、frame 2555），无 `open-menu`，errors `[]`。关闭 test session 后 phase 为 `null`。这证明该原生输入路径与生产绑定的关闭效果，不证明下游生产 Core 地图规则，也不把页面合成 Escape 等同于浏览器原生解锁。
- **2026-10-12，Keyboard Lock 获得/解除的原生功能对照：** 同一自有 Chrome 无痕窗口，通过正常 UI 导入代码生成的两份 `mission-startable` 合成光盘文件，进入任务并以 Start 进入 document fullscreen；Departure 的普通 “To exit full screen, press esc” 提示不计为锁已获得证据。Running 且焦点在 Game controls 时，Computer Use 原生 Cmd+L 后焦点仍为 Game controls，地址栏没有被选中；随后在同一区域发送 `p`，观察 `Paused` / `Paused by you`，document fullscreen 仍在。此时以同一路径发送 Cmd+L，Chrome 地址栏选中完整的本次 URL；再发送 Cmd+T，实际打开第二个 `New Incognito Tab`。暂停前后的同码快捷键对照提供实际拦截与恢复证据，不依赖 API 可用性、内部申请成功或全屏提示推断。它只覆盖本机 Chrome 的 Computer Use 原生路径，不外推所有 OS 全局快捷键；31 的用户物理输入记录仍单独保留。没有出现 Keyboard Lock 权限提示，也没有接受新的浏览器权限。
- **物理 Option/方向键/开火：** Computer Use 无法以单个 chord 持续保持多个非修饰键，因此由用户在同一正常任务中逐组按住左 Option+方向键约两秒、期间轻点一次 Space、再全部松开；没有用短 chord 或合成事件代替。五份导出 `osr-recording-f70ba39ec6084efa-1471920519-{2837,8469,20302,24718,28218}.json` 留在忽略的本地证据目录，2837 为组合操作前的基线锚点；核验所有 header、finalTick、tick 长度及相邻精确前缀一致。以下通过样本中 secondary 均落在 primary 区间，所有轴为 0，松开后的 tick/组间无开火命令。

| 方向 | 导出 finalTick | primary 区间（tick 数） | 单次 secondary tick | 视角结果 |
|---|---:|---|---:|---|
| ↑ 单独复测 | 20302 | 19630–19756（127） | 19722 | 唯一 `cockpit-front` 在 19636 |
| ↓ | 24718 | 23468–23568（101） | 23530 | 用户确认本组临时 G-08；无其他 Core 命令 |
| ← 单独复测 | 28218 | 27529–27632（104） | 27608 | 用户确认本组临时 G-08；无其他 Core 命令 |
| → | 24718 | 24035–24157（123） | 24114 | 用户确认本组临时 G-08；无其他 Core 命令 |

- **不合格尝试保留：** ↑ 首次在 8469 中有 primary 7796–7909（114）和 `cockpit-front` 7810，但缺 secondary；用户确认曾按 Space，随后关闭 Codex 并重测成功，不能据此确认 Codex 是原因。← 初次有 primary 23764–23880（117）和 secondary 23852、23855，不能把两个相隔三 tick 的请求解释为已确认的正常重复；以单独复测取得一次 Space 的合格归因，原尝试未删除。31 的 Fn、操纵矩阵、持续释放与当时局限完整保留，不追溯改写为本次证据。
- **清理：** 最后一份由用户点击原生 Save 保存，文件读回与上述断言通过。用户批准 Leave 后，复读确认任务标签已关闭，仅剩本次空白无痕标签；关闭该标签的原生操作确认窗口回收。停止自有 `p305-37-dev`，只移除本次两份合成光盘文件，保留 replay/私有报告；没有操作其他浏览器窗口、DOSBox-X 或用户存储。
- **审阅与文档：** scoped rubber-duck 核对五份 replay 与原生/物理证据，无证据或行为阻断项；其 tracker 同步意见在提交前落实，并补明 2837 的基线用途。键位指南追加 37 的当前结果，保留 30/31 历史限制；其他工程、原版与架构文档无新事实或行为变更。相对链接/锚点、元数据和 `git diff --check` 通过；无实现改动，不需 simplify 或应用构建。
