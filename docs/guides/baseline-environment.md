---
type: guide
status: active
phase: P0
updated: 2026-10-10
related: [U-016, U-021]
---

# 基准环境搭建与运行

用于运行原版游戏做行为对照，以及对原版文件做静态分析。以下路径以 macOS（Apple Silicon）为准。agent 可以用 Computer Use 运行与观察原版，见[原版证据获取](./original-evidence.md#agent-运行原版)；本机的 Computer Use 无法向 DOSBox-X 输入。需要游戏操作时，能写成测量配方的输入由测量工具在模拟器内施加，其余由用户在键盘上操作。在私有副本中运行、在调试器暂停点读取内存并施加输入的测量方法见[运行时测量](./runtime-measurement.md)。

## 工具

| 工具 | 位置 | 说明 |
|---|---|---|
| DOSBox-X 2026.08.31（arm64） | `~/Applications/dosbox-x.app` | 从官方 GitHub 发布页下载；自带调试器（`-break-start`），测量工具用它的 `DV` 读、`SMV` 写线性内存 |
| OpenJDK 21 | Homebrew `openjdk@21` | 不加入系统 PATH，只供 Ghidra 使用 |
| Ghidra 12.0.1 | `~/Tools/ghidra_12.0.1_PUBLIC` | 必须使用 12.0.1，以匹配 LE 加载插件；不要用 Homebrew 的版本 |
| ghidra-lx-loader 12.0.1 | Ghidra 的 `Ghidra/Extensions/` | 用于载入 LE 格式的 `SRANGERS.EXE` |
| 启动脚本 | `~/Tools/bin/dosbox-x`、`ghidra`、`ghidra-headless` | 脚本中设置了 `JAVA_HOME`，无需修改 shell 配置 |
| Node 22、pnpm | 系统已有 | Node 22 可直接运行 `.ts` |

## 原版文件

- 光盘镜像：`local/StarRang/cd/`（CloneCD：`.ccd`/`.img`/`.sub`，另有 `.cue`）。
- 安装目录：`local/StarRang/SRANGERS/`，作为 DOSBox-X 的 C 盘。
- 初始用户文件快照：`local/StarRang/baseline/initial/`（`SRANGER.CFG`、`SRHISCOR.RAW`）。游戏运行时会改写这两个文件，需要还原时从快照复制回去。
- 以上全部位于被 git 忽略的 `local/`，永不提交。

## 运行原版

在仓库根目录运行：

```sh
~/Tools/bin/dosbox-x -conf local/StarRang/star-rangers-dosbox-x-mac.conf
```

配置会自动挂载 C 盘和光盘并启动游戏。DOSBox-X 不接收 macOS 的 ⌘V，需要粘贴时使用菜单 **Main → Paste Clipboard**。

基准设置（修改须记录，并重新测量受影响的行为）：

- CPU：`cputype=pentium`，`cycles=fixed 40000`。初始值，待校准后冻结（U-021）。在所选任务中，游戏时钟速率与帧率依赖 cycles（[B-006](../original/behavior/B-006-simulation-timing.md)）；测量其他 cycles 值时只改私有配置副本，见[运行时测量](./runtime-measurement.md#私有配置与游戏设置)。
- 声卡：Sound Blaster 16；音效 `SB16.DIG`，音乐 `SBPRO2.MDI`（OPL3，Nuked 精确模拟）。沿用原安装的 Miles 配置（U-016）。
- 游戏内画面设置：全部取最高，即过场 HI、背景细节 ON、Gouraud 着色 ON、贴图 ON、游戏分辨率 HI。设置界面的 7 个选项与 `SRANGER.CFG` 中的 `SOUND_LEVEL`、`MUSIC_LEVEL`、`CINEMATIC`、`DETAIL`、`SHADING`、`TEXTURE`、`GAMEHIRES` 一一对应。初始快照中 `DETAIL=FALSE`（首次运行时游戏按机器性能自动选择），基准应为 TRUE。
- 录像、截图、录音：菜单 **Capture**，输出到 `local/StarRang/captures/`。截图是游戏原始像素，可用于判断分辨率。

## 静态分析

首次准备（在仓库根目录运行）：

```sh
# 1. 给 Ghidra 加入 Watcom 调用约定（__watcall），设为默认；原文件备份为 *.orig
python3 tools/ghidra/patch-watcom-cspec.py ~/Tools/ghidra_12.0.1_PUBLIC

# 2. 导入并完整自动分析，项目保存在 local/ghidra/srangers（约 35 秒，约 1800 个函数）
~/Tools/bin/ghidra-headless local/ghidra srangers -import local/StarRang/SRANGERS/MAIN/SRANGERS.EXE -overwrite
```

之后用图形界面打开（`~/Tools/bin/ghidra`），或用 `tools/ghidra/` 中的脚本做无界面分析，例如：

```sh
~/Tools/bin/ghidra-headless local/ghidra srangers -process SRANGERS.EXE -noanalysis -readOnly \
  -scriptPath tools/ghidra -postScript DumpCallers.java "$PWD/local/research/callers.c" 0x6affc
```

- Ghidra 项目与脚本输出只放在 `local/`。反编译结果属于原版程序的衍生内容，不得提交或粘贴进文档；文档只记录函数地址与作用。
- `SRANGERS.EXE` 载入后为 4 个 LE object；地址与已知函数见 [executable](../original/formats/executable.md) §4。
- 补丁之前 Ghidra 默认使用 Borland 调用约定，反编译出的参数是错的。升级或重装 Ghidra 后需要重新运行补丁脚本，并重新导入程序。
- 部分代码已经反汇编但没有归入函数（例如调试命令处理），可用 `DumpAt.java` 在指定地址补建函数后再反编译。

## 首次运行可能遇到的问题

- macOS 提示无法验证开发者：在“系统设置 → 隐私与安全性”中点“仍要打开”。
- pnpm 报找不到 `pnpm.cjs`：corepack 版本太旧，运行 `npm i -g corepack@latest`，并删除 `~/.cache/node/corepack/v1/pnpm/` 下损坏的版本目录。
