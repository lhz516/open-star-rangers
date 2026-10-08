---
type: plan
status: active
phase: P2
task: "07"
subtask: "21"
updated: 2026-10-08
---

# 21 — SNIP 与 DIAG 的本地核对

**契约来源：** [spec](../spec.md) 的 S-10、S-12；AC-13 的重跑、AC-14 的修订部分、AC-21。
**依赖：** 20。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。
**执行方式：** 自动

## 工作范围

- **nob-check：** 本地运行 `node tools/nob-check.ts`，覆盖 `SR.NOB` 的 SNIP 与两个 DIAG 条目及 `MAIN/` 中其余封包。
- **生产路径与独立读取：** 在本地基准上经产品入口与生产图形步骤得到 9 帧与文字 payload；与只共用光盘、IMFAT 与 LE 读取器的独立读取比较；帧 6 经生产调色板与 `srangers_068.png` 左显示屏 (58,347) 处逐像素比较。
- **AC-13 重跑：** 用含 `data` kind 的 P2-07/16 脚本副本重跑步骤结果与作业路径，记录新的用量；P2-07/15 的合成比较复跑。
- **记录：** 只记命令、计数与判定；脚本与输出在被忽略的 `local/research/p2-07/snip-diag/`。最终保真判定归 P2-12。

## 不包含

- P2-12 在新候选上的复核与其本地脚本。

## 写入范围

- `docs/original/formats/hud.md`
- `local/research/p2-07/snip-diag/`（被忽略，不提交）

## 验收标准

- [x] nob-check 对本地 `SR.NOB` 的 SNIP 与两个 DIAG 条目通过，`MAIN/` 中全部封包失败 0。
- [x] 9 帧与独立解码逐像素相同；帧 6 与 `srangers_068.png` 左显示屏逐像素比较并记录计数；文字 payload 与独立读取相同。
- [x] AC-13 重跑通过，新用量在份额之内并已记录；15 的合成比较结果不变。

## 验证方法

- 本地命令，见完成证据。

## 完成证据

- **nob-check：** `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` 输出 `SNIP 1 passed, 0 failed`、`DIAG 2 passed, 0 failed`、`SNIP image 96x96`、`SNIP frames per entry 9, 9 frames decoded`、`DIAG startup messages 3, 57 texts read, longest 22 bytes`，失败 0；`MAIN/` 中其余 6 个封包也为失败 0。
- **独立读取与截图：** `node --preserve-symlinks --preserve-symlinks-main local/research/p2-07/snip-diag/snip-diag-check.ts`：9 帧 96×96 与独立解码（条目字节加 EXE `0x175ed8` 的颜色表）全部相同（9/9）；帧 6 经生产飞行调色板与 `srangers_068.png` (58,347) 处 96×96 区域比较 9,216 个像素，一致 9,216；文字 payload（31 个重定位、3 条启动消息、31 段文字含 EXE 中的下行格式）与独立读取相同。判定 pass（3/3）。
- **AC-13 重跑：** `node --preserve-symlinks --preserve-symlinks-main local/research/p2-07/snip-diag/base-check.ts`（P2-07/16 脚本的副本，只增加 `data` kind）：135 个 Asset，P2-05 5/5、P2-07 96/96；两次运行 135 个 payload 哈希相同；`cockpit-hud-map` 100 个 Asset，全部 verified，`validateGroup` 为 `group-complete`；P2-07 用量 `assets` 96/112、`dependencyEdges` 100/192、`payloadBytes` 551,361/917,504、`imagePixels` 524,729/655,360、`paletteEntries` 256/1,024，均在份额内；作业依次经五个阶段，四组都为 `group-complete`，判定 pass（9/9）。原像素份额 524,288 不足以容纳 524,729，因此 spec 修订了份额。
- **15 复跑：** `node --preserve-symlinks --preserve-symlinks-main local/research/p2-07/composite-check.ts` 与 [15](./15-local-composite-check.md#完成证据) 的记录相同（前视 132,505 中一致 111,440；四张地图截图各 124,701 全部一致）。
- **文档：** 结论写入 [hud 的 SNIP 10487](../../../../original/formats/hud.md#snip-10487-confirmed-structure-p2-1227) 一节，只记计数与判定。
