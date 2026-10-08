---
type: plan
status: active
phase: P2
task: "12"
subtask: "13"
updated: 2026-10-07
---

# 13 — 对照基准盘点与补拍清单

**契约来源：** [spec](../spec.md) 的 S-08、S-10 与[原版本地对照](../spec.md#原版本地对照)的“画面基准”；为 V-1 至 V-4、M-3 准备基准，落实[判定分类](../spec.md#判定分类)中“未截到不是通过理由”。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本（计划新增 `local/research/p2-12/baselines/`）：
  - 核对 `local/StarRang/captures/` 现有截图的原始像素尺寸与格式，确认可作像素基准（不把缩放截图当作基准）；复用 P2-07 的截图分类做法（`local/research/p2-07/classify-captures.ts`）区分 HI 前视与地图画面。
  - 由 12 的候选列出每个对照项所需的基准：V-1 的每个模型用途（玩家、两种敌机、友方、基地、碎片）；V-2 的效果类别（弹丸、导弹第 0 个映射、带与不带贴图的碎片、接缝面）；V-3 的前视（至少 2 个场景不同的截图，用于透明判断）与地图边框；V-4 的每个图像、字库、调色板在原版中的消费位置（依据 [hud 覆盖表](../../../../original/formats/hud.md#slice-screen-coverage-and-hud-image-families-r3-r4-r6)与绘制路径）；M-3 备选方法所需的已知世界位置标记画面。
  - 已有基准按文档记录（例如 [mesh §3](../../../../original/formats/mesh.md#3-comparison-with-the-original-partial) 的截图文件名）与脚本分类结果对应到文件名；缺失项写入补拍清单，写明游戏内场景、视角、设置与要捕获的对象。
- agent 不打开原版截图或原版派生图像，只读取脚本输出的计数、尺寸与分类结果；三维对象是否在画面中由已有文档记录或用户在 15 确认。
- 清单只在 `local/`；完成证据只记文件名、计数与缺失项类别。

## 不包含

- 补拍本身（15，由用户完成）；像素比较（16、17）。

## 关键文件与契约

- [基准环境](../../../../guides/baseline-environment.md#运行原版)：DOSBox-X 配置、游戏内设置与截图方法。
- [cockpit R5](../../../../original/formats/cockpit.md#production-composites-and-element-overlaps-r5)、[hud](../../../../original/formats/hud.md)、[mesh](../../../../original/formats/mesh.md) 中已记录的截图文件名。

## 写入范围

- `local/research/p2-12/baselines/**`：盘点脚本、输出与补拍清单（被忽略）。

## 验收标准

- [ ] 每个对照项（V-1 至 V-4、M-3 备选）都对应到已有基准文件名或列入补拍清单；没有对照项未被归类。
- [ ] 现有截图的尺寸与格式已核对；不合格的截图不作像素基准。
- [ ] 补拍清单写明场景、视角与对象，供 15 使用；证据不含原版内容。

## 验证方法

- 在本机运行脚本，记录命令、计数与缺失项类别。
- 不涉及浏览器验证。

## 完成证据
