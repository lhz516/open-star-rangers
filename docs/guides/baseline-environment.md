---
type: guide
status: active
phase: P0
updated: 2026-10-01
related: [U-016, U-021]
---

# 基准环境搭建与运行

用于运行原版游戏做行为对照，以及对原版文件做静态分析。以下路径以 macOS（Apple Silicon）为准。

## 工具

| 工具 | 位置 | 说明 |
|---|---|---|
| DOSBox-X 2026.08.31（arm64） | `~/Applications/dosbox-x.app` | 从官方 GitHub 发布页下载；自带调试器（`-break-start`） |
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

- CPU：`cputype=pentium`，`cycles=fixed 40000`。初始值，待校准后冻结（U-021）。
- 声卡：Sound Blaster 16；音效 `SB16.DIG`，音乐 `SBPRO2.MDI`（OPL3，Nuked 精确模拟）。沿用原安装的 Miles 配置（U-016）。
- 游戏内画面设置：全部取最高，即过场 HI、背景细节 ON、Gouraud 着色 ON、贴图 ON、游戏分辨率 HI。设置界面的 7 个选项与 `SRANGER.CFG` 中的 `SOUND_LEVEL`、`MUSIC_LEVEL`、`CINEMATIC`、`DETAIL`、`SHADING`、`TEXTURE`、`GAMEHIRES` 一一对应。初始快照中 `DETAIL=FALSE`（首次运行时游戏按机器性能自动选择），基准应为 TRUE。
- 录像、截图、录音：菜单 **Capture**，输出到 `local/StarRang/captures/`。截图是游戏原始像素，可用于判断分辨率。

## 静态分析

```sh
~/Tools/bin/ghidra                       # 图形界面
~/Tools/bin/ghidra-headless <项目目录> <项目名> -import <文件> -noanalysis
```

- Ghidra 项目放在 `local/ghidra/`。
- 已验证可载入 `SRANGERS.EXE`，识别出 4 个 LE object。
- Ghidra 默认选择 Borland 调用约定，但程序由 Watcom 编译（EAX、EDX、EBX、ECX 寄存器传参）。代码分析前需要自定义调用约定，否则反编译出的参数会是错的。

## 首次运行可能遇到的问题

- macOS 提示无法验证开发者：在“系统设置 → 隐私与安全性”中点“仍要打开”。
- pnpm 报找不到 `pnpm.cjs`：corepack 版本太旧，运行 `npm i -g corepack@latest`，并删除 `~/.cache/node/corepack/v1/pnpm/` 下损坏的版本目录。
