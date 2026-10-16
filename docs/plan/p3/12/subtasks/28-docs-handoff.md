---
type: plan
status: active
phase: P3
task: "12"
subtask: "28"
updated: 2026-10-15
---

# 28 — 文档同步与交接

**契约来源：** [spec](../spec.md) 的 S-14、AC-22（文档部分）。
**依赖：** 09, 23, 24, 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 同步 [render 模块说明](../../../../engineering/modules/render.md)（飞行渲染器、表现模块、呈现约定与已知差异：按 tick 的缓动、星云起点、CR-11 差异）、[app](../../../../engineering/modules/app.md) 与 [core](../../../../engineering/modules/core.md) 模块说明的实现部分、[源码结构指南](../../../../engineering/source-structure.md)（`render/flight/` 目录与边界）、[工程约定](../../../../engineering/README.md#渲染表面与视口)（飞行画面的检查与 E2E）。
- 在制标注：P3-13 接入前的“驾驶舱/HUD 待接入”提示写入相应文档，不新增 G 项。
- 交接：向 P3-13（合成层接口与视角信息）、P3-14（`PresentationTick`、激活流与相机，以及 09 记录的接口差异）、P3-15（被毁视角真实流程、原版对照汇总所需的证据位置）写明。

## 不包含

- 原版事实（08、27）。

## 关键文件与契约

- 上列文档。

## 写入范围

- `docs/engineering/**`：模块说明、源码结构、工程约定与交接。

## 验收标准

- [ ] S-14：文档与实际 API、目录和检查一致；交接三项写明。
- [ ] 改动文档的 `updated:`、链接与锚点有效。

## 验证方法

- 文档审阅与链接检查。

## 完成证据
