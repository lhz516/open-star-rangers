---
type: plan
status: active
phase: P3
task: "12"
subtask: "13"
updated: 2026-10-17
---

# 13 — 表现层效果：额外爆炸、事件 0x10 与判别值 1/2 碎片

**契约来源：** [spec](../spec.md) 的 S-08、AC-12；[表现层效果与会话级选择者](../spec.md#表现层效果与会话级选择者)；[X2–X9](../../../../original/formats/executable.md#destruction-explosions-and-fragments-p3-0706)。
**依赖：** 01, 05, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/render/flight/presentation/effects/`（计划新增）实现：
  - 额外爆炸：来源为机体的主爆炸，用 10 的构造事实与步首相机的位置和第 0、1 行逐分量计算偏移；个数、变体、激活延迟与线性运动按 X2、X3；额外爆炸没有碎片与额外爆炸。
  - 事件 0x10：首次回调时按 X4 设三个事件时刻，用 X5 自身的投影与当前视角的逻辑视口做门禁，距离类别 300/450；到期按 X5 产生判别值 1、2 碎片（个数、方向、速度、自转、启动旋转表、到期）。
  - 带标志的判别值 2 碎片到期时转为一次 `other` 爆炸，原碎片图形保持到所持来源应释放的时刻；碎片出区按 10 提供的活动区域输入；不随主爆炸提前消失。
  - 闪光检查（`0x24314`）：主爆炸激活后的首次更新按来源种类、L1 距离与前向点积判定，产生一次闪光请求。
- 构造与首次回调的次序按 X9 区分对象更新阶段与较晚阶段；覆盖普通、玩家延迟、AI 当 tick 创建、碎片再爆炸与来源已从末态移除。
- 测试：注入随机源逐项核对数量、速度与轴、偏移、时序、门禁边界与闪光条件；与 [B-009 归表现层的观察](../../../../original/behavior/B-009-combat-rules.md#归表现层的观察交-p3-12p3-14) 中实际覆盖的样本对照，未读分支不冒称已对照。

## 不包含

- 绘制（20、21）。
- 被毁视角相机（14）。

## 关键文件与契约

- 计划新增：`src/render/flight/presentation/effects/`。
- 输入：10 的构造事实与活动区域投影；12 的相机与选择者。

## 写入范围

- `src/render/flight/presentation/effects/**`：额外爆炸、事件 0x10、判别值 1/2 碎片、闪光检查与测试。

## 验收标准

- [x] AC-12：每类情形的构造、首回调、激活、运动与到期符合 X2–X9；门禁用 X5 的投影，300 与 450 两侧正确；碎片不提前消失，出区按区域输入。
- [x] 与 B-009 的已覆盖样本对照不矛盾，结论写入完成证据。
- [x] `pnpm exec vitest run src/render/flight/presentation` 通过。

## 验证方法

- Node 测试，注入随机源。

## 完成证据

- **实现（2026-10-17，按 D-01 的 [FS-03](../../02/spec.md#fs-03-领域事件)、FS-05、[FS-07](../../02/spec.md#fs-07-表现层的只读接口renderflight不在-core) 与 12 的 `PresentationEffects` 缝；不改 `presentation/*.ts`）：** 新增 `src/render/flight/presentation/effects/`。
  - [effect-rules.ts](../../../../../src/render/flight/presentation/effects/effect-rules.ts)：纯算术。额外爆炸（X2 第 6 步）：n = rand AND 3（大型 +2），每个六次抽取 F(rand × C × K + B)（(30, −15) 或 (120, −60)），各乘相机 R0.x…R1.z 后逐分量相加，位置 F(P + 2u + (t₁R0.x + t₄R1.x))，u = normalise(F(相机 − P))；延迟 rand % 21。门禁 `0x2443c`：Core 的 `pointInFrame`（`0x56dc0`），10 ≤ z < 3800，sx = chop(W·x/z) + (right SAR 1)、sy = chop(−W·y/z) + (bottom SAR 1)，含端点；类别 1、2 恰为大型种类，不保留；类别 0 以 F(P − 相机) 的平方和 < 90000 保留两种、< 202500 只保留模式 2。生产者：模式 1 (rand AND 3) + 10、模式 2 rand % 5，只有 `0x91780` 的种类产生。`0x24ec4`：判别值 2 的标志 rand % 10 = 0、`randomDirection`（判别值 1 取第二次）、自转 5° + 20°/10° 跨度、速度 4 + 14/12、速度 F(基础 + u × s)、启动旋转表 rand % 64、自转轴 0 或 rand % 3；判别值 1 的形状 rand % 2（`0x3e590`）。f64 常量为度数 × 3.1415927 ÷ 180、14、12、4：在本地映像的同一常量池中逐位找到（高概率，只记数值）。寿命 0x100/0x200 + rand % 0xC0。闪光 `0x24314`：只对机体来源，大型总是，否则 L1 < 100，或 < 150 且前向行点积 > 0.707。爆炸速度 s = F(R2·v ÷ R2·R2)（v = F(R2 × s)；FS-03 只给速度向量）。
  - [presentation-effects.ts](../../../../../src/render/flight/presentation/effects/presentation-effects.ts)：`createPresentationEffects({ content })` 返回 `FlightPresentationEffects`（`PresentationEffects` 加 `fragments()` 与 `flashRequests(tick)`），每运行一份，作为 `FlightPresentationInput.effects` 接入。每 tick 按 PV7 的遍内次序重放：构造（`explosion-created` 的机体来源，以步首相机建额外爆炸并预留槽；首次回调在 `object-update` 构造时为同 tick，否则下一 tick，X9）→ 对象更新（机体爆炸的首次回调须恰为其 `explosion-started` 的 tick，用激活位置、步首相机与门禁视口设 +0xC/+0x10 的事件；门禁视口取上一 tick 的，若本 tick 有 `mission-flow` 阶段的 `view-switched` 则取其视角的；上一 tick 末 `display` 为 `shown` 的才张贴到期事件；额外爆炸首次回调抽延迟，时钟严格超过后激活；碎片首次回调设到期并进入状态 7；状态 6 的对象离开）→ 请求处理（首次更新的闪光检查，用上一 tick 末的爆炸位置与步首相机，X4；激活；更新：帧号 ≥ n 释放所持碎片，+0x60 之后进入状态 6；生产者以上一 tick 末的爆炸位置与 `explosion-created.velocity` 产生碎片；到期：带标志者成为一次 `other` 爆炸的所持来源，继续运动，其余进入状态 6）→ 运动（Core 的 `spinFragment`；爆炸按 `0x22818` 漂移）→ 区域检查（Render State 的 `activeAreaCentre` 与 Core 的 `isWithinActiveArea`，没有中心时同 Core 全部出区；所持碎片不检查）。表现层爆炸进入状态 6 的同 tick 调用 `end`（PV6：该遍渲染即去掉视觉），下一 tick 的回调再释放仍所持的碎片；碎片在状态 6 的下一 tick 离开并释放槽。`fragments()` 给出每个碎片的键、判别值、部件序号或形状、标志、父爆炸、来源种类、`display`（pending/shown/released）、位姿及创建、激活、所属爆炸与状态 6 的 tick。闪光请求按 tick 保留最近 5 个 tick（FS-07 每帧至多 `MAX_TICKS_PER_FRAME` 个 tick），更早的读取为 `invalid-input`。所有截止时刻以安全整数相加，越界为 `presentation-capacity`。随机全部取表现随机源；原版结果不被使用的抽取（非机体与额外爆炸的模式 0 事件）不取。
- **测试与 AC-12：** [effect-rules.test.ts](../../../../../src/render/flight/presentation/effects/effect-rules.test.ts)（注入随机源：额外爆炸个数与抽取数、逐分量抖动（用非单位换位的行区分 t·R0 + t′·R1）、大型跨度、延迟支持集；门禁的 z 两端、chop 与左右上下端点（F1 与全屏视口）、299.9/300/449.9/450 两侧、屏外、类别 1/2 与各类别 0 种类；生产者个数与 `0x91780`；两种判别值的抽取数、标志、方向、自转/速度端点、启动旋转与轴、形状；速度恢复（非单位 R2、负速度、零行）；寿命；闪光的来源种类、L1 100 与 150 两侧、前向 0.707 两侧）与 [presentation-effects.test.ts](../../../../../src/render/flight/presentation/effects/presentation-effects.test.ts)（经真实 `createFlightPresentation`：碰撞构造 N → 首次回调 N+1 → 额外爆炸按延迟激活、位置、漂移与 +0x60 后离开；全部 r = 0…20 的激活间隔为 2⌊r/2⌋ + 2；`object-update` 构造同 tick 计时；玩家延迟爆炸用构造 tick 的步首相机而非帧末相机，闪光看下一 tick 的步首相机；大型与导弹来源；激活 tick 不符、无构造事实、首次回调前被移除；碎片的 +0xC/+0x10 产生、首移、到期与离开 tick；带标志碎片的再爆炸、所持期间继续运动、动画结束释放、爆炸离开；距离与屏幕门禁、同 tick `mission-flow` 切换与较晚阶段切换；离开状态 7 不再张贴；区域检查（远中心与无中心）、所持碎片不受区域检查而随爆炸状态 6 下一 tick 释放；闪光时机与保留窗口；安全整数越界）。
- **与 B-009 已覆盖样本的对照（[归表现层的观察](../../../../original/behavior/B-009-combat-rules.md#归表现层的观察交-p3-12p3-14)）：** 不矛盾。额外爆炸每次 1 至 2 个：kind 0x80 为小型，支持集 0–3；激活在主爆炸后 6 至 24 单位：本实现在 2 单位步长下为 2⌊r/2⌋ + 2（2–22），原版步长可大于 2，24 在其支持集内（r ≤ 20 加一个步长）；主爆炸与额外爆炸在首个 Δ > 0x60 的样本请求移除：一致（表现层的视觉在该 tick 去掉，见上）；判别值 1、2 碎片按时到期、按帧转动、创建帧不移动：一致；判别值 1 的轴为 0、判别值 2 抽取（样本为 1）：一致；碎片爆炸的来源种类 0x1000000：一致（`sourceKindBit` 24）；变体 1：来自 12 的选择。未读的分支（闪光条件的运行时、kind 0x100 的碎片事件、门禁边界的运行时）不称已对照。
- **检查：** `pnpm exec vitest run src/render/flight/presentation tools/engineering-boundaries.test.ts` 通过（effects 2 文件 27 项）；`pnpm typecheck`、eslint 通过；`pnpm check` 通过（346 文件 10205 项，构建成功；块体积警告为既有）。
- **rubber-duck：** 采纳全部四项：速度恢复改为除以 ‖R2‖²（行未必单位长）；区域检查或 +0x60 移除的表现层爆炸在同 tick 结束（原先多留一 tick，可能多画一帧），下一 tick 释放所持碎片；截止时刻改为检查安全整数；补玩家延迟爆炸的取样测试。simplify：额外爆炸与再爆炸只存漂移速度（不再伪造 mode-1 块），`splice(indexOf)` 改为原地压缩，`delayed` 由来源推出，门禁表收为“大型不保留”加两阈值，键经 `liveKey` 检查而非强转，上一 tick 的实体表只在有机体爆炸时建立，测试辅助去掉未用导出；未采纳：`drawRand` 与 explosion-selection 的同名函数合并（该文件不在写入范围，未导出）、角度常量改用 `PI_CONSTANT × ONE_180TH_CONSTANT`（与映像中的常量逐位一致的是现写法）、闪光改为“取走即清”（无消费者时无界）。
- **文档影响：** 不改 `docs/engineering`（交 28）。建议 28 在 [modules/render.md](../../../../engineering/modules/render.md) 记载 `createPresentationEffects`、`fragments()` 与 `flashRequests(tick)` 的用法与保留窗口，以及 20（判别值 1/2 碎片的外观来源：形状、部件 i mod 列表 1 数）与 21（闪光请求）的消费方式。原版事实：额外/碎片常量在映像常量池中的位置只作高概率记录于此，`docs/original/` 与 unknowns 无需更新；STATUS 与 tasks 无需更新。

