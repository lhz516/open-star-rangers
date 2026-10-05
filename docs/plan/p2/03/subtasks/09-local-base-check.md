---
type: plan
status: active
phase: P2
task: "03"
subtask: "09"
updated: 2026-10-05
---

# 09 — 基准盘本地核对与原版事实记录

**契约来源：** [spec](../spec.md) 的 S-13；AC-12（本地运行）、AC-03（研究工具）、AC-13（`docs/original/` 部分）；[验证策略](../spec.md#验证策略)中的实机/原版对照。
**依赖：** 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **基准镜像核对：** 在开发者机器上运行 `node tools/source-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，确认：
  - 识别为 `star-rangers-1995-cd`，指纹等于 04 固定的常量；
  - 全部 9 个 NOB 都能打开，每个条目都读取并通过校验，失败数为 0；
  - 各封包的条目数与类型分布等于 [imfat §4](../../../../original/formats/imfat.md#4-type-distribution-per-file-confirmed)；
  - 观测最大值（条目数、数据块、重定位个数）不超过 spec 的上限。
- **研究工具：** 对 `local/StarRang/SRANGERS/MAIN/*.NOB` 运行 `nob-list` 与 `nob-check`，确认改用新规则后仍然通过。
- **原版事实：** 依据 `local/research/p2-03/` 的调查与本次运行，把封包结构事实带置信度写入 [imfat](../../../../original/formats/imfat.md)：
  - 目录顺序即数据顺序，块与重定位表连续且恰好结束于文件末尾；
  - 首项 ID 等于基数 + 1；保留字为 0；
  - 重定位位置唯一、互不重叠，但不一定有序，可以不对齐；
  - 存储指针的观测范围；
  - 观测最大值与读取器上限的对照。

  只写结构、计数与结论。按证据更新或保持 [U-001、U-020](../../../../original/unknowns.md#数据与格式) 的状态说明；确有必要时，在 [manifest](../../../../original/manifest.md) 中链接版本识别说明。
- **证据：** 只在本文件中记录命令、计数与结论；JSON 输出与调查脚本留在 `local/research/p2-03/`。

## 不包含

- 任何代码修改；发现规则误拒或 CLI 缺陷时，在 goal 中新增修复子任务。
- 视觉或音效保真对照（P2-05 至 P2-08、P2-12）。

## 关键文件与契约

- **运行：** `tools/source-check.ts`（08）、[nob-list](../../../../../tools/nob-list.ts)、[nob-check](../../../../../tools/nob-check.ts)。
- **修改：** [imfat](../../../../original/formats/imfat.md)，必要时修改 [unknowns](../../../../original/unknowns.md) 与 [manifest](../../../../original/manifest.md)。
- **前提：** `local/StarRang/cd/` 的 CloneCD 文件组与 [manifest](../../../../original/manifest.md#光盘镜像) 一致；`local/StarRang/SRANGERS/MAIN/` 有安装目录的 NOB。缺少时本子任务为 blocked，不能用合成数据代替。

## 验收标准

- [ ] AC-12：本地 CLI 输出 `passed: true`，版本 ID 与指纹符合预期，9 个封包全部条目通过，计数与 imfat §4 一致，观测最大值在上限内；输出只含规范光盘路径、版本 ID、指纹、计数、读取用量与结论。
- [ ] AC-03：`nob-list`、`nob-check` 对本地安装目录的 NOB 运行成功，失败数为 0。
- [ ] AC-13（`docs/original/` 部分）：[imfat](../../../../original/formats/imfat.md)记录新事实并标明置信度与证据；U 项状态与证据一致；`pnpm check:original` 报告 0 个发现；仓库没有新增原版内容或研究输出。

## 验证方法

- 本地只读运行上述命令，核对计数，并与 imfat §4、spec 上限比较。
- 用 `git status` 确认 `local/` 中的输出未被跟踪；检查文档链接与元数据。

## 完成证据
