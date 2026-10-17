---
type: plan
status: active
phase: P3
task: "08"
subtask: "19"
updated: 2026-10-15
---

# 19 — 僚机处理器与友伤累计

**契约来源：** [spec](../spec.md) 的 S-09、AC-07，AC-08 中友伤累计；[僚机](../spec.md#僚机)；04 的研究与 08、09 定稿。
**依赖：** 16, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-wingman.ts`：内置僚机处理器 `0x610c8` 及子处理器（编队、跟随、交战、返航、友伤后的模式变化、攻击航线 `0x63c00` 复用 16 新建的 `src/core/rules/ai-attack-pass.ts`、AICO 元素），按 04 的结论与 01 确认的各内置程序参数；接入 15 的分派。
- 友伤累计：按 09 定稿（[P3-02 CR-27](../../02/spec.md#cr-27-友伤累计的分工d-03)），写入留在 P3-10（`0x3c208` 第 1 步的 `0x38f20`，已实现于 [comm-reactions.ts](../../../../../src/core/systems/comm-reactions.ts)），本任务不写累计；实现读者 `0x38fd8` 的阈值判定（`accumulated` > AICO +0x28，等号不阻塞）与私有行为字节 b = 5，并在 P3-10 的写入上联合验证“命中 → 累计 → 愤怒”的完整链（每次伤害只累计一次）。
- 无僚机配置下没有僚机实体、控制器与回复；世界级公共状态保持合法初值。
- 测试：各行为转换的条件与边界、编队相对位置、导弹发射与锁定字节、友伤阈值的等号与跨阈值（合成累计值）、新世界与无僚机。

## 不包含

- 僚机命令（20）；停放处理器（21）；P3-10 的无线电与菜单；友伤累计的写入（P3-10，已交付）。

## 关键文件与契约

- 已有：[comm-reactions.ts](../../../../../src/core/systems/comm-reactions.ts)（P3-10 的 `0x3c208`，写入友伤累计；只读其结果，不改）。
- 计划新增：`src/core/rules/ai-wingman.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-wingman.ts`：僚机处理器（新建）。
- `src/core/rules/ai-wingman.test.ts`：测试（新建）。
- `src/core/systems/ai.ts`：接入。
- `src/core/systems/ai.test.ts`：集成测试（含友伤完整链的联合验证）。
- `src/core/systems/spawn.test.ts`：僚机安装镜像写入 +0xC4/+0x90 后的期望。

## 验收标准

- [x] AC-07 的各项由测试覆盖；友伤累计来自原始伤害调用点且只累计一次。
- [x] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 测试，期望由 04 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：** 新建 [`ai-wingman.ts`](../../../../../src/core/rules/ai-wingman.ts)：安装 `0x60f80`（AICO 元素 +0xDC − 1 的分数与横滚匹配、噪声，AI 锁定开启，下次更新）、初始行为 `0x61d64`、应用 `0x61740` 与镜像 `0x61dfc`（含 B+4/B+8 访问器失效即清零）、周期行为 `0x61a88`（愤怒、b 0–4 的转换、编队附近搜索的交战半径 i32 与截断距离严格比较、b 3 的完全修理 `0x39820`）、`0x610c8` 的更新次序（停靠、近距规避半周期、b ∉ {0, 1, 5} 松开通道 0、最近受害者规避 `0x6c07f`/愤怒时 `0x6c07e`、b 0/1 的攻击航线复用 `ai-attack-pass.ts`、按 b 的飞行与速度带、通道 0/1 的按下、列表 1 无弹时换挂点、每 0x780 一次的主炮切换抽取）、友伤读者 `0x38fd8`（`isFriendlyFireBlocking`：累计 > AICO +0x28，有符号，等号不阻塞）。累计的写入仍只在 P3-10（未改 comm-reactions）。[`ai.ts`](../../../../../src/core/systems/ai.ts) 把僚机加入 `HANDLERS`（模式 2 无事可做），处理器调用的公共部分合并为 `handlerCall`。命令消费（第 2 步）留给 20：`WingmanCall.consumeCommand(call, controller)`，并导出 `applyBehaviour` 与 `isFriendlyFireBlocking` 供其复用。离场仍经 16 的 `requestWarpDeparture`（`warp-departure` 的处理归 21）。
- **测试：** [`ai-wingman.test.ts`](../../../../../src/core/rules/ai-wingman.test.ts)（27 项，期望按 WA1–WA10、WB6 与合成数据独立推导）：读者的等号与有符号阈值；安装的元素参数、AI 锁定、编队偏移 (125, 3, 25)、镜像与同一调用中的飞行和噪声抽取；`0x61d64` 的六种 +0xC4/+0x90 组合；b 0–5 的应用与回退结果（含访问器清零）、b 1 越过 PT/B+4 的搜索、b 3 活动/停放/无基地、b 4 活动区内外（半径 7500 的等号在外）；愤怒及其粘性；b 0 失效/B+4 回退、b 1 目标为 PT 时重选、b 2 交战半径 979.9/980.5 两侧与 0x140 节奏、越过 B+4 与排除 PT；b 3 到达修理（含无序距离算到达）、b 4 每次请求离场；编队速度带 16/32/120 的等号与 60/5 的停止；追击速度带 250/550、通道 0（保持 0x60）与通道 1（−1 → 0x7D00）、列表 1 换挂点清锁定、0x40 的主炮切换抽取；攻击航线；近距规避（只计对方半径，AICO +0x20 严格、须在前方，半周期）；受害者规避（AICO +0x24 严格，愤怒时不计玩家）；停靠；b 3/4 无速度与按下；七个（元素, 周期）合成参数元组的分数、噪声、节奏与前置常数。[`ai.test.ts`](../../../../../src/core/systems/ai.test.ts) 新增 6 项：首次回调安装并在同一调用中执行更新体与其抽取（油门噪声 1 次）；移除不抽取、停放安装走未接入的停放处理器、恢复后重装再次抽取，B+4/B+0x0C 丢失、b 由镜像重建；b 5 恢复为 0（对 B+8），同一调用的周期更新在累计仍高时恢复 5、累计回落时保持 0；**完整链**：玩家投射物经 `applyShotHit`（P3-07 伤害入口，P3-10 的 `0x38f20` 计入）击中僚机 3 与 1 → 累计 4（每次伤害只计一次）不愤怒，再 1 → 5，僚机下一次到期更新 b = 5 并瞄准玩家；窗口结束后新命中把累计重置为 1，b 保持 5；愤怒僚机在 AI 锁定达到 4 后经通道 1 发射制导导弹，`launchByte` 4、热寻程序、目标为玩家；无僚机配置 40 tick 内无种类 1 实体、无僚机控制器，`friendlyFire` 保持 {0, 0}。“未接入”测试排除种类 1。
- **检查：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm exec vitest run src/core/rules/ai-wingman.test.ts src/core/systems/ai.test.ts` 59 项通过；[`spawn.test.ts`](../../../../../src/core/systems/spawn.test.ts) 原在 40 tick 后断言僚机 `ai` 仍为实例化值（mode 4、target null），接入后安装的镜像按 WA4 写入 mode 2、target 玩家，经范围扩大改为此期望（goal 不变）；之后 `pnpm check`（typecheck、lint、全量 vitest、build）通过。`pnpm test:e2e`（端口 5163/5164）227 项通过，1 项失败为 joint-pipeline 的提交长任务（62 ms，主机负载），单独重跑通过。
- **Rubber-duck：** 无阻塞问题；一项采纳：b 3/b 4 的到达比较按原生 `JNC`，无序距离算到达（改为 `!(d >= k)`，加测试）。
- **Simplify：** 合并 `handlerCall`，`consumeCommand` 改为接收 `call`，抽出 `isPursuit`/`departAndClear`，去掉转发包装与空分支、重复 import。未采纳：每次更新只建一个 pilot（只省少量分配，需改各函数签名）。
- **文档影响：** 未改文档。交 28：core.md 的僚机处理器与 `consumeCommand` 接缝；executable WA5 补“到达比较无序算到达”的代码事实；WA6 编队停止对已失效 S+0x10 的速度，原版无句柄检查直接读取，Core 取 0（[P3-02 CR-24 决定 17](../../02/spec.md)，已批准差异）。

