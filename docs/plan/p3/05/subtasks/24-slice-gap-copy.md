---
type: plan
status: active
phase: P3
task: "05"
subtask: "24"
updated: 2026-10-10
---

# 24 — G-08、G-09、G-10 的标注文字与 slice-gaps

**契约来源：** [spec](../spec.md) 的 S-09，[暂缺标注](../spec.md#暂缺标注)、[文档影响](../spec.md#文档影响)（slice-gaps）、[数据模型与契约](../spec.md#数据模型与契约)的 `SLICE_GAPS` 行；AC-08 的文字与文档部分。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts) 的 `SliceGapId` 与 `SLICE_GAPS` 增加 `G-08`、`G-09`、`G-10` 的 `{ title, text }`：按 [P3-01 标注规则](../../01/spec.md#标注规则)说明缺少什么、由哪个阶段补齐；G-08 的按键范围以 11 修订后的 P3-01 为准，G-09、G-10 以集成后的 P3-01（P3-06 的修订）为准。界面文字只在此处。
- [slice-gaps.md](../../../../engineering/slice-gaps.md) 写入 G-08、G-09、G-10 的呈现位置（飞行输入区的标注区）与触发键。
- 更新依赖 G 项清单的现有测试（[mission-copy.test.ts](../../../../../src/ui/mission/mission-copy.test.ts) 中的键列表）。

## 不包含

- 标注区组件（23）；绑定（19）；P3-01 修订（11）。

## 关键文件与契约

- [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)、[mission-copy.test.ts](../../../../../src/ui/mission/mission-copy.test.ts)、[slice-gaps.md](../../../../engineering/slice-gaps.md)；[P3-01 缺省清单](../../01/spec.md#缺省清单)。

## 写入范围

- `src/ui/mission/slice-gaps-copy.ts`
- `src/ui/mission/mission-copy.test.ts`
- `docs/engineering/slice-gaps.md`

## 验收标准

- [ ] 三个 G 项的文字符合 P3-01 标注规则，且与修订后的 P3-01、P3-05 spec 一致。
- [ ] slice-gaps 文档写明呈现位置与触发键，链接可解析，`updated:` 已更新。
- [ ] `pnpm exec vitest run src/ui/mission` 通过；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 文字与 P3-01 逐项审阅；浏览器显示由 28 验证。

## 完成证据
