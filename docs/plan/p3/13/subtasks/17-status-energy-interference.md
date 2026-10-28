---
type: plan
status: active
phase: P3
task: "13"
subtask: "17"
updated: 2026-10-28
---

# 17 — 状态、能量页与 SNIP 干扰

**契约来源：** [spec](../spec.md#左显示屏) 的 S-06，AC-08/10。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 页0 按 Core 相位/字段绘制 MFDD 背景/叠加、DIAG 两行打字/轮换/光标；零间隔不无限追赶。
- 页1 按分配档位与满刻度绘制背景、条带和导入标签。
- 提供左右显示屏共用的 SNIP 帧/切换模块，状态/页面门禁与随机节奏按03/08；不重新解析SNIP。

## 不包含

不写 Core 页面/损伤状态、不实现通讯页或 Warp 页、不接应用循环。

## 关键文件与契约

- [status-messages-payload.ts](../../../../../src/content/hud/status-messages-payload.ts)、12 的 blink 输出。
- 计划新增 `src/render/cockpit/left-display/`、`interference/`；20 可只读复用 interference。

## 写入范围

- `src/render/cockpit/left-display/**`：状态和能量模块及测试。
- `src/render/cockpit/interference/**`：通用显示干扰及测试。

## 验收标准

- [x] 背景/层叠次序、blink、文字换行/光标均有精确像素断言。
- [x] 切页/受损/零间隔/首次画面与暂停保持无重复推进。
- [x] SNIP 状态0/1/2与相位、预算及不支持输入按合同处理。

## 验证方法

`pnpm test -- src/render/cockpit/left-display src/render/cockpit/interference`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限两页与干扰模块。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-17`（基线 `17ed65c9`，提交前快进到含 16、18 的 main `bca56e8e`）。

**交付（纯模块，无 DOM/GPU/app/宿主时钟）：**

- [interference/display-interference.ts](../../../../../src/render/cockpit/interference/display-interference.ts)：`createDisplayInterference(frames)` → `DisplayInterference { frameCount, lastFrame(), draw(context, rect, start, forced) }`（`0x4d010`：帧 = ((时钟 − 开始) × 12，u32) >> 6 模帧数，不透明画在 (x0, y0 + 1)，非强制时送屏；非强制且等于共用“上次帧”（初值 −1）时不画）；门控原语 `createInterferenceGate`、`holdInterference`（状态 2：关时开并记开始，不推进下次切换）、`toggleInterference`（状态 1：翻转、开时记开始、抽 1 次 rand，下次切换 = 时钟 + 0x40 + (rand & 0x3F)）、`interferenceFrame`。帧须为同尺寸、不透明、direct 的图像，否则 `ContentContractError('binding-mismatch')`。**一个运行一个实例，由 24 同时交给左显示屏与 20 的右显示屏**，共用上次帧（DC-10）；右显示屏的门控（状态 2 不看下次切换、状态 0 保留开关）由 20 用同一组原语自行组合。
- [left-display/left-display.ts](../../../../../src/render/cockpit/left-display/left-display.ts)：`createLeftDisplay({ content, interference, pages?, initial })` → 处理类型 6 的 `CockpitModule`（`beforeDraw`、`prepare`、`instruments[6]`，另有只读 `state()`），不提供 `paintElement`。页表 7 项（字段 10、11、13×4、无；周期 0、0、0x40、0x10、0x40、0、0x10），各页独立的干扰门与下次刷新；强制 = 目录 +0x0C（`layout.slot.alwaysRedraw`）。`left-page-changed` 令新页下次刷新为 0（`0x4cdf0`）；进出视角 6 的 `view-switched` 即 `0x4cd68`（释放两行 DIAG，页 0 与当前页下次刷新为 0）；`incoming-started` 且 `shown` 即 `0x4e418` 调 `0x4ce18`，下一次调用先以 0 填满矩形。页 2–6 为注入的 `LeftPageDrawer = (context, record) => boolean`：`communicationPageDrawers(pages)` 把 18 的 `drawMenuPage`（页 2–4）与 `drawIncomingPage`（页 5）绑定为绘制器；页 6 由 19 的 `drawWarpPage` 在 24 中接入。缺绘制器的页不画、刷新照常；返回值不影响刷新（改页属 Core）。
- [status-page.ts](../../../../../src/render/cockpit/left-display/status-page.ts)、[diag-line.ts](../../../../../src/render/cockpit/left-display/diag-line.ts)：页 0 按 DC-06 在 `rebuilds` 变化的 tick 记下同 tick 的护盾与字段 0–8 及**上一 tick** 的 `blink`（tick 1 用 tick 0），下一次页 0 调用以 (shield << 8) ÷ c5C 选背景、按 1、0、2…8 以颜色键叠加；组成、任一行到期（next ≤ 采样，非严格）或强制时复制 97 × 96、画 y0 行与两行 DIAG（fonts/1，(x0 + 4, y0 + 5)、(x0 + 4, y1 − 20)，行距为字高），组成或到期且非强制时送屏；每次调用至多一步、无追赶；打完置保持终点，打完且到期后释放。上行循环格式 0–3（评级越界时格式 2 自身为 `%s` 实参），下行有启动消息时每条抽 1 次 rand、低字节 < 0x55 取启动消息，否则字段 0–14 的名称与状态词；状态 3 为消费者故障（越过三个状态词）。
- [energy-page.ts](../../../../../src/render/cockpit/left-display/energy-page.ts)：页 1 在 `energyPageRedraws` 与上次绘制不同、强制或视角模式不同（初值“没有”）时重画：BITM 10467、y0 行、L1/L2 的 TABL 10479 记录（列 0..w 线性读取、行 0..h − 2）、三条带（`IMUL`/截断 `IDIV`，满刻度 0 且值 < 0 为 `invariant-violated`，DC-09）与 fonts/0 标签；半宽表 `ENERGY_HALF_WIDTHS`（f32 累加 t，45t³ 精确截断后钳位 5–45）。
- [left-display-content.ts](../../../../../src/render/cockpit/left-display/left-display-content.ts)：`prepareLeftDisplayContent`（创建时调用）核对图像数量/direct、DC-08 的 DIAG 转换（格式 0、1：`%d`+`%%`；2：`%s`；3：`%d`；下行两个 `%s`）与最大实参下 ≤ 79 字节（格式 2 以自身为最宽实参）、每个可画字节在字体映射内（fonts/1 先大写），违反为 `ContentContractError`。
- 颜色等代码常量（DIAG 上行 8、启动 0xC、子系统 0xF；能量带 0xF、0x14、0xA，标签 8）取自 03 的私有记录，hud §4.4 尚未列出，见下方文档影响。

**验证：**

- `pnpm exec vitest run src/render/cockpit/left-display src/render/cockpit/interference`：4 个文件 43 项通过。
- `pnpm check`（typecheck、lint、Vitest 413 个文件 11,258 项、构建）：通过，退出码 0；只有既有的 >500 kB 块体积警告。
- 关键断言（合成内容，期望画面由测试按记录规则独立构造）：页 0 首次调用整幅 B 逐像素相等（背景、叠加 1、0、4 的次序，重叠像素为叠加 0 而非 1，第 97 列等于下一行首像素，y0 行，两行文字与光标），S 的矩形等于 B；组成用上一 tick 的 blink（相位与当前值不同时字段 2/3 的叠加与背景随之切换），无写入的相位变化不改画面；11 组背景阈值；DIAG 间隔 4 时打字序列 1,1,2,2,3,3,4,4（严格比较的负对照不同），间隔 0 时一次一字并同一步越过换行，两行文字含光标的整幅像素；光标翻转、保持终点释放与格式循环；评级选择与越界 `RR%s`；rand 低字节 0x54/0x7f54 → 启动消息、0x55/0xff → 子系统消息，每条下行恰抽 1 次，序列等于 `cockpitRandom(TEST_SEED)` 推得的期望，无启动消息时 0 次；换页、SNIP、地图视角与 0 tick 批次中 DIAG 状态不变；进出视角 6 释放两行并保留循环索引、当前页立即刷新；无玩家时不画不抽；能量页整幅像素、计数/视角/首次进入的重画规则与满刻度、0、截断、负值与零满刻度故障；页刷新周期（严格大于）、`left-page-changed` 立即刷新；SNIP 状态 2 不抽 rand、帧 0,0,0,1,1,1,2,2 并跳过相同帧，状态 0 立即关闭并恢复页 0；状态 1 的切换时刻与抽取次数，页 2/3 同字段而门独立；状态 3 按状态 1；页 6 永不干扰；`incoming-started`（shown）后先清矩形，`shown` 为假时不清（负对照）；强制时每次绘制、不送屏、不推进刷新；1×24 与 5+0+5+2+5+5+2 分组的 B、S、状态与抽取次数相同；缺绘制器与非法绘制器；`communicationPageDrawers` 把页 2–4/5 分派到 18 的两个方法并保持绑定；左右两屏共用上次帧。内容核对的 limit/limit + 1（68/69 字节加 `%d`、格式 2 的 38/39、下行 70 + 1 + 8/9）、未映射字节与图像绑定。另以变异检查确认关键测试会失败（严格/非严格、叠加次序、相位取值、启动阈值、评级越界、刷新比较、状态 0、计数重画、线性列、上次帧、换页刷新、重建刷新、shown 条件）。
- **Rubber-duck（code-review 代理担任）：** 未发现缺陷；唯一意见为“视角 6 重建令当前页刷新”缺测试，已补测试并经变异确认。
- **Simplify（按四个角度自查本次 diff）：** `idiv` 由 BigInt 改为与 Core `quotient` 同理的截断除法（i32 操作数下精确）；上行循环索引改在格式化之后递增，与下行一致；未发现可复用的现成 helper（Core `quotient` 抛 Core 错误类型，不适用）。复跑上述检查通过。
- **文档影响（不在写入范围，交协调者）：** ① hud §4.4 宜补左显示屏的代码颜色常量（DIAG 上行 8、启动消息 0xC、子系统消息 0xF；能量页中/左/右带 0xF/0x14/0xA、标签 8）；② hud §4.4 能量页“a negative value none”应改为：IDIV 向零截断，−scale < h × value < 0 时长度为 0、仍画底行，h × value ≤ −scale 时不画（代码依据同 03）；③ `docs/engineering/modules/render.md` 的驾驶舱 API 由 24 同步（`createLeftDisplay`、`communicationPageDrawers`、`createDisplayInterference` 由左右两屏共用一个实例）。`docs/original/unknowns.md`、STATUS 与 phase `tasks.md` 无需改动。
- **私有输出：** `local/research/p3-13/17-left-display/check.log`（检查日志）；只读参考 `local/research/p3-13/03-left-display/`、`05-messages-text/`、`04-target-overlay/`，未运行 DOSBox-X 或 Ghidra。
