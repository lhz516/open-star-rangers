---
type: plan
status: active
phase: P3
task: "13"
subtask: "08"
updated: 2026-10-28
---

# 08 — D-01 输入、内容与预算定稿

**契约来源：** [spec](../spec.md#共享契约修订d-01) 的 S-01，AC-01/02/03/06/09/18。
**依赖：** 07。
**执行方式：** 需用户：批准尚未形成的共享合同；agent 先完成精确草案，推荐授权不替代未定合同审批。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 为仪表调度 payload、同 tick `TickOutput.projection`、statusDisplay.blink、满刻度/目标变体/标签威胁等定稿确切类型、单位、输入来源和消费者。
- 明确 slot 7 无图像的表达与 slot 2 同源几何、有限静态参数，禁止导入运行期指针/计时；决定是否需要布局 schema 变化。
- 固定消息/文字/历史/CPU/GPU 上限、雷达容量策略、格式失败与包校验/缓存恢复/版本影响；保留单事件通道和整批输入拒绝语义。
- 同步右键双调用与 ready 握手、G-05 项目消息策略以及受影响上游合同；计划中的文件名/写入范围若需调整，由协调者在认领实现前核对。

## 不包含

不写产品代码，不批准新的原版差异或省略证据，不修改已完成 goal/subtask 证据。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)、[game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)。
- [map-input.ts](../../../../../src/ui/game-input/map-input.ts)、[layout-payload.ts](../../../../../src/content/graphics/layout-payload.ts)。

## 写入范围

- `docs/plan/p3/02/spec.md`：Core 只读事实合同。
- `docs/plan/p3/03/spec.md`：补充导入与版本。
- `docs/plan/p3/04/spec.md`：Runtime 批次/生命周期。
- `docs/plan/p3/05/spec.md`：输入与绘制 ready。
- `docs/plan/p3/09/spec.md`：map 读模型/零能量反馈。
- `docs/plan/p3/10/spec.md`：基地项目消息呈现。
- `docs/plan/p3/13/spec.md`：D-01 完整合同和批准记录。

## 验收标准

- [x] 所有必需输入与预算有封闭定义，非必需候选以可推导性证据撤销。
- [x] 逐 tick 数据、错误前缀/拒绝、版本与旧缓存恢复一致，无猜测 fallback。
- [x] 上游同步获得适用批准；仍未批准的部分不能作为实现前提 completed。

## 验证方法

合同对实际类型、原版事实和合成验证矩阵逐项核对，检查链接/metadata；不得以只写方向或“将来决定”通过关卡。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-08`，基线 `22b77e4c`。只改文档；未启动 DOSBox-X、未运行 Ghidra 或应用构建。依据为 01–07 的完成证据（07 的 D-01 候选汇总与“spec 行为/契约更正”）、[cockpit](../../../../original/formats/cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301)、[hud §4](../../../../original/formats/hud.md#4-instrument-overlay-and-map-drawing-p3-13)、[D9](../../../../original/formats/executable.md#d9-status-display-writes-subsystem-fields-1-5-and-8--confirmed-code)、[T7](../../../../original/formats/executable.md#t7-right-target-display-confirmed-code) 与[地图鼠标](../../../../original/formats/executable.md#map-mouse-input-p3-0503)，以及实际代码：`projection.ts`、`combat.ts`、`map.ts`、`player-state.ts`、`systems/displays.ts`、`rules/displays.ts`、`rules-version.ts`（`RULES_VERSION` 9）、`snapshot.ts`（快照 8）、`recording.ts`（replay 3）、`game-runtime.ts`（`TickOutput`、`#tick`）、`layout-payload.ts`、`map-geometry-payload.ts`、`map-rule-data.ts`、`entity-table.ts`、`load-transforms.ts`、`map-input.ts`、`slice-definition.ts`（6）、`convert-graphics.ts`（`graphics-5`）、`production-graphics.ts` 与 `flight-render-error.ts`。D9 的次序另以 03 的私有 `findings.md` 核对（`0x4d0e0` 先写后翻转、标志初值 1）。P3-14 的 FA-01/FA-03 在分支 `p3-14-flight-sound-spec`（`5a662042`）上只读核对，main 仍为 `communications.player.warnings`。

**定稿（按协调者 2026-10-28 的决定，均为推荐方案）：**

