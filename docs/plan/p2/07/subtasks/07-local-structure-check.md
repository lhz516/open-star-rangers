---
type: plan
status: active
phase: P2
task: "07"
subtask: "07"
updated: 2026-10-05
---

# 07 — 本地全量结构校验

**契约来源：** [spec](../spec.md) 的 S-10（nob-check 部分）、S-11；[限值与预算](../spec.md#限值与预算)；技术决定 9、11；AC-14，AC-16 的观察最大值部分。
**依赖：** 03、06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **加固 [nob-check.ts](../../../../../tools/nob-check.ts)：** 经 03 与 06 的同一套容器解析：
  - 3 个 CCKD 的目录，以及全部非空 slot 的元素与其图像记录（解码、调色板索引检查同 P2-05）；
  - 3 个 MFDD 的两个列表，按新上限；
  - 05 记录为图像列表的全部 TABL 条目的全部记录。
- **输出：** 只有计数、观察最大值（目录项数、每 slot 元素数、每列表记录数、每 TABL 记录数、元素 +44/+48 的取值分布）与失败原因；不输出原版字节、像素或偏移。
- **运行：** 在本地基准上运行 `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`，全部实例通过。任何实例被拒绝时本子任务不通过：按证据修订 spec（例如限值），经用户批准后再继续，不放宽为静默接受。
- **记录：** 观察最大值写入 [cockpit](../../../../original/formats/cockpit.md) 与 [hud](../../../../original/formats/hud.md)，格式参照 [textures §5](../../../../original/formats/textures.md#5-observed-maxima-against-the-p2-05-limits-confirmed)；[工具指南](../../../../guides/tools.md)记录新输出。
- **测试：** 若 nob-check 有可提取的纯函数，补充合成封包上的测试；没有时以本地运行为证据，并保证 `pnpm typecheck` 覆盖工具代码。

## 不包含

- 生产转换与作业路径：归 [16](./16-local-base-check.md)。
- 用途、调色板与透明研究：归 08–11。

## 关键文件与契约

- **修改：** [nob-check.ts](../../../../../tools/nob-check.ts)；[tools.md](../../../../guides/tools.md)；[cockpit.md](../../../../original/formats/cockpit.md)、[hud.md](../../../../original/formats/hud.md)。
- **本地数据：** `local/StarRang/SRANGERS/MAIN/SR.NOB`。

## 验收标准

- [ ] AC-14：本地基准的全部 CCKD 目录与非空 slot 元素、全部 MFDD 列表、05 记录的全部 TABL 图像列表通过结构校验；输出只有计数、观察最大值与失败原因。
- [ ] 观察最大值在批准的结构限值之内，并写入原版文档。
- [ ] 工具指南记录新输出；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 本地运行 `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`，证据记录命令、计数与判定。
- 不涉及浏览器。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
