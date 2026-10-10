---
type: plan
status: active
phase: P3
task: "07"
subtask: "16"
updated: 2026-10-09
---

# 16 — 能量与显示状态

**契约来源：** [spec](../spec.md) 的 S-08、AC-10（规则部分）；[能量与显示状态](../spec.md#能量与显示状态)。
**依赖：** 04, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **能量阶段：** 按 04 的 Q-08 结论实现 `energy` 阶段（经 11 的 `energy.ts` 导出 `run`）：先玩家后其他对象的次序与筛选（活动、停放、已停靠、新生、被毁）；按类别的更新间隔与到期比较；护盾与武器充能按档位恢复并消耗能量；子系统 0 受损时的额外消耗；整数运算按原版语义。
- **速度消耗：** 速度阈值的消耗规则实现为接收速度输入的函数并单独测试；接到 P3-06 的速度状态归 22。
- **耗尽：** 能量钳为 0；非玩家对象按 Q-08 的效果；首次进入耗尽处理时发出 `energy-depleted` 并写入具名待处理状态（不当作任务失败，恢复前不重复通知）。
- **能量管理与页面：** `energy` 的 `open`、`shield-increase`/`shield-decrease`、`gun-increase`/`gun-decrease` 与 `damage-report` 的效果、档位范围与边界、上下文与原因码；左显示屏页面状态（原版页表序号）与自动返回。
- **测试：** 初值读取；各类对象的间隔与筛选；恢复与消耗；速度阈值上下（以给定速度）；子系统 0；能量与容量为零时不产生 NaN；耗尽每次转换一次、恢复后可再次耗尽；命令的状态、边界与原因码；页面状态。

## 不包含

- 实例化初值（12）；速度与最高速度（P3-06）；Warp 能量（P3-09）；修理与补给（P3-10）；页面绘制（P3-13）；信标流程（P3-11）。

## 关键文件与契约

- `src/core/systems/energy.ts`（11 新建）：能量阶段与命令。
- 计划新增：`src/core/rules/energy.ts`、`src/core/rules/displays.ts` 及相邻测试。

## 写入范围

- `src/core/systems/energy.ts`：能量阶段、命令与页面。
- `src/core/systems/energy.test.ts`：能量系统测试（新建）。
- `src/core/rules/energy.ts`：恢复、消耗与耗尽规则（新建）。
- `src/core/rules/energy.test.ts`：能量规则测试（新建）。
- `src/core/rules/displays.ts`：左显示屏页面状态（新建）。
- `src/core/rules/displays.test.ts`：页面测试（新建）。

## 验收标准

- [ ] AC-10：初值、档位、到期比较、更新间隔、原始资源与满刻度按 Q-08；玩家与非玩家、活动、停放、已停靠、新生、被毁分别测试。
- [ ] AC-10：速度阈值上下的消耗规则以给定速度测试；能量为零、容量为零与非法除数不产生 NaN。
- [ ] AC-10：耗尽事实每次转换一次，恢复后可再次耗尽；`e`、`s`、`g`、`d` 的状态、边界与反馈正确。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step` 断言阶段次序、命令结果与事件；公式的期望由 Q-08 独立推导。
- 速度消耗与 P3-06 的接线在 22 中验证；连续速率的对照见 27。

## 完成证据
