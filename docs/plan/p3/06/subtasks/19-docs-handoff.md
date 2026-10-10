---
type: plan
status: active
phase: P3
task: "06"
subtask: "19"
updated: 2026-10-09
---

# 19 — Core 文档与交接

**契约来源：** [spec](../spec.md) 的 S-10；AC-12（文档部分）；[与相邻任务的接口](../spec.md#与相邻任务的接口)。
**依赖：** 14, 15, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **[Core 模块说明](../../../../engineering/modules/core.md)：**
  - 世界创建的 `craftInfo` 输入、语义检查与 setupHash 覆盖；
  - 新的阶段实现（`movement`、`parked-update`、`area-check`）、内部请求与命令判定；
  - 新的规则辅助模块、实体与玩家状态字段、原因码、领域事件、`flight` 分区与上限；
  - 已知差异：分阶段接入（动态最高速度、AI 驾驶、停放对象的 AI 与 Warp 输入）、固定步长与原版可变步长、舍入方向、未实现的不可达分支；
  - 交接：P3-04（创建输入）、P3-05（轴的取值与对应、物理键、灵敏度档位、按住节奏）、P3-07（目标引用、最高速度的实时输入、弹丸与导弹模式、冲量与定时旋转的写入者）、P3-08（浮点操纵路径、停放对象的 AI、编队）、P3-09（`warpClock`、地图门禁、Warp 期间的区域中心）、P3-10（菜单中的数字键优先级）、P3-11（`object-left-world`）、P3-12/P3-13（放置序号、运动 projection、辅助状态与事件）、P3-14。
- **[源码结构指南](../../../../engineering/source-structure.md)：** 新模块的落点。
- **[工程约定](../../../../engineering/README.md)：** 仅在命令或检查规则变化时更新。
- 不声明下游玩法已完成；改动文档的 `updated:`、链接与锚点有效。

## 不包含

- 原版事实（01–05、17 写入 `docs/original/`）；spec 修订（06、08）。
- 键位文档的绑定（P3-05）。

## 关键文件与契约

- [core.md](../../../../engineering/modules/core.md) 的正式 Core、扩展规则、已知差异与交接各节；[source-structure.md](../../../../engineering/source-structure.md)。
- 09–16 的完成证据。

## 写入范围

- `docs/engineering/modules/core.md`：API、阶段、已知差异与交接。
- `docs/engineering/source-structure.md`：新模块落点。
- `docs/engineering/README.md`：仅在命令或检查规则变化时。

## 验收标准

- [ ] AC-12（文档部分）：Core 模块说明与源码结构指南已同步新 API、阶段、已知差异与对下游任务的交接；未建的下游任务有明确交接。
- [ ] 改动文档的 `updated:`、链接与锚点有效；没有原版内容。

## 验证方法

- 逐项对照 09–16 的交付与 spec 的接口表；文档链接与 front matter 检查。不涉及浏览器。

## 完成证据
