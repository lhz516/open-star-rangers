---
type: plan
status: active
phase: P3
task: "13"
subtask: "19"
updated: 2026-10-28
---

# 19 — Warp 页与就绪灯

**契约来源：** [spec](../spec.md#左显示屏) 的 S-06/S-08，AC-10/14。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 页6 消费 angle/error/completion/centring，按批准绘制规则画三条带、标题与有界轨迹。
- 轨迹依任务时钟/0x10刷新语义，Warp 序号改变重置；indicator 驱动类型12。
- 空 page/非Warp和暂停/0tick区分，禁止自造固定进度动画。

## 不包含

不修改 Warp 能量、位姿、路径、相机或音效。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts) 的 CombatWarpReading。
- [render-state.ts](../../../../../src/core/projections/render-state.ts) 的 Warp 序号。
- 计划新增 `src/render/cockpit/warp-display/`。

## 写入范围

- `src/render/cockpit/warp-display/**`：页6、灯与合成测试。

## 验收标准

- [x] 三读数/轨迹来自同tick输入，刷新等号与边界无提前。
- [x] 多次Warp和重试不继承旧轨迹，非Warp不画页6。
- [x] 0tick只重画，所有输出均可由合成像素测试验证。

## 验证方法

`pnpm test -- src/render/cockpit/warp-display`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限页6表现，31用截图066对照。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-19`（基线 `bca56e8e`）。未启动 DOSBox-X，未运行 Ghidra；原版事实只引用 [hud §4.4 页 6](../../../../original/formats/hud.md#44-left-display-type-6)、[hud §4.8 类型 12](../../../../original/formats/hud.md#48-indicator-strip-type-9-and-warp-lamp-type-12)、[T8](../../../../original/formats/executable.md#t8-left-display-no-target-reads-confirmed-code) 与 [Warp 进度](../../../../original/formats/executable.md#warp-progress-completion-and-interruptions-p3-0906)；轨迹连线条件、刻度起点与 `0x4e018` 的两种填充/标签定位只读核对了 03、07 的私有反汇编，未新增原版记录。

**交付（纯模块，无 DOM/GPU/app/UI 导入，随机抽取 0 次）。** 17 的类型 6 分派与 24 的装配按下列接口接入：

- [warp-page.ts](../../../../../src/render/cockpit/warp-display/warp-page.ts)：`createWarpPage({ font: fonts/0, background: BITM 10467, hudText: { leftWarpTitle, leftWarpBar1Label, leftWarpBar2Label, leftWarpBar3Label } })` → `WarpPage { drawWarpPage(context, record): boolean; history(); serial() }`。`drawWarpPage` 已绑定，可直接作为 17 的 `LeftPageDrawer` 传入 `pages: { 6: warpPage.drawWarpPage }`；页面、0x10 严格刷新与 SNIP 门禁归分派者，每次调用即一次刷新、追加一个样本。读 `flight.combat.player.warp.page` 与同 tick Render State 的 `warp`；二者缺一（非视角 1、无玩家）返回 false、不画不送屏并清空历史（原版视角 ≠ 1 时同样清空；页面序号是 Core 的，不改）。历史至多 94 项（`COCKPIT_LIMITS.warpTrail`）trunc(c × 50)，满时左移；`warp.serial` 与上次追加时不同即清空（替代原版的 Warp 开始标志）。绘制：BITM 10467 97 列不透明于 (x0, y0 + 1)、y0 行 0；点 i 于 (x0 + 94 − n + i, y0 + 2 + h[i])，与前一点（前一点 x > 0 时）以 0x13 连线，i mod 3 = 0 时自 y + 2 至 y0 + 51 画 0x11 刻度；基线 0x10；标题 fonts/0 颜色 8 于 (x1 − 66, y0 + 2)；三条带 a（y1 − 40…y1 − 28，两端起，0x0F，标签居中）、s（y1 − 26…y1 − 14，0x0A）、p（y1 − 12…y1 − 2，0x10）（后两者自左、不含终点、标签右对齐），标签 fonts/0 颜色 8、每字按 8 像素定位；非常重绘槽送整矩形。读数不在 [0, 1] 为 `invariant-violated`，在任何改变之前；文字的字节在创建时按 fonts/0 映射核对（`unmapped-character`）。
- [warp-lamp.ts](../../../../../src/render/cockpit/warp-display/warp-lamp.ts)：`createWarpLamp({ font: fonts/1, hudText: { indicatorWarpInterval } })` → `WarpLampModule`（`CockpitModule`，处理类型 12，`state(): { lit, forced }`）。24 须把它登记在类型 9 模块之后，使全局回调保持 8、6、9、12。`global` 在有玩家时取 Core 的 `warp.indicator`，变化即置强制标志；无玩家保持原状（原版先返回）。`activate` 置强制标志，永不清除。非常重绘槽：未强制不动作；灯亮在 (x0, y0) 以 fonts/1（步进 6、大写）颜色 0x10 画字、不先清除，灯灭整矩形填 0；然后送矩形。常重绘槽只在灯亮时画字、不送屏。每运行从灭/未强制开始（Δ-04）。

**验证。**

- `pnpm exec vitest run src/render/cockpit/warp-display`：2 个文件 24 项通过。关键断言（合成字体可从像素读回文字；左显示屏矩形 (58, 340)–(153, 439)）：
  - 页 6：背景第 96 列取下一行首像素、末行该列为 0、矩形外第 96 列不送屏；基线恰为 92 像素；c = 1 的 10 个样本得到 12 个刻度像素（列 84/87/90/93，行 51/53/54，与截图 066 的预测一致），轨迹全被基线覆盖；h = 0…6 时 0x13 与 0x11 像素集合逐一相等；单样本只有刻度、点本身保留背景（负对照）；95 次追加后为最后 94 项、最旧点在 x0；trunc 边界 0.0199999 → 0、0.02 → 1、1 → 50。
  - 条带：a = 0 只画两端两条，a = 0.5 每端 12 条，a = 1 共 46 条（与截图 066 第一条带的 46 条一致），上下各一行无溢出；s、p = 0 不画，0.25 为 11 条，1 为 46 条（x < 151），下一行无像素；标签位置 97、125、117。
  - 门禁：serial 改变重新开始；无读数/非 Warp/有读数无 transit 都返回 false、B 无像素、不送屏、历史清空，此后同一 serial 也从新历史开始；常重绘槽画而不送；越界读数抛错且历史、B、送屏均不变；映射外文字在创建时拒绝。
  - 真实表现层（测试内的分派替身按 hud §4.4 实现 0x10 严格刷新）：c = tick/100 时 tick 1–19 追加 [0, 5, 9]，即 tick 1、10、19（每 9 tick），tick 9 的样本 18 等于到期值不追加；Warp 中 B 每次调度填 0 而 S 保持上次送屏的页面；空批次不改变历史、调度、B 与 S；同一运行的第二次 Warp（serial 2）首个刷新重新开始，新运行的模块历史为空。
  - 类型 12：未激活且灯未变不动作；激活后灯灭每次调用都填 0 并送屏；灯变亮当次画字（未画位保留底板）并送屏，再灭则填 0；无玩家保持亮；常重绘槽灭时不填、亮时画字、都不送屏；文字按大写后的 fonts/1 映射核对。表现层中创建即激活，灯在 tick 2 变化时同 tick 显示；Warp 视角中 S 的灯矩形只有 0 与 0x10，空批次不改变状态、B 与 S。
- `pnpm check`（typecheck、lint、全部 Vitest 412 文件 11,239 项、生产构建；只有既有的 >500 kB 块体积警告）：退出码 0。
- **Rubber-duck（code-review 代理担任）：** 无实质意见；确认门禁、读数校验先于改变、历史与 serial、轨迹/刻度/条带/标签几何、背景复制、常重绘、类型 12 的强制标志与无玩家分支均与契约一致，并指出 Core 的 c 在管壁处恰为 0、各读数不会越出 [0, 1]。
- **Simplify：** 按四个角度自查本 diff。背景复制与 18 的私有方法、17 未合入的 `blitColumns` 相同，因不能跨写入范围引用而保留本地实现（建议 24 合流后改用共享函数）；字形预检与大写转换没有通用的导出函数，保留；未发现冗余状态或多余计算。
- **文档影响：** 原版事实无新增，`docs/original/` 与 unknowns 不变；可选的 hud §4.4 细化（单样本不画点、连线条件为前一点 x > 0）不改变已记录规则，未提出。需要但不在本写入范围：`docs/engineering/modules/render.md` 的驾驶舱 Warp 页/灯 API（随 24 同步）。
- **私有输出：** 无（未运行原版或研究脚本）。
