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

- [x] AC-14：本地基准的全部 CCKD 目录与非空 slot 元素、全部 MFDD 列表、05 记录的全部 TABL 图像列表通过结构校验；输出只有计数、观察最大值与失败原因。
- [x] 观察最大值在批准的结构限值之内，并写入原版文档。
- [x] 工具指南记录新输出；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 本地运行 `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`，证据记录命令、计数与判定。
- 不涉及浏览器。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

2026-10-05：

- **实现（[nob-check.ts](../../../../../tools/nob-check.ts)）：**
  - **CCKD：** 经 `readCockpitGroups` 读取目录，解码全部元素的图像记录，有嵌入调色板时核对索引范围。
  - **MFDD：** 按 16 个记录的新上限读取两个列表。
  - **TABL：** hud §2 记录的 5 个图像列表经 `readTableRecordOffsets` 解析，全部记录解码。封包只要含其中任一条目 ID，就必须以 TABL 类型含全部 5 个，否则为失败；判断与文件名无关。其他 TABL 条目只统计其中能按图像列表解析的数量。
  - **共享读取器：** 解析仍全部在共享读取器中。`CockpitElement` 增加 `flags`（+44、+48 的取值，只作解析结果，不进入 payload），供统计取值分布。
- **本地运行：** `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`，退出码 0，0 个失败。输出副本在被忽略的 `local/research/p2-07/nob-check-sr.txt`。
  - **通过数：** CCKD 3、MFDD 3、TABL 5 个条目全部通过；共解码 231 个图像记录（原 123 个，加 38 个元素与 70 个 TABL 记录）。
  - **容器计数：** 目录项最多 8，每 slot 元素最多 4，MFDD 每列表最多 9，TABL 每列表最多 29；都在 `cockpitSlots` 1–8、`cockpitElements` 0–16、`mfdRecords` 0–16、`tableRecords` 1–64 之内。
  - **元素标志：** 第一个标志 30 个为 0、8 个为 1；第二个标志 5 个为 0、33 个为 1。
  - **图像尺寸：** CCKD 元素最大 640×480，恰在 P2-05 的图像上限上；TABL 记录最大 20×52。
  - **其他条目：** 其余 5 个 TABL 条目都不能按图像列表解析。SCENARIO、CRAFT、OPTIONS、AISTUFF、COMM、DEBRIS 六个封包也都以退出码 0 通过。
- **负向核对：** 一个只含 1 个文档列表 ID（另有 1 个类型不符）的合成封包，报 4 个“缺失或类型不符”的失败，退出码 1。生成样本的临时文件已删除。
- **文档：**
  - [cockpit §3](../../../../original/formats/cockpit.md#3-observed-counts-against-the-p2-07-limits-confirmed) 新增观察计数与限值对照；原 §3“Open questions”顺延为 §4。
  - [hud §2](../../../../original/formats/hud.md#tabl-image-lists-confirmed-structure) 记录 TABL 列表的观察计数。
  - [textures §5](../../../../original/formats/textures.md#5-observed-maxima-against-the-p2-05-limits-confirmed) 补充 CCKD 与 TABL 记录及 480 高的最大值。
  - [工具指南](../../../../guides/tools.md#封包结构核对)记录新的检查范围、TABL 判定与输出。
- **测试与工程：** `source-graphics` 的分组测试断言了 `flags`。nob-check 没有可提取的纯函数，按本子任务的规定以本地运行与合成负向样本为证据。`pnpm typecheck`（含 tools）、`pnpm lint` 通过；`pnpm check` 通过，124 个文件、3807 项，构建成功。
- **审查：**
  - **rubber-duck：** 阻塞项为 TABL 覆盖按文件名判断，换名时会不检查列表就通过，也不核对列表条目是否齐全。已改为按条目 ID 判断，与文件名无关，缺失或类型不符即失败；已经用 `/dev/stdin` 与合成封包复核。
  - **simplify：**
    - 已采纳：布尔标志加 `includes` 取代派生集合；标志只计 1，0 由总数得出；“是否能按图像列表解析”抽为小函数。
    - 复用、效率与层级三个角度没有发现问题。
