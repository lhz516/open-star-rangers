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

- [x] 三个 G 项的文字符合 P3-01 标注规则，且与修订后的 P3-01、P3-05 spec 一致。
- [x] slice-gaps 文档写明呈现位置与触发键，链接可解析，`updated:` 已更新。
- [x] `pnpm exec vitest run src/ui/mission` 通过；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 文字与 P3-01 逐项审阅；浏览器显示由 28 验证。

## 完成证据

- 对照 P3-01 的标注规则、G-08–G-10 缺省清单与 P3-05 AC-08：G-08 只说明前视以外视角暂缺；G-09 明确没有自动驾驶命令；G-10 明确固定为 Medium；三项均标明由 P4 补齐。
- `pnpm exec vitest run src/ui/mission`：3 个文件、24 项测试通过；`pnpm typecheck` 与 `pnpm lint` 通过。`git diff --check` 通过；相对链接检查解析 `slice-gaps.md` 的 14 个链接。
- Rubber-duck 审查无适用发现；simplify 的复用、简化、效率与抽象层级审查均无发现。
- 文档影响：已在 `docs/engineering/slice-gaps.md` 同步文字集中位置、飞行输入区呈现位置与每项触发键；原版事实未变，无需改 `docs/original/`、STATUS 或阶段任务索引。
