---
type: plan
status: accepted
phase: P3
task: "13"
updated: 2026-10-28
---

# P3-13：Classic 驾驶舱、HUD/MFD 与地图画面 — Goal

## 目标与来源

实现已批准 [spec](./spec.md) 的 S-01 至 S-14、AC-01 至 AC-25：前视驾驶舱、HUD/MFD、消息行、战略地图及生产输入接线，取得合成浏览器与私有原版对照证据。本文件只分配工作，不重新定义行为、容差或批准例外。

## 代码现状与前提

- 基线 `004278af`，P3-09 至 P3-12 已合入，见各 [09](../09/goal.md)、[10](../10/goal.md)、[11](../11/goal.md)、[12](../12/goal.md) goal。当前无 `src/render/cockpit/`；本文中的该目录及 `instruments-payload.ts`、`cockpit-content.ts` 等均为**计划新增**，最终名由 08 的完整合同固定。
- [game-runtime.ts](../../../../src/app/runtime/game-runtime.ts) 每 tick 已提取冻结 projection，却只在 `TickOutput` 留 render/events；13 保留同 tick 引用。[projection.ts](../../../../src/core/projections/projection.ts) 已有 motion/combat/map/communications，12 补齐 spec 要求的相位、满刻度/目标及威胁读数，不改变规则。
- [layout-payload.ts](../../../../src/content/graphics/layout-payload.ts) 只有元素图像/位置，10–11 定向补充调度元数据；[map-geometry-payload.ts](../../../../src/content/hud/map-geometry-payload.ts) 已有主地图来源，不能建立第二份独立几何。
- [flight-run.ts](../../../../src/render/flight/renderer/flight-run.ts)、[flight-layers.ts](../../../../src/render/flight/composition/flight-layers.ts) 已有运行和 cockpit 槽；24 唯一拥有应用/运行装配的热文件改动。各绘制项写各自子目录，不能各改 `wireFlightRun`。
- [map-input.ts](../../../../src/ui/game-input/map-input.ts) 已有输入政策与 ready 握手，[use-mission-owner.ts](../../../../src/app/composition/use-mission-owner.ts) 的几何仍为 null；23 交付端口，24 接生产。25 扩展 [BasePage](../../../../src/ui/mission/BasePage.tsx) 及 G-03 文案/桥接，不新增台词导入。
- **地图架构前提已满足：** [ADR-0019](../../../decisions/ADR-0019-strategic-map-render-pipeline.md)、总计划和 P3-09 已同步；spec 明确批准。08 的 D-01 与 09 的 D-02 **尚未定稿**，依赖它们的实现不得提前开始。
- **P3-14 外部接口：** 分支 `p3-14-flight-sound-spec` 的 `5a662042` 是已核对的合同来源，不是本 checkout 已有实现。09 须取得其 D-02 与本 spec 一致的批准记录；21、24、26–29 需要 P3-14/14 的真实共享模型及 FA-01/必要 FA-02 已可在执行基线导入。由 P3-14 拥有模型，本任务不复制；缺少则阻塞对应项，不要求对方整个 goal 完成，也不自行切换或合并分支。
  **2026-10-28 D-02 修订：** [D-02 定稿](./spec.md#d-02-定稿09)证明锁定/警告的声音与绘制之间没有共同状态，不建共享模型；21、24、26–29 不再需要 P3-14/14 的模块，只读同 tick projection。警告现读 main 的位置，P3-14 合入时按 DD-02 切换。
- **版本与恢复：** 起点 rules 9、snapshot 8、replay 3、slice 6、converter `osr-import.graphics-5.logic-4.audio-2.models-4`。以执行基线和 08 的版本合同为准；恢复旧缓存只能重新导入，不自动清用户缓存。
- **证据与环境：** 原版依据见 spec Q-01 至 Q-13、[hud](../../../original/formats/hud.md)、[cockpit](../../../original/formats/cockpit.md)、[B-001](../../../original/behavior/B-001-strategic-map.md)。优先复用现有截图/研究，目标零新增 DOSBox；必需缺口按[证据指南](../../../guides/original-evidence.md)最小补采，不自动豁免。原版字节、图像和逆向输出仅在 `local/`，公共测试只用合成内容。
- 验证命令已有 `pnpm test -- <文件>`、`pnpm check`、`pnpm test:e2e`、`pnpm check:compliance`；工具脚本按[工程约定](../../../engineering/README.md)及[工具指南](../../../guides/tools.md)使用。新增测试路径在文件落地后才可运行；缺依赖再按工程指南恢复，不在本次生成中安装或执行。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 08、10–13 | 26 契约/replay；30 导入核对 |
| S-02 | 14、16–22 | 各项 Node；26 分组一致性 |
| S-03 | 15 | 15 精确像素；27–28 浏览器 |
| S-04 | 16、24 | 27 布局与调度；31 静态像素 |
| S-05 | 16 | 16 独立投影/容量；27、31 |
| S-06 | 17–19 | 27 各页/干扰；31 元素对照 |
| S-07 | 20 | 27 目标场景；31 对照 |
| S-08 | 18、19、21 | 26 有序事件/共享提示；27–28 |
| S-09 | 21 | 27 视角/目标框；31 |
| S-10 | 22 | 28 地图像素；31 |
| S-11 | 23、24 | 28 生产输入；29 资格失效 |
| S-12 | 24–25 | 27–29 UI/资源/恢复 |
| S-13 | 01–07、31–32 | 32 分列规则/外观/节奏结论 |
| S-14 | 33 | 34 文档与交接核对 |
| AC-01 | 08、12–13 | 26 真实链及版本拒绝 |
| AC-02 | 10–11 | 30 独立读取；28 缓存恢复 |
| AC-03 | 13–14 | 26 1×5/5/2+0+3、故障批次 |
| AC-04 | 14、24 | 26 Core 与 P3-12 RNG 不变 |
| AC-05 | 15 | 15 像素/边界；27–28 |
| AC-06 | 15、18 | 27 文案、32 合规来源 |
| AC-07 | 16、22、24 | 31 预注册静态掩码/截图 |
| AC-08 | 14、16–22、24 | 27–28 视角与到期 |
| AC-09 | 12、16 | 16 独立期望；27、31 |
| AC-10 | 17–19 | 27 页0–6；31 |
| AC-11 | 18、25 | 27 F1/Warp/基地来电 |
| AC-12 | 20 | 27 目标/干扰；31 |
| AC-13 | 18、25 | 26 绘制前后事件；27–28 |
| AC-14 | 09、19、21、24 | 26–27 真实驾驶舱表现模块（D-02 定稿） |
| AC-15 | 21 | 27 叠加/被毁；31 |
| AC-16 | 22 | 28 图元/语义；31 |
| AC-17 | 23–24 | 28 输入序列和实际锁定 |
| AC-18 | 14、20、23–25 | 29 预算/深度/恢复/释放 |
| AC-19 | 24 | 27–29 整屏闪光与缩放 |
| AC-20 | 25 | 27–28 正确区域/标注；33 |
| AC-21 | 01–07 | 32 原版事实与 U 项；34 |
| AC-22 | 07、32 | 31 证据资格；32 逐元素判定 |
| AC-23 | 24–25 | 31 私有真实流程（含被毁） |
| AC-24 | 33 | 34 链接/接口与移交 |
| AC-25 | 各实现项 | 26–30 针对性检查；34 最终工程证据 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。实际前提是下表依赖和外部接口证据；写入范围冲突交调度器串行，不因同写文件额外制造依赖。执行结果写各 subtask；本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-layout-scheduling-research.md](./subtasks/01-layout-scheduling-research.md) | — | completed |
| [02-gauges-radar-research.md](./subtasks/02-gauges-radar-research.md) | — | completed |
| [03-left-display-research.md](./subtasks/03-left-display-research.md) | — | completed |
| [04-target-overlay-research.md](./subtasks/04-target-overlay-research.md) | — | completed |
| [05-messages-text-research.md](./subtasks/05-messages-text-research.md) | — | completed |
| [06-map-presentation-research.md](./subtasks/06-map-presentation-research.md) | — | completed |
| [07-evidence-contract-baseline.md](./subtasks/07-evidence-contract-baseline.md) | 01, 02, 03, 04, 05, 06 | completed |
| [08-shared-contract-gate.md](./subtasks/08-shared-contract-gate.md) | 07 | completed |
| [09-shared-audio-contract-gate.md](./subtasks/09-shared-audio-contract-gate.md) | 08 | completed |
| [10-instrument-content-payload.md](./subtasks/10-instrument-content-payload.md) | 08 | completed |
| [11-graphics-import-wiring.md](./subtasks/11-graphics-import-wiring.md) | 10 | in-progress |
| [12-core-hud-read-models.md](./subtasks/12-core-hud-read-models.md) | 08 | completed |
| [13-runtime-tick-projection.md](./subtasks/13-runtime-tick-projection.md) | 08 | completed |
| [14-cockpit-presentation-foundation.md](./subtasks/14-cockpit-presentation-foundation.md) | 10, 12 | in-progress |
| [15-indexed-raster-font-text.md](./subtasks/15-indexed-raster-font-text.md) | 10 | completed |
| [16-cockpit-gauges-radar.md](./subtasks/16-cockpit-gauges-radar.md) | 14, 15 | pending |
| [17-status-energy-interference.md](./subtasks/17-status-energy-interference.md) | 14, 15 | pending |
| [18-communications-messages.md](./subtasks/18-communications-messages.md) | 14, 15 | pending |
| [19-warp-display.md](./subtasks/19-warp-display.md) | 14, 15 | pending |
| [20-target-display.md](./subtasks/20-target-display.md) | 14, 15, 17 | pending |
| [21-flight-overlay-cues.md](./subtasks/21-flight-overlay-cues.md) | 09, 14, 15 | pending |
| [22-map-picture.md](./subtasks/22-map-picture.md) | 14, 15 | pending |
| [23-map-input-geometry.md](./subtasks/23-map-input-geometry.md) | 22 | pending |
| [24-run-composition-wiring.md](./subtasks/24-run-composition-wiring.md) | 11, 13, 16, 17, 18, 19, 20, 21, 23 | pending |
| [25-ui-bridge-gaps.md](./subtasks/25-ui-bridge-gaps.md) | 18, 24 | pending |
| [26-replay-contract-integration.md](./subtasks/26-replay-contract-integration.md) | 25 | pending |
| [27-browser-cockpit.md](./subtasks/27-browser-cockpit.md) | 25 | pending |
| [28-browser-map.md](./subtasks/28-browser-map.md) | 25 | pending |
| [29-browser-lifecycle.md](./subtasks/29-browser-lifecycle.md) | 27, 28 | pending |
| [30-real-content-import.md](./subtasks/30-real-content-import.md) | 11 | pending |
| [31-real-content-pictures.md](./subtasks/31-real-content-pictures.md) | 27, 28, 30 | pending |
| [32-presentation-verdicts.md](./subtasks/32-presentation-verdicts.md) | 07, 26, 29, 31 | pending |
| [33-documentation-handoff.md](./subtasks/33-documentation-handoff.md) | 32 | pending |
| [34-final-alignment.md](./subtasks/34-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33 | pending |

34 为最终验证，永远最后且不交付功能代码。发现缺口时新增更大 ID 的修复项、插在 34 之前并加入其依赖，不重用或重排既有 ID。

允许的并行机会（不是固定批次或执行授权）：01–06 的独立私有研究可并行；08 之后 10/12/13 可并行，09 是协调者批准关卡；14/15 后各仪表子目录可并行；26/27/28 可独立验证，30 可在导入完成后提前核对。实际 wave 由 `task-state` 按当前 tracker 与写入范围计算。

## 执行记录

## 审批

用户于 2026-10-25 明确批准本 goal（“approve the goal and commit”）。批准范围为 01 至 34 的子任务拆分、依赖、写入范围、执行方式与验收覆盖；全部子任务仍为 pending，批准不启动执行，也不代表实现完成。08（D-01）与 09（D-02）尚未形成的具体共享合同仍须在各自关卡取得明确批准；P3-14 的真实共享提示模块仍是 21、24、26–29 的外部前提。
