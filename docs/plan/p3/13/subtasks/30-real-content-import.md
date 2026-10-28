---
type: plan
status: active
phase: P3
task: "13"
subtask: "30"
updated: 2026-10-28
---

# 30 — 本地真实内容独立导入核对

**契约来源：** [spec](../spec.md#验收标准) 的 AC-02/25。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用本地合法镜像走产品导入与包验证，独立读取CCKD结构核对调度元数据、图像引用、slot 2几何和内容身份。
- 验证converter/schema切换后旧包不恢复，原版输入不被修改；记录版本、计数、哈希、诊断。
- 检查工具只输出允许的结构摘要；取得31真实候选准备所需的新包身份。

## 不包含

不把真实内容接入自动测试/CI，不实现导入修复、不为此启动DOSBox。

## 关键文件与契约

- [package-check.ts](../../../../../tools/package-check.ts)、[nob-check.ts](../../../../../tools/nob-check.ts)。
- [本地导入指南](../../../../guides/local-import.md) 与 [工具指南](../../../../guides/tools.md) 的既有命令。

## 写入范围

- `local/research/p3-13/import-check/**`：私有独立读取脚本、包验证及版本摘要。

## 验收标准

- [x] 产品导入与独立结构读取一致，版本/角色/几何/身份可核对。
- [x] 未读取非授权路径、未上传内容，原版输入文件不变。
- [x] 故障有明确原因与恢复条件，不用合成包代替真实导入验收。

## 验证方法

按 [原版证据指南](../../../../guides/original-evidence.md) 和工具指南运行实际本机输入路径的 `node tools/package-check.ts`、`node tools/nob-check.ts`；只在本文保留安全摘要。缺数据先使用已记录合法路径，不造数据通过。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-30`（基线 `112c1fc4`，含 11 的 `8e73866d`）。只读本机合法 CloneCD 镜像与安装目录的 `SR.NOB`，未启动 DOSBox-X，未用合成包代替。以下只记版本、计数、哈希与判定。

- **产品导入与包验证：** `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` 通过（`passed: true`）：版本 `star-rangers-1995-cd`，切片定义 7，`osr-import.graphics-6.logic-4.audio-2.models-4`，四组完整（logic 10、models 266、cockpit-hud-map 106、audio 29，共 411 个 Asset、3,807,078 字节，限值 814 个、16,576,768 字节）；`cockpit-instruments` 1 个 Asset、payload 2,351 字节（≤ 8,192），3 槽、1 个常重绘槽、8 个元素（遍 1 4 个、逐帧 7 个）、13 条记录（每槽最多 10，≤ 32）、5 个参数表共 8 项（最多 4，≤ 4）、20 个距离，`checkCockpitInstruments` 与工具内独立读取均一致；读取共 109,832,115 字节。`node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`：15 类条目全部通过、0 失败，CCKD 3 个、17 个仪表槽（9 个常重绘）、66 条记录、17 个参数表。两份输出与 11 的私有输出逐字节相同（转换确定）。
- **自写独立读取（不复用 11 的转换器，也不复用 package-check 内的读取）：** 私有脚本按格式文档自写原始扇区（同步、模式 1、MSF）、ISO9660、IMFAT、CCKD（指针须在重定位表中）、图像记录（编码 0/2）与 LE（对象表、页表、fixup 记录）读取，只读取所需的 3,473 个扇区；产品包经 `importPackage` 生成后用 `src/content` 的包读取器解读。结果 `passed: true`、0 个不一致：
  - 调度元数据：布局号 0/6/8 恰对应目录槽 0/2/7，常重绘只有槽 7；8 个元素的 pass/everyFrame、13 条记录的类型、矩形、间隔、+0x14 与参数表逐字段相同；源记录 +0x1C/+0x20/+0x2C 全为 0。
  - 图像引用：两个布局的元素图像 ID 与 payload 同下标一致，元素位置等于 +36/+40；8 张图像（309,781 像素，3 张编码 2 带遮罩、5 张编码 0 无遮罩）的尺寸、索引与遮罩逐像素等于独立解码；槽 0 无组调色板，图像用 `palette/flight/cockpit-hud-map`；槽 2 的图像用 `palette/map/screen`，其 256 项与组调色板按位复制展开后相同。
  - slot 2 几何：槽 2 恰一条类型 10 记录，其矩形与间隔等于 `data/hud/map-geometry` 及 payload 槽 2 的类型 10 记录；地图几何的信息行高等于字体 1 头字节 +3，且与表长 (size − 4)/256 一致。
  - 观察距离：EXE 区域 `le/4/0x5424/80` 无 fixup，20 个 f32 有限且与 payload 逐项 `Object.is` 相等。
  - 内容身份：用独立读取结果（图像 ID 取自布局）经 schema 编码器重建的字节与包中 payload 的 SHA-256 相同，描述符指纹与字节数一致；光盘中 `MAIN/SR.NOB`、`MAIN/SRANGERS.EXE` 的 SHA-256 等于 [manifest](../../../../original/manifest.md) 记录；各组共用同一 `ContentIdentity`。
  - 反例：在内存中分别改动一条记录间隔、slot 2 矩形、一个像素、槽 7 常重绘标志与一个距离，五次均报出对应的结构路径（如 `slots[0].records[0]`、`mapGeometry.rectangle`、`viewDistances[3]`），说明核对能失败。
- **旧包不恢复：** `npx vitest run src/platform/storage src/app/resources/resource-holder-cache.test.ts src/original-data/conversion/converter-version.test.ts src/workers/production-package.test.ts tools/package-check.test.ts tools/nob-check.test.ts` 7 个文件 219 项通过，其中切片定义版本 6 记为 `cache-incompatible`、同键重新导入的当前包为 `compatible`，`graphics-5.logic-4`（以及更早的 `graphics-5.logic-2/3`）不提供恢复，恢复失败后可重试。`package-check` 每次都运行新的导入作业，不读缓存；恢复条件见[本地导入指南](../../../../guides/local-import.md#缓存与重新导入)（重新导入）。
- **读取路径、上传与原版不变：** 三次运行均在 Node 权限模型下（`--permission`，只允许读取工作树的 `src`、`tools`、`node_modules`、`package.json`、私有脚本，以及 package-check/独立读取的 4 个光盘文件或 nob-check 的 `SR.NOB`；未授予写入、子进程与 worker 权限），全部通过即未读取其他路径；对照：未授权读取 `SR.NOB` 报 `ERR_ACCESS_DENIED`，不授权 `.img` 时 package-check 失败为 `read-failed@input[1]`（原因与位置明确，恢复条件为提供可读文件）。预加载的网络审计拦截 net/tls/dgram/http(s)/fetch，三次均为 0 次网络尝试。私有 `run.sh` 一次完成全部运行、反例与权限对照，其前后 6 个原版文件（4 个光盘文件、`SR.NOB`、`SRANGERS.EXE`）的 SHA-256、大小与修改时间相同（此前各次单独运行的前后哈希也相同）。
- **输出只含结构摘要：** 审计脚本把两份 JSON 的 179 个字符串值全部归类为名称、版本、Asset ID 或哈希（0 个无法归类，0 处主机路径）；`nob-check` 输出 41 行中的每个词都出现在 `tools/nob-check.ts` 源码的标签里或是输入文件名（0 个未知词、0 处主机路径），其余只有计数与尺寸。
- **31 需要的新包身份（`ContentIdentity`）：** schema 1，`classic-p2-slice` 定义版本 7，`osr-import.graphics-6.logic-4.audio-2.models-4`，manifest `manifest:sha256:b0ea7efdd14a5d30b465a7d3d4cb2eb2c1e49537128dd86e63a4ad37800aabac`，来源 `original-import` `source:sha256:67391efbb13ceda3e264f18ae0905d1ba39909ef36b002491ffa33076a35ddeb`（版本 `star-rangers-1995-cd`）。`data/hud/instruments` 指纹 `sha256:362fc198ee56dae7d300fefdc13725c4a4671cf706a6070c96eff1c2b48a8b79`（2,351 字节，角色摘要 `sha256:471151f1…e1fe`），`data/hud/map-geometry` 指纹 `sha256:5f2a84f712f9d311426a71e277860c7fdb2bf457f0d623ca153ffb51097da03b`，cockpit-hud-map 组摘要 `sha256:5b991c99…3386`。
- **rubber-duck：** 只读 code-review 代理按 rubber-duck 角色审查文档与私有脚本，确认独立读取不以包数据为自身期望、各格式偏移与 fixup 解析正确、主要结论有输出支持；三项发现均已处理：`nob-check` 类型数误写为 19（改为 15）；输出审计对 `nob-check` 行的正则过宽（改为逐词对照工具源码标签）；修改时间对比未覆盖最后一次运行（把时间对比、反例与权限对照并入 `run.sh` 重跑，结果不变）。
- **文档影响：** 无需更新。工具指南与本地导入指南的命令和重新导入条件已由 11 写明且与本次结果一致；没有新的原版事实（payload 观测大小由 07/32 记入 cockpit §3），unknowns 不变。
- **私有输出：** `local/research/p3-13/import-check/`（`run.sh`、`independent-read.ts`、`net-audit.mjs`、`audit-output.mjs`，以及 package-check、nob-check、独立读取、反例、权限对照、输出审计、缓存测试日志与前后哈希）。
