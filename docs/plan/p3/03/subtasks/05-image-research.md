---
type: plan
status: active
phase: P3
task: "03"
subtask: "05"
updated: 2026-10-09
---

# 05 — 爆炸动画与补充图像的研究

**契约来源：** [spec](../spec.md) 的 S-01、S-09（TEX 11069）、S-10、S-11、S-12、AC-01；[字段处理规则](../spec.md#字段处理规则) 9、[研究门槛与阻塞](../spec.md#研究门槛与阻塞) 2、[Asset 与角色](../spec.md#asset-与角色)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **ANIM（闭包 #20）：** 用只读 Ghidra 研究 17 条 ANIM 的结构：
  - 帧数与帧表、每帧的图像记录（编码 1）、位置偏移与时长等逐帧或动画参数；
  - 解码 [图像编码 1](../../../../original/formats/textures.md#encoding-1-animation-unconfirmed) 的代码与规则，包括每个分支，以及是否为帧间增量；
  - 绘制路径：爆炸对象（种类 `0x400000`）的绘制回调，以及 EXPL 异步载入器 `0x66ad8` 之后的准备。由此确定帧的调色板（自带或 DATA）、透明、行序与显示方式（直接或最近色）。

  解码规则须由代码确认。用本地脚本按该规则解码全部 186 帧，核对每帧恰好用尽其数据。
- **EXPL 与 EXIC：** 确认 EXPL 除 {SND, ANIM} 之外是否还有字段及其类型；确认 EXIC 三张列表与 17 条 EXPL 的对应。
- **补充图像：**
  - TEX 11069（受击闪烁，闭包 #19）：`0x42664` 按像素值推进条带，确定调色板与显示方式，以及像素值作为阈值时的含义对转换的要求；
  - TEX 11089（右侧目标显示屏背景，闭包 #26）：`0x42b04`→`0x85730` 的显示方式与最近色目标；
  - NEBC 10661 的 15 个 BITM（闭包 #21）：`0x5b54c` 不查色表，确认在 DATA 下直接显示（目前为高概率，U-018）。
- 记录观测值：ANIM 的帧数、每帧宽高、数据字节与调色板条目数，以及 186 帧的最大值。
- 事实写入 [textures](../../../../original/formats/textures.md)：新增 ANIM 与 EXPL 小节，更新编码 1 与 BITM 小节（英文）。研究脚本与解码输出放在 `local/research/p3-03/images/`，解码图像不离开 `local/`。
- 若编码 1 的规则不能由代码确认，或帧的调色板、透明与显示方式达不到高概率，按研究门槛 2 记为 blocked。

## 不包含

- 爆炸选择、动画播放与背景方向等表现规则：归 P3-07、P3-12。
- 与截图或视频的外观核对：在 21 中用生产解码结果完成。
- 解析器、payload 与转换：归 09、14、16、17。
- U 项：由 22 写入；本项在完成证据中列出 U-001、U-018、U-027、U-030 的线索。

## 关键文件与契约

- [textures §2、§4](../../../../original/formats/textures.md#2-image-record-36-bytes-confirmed)、[hud §3](../../../../original/formats/hud.md#3-id-lists-confirmed-structure)、[audio 的爆炸效果](../../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)、[executable 的受击闪烁与星云](../../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)。
- [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)（只读）：现有的图像记录读取与 RLE 解码。

## 写入范围

- `docs/original/formats/textures.md`：ANIM、EXPL、编码 1、TEX 11069、TEX 11089 与星云 BITM 的事实。
- `local/research/p3-03/images/**`：研究脚本、Ghidra 输出、私有副本与解码输出（被忽略）。

## 验收标准

- [ ] AC-01（图像部分）：编码 1 的解码规则由代码确认，并写明每个分支；帧的调色板、透明、行序与显示方式至少为高概率；ANIM 与 EXPL 的每个字段都有存储类型与证据。
- [ ] 全部 186 帧按该规则恰好用尽数据，本地核对的方法与结果已记录（只记计数）。
- [ ] TEX 11069、TEX 11089 与星云 BITM 的显示方式已有结论与置信度。
- [ ] 观测值已记录，可供 06、09、14 推导限值；文档没有原版像素、调色板值或反编译代码，front matter 与链接有效。

## 验证方法

- 只读 Ghidra（私有副本）与本地解码脚本，产物只在 `local/`。
- 文档 diff 审阅与链接检查。不涉及浏览器。

## 完成证据
