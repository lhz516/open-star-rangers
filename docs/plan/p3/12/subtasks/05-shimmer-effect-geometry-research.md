---
type: plan
status: active
phase: P3
task: "12"
subtask: "05"
updated: 2026-10-15
---

# 05 — 受击闪烁、弹丸导弹与碎片呈现研究

**契约来源：** [spec](../spec.md) 的 S-05、S-07、S-13、AC-08、AC-10、AC-18；Q-05、Q-07、Q-08；[模型、光照与第 2 列表](../spec.md#模型光照与第-2-列表)、[弹丸、导弹与碎片](../spec.md#弹丸导弹与碎片)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-05：** `0x3d4e4` 对玩家与其他对象的分支（普通/被毁视角、玩家 +0xCC、一 tick 内多次命中、命中后同 tick 切换视角）；`0x42514`、`0x41dcc`、`0x42664` 的开始、持续与结束；球面包裹 `0x82ae8`（类型 2）；种类 `0xf9c7c` 共用的 16 步；不透明度 0x7F 在 8 位渲染中的呈现；第 2 列表部件在不受击时是否绘制。用 P2-12/21 的受击截图核对点阵外观。
- **Q-07：** `0x3fb1c`、`0x4457c` 的放置与朝向、是否受光、效果颜色的取值范围与通道、导弹元素跨接缝面的插值。用截图 099、109、112、113、128 与参考视频核对。
- **Q-08：** `0x3e530`、`0x3e590` 按判别值的几何；部件相对碎片位置的放置（DEBRIS 偏移）；逃生舱绘制部件 0–2；判别值 1 的形状抽取；自转与光照。用截图 044、092、098 核对。
- 交 09 的摘要：受击闪烁与碎片显示需要的 Core 事实（如玩家 `inWarp`、源模型的释放状态）。
- 结论写入 `local/research/p3-12/shimmer-effects/findings.md`：英文，按目标文档与节写成可直接并入的草稿，每条带置信度与证据（函数地址、结构、计数），不含原版内容、反编译输出或读数原值；受影响的 U 项变化一并列出。由 08 统一写入 `docs/original/`，本项不改跟踪的原版文档，使 01 至 06 可以并行。
- Ghidra 以 `-noanalysis -readOnly` 在 `local/research/p3-12/shimmer-effects/` 中的私有只读副本上运行，不 `-overwrite`；寄存器相关步骤按原生指令读取，调用者以相对调用与 32 位值的原始扫描核对。先复用已有记录与 `local/research/` 中的研究输出，不重做已确认的分析。
- 静态证据达不到 spec 所需结论的项，在完成证据中列出缺口、已尝试的途径与建议的最小补证，交 07 判断；不按猜测写结论。

## 不包含

- 实现（13、18、20）。

## 关键文件与契约

- 起点：[TEX 11069](../../../../original/formats/textures.md#tex-11069-hit-shimmer-band-map-confirmed)、[效果来源](../../../../original/formats/executable.md#effect-presentation-sources)、[效果几何](../../../../original/formats/executable.md#effect-geometry-data-p2-0614-research)、[效果贴图映射](../../../../original/formats/executable.md#effect-texture-mappings-p2-1115-research)、[mesh §3](../../../../original/formats/mesh.md#p2-12-viewer-comparison-v-1)。
- 计划新增：`local/research/p3-12/shimmer-effects/`（被忽略）。

## 写入范围

- `local/research/p3-12/shimmer-effects/**`：脚本、截图匹配输出、私有项目副本与 findings 草稿。

## 验收标准

- [ ] Q-05 的每个分支有原生指令依据；点阵外观的置信度与依据已标注。
- [ ] Q-07、Q-08 达到已确认（代码），外观项标注置信度。
- [ ] 交 09 的字段摘要已写入完成证据；没有改动跟踪的原版文档。

## 验证方法

- 对照 spec 的[原版研究](../spec.md#原版研究)逐项核对结论与所需置信度。
- `git status` 确认除本 subtask 文档外没有改动跟踪文件，仓库中没有原版内容、反编译输出或读数。

## 完成证据