- **P3-13 spec：** 新增 [D-01 定稿](../spec.md#d-01-定稿08)（DC-01 至 DC-13）：仪表调度 payload（DC-02，含 EXE 的观察距离表）、同 tick projection 的消费（DC-03）、封闭的逐 tick 输入与整批校验和具名派生随机流（DC-04）、640×480 后备面与送屏面的原版复制模型（DC-05）、状态页与能量页的重组（DC-06）、消息行与 G-03（DC-07）、限值表（DC-08）、地图右键双调用/ready/几何原点/代价文字/零能量（DC-09）、F1 叠加与右显示屏（DC-10）、差异 Δ-04 至 Δ-09（DC-11）、撤销项（DC-12）与关卡项（DC-13）。按 07 的结论以“D-01 修订”最小更正：雷达（Warp、节奏、无十字、0.5r 四段弧）、角落异形条、按视角的可见保留（S-02、调度、地图重绘、AC-08）、类型 9 闪烁不共享（S-08、指示条、D-02 表）、G-03 参数、地图标签/代价/右键、Q-13 汇总两处、不包含的自动驾驶一条、表现层契约的推进输入、AC-01 的撤销项，以及与 P3-14 的关系（FA-01 合并说明、FA-03 同名字段、07 的 9 型可达性信息）。
- **P3-02：** 新增“P3-13 的契约修订（D-01）”CK-01 至 CK-07：CR-10 次序照原版更正（`phaseFlipped`、`rebuilds`）、能量页计数 `energyPageRedraws`、projection 增补、撤销项、`RULES_VERSION` 9 → 10、快照 8 → 9、replay 3 不变。
- **P3-03：** 修订 4：角色 `cockpit-instruments`、切片定义 6 → 7、`graphics-5` → `graphics-6`、`payloadBytes` 8,192、旧缓存须重新导入。
- **P3-04：** `TickOutput.projection` 的形状、来源、批次与故障矩阵。
- **P3-05：** 右键电平与 ready 凭证、几何原点的同步段，绑定表右键一行，已知差异更新。
- **P3-09：** `map` 分区三项增补、零能量显示、无图标代价文字、信息行零满刻度。
- **P3-10：** 基地页读同一队首与当前来电摘要。
- 七份 spec 的审批区由协调者于 2026-10-28 依用户同日的授权记录批准（见各 spec 审批区），第三项验收随之勾选。

**检查：** 七份 spec 逐一运行会话链接检查脚本：P3-02、04、09、10、13 为 `bad 0`；P3-03（`textures.md#encoding-1-animation-unconfirmed`）与 P3-05（`keyboard-input.md#7-尚未实现的键盘能力`）各 1 个坏锚点，均在基线即存在（`git stash` 后复查相同），不是本次引入。`git diff --check` 通过。`node tools/compliance/cli.ts original` 的 index 与 worktree 两个范围各检查 1,903 个文件、无发现，build 范围因没有构建产物报 ENOENT（只改文档，未构建）。front matter 的 `updated` 均为 2026-10-28。跟踪文档只含地址、结构、代码常量、计数与公式，没有原版字节、文字、图像或反编译内容。

**Rubber-duck：** 环境没有专门的 rubber-duck 代理，用只读 code-review 代理按 rubber-duck 要求对照验收、协调者决定、01–07 证据、原版文档与代码审阅一次。它确认 CK-01 次序与 03 的私有核对一致，版本号、DC-08 的算术、DC-09 的 16 tick 节奏与带入计数公式、15 个 G-03 序号、FA-03 同名同义、CK-03 的来源都正确；提出 7 条与 1 处次序歧义，全部采纳：① 页 0 重组的相位改为写入时（上一 tick）的 `blink`（CK-01 先写后翻转）；② 右显示屏的观察距离表（EXE 数据 `0x175424`，20 个 f32）随 `data/hud/instruments` 导入，其余常量按技术决定 6 为具名代码常量；③ 调度、地图重绘与表现层契约的推进输入三处仍是旧模型，已按 DC-04/DC-05 更正；④ DC-04 改为输入值同源、读取路径由 D-02 决定，不改技术决定 8 与 AC-14；⑤ AC-01 的“目标变体”改为撤销项；⑥ 失去资格清右键电平补为 Δ-09，并同步 P3-05 的已知差异；⑦ P3-09 同步段中“P3-11 接入前不可达”改为由 22 核实可达性；次序歧义：地图读取调用改为调度之前的独立一步。

**文档影响：** 只改上述 spec 与本文；原版事实没有新增（DC-13 的两项核对由 12、21 在实现前写入 `docs/original/`）；`docs/STATUS.md`、阶段 `tasks.md` 与工程文档无需本项修改（实现子任务各自更新模块说明）。
