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

- [x] AC-12：本地 CLI 输出 `passed: true`，版本 ID 与指纹符合预期，9 个封包全部条目通过，计数与 imfat §4 一致，观测最大值在上限内；输出只含规范光盘路径、版本 ID、指纹、计数、读取用量与结论。
- [x] AC-03：`nob-list`、`nob-check` 对本地安装目录的 NOB 运行成功，失败数为 0。
- [x] AC-13（`docs/original/` 部分）：[imfat](../../../../original/formats/imfat.md)记录新事实并标明置信度与证据；U 项状态与证据一致；`pnpm check:original` 报告 0 个发现；仓库没有新增原版内容或研究输出。

## 验证方法

- 本地只读运行上述命令，核对计数，并与 imfat §4、spec 上限比较。
- 用 `git status` 确认 `local/` 中的输出未被跟踪；检查文档链接与元数据。

## 完成证据

以下是 2026-10-05 在开发者机器上的只读本地运行。JSON 与文本输出留在 `local/research/p2-03/`（不跟踪），这里只记录命令、计数与结论。

- **基准镜像：** `node tools/source-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` 退出码为 0，输出 `passed: true`、`error: null`、`closeFailures: 0`。
  - **身份：** `star-rangers-1995-cd`，指纹 `source:sha256:fd97bcea3c3aee835c9058419469786587a4580e96b431bb9ce9c127ff2181be`，等于 04 固定的常量；覆盖文件 8 个。
  - **封包：** 9 个封包（7 个 verified，`MAIN/COMMFACE.NOB` 与 `MAIN/COMMFAC2.NOB` 为 research）共 1,857 个条目，全部读取并通过校验。
  - **计数：** 各封包条目数与类型分布逐项等于 [imfat §4](../../../../original/formats/imfat.md#4-type-distribution-per-file-confirmed)（SR 701、SCENARIO 62、AISTUFF 45、CRAFT 25、OPTIONS 20、COMM 7、DEBRIS 1、COMMFACE 与 COMMFAC2 各 498）。
  - **最大值：** 条目数 701、数据块 827,089 字节、每条目重定位 445，均在 spec 上限内。
  - **读取：** `sourceReadBytes` 为 111,333,462，即产品入口句柄与研究句柄之和，低于默认上限（输入总量）。
- **研究工具（AC-03）：**
  - `node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/*.NOB`：退出码 0，7 个封包都输出目录摘要；
  - 对同目录 7 个 NOB 逐个运行 `node tools/nob-check.ts`：7 次退出码都为 0，失败数都为 0。
- **原版事实（AC-13）：** [imfat](../../../../original/formats/imfat.md) 补充以下已确认事实：
  - 首项 ID 为基数 + 1，步长恒为 2；类型标签为 3–4 位；各文件的 `flags` 取值集合；
  - 目录顺序即数据顺序，块与重定位表连续且恰好结束于文件末尾，最小数据块 8 字节；
  - 重定位位置唯一、互不重叠，部分文件无序，存储指针严格介于 0 与块大小之间；
  - 新增 §6，列出观测最大值与读取器上限的对照。

  证据为同日的只读结构调查与本次运行。[U-001](../../../../original/unknowns.md#数据与格式) 补充了全量校验说明，状态仍为“进行中”（其余 payload 类型待研究）；U-020 的 `flags` 含义仍未确认，状态不变。manifest 无需修改。
- **合规：** `pnpm check:original` 报告 passed。`git status` 中只有文档改动，`local/` 的输出未被跟踪。
- **Rubber-duck：** 采纳三项：
  - 运行结果从 imfat 移到本证据，imfat 只保留格式事实并链接这里；
  - 保存 `nob-check` 的输出，作为 AC-03 的证据；
  - §2 标题改为“Confirmed; `flags` meaning Unconfirmed”。
- **Simplify：** 本子任务只修改文档，不需要代码清理。
- **文档影响：** 修改 [imfat](../../../../original/formats/imfat.md) 与 [unknowns](../../../../original/unknowns.md)；工程与工具文档已在 01–08 中更新，无需再改。

