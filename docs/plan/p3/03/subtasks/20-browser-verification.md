---
type: plan
status: active
phase: P3
task: "03"
subtask: "20"
updated: 2026-10-09
---

# 20 — 浏览器验证

**契约来源：** [spec](../spec.md) 的 S-15、AC-15（浏览器缓存）、AC-17；[验证策略](../spec.md#验证策略)的浏览器验证。
**依赖：** 19, 26, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用版本 4 的合成包在生产预览中验证，不使用原版数据：
  - 导入后显示 `Complete resources, viewable`；保存后刷新，用 `Open saved resources` 恢复并重新校验；
  - 查看器能打开至少一个爆炸帧图像、一个星云图像、受击闪烁贴图与目标显示屏背景；断言实际的 Canvas/WebGL 像素与合成图像一致，不只看 Canvas 存在或 HTTP 200；
  - `Sounds` 列出新增的 `event-sound` 与 `hud-sound`，并能播放其中一个合成波形（断言调用与生命周期）；
  - `repeat` 方式的合成声音（27 提供）按次数播放后自然结束，可被提前停止（spec 修订 1，AC-17）；
  - 19 的交接：查看器的第一个图像现在是带掩码的爆炸帧；AC-24 布局对照在透明纹素上期望的棋盘灰（102）与实际渲染（153）不一致，19 已把该用例改用不透明的导弹图像。判明哪一方符合查看器契约：若是对照有误，修正对照并恢复覆盖带掩码的图像；若是渲染有误，不在本项改应用代码，作为阻塞报告给协调者。
  - 旧转换器版本的合成缓存记录不提供恢复。
- 在 [e2e/](../../../../../e2e/) 中新增或扩展用例：`viewer-page`、`resource-cache`、`cache-recovery`、`audio-playback` 及其观察支持。新用例带网络审计与资源平衡，不发出未预期的网络请求，也没有遗留资源。
- 运行完整的 `pnpm test:e2e`，确认既有用例全部通过。

## 不包含

- 原版数据的浏览器核对：本任务不要求。外观对照在 21 中只用本地数据与截图完成。
- 查看器中 data Asset 的专用显示：不做（spec 技术决定 9）。
- 本地导入指南：由 22 同步。

## 关键文件与契约

- [viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts)、[resource-cache.spec.ts](../../../../../e2e/resource-cache.spec.ts)、[cache-recovery.spec.ts](../../../../../e2e/cache-recovery.spec.ts)、[audio-playback.spec.ts](../../../../../e2e/audio-playback.spec.ts)、[e2e/support/](../../../../../e2e/support/)。
- [viewer-items.ts](../../../../../src/app/viewer/viewer-items.ts)（只读）：新增图像与声音无需改代码即可列出。
- [工程约定：本地浏览器 runner](../../../../engineering/README.md#本地浏览器-runner)。

## 写入范围

- `e2e/**`：新增与扩展的浏览器用例及观察支持。

## 验收标准

- [x] AC-17：版本 4 的合成包完成导入、保存与刷新恢复；查看器显示上述四类新图像，像素断言通过；`Sounds` 列出新声音并播放一个合成波形，`repeat` 声音按次数播放后结束；无未预期的网络请求或遗留资源。
- [x] 带掩码图像的棋盘灰差异已判明，结论与处理记录在完成证据中。
- [x] AC-15（浏览器）：`resource-cache` 与 `cache-recovery` 通过，旧版本记录不提供恢复。
- [x] 完整的 `pnpm test:e2e` 通过；证据记录用例名、结果与 Chrome 版本，不保存截图到仓库。

## 验证方法

- `pnpm test:e2e`；按 browser-testing 核对实际画面与声音调用。合成按键与合成数据不作为原版证据。

## 完成证据

2026-10-09，worker `exec-p3-03-20`（应用管理的 worktree，分支按协调者的适配改名为 `exec-p3-03-20`），基于认领提交 9c203d6。只改 `e2e/**` 与本文档，应用代码未改。浏览器检查只用代码生成的合成数据：Chrome 155.0.8059.39（`channel: chrome`，headless；`development-headed` 与音频可见性用例为 headed），开发服务器 `http://127.0.0.1:5160`，生产预览 `http://127.0.0.1:5161`，每个用例用隔离 context；不保存截图到仓库。

- **棋盘灰差异（19 的交接）：对照有误，渲染正确。** 用临时诊断用例（未入库）在 AC-24 的四种布局中读取 3×3 的带掩码爆炸帧 `image/explosion/01/01`：只有 1280×800、像素比 2 时 6 个透明纹素的样本为 153 而不是期望的 102。截图中图像左上的深色方格从设备行 0 开始、正好 8 行，而对照从行 −1 读取：画面区域位于 −0.375 CSS 像素（条目列表变长后，区域在文字之下落在小数位置），`bufferPixels` 把原点算作 `Math.round((区域 + frame) × 像素比)` = −1。另以独立的 WebGL 画布在 1/8 像素的偏移上实测（一次性脚本，未入库）：Chrome 先把画布位置取整到 CSS 像素再乘像素比，例如像素比 2 时 50.25 → 设备行 100、50.5 → 102（不是 101）；像素比 1 时两种算法相同。棋盘格的相位与灰度（左上第一格为 102、每格 8 个缓冲像素）符合 [viewer-presentation.ts](../../../../../src/render/viewer/viewer-presentation.ts) 与 render 分册的约定。处理：
  - [viewer-observations.ts](../../../../../e2e/support/viewer-observations.ts) 的 `bufferPixels` 改为 `Math.round(CSS 位置) × 像素比`；其余调用者（AC-11/12/13/14/18、失败矩阵的 `viewHeld`、开发联合闭环）都通过；
  - AC-24 用例恢复为第一个图像（带掩码的爆炸帧，`role` 断言为 `explosion-frame`），并用新增的 `checkerNeighbours` 在每个灰色样本右侧一格、同一透明纹素内加一个另一灰度的样本；断言样本含两种灰度与不透明纹素，四种布局逐字节一致。不透明的导弹图像不再需要。
  - 生产联合闭环的 `framePixels`（未改）用区域矩形裁剪截图，只在像素比 1 下运行，不受此影响；若以后在像素比 2 下使用，宜改用同一规则。
- **AC-17，开发测试入口的完整流程**（[viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts)“imports the version 4 package, saves it, restores it after a reload, and shows its new images and sounds (P3-03 AC-17)”，网络审计与资源平衡下运行，文件名标记为金丝雀）：
  - 选择合成切片光盘的文件后导入，状态依次为 `Source identified`、`Complete resources, viewable`、`Saved in this browser (saved in …)`、`Mission loads into Core`；回菜单后存储恰为该包（键与各组 Asset ID 等于 Node 中同一光盘的 `models` 转换），平衡通过；
  - 刷新前保留释放证据，刷新后 `Open saved resources` 恢复为 `restored and verified`；
  - 查看器：四个新角色（`explosion-frame` 186 个、`nebula-background` 15 个、`hit-shimmer`、`target-display`）的每个图像都在列表中；各取第一个显示，截图解码读回的像素与 Node 预期逐字节一致，另加一个非棋盘格的不透明纹素，带掩码的爆炸帧同时读到棋盘格；版本 4 新增的 12 个 data 角色（17 个动画在内）都不在列表中；
  - `Sounds` 列出全部 8 个 `event-sound` 与 3 个 `hud-sound`；可信点击播放 `none` 的 HUD 声音：探针记录的声音源缓冲与测试按 payload 文档布局独立解码（不经 `readSoundPayload`）的采样逐值相等，`start()` 不带时间，自然结束后发声数与连到输出的节点数为 0，且没有任何 `stop()`；
  - 播放 `sound/event/warp-arrival`（`repeat` 8 次，3 帧）：一个循环整段缓冲的声音源（`loop` 为真，`loopStart`/`loopEnd` 为 0），恰有一次预定的 `stop(when + 8 × 3 / 11025)`，自然结束；返回菜单后 AudioContext 已关闭（`close()` 已 resolve），平衡通过。
- **AC-17，生产预览与开发服务器的 `/`**（新增 [version-4-viewer.spec.ts](../../../../../e2e/version-4-viewer.spec.ts)，普通 `*.spec.ts`，两个项目都运行；网络审计与资源平衡下运行）：合成文件在生产预览中只能到 `source/unsupported-version`（P2-12 技术决定 1），因此按 `seedProductionCache` 在测试自己的 context 中以生产身份预置版本 4 的包，其中 `warp-arrival` 换成可计时的长声音 `LONG_REPEAT`（8000 Hz u8，每遍 150 ms 静音、300 ms 振幅 0.5 的方波、150 ms 静音，3 遍）；包的来源指纹、manifest 身份与该声音的摘要作为金丝雀，先证明在缓存中。刷新后经菜单恢复并重新校验，查看器同上显示四类新图像并逐字节读回。
  - 自然结束：探针在页面内每 5 ms 采样上下文时间与输出峰值，采样在点击之前开始、在上下文时间越过预定结束 0.4 s 后才结束（不按挂钟，避免上下文启动慢时截短）。听到的段恰为 3 段，各在自己那一遍的方波中，最后一段在预定结束之前结束，之后全为静音；只有一次预定的停止。实测（本次完整运行）：开发为 0.151–0.493、0.760–1.091、1.358–1.695 s，生产为 0.151–0.493、0.755–1.086、1.353–1.695 s，预定停止 1.800 s；
  - 提前停止：再次播放，听到声音后点 `Stop sound/event/warp-arrival`，声音源的停止依次为预定的一次与立即的一次（不带时间），立即停止早于预定结束（开发 2.723 / 4.093 s，生产 2.705 / 4.087 s），只听到 1 段，之后全为静音，发声数与连接数为 0；
  - 第一版长声音在一遍开头就是方波，曾在预定停止处多出约 40 ms 的“第 4 段”：Chrome 对重采样的循环缓冲在循环点做线性插值，结束前最后几帧已向下一遍首帧插值到 0.42。改为每遍首尾静音后不再出现。复跑 5 次 × 两个项目共 10 次通过（负载均值约 4.3）。
- **AC-15（浏览器）：**
  - [resource-cache.spec.ts](../../../../../e2e/resource-cache.spec.ts) 的损坏与不兼容表加入“slice definition version 3”：恢复为 `cache-incompatible`、列出为 `incompatible`，记录逐字节不变；
  - [cache-recovery.spec.ts](../../../../../e2e/cache-recovery.spec.ts) 新增“offers no restore of the previous converter version's package…（P3-03 AC-15）”（网络审计与资源平衡下运行）：以 P3-02 的生产转换器版本 `osr-import.graphics-3.logic-1.audio-1.models-3` 提交合成包，并按旧版本写法把各组身份改为切片定义版本 3（[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的 `damageStoredPackage` 增加该选项）。直接恢复为 `cache-incompatible`、列出为 `[[旧版本, incompatible]]`，读取不改变记录；菜单为 `None in this browser`，不出现 `Open saved resources`；随后导入保存在当前键下，旧版本的记录不迁移、不删除、不变；刷新后只提供新包，恢复并校验，记录不变。
  - `cache-recovery` 与 `resource-cache` 全部通过（22 项，开发项目）。
- **探针与支持模块：** [audio-playback.ts](../../../../../e2e/support/audio-playback.ts) 的音频探针增加 `sources()`（每个启动的 AudioBufferSourceNode 的缓冲采样、循环设置，以及 `start`/`stop` 调用时的上下文时间与参数；启动时复制，不保留节点或缓冲）与 `beginTrace`/`finishTrace`（页面内采样，结束按上下文时间）；不注册任何监听，资源平衡不受影响。[version-4.ts](../../../../../e2e/support/version-4.ts) 放版本 4 的角色、查看与试听步骤、独立的声音解码与长声音包；`settleTooling` 改由 [resource-balance.ts](../../../../../e2e/support/resource-balance.ts) 导出供新用例共用。
- **检查：**
  - 改动前的基线完整 `pnpm test:e2e`：179 通过、2 失败，都是联合闭环的“无长任务”断言（55、56 ms 的单个长任务），当时负载均值约 7（其他 worktree 在运行）；负载约 3.5 时单独复跑两个文件 4 项都通过、0 个长任务，判为负载所致，与本项无关；
  - `pnpm check` 通过（182 个测试文件、5,840 项，构建通过）；`pnpm typecheck` 与 `pnpm lint` 无问题；
  - 完整 `OSR_E2E_DEV_PORT=5160 OSR_E2E_PREVIEW_PORT=5161 pnpm test:e2e`：185 项全部通过（10.2 min；基线 181 项加新增 4 项），含两项联合闭环、`viewer-page` 的 AC-24 与 P3-03 AC-17、`cache-recovery` 的 P3-03 AC-15、两个项目的 `version-4-viewer`；
  - 服务器与浏览器均由 runner 或用例关闭，端口 5160–5162 已释放。
- **Rubber-duck：** 采纳 3 项：试听轨迹原按挂钟结束，负载下第一次播放的上下文启动慢时会截短（复现 5 次中 1 次失败），改为按上下文时间结束并在结束时补一个样本；一次性声音“没有 stop”的断言改为在自然结束之后读取；期望的声音由测试按文档布局独立解码，不再调用被测的 `readSoundPayload`。其余方面（原点规则、探针包装、AC-15、审计与平衡）未发现问题。
- **Simplify：** 采纳：`settleTooling` 改为一处导出；切片定义改写并入 `damageStoredPackage`；用 `statusOf`；`contentSamples` 与棋盘格邻格样本移入 `viewer-observations.ts`；探针级的轨迹与声音源读取移入 `audio-playback.ts`；探针在启动时复制记录、用 WeakMap 找停止、不保留节点，采样间隔 5 ms；`playSound` 轮询 `started()`；`expectNewImages` 内部断言带掩码图像；查看器打开步骤共用 `openHeldViewer`；去掉长声音包的缓存；AC-15 的记录读取改用摘要模式。未采纳：把其他未改用例中的同类私有辅助函数（`recordsOf`、`storedPackage`、`loopingPackage`、`pictureWithOpaque`、状态文字常量、另两份 `settleTooling`）抽到支持模块，需要改动不在本项中的用例；`framePixels` 的原点规则同上。
- **文档影响：** 写入范围只有 `e2e/**`，以下建议交协调者或 22：
  - [工程约定](../../../../engineering/README.md#本地浏览器-runner)的音频探针一节：`sources()`、`beginTrace`/`finishTrace`，以及重采样的循环缓冲在循环点插值、计数用的合成声音须首尾静音；
  - 同文档的页面回归路线：新增 [version-4-viewer.spec.ts](../../../../../e2e/version-4-viewer.spec.ts) 在两个项目中运行；`bufferPixels` 按 Chrome 的规则（先取整到 CSS 像素再乘像素比）定位画面；
  - render 分册的棋盘格约定不变（渲染正确）。其他文档无需更新。
