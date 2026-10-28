---
type: plan
status: active
phase: P3
task: "13"
subtask: "18"
updated: 2026-10-28
---

# 18 — 通讯页与有界消息行

**契约来源：** [spec](../spec.md#消息行指示条与-warp-灯) 的 S-06/S-08，AC-06/11/13。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 页2–4 只消费菜单选项 key/tone/引用，保留两种布局/截断/闪烁；页5 读当前 incoming/shown 和注入的 G-03 摘要。
- 消息队列区分入队/首次逻辑显示/未画过期/滚出；按05/08的绘制前后阶段处理 incoming-started、flight-message、radio-flushed、速度辅助。
- 零时长消息仍入一次，完成/信标各按实际次序丢队首；只走一个事件通道。
- 提供基地页可读的当前摘要快照/订阅端口，不新建第二队列，不导入 UI 文案模块。

## 不包含

不导入 CMOV 台词/头像，不改变 radio 回调，不修改 BasePage（25）。

## 关键文件与契约

- [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[comm-menus.ts](../../../../../src/content/rule-data/comm-menus.ts)。
- 计划新增 `src/render/cockpit/communications/`、`messages/`。

## 写入范围

- `src/render/cockpit/communications/**`：菜单/来电纯模块及测试。
- `src/render/cockpit/messages/**`：有界队列、时点、当前视图与测试。

## 验收标准

- [x] 入队/取出不等于开始显示；绘制末尾开始只能下次合格绘制显示。
- [x] 零时长、连续flush/beacon/完成、跨视角与不同帧分组均无提前/重复/丢消息。
- [x] 摘要缺映射、字节/条数超限明确反馈，完整信息不因96像素面板裁掉。

## 验证方法

`pnpm test -- src/render/cockpit/communications src/render/cockpit/messages`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限消息消费者，不建事件溯源系统。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-18`（基线 `8b921c7e`）。未启动 DOSBox-X，未运行 Ghidra；原版事实只引用 [hud §4.7](../../../../original/formats/hud.md#47-message-line-type-8)、[comm §4](../../../../original/formats/comm.md#4-text-rules-confirmed)、[cockpit 的每视角规则](../../../../original/formats/cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301)、[FC2](../../../../original/formats/executable.md#fc2-layers-per-view-mode--confirmed-code) 与 [05 的完成证据](./05-messages-text-research.md#完成证据)；页 2–4 的行 x（x0 + 6，与标题同用 HI 参数块 +0x48）与 BITM 的 97 列只读核对了 03 的私有反汇编，未新增原版记录。

**交付（纯模块，无 DOM/GPU/app/UI 导入，随机抽取 0 次）。** 24 装配、17 的类型 6 分派与 25 的基地桥接按下列接口接入：

- [message-queue.ts](../../../../../src/render/cockpit/messages/message-queue.ts)：每运行一条有界队列 `MessageQueue`：`post`（入队尾；≥ 64 项、单项 > 128 字节或总字节 > 8 KiB 时丢**新**项并 `drops` 加 1，不抛错，Δ-05）、`dropHead`（`0x4e9b0`，空队列也置清除标志）、`expire`（`0x4e964`，只看未显示的队首，u32 严格 >）、`show(sample, W)`（`0x4e6c0` 第 2、4、5 步：首次逻辑显示记 `firstShown`（未显示为 null，不用 0），偏移 W − ((dt × 48 或 120 mod 2³²) >> 6)，宽度 + 偏移 ≤ 0 时移除、置清除标志并返回 null，即本次不画）。
- [message-line.ts](../../../../../src/render/cockpit/messages/message-line.ts)：`createMessageLine({ font: fonts/0, flightMessages, copy })` → `MessageLineModule`（`CockpitModule`，处理类型 8；登记在全局回调次序 8、6、9、12 的首位）。① 按事件原次序：`radio-flushed` 丢一次队首；`flight-message: beacon` 先丢队首再入队（0x0C/1/0x3C0）；`missionComplete` 只入队（0x0C/1/0x280，入队样本为上一 tick 的时钟）；`speed-assist-toggled` 按 `enabled` 入 `speedAssistOn/Off`（0x0F/2/0x140）。③ `global` 先过期再由类型 8 绘制（hud §4.7 第 1–7 步：视角 ≠ 8 时清除标志整矩形填 0 并在非常重绘槽送屏；文字行 y = trunc((y0 + y1 − h)/2)；只画整字（`wholeGlyphRange`，最右像素 ≤ x1 − 3）；视角 ≠ 8 填 (x0, y)–(x1 − 1, y + h) 并在非常重绘槽只送这条带；视角 8 不做整矩形清除、填 (x0, y0)–(x1 − 1, y1 − 1) 并画颜色 8 外框）。④ 只有 `incoming-started` 入 G-03 摘要（颜色 8、模式 1、0x200、宽 8 × 字节），因此最早在下一次合格绘制首次显示；`radio-queued`、`radio-taken`、`incoming-ended` 不入队，同 tick 开始又结束的消息只入一次。只消费表现模型的逐 tick 有序事件，不订阅 Event Bus。无玩家实体（`projection.player.entityId` 为 null）与不调用驾驶舱的视角（0x13）冻结：不过期、不绘制。基地视角（6）没有槽，`global` 在过期后按槽 0 类型 8 记录的宽度（与 10097 槽 0 相同，hud §4.7）推进队首、不画像素，使基地页看到的队首按前视的宽度/到期策略滚出（G-05）。
- **基地页端口（DC-07）：** 同一模块的 `snapshot()`（冻结；只在变化后换新对象）给出 `head`（`serial`、`source`、`origin: original | project`、文字、来电身份、`covered`）、`incoming`（当前 tick projection 的 `communications.player.incoming` 及其摘要、`covered`、`shown`）、`length`、`messageDrops`；`subscribe(listener)` 在改变快照的钩子结束时同步发布、返回取消函数。没有第二条队列、计时器或重播；`dispose` 后拒绝使用。
- [message-copy.ts](../../../../../src/render/cockpit/messages/message-copy.ts)：应用注入的 `IncomingCopy { summary(message), label(message), uncoveredSummary, uncoveredLabel }`（25 定义文案，本模块不导入 UI）。摘要 1–58 字节、标签 1–2 行 × 1–16 字节，只用 0x20–0x7E、无 0x7B，且在绘制字体（fonts/0；fonts/1 先大写）的映射内；违反为 `invalid-input`/`unmapped-character`。`uncovered*` 在创建时核对；缺映射时显示“未覆盖”文案并在快照中 `covered: false`，不静默。`checkSummaryText`/`checkLabelLines` 供 25 在运行开始前逐条核对。
- [communication-pages.ts](../../../../../src/render/cockpit/communications/communication-pages.ts)：`createCommunicationPages({ font: fonts/1, background: BITM 10467, hudText, commMenus: { id, content }, names, copy })` → `drawMenuPage(context, record)`、`drawIncomingPage(context, record)`，由左显示屏的类型 6 分派在页 2–4、5 调用（页面、刷新周期与 SNIP 门禁归分派者，本模块不写 Core 页面）。页 2–4：BITM 10467 不透明画在 (x0, y0 + 1)、源列 0..w 共 97 列（第 w 列读下一行首像素；末行该列在图像外，不复现，原版被框架遮住），y0 行颜色 0；标题颜色 0x13 在 (x0 + 6, y0 + 4)；各项从 y0 + 15、行距 9、y ≤ y1 − h + 1（HI 9 行），每行为键字节 + 正文（分类与命令取数据第 2 字节起、对象为分隔符 + `names(name)`、退出项取所在表末项），截到 trunc((x1 − x0)/6) 字；颜色末项 0x0C、活动对象 0x10、受威胁 0x0A 在时钟第 5 位为 0 时显示 0x0F、其他 0x0F；只读 Core 选项的 key/tone/表与源序号引用，菜单的 Asset 与 projection 引用不符或源序号越界为 `invariant-violated`；无菜单返回 false、不画。页 5：在 `incoming` 存在且 `shown` 时把 (x0, y0 + 1) 起的 96 × 96 帧区填 0，在其中居中画 G-03 短标注（fonts/1、颜色 0x0F、行距 9），y0 行颜色 0；完整摘要只进消息行与基地页。HI 切片未引入 LO 路径（纯文字分支、fonts/2、LO 面板布局、10101 矩形、COMMFAC2 时长）。

**DC-13 关卡（被毁视角中消息队列是否可能非空）：可达（已确认，代码推演）。** Core 的 `destroyPlayer`（[player-loss.ts](../../../../../src/core/systems/player-loss.ts)）在同一 tick 先 `flushRadio('player-destroyed')` 发出恰一个 `radio-flushed`，再 `view-switched` 到 0x11/8；消费者只丢一次队首（hud §4.7 的 `0x2cd20` → `0x4e9b0`），所以被毁时队列有 ≥ 2 项就会把余项带进槽 7 的消息行，而清除标志在每次被毁时都会置位。≥ 2 项在正常游玩中常见：一条 G-03 摘要在槽 0 需要 (181 + 8n)/0.75 单位滚出（40 字节约 334 tick），来电约 57 tick 一条；速度辅助连按两次也会排队。被毁后子状态 2 使 `takesRadio` 为假（[radio.ts](../../../../../src/core/rules/radio.ts)），不会再有 `incoming-started`，只剩积压项与速度辅助。因此 AC-23 的真实内容核对（30/31）应把“被毁视角的消息行”列为可达项；本任务以合成测试覆盖。

**世界行的覆盖（实现取舍，按 DC-05 与 FC2）。** 槽 7 的矩形在视角 0x11 的世界行中。原版世界视图不整体清除帧缓冲，各世界层在后续帧画在早先留下的像素之上，所以第 1 步的整矩形填 0 只在当帧盖住世界，之后等同黑色太空。本模块每次绘制前先把矩形落在世界行的部分取消覆盖（`clearRect`），再按原版步骤填充：清除那一帧整矩形盖住世界，之后只有正在画的文字带盖住世界，队列清空后的下一帧世界完全露出。与原版只差移除那一帧（原版上一帧的文字仍在世界之下可见，本项目显示世界）。视角 0xC 的槽 0 矩形在驾驶舱带，不受影响。

**验证。**

- `pnpm exec vitest run src/render/cockpit/messages src/render/cockpit/communications`：2 个文件 32 项通过。关键断言（合成字体每个字形带自身码位，可从像素读回文字；矩形设为 hud §4.7 的 HI 几何）：
  - 阶段：`[速度辅助开, 关, beacon]` 后 beacon 丢“开”；`[radio-flushed(completion-message), missionComplete]` 只丢一次；`incoming-started` 在本 tick 不显示，tick 8 的字形在 x0 + 172，同 tick 的 beacon 在 x0 + 171（负对照）；同一序列按 1×10、5+5、2+3+5 分组的快照与像素相同；零时长只入一次，`radio-queued`/`radio-taken`/`incoming-ended` 不入队。
  - 15 tick 跨 F1 → 地图 → F1 → 被毁视角、含来电开始结束、清空、beacon、完成与双清空的序列，按 1×15、5+5+5、2+0+3+0+5+4+1（含空批次）分组时快照、发布序列、B（含覆盖）与 S 完全相同。
  - 绘制：dt 336 时宽度 + 偏移 = 1 仍绘制并送带，dt 338 时 = 0 移除且本次不送屏，下一次整矩形清除一次；偏移 −3 时首字为第 1 字、在 x0 + 5，左侧无像素；末字的第 7 列恰在 x1 − 3、其右无像素；模式 2（速度辅助）dt 12 偏移 159。
  - 过期：58 字节长队首滚出后，入队样本取上一 tick 时钟的完成消息（到期 862）在时钟 864 过期，后一条（到期 864，等号不严格大于）同 tick 首次显示；未显示的三项在一次 `global` 中只过期队首；已显示项从不过期。
  - 地图：清除标志不整矩形清除，外框颜色 8 在列 152–390、行 411–425 共 504 像素，空队列不画外框；返回 F1 时标志仍触发整矩形清除；F1 → 地图偏移相对 x0 右移 58。
  - 被毁视角：清空 + 切视角同 tick 后余项在槽 7 文字行 8–15 由帧末整屏复制显示，处理例程不送屏；覆盖由清除帧的 3,111 像素降到文字带 1,638 像素，清空后的下一 tick 为 0。
  - 冻结：无玩家实体与视角 0x13 中 200 tick 不过期、不画；基地视角按槽 0 宽度在 tick 170 滚出、B 与 S 无像素。
  - 限值：64 项保留、第 65 项丢弃且 `messageDrops` = 1、不抛错；128 字节保留、129 字节丢弃；未覆盖消息显示“未覆盖”文案、`covered: false`；超过 58 字节、控制字符、0x7B、空串与映射外字节均拒绝，运行中出现时表现模型锁存失败。
  - 端口：每次改变只发布一次、重复查询返回同一对象、空批次与无变化 tick 不发布、当前来电摘要随 projection 更新、取消订阅后不再调用、释放后拒绝使用；随机抽取 0 次。
  - 通讯页：背景第 96 列取下一行首像素、末行该列为 0；标题 0x13；`1FRIENDLY BASES` 截在 15 字；10 个对象只画 9 行；对象/活动/威胁闪烁/末项颜色与 tick 16、8 的对照；三张命令表按引用取文字、退出项取表末；常重绘槽不送屏；无菜单不画；Asset 不符与源序号越界拒绝。页 5：标注居中于 96 × 96 区（两行 y 380、389），区内只有标注像素、区外保持原样，未覆盖消息用未覆盖标注，Warp 中或无来电不画；标注超过 2 行、16 字节、含 0x7B 或映射外拒绝。
- `pnpm check`（typecheck、lint、全部 Vitest 406 文件 11,159 项、生产构建；只有既有的 >500 kB 块体积警告）：在 rubber-duck 与 simplify 修改之后复跑通过，退出码 0。
- **Rubber-duck（code-review 代理担任）：** 一条实质意见——被毁视角中槽 7 的矩形位于世界行，`fillRect` 的覆盖在该视角永不清除，每次被毁都会留下盖住世界的黑框。已采纳：按 FC2 在每次绘制前取消世界行部分的覆盖（见上节），并补覆盖计数断言。另一条——“本 tick 不显示”的测试在 dt 0 时空洞——已改为 tick 8 的位置对照。审阅确认其余要点（阶段、过期、偏移与移除、整字、地图分支、跨视角、冻结、基地推进、限值、快照变更检测、G-03 文案约束、通讯页布局与颜色、页 5、DC-13 结论）成立。
- **Simplify：** 按 simplify 的四个角度自查本子任务 diff：发布前后的比较改为不分配的字段比较；删去未用的 `posted` 字段；菜单表文字改为按表名的查找表。基础层若对世界行统一取消覆盖（见交接建议）更合层次，但在 `presentation/**` 写入范围之外，未改。复跑上述测试与检查通过。
- **文档影响：** 原版事实无新增（DC-13 的结论是 Core 序列与已记录规则的推演，记于此处），`docs/original/` 与 unknowns 不变。需要但不在本写入范围：`docs/engineering/modules/render.md` 的驾驶舱消息行/通讯页 API（24 同步）；spec DC-13 可记“18 已核实：可达”；见 worker 报告。
- **私有输出：** `local/research/p3-13/18-communications/check.log`（`pnpm check` 输出）；无原版内容。
