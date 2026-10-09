---
type: plan
status: active
phase: P2
task: "12"
subtask: "33"
updated: 2026-10-08
---

# 33 — 修复：源码结构的呈现约定表与 30 及范围例外对齐

**契约来源：** [spec](../spec.md) 的 S-11、S-13、[判定分类](../spec.md#判定分类)的“用户批准的范围例外”；AC-21、AC-23。由 [26](./26-final-alignment.md) 的第三次运行新增（execute-goal §5）。
**依赖：** —。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [源码结构的呈现约定表](../../../../engineering/source-structure.md#资源查看渲染)的依据列与 [30](./30-deferred-recaptures.md#完成证据) 及用户批准的范围例外对齐：
  - “方向”行：导弹的效果对照改为 30 的结论（`srangers_099` 是导弹类型 1，高概率；21 对类型 5 的判定作废）；
  - “效果贴图（三维）”行：跨接缝面的外观为用户批准的范围例外，不再写“相应验收保持 blocked”；接缝插值仍未确认，标注保留；
  - “效果颜色（三维）”行：弹丸记录 0、1、2、6 一致（记录 6 以 `srangers_128` 直接对照），记录 3、4、5、7、8、9 在切片之外（已确认不使用），删去记录 8 的视频判定。
- 只改依据列的文字与链接；原版事实留在 `docs/original`，这里只写结论与链接。

## 不包含

- 呈现约定本身（代码、测试、查看器）；其他文档。

## 写入范围

- `docs/engineering/source-structure.md`：资源查看渲染一节的呈现约定表。

## 验收标准

- [ ] 表中三行的依据与 30、spec 范围例外一致，没有过时的判定；其余行不变。
- [ ] 链接、锚点与 front matter 有效；`pnpm --silent check:original` 通过；没有原版内容。

## 验证方法

- 文档 diff 审阅、链接与元数据检查、`pnpm --silent check:original`。

## 完成证据
