---
type: plan
status: active
phase: P3
task: "14"
subtask: "16"
updated: 2026-10-28
---

# 16 — 运行级有序音效消费者

**契约来源：** [spec](../spec.md#发声类别) 的 S-04、S-05、S-06、S-08、AC-03、AC-04、AC-05、AC-10。
**依赖：** 11, 12, 13, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 连接公开 onAny/onFrame，按 D-02 收集本帧事件、等待已准备的表现快照、按 tick/顺序消费，再更新持续声音。
- 使用分配账本、参数与 14 的声音侧 HUD 提示状态（D-02 的 DW-10；没有共享 HUD 模型），区分一次性激活标记和播放句柄；爆炸和纯表现来源有独立命名空间。
- 处理新建/活动/停放/待移除、限频边界、声音被抢占、零 tick/静止帧、锁定和隐藏后重建；旧脉冲/重复/爆炸不补发。
- 帧内缓存按已批准事件/效果预算限制；结束、故障、取消与 run 退役失效缓存/回调，绝不调用 step 或提交命令。

## 不包含

- 不自建 rAF/计时器，不实现相机或选择器；生产装配与跨任务验证归 17–20。

## 关键文件与契约

- 现有 [GameSessionRun](../../../../../src/app/session/game-session.ts)、[MAX_TICKS_PER_FRAME](../../../../../src/app/runtime/game-runtime.ts)和 CORE_LIMITS。
- 计划新增 `src/app/flight-audio/consumer.ts`、`consumer.test.ts`、`consumer.test-support.ts`。

## 写入范围

- `src/app/flight-audio/consumer.ts`：运行级消费与清理。
- `src/app/flight-audio/consumer.test.ts`：批次、持续状态与故障测试。
- `src/app/flight-audio/consumer.test-support.ts`：合成端口/帧与可控音频能力。

## 验收标准

- [x] 0/1/多 tick 批次、独立同 Asset 事件、短命来源和本帧结束的效果不漏触发或重播。
- [x] 持续状态、句柄和激活标记分离，锁定/隐藏/停止不积压一次性声音。
- [x] 预算、失效回调与错误路径可断言，不改变 Core/RNG，不产生额外循环。

## 验证方法

- 使用真实 Session 加合成帧端口和假音频能力，独立核对播放意图/停止顺序；`pnpm test -- src/app/flight-audio/consumer.test.ts`、`pnpm check`。
- [simplify](../../../../../.agents/skills/simplify/SKILL.md)限定本项；替身覆盖不替代 19/20 的真实集成。

## 完成证据

- **实现：** [consumer.ts](../../../../../src/app/flight-audio/consumer.ts) 的 `attachRunAudio(run, { ownerId, content, controller, presentation, record? })` 在 tick 0 核对表现实例（非 null、owner/run 相同、`camera().tick` 等于当前 tick），按 DW-03 逐 tick 配对 `TickOutput` 与结构类型 `AudioPresentationTick`（`afterStep`、`activations`、含 DW-02 `forward`/`speed` 的 `explosions`；20 交付的实际 `PresentationTick` 可直接传入），按 DW-04 的次序处理：全部停止 → `hud-cues.beforeDispatch` → 类型 2 → 停靠门禁 → 类型 4、8（事件项先于更新项，更新项按种类位再按 ID，表现层爆炸最后；本 tick 没有玩家实体时不产生更新项，事件项与移除照常，DW-04 的 2026-10-28 补充）→ `afterDispatch`。逐对象声音表照 A-02（限频 12 单位、建表时不设时钟、状态 0/1/2、爆炸只在建表那次抢占、受击遇已结束为无声），移除与离表照 DW-07，爆炸照 DW-08。运行结束、`invalidate()` 或契约错误都停止全部发声、清空缓冲与声音表并撤销两条订阅；之后的输入无操作。可选 `record` 给 18 的开发日志（每项含 tick、时钟、触发序号、Asset、来源、类别、结果与封闭码、初始参数、被抢占来源）。
- **测试：** [consumer.test.ts](../../../../../src/app/flight-audio/consumer.test.ts)（40 项）与 [consumer.test-support.ts](../../../../../src/app/flight-audio/consumer.test-support.ts)（手动帧端口、表现端口、真实控制器 + 假能力）。覆盖：装配错误不留订阅；两种输入次序 × 1/5/0–5 分组决定相同；静止帧与 0 tick 帧不重放、不推进参数；9 类配对/预算违约均抛出并结束运行声音；同 tick 分派次序与抢占来源；停止事件先于本 tick 一切声音、救援 11381 在停止后播放；停靠跳过对象项与移除；槽 0 限频边界（时钟 12 处刷新）、自然结束后在下一个不受限频项重放、首次失败下 tick 重试而后续失败每 12 单位重试；空槽一次 `empty-slot`；受击的再播与 `ended-hit`；一次性来源用列表或事件快照、玩家保持开始值；A-05 引擎参数；退场停止并重建、停放只丢表；爆炸首放抢占、丢失后隔一项不抢占重放；表现层爆炸离表即停；隐藏后只重建槽 0 与存活爆炸；锁定时不排队；新运行从空表开始；没有玩家实体时不产生更新项而射击、受击与表现层爆炸的离表停止照常；激活/爆炸/实体表预算。正式 Session（合成战斗世界 120 tick）：三种分组 × 两种次序的决定与参考完全相同，Core 事件与帧请求数与无音频运行相同；每个射击/受击恰一个决定，玩家射击保持 127/64，选目标按事件 tick 播放，玩家引擎在首个位姿项开始，Core 与表现层爆炸都有声音。期望值按 A-02/A-04/A-05 公式与 D-02 独立推导。
- **命令：** `pnpm test -- src/app/flight-audio/consumer.test.ts` 通过；`pnpm exec vitest run src/app/flight-audio/` 153 项通过；`pnpm check` 通过（439 个测试文件、11,819 项，typecheck、lint、build）。
- **Rubber-duck：** 认为配对、次序、限频、爆炸重放、暂停中的发声、听者、停靠门禁与出错失效符合合同。采纳：开发记录增加 `preempted`；补充装配中订阅失败不留残留的测试；说明 `ownCleanup` 登记保留到运行结束的理由（会话通知中不允许释放）。上报协调者的两点已由协调者在 DW-04 中裁定（2026-10-28）：地图标记（种类位 25）的更新项无声，照实现采纳；A-01 的“ps 与其玩家存在时”门禁加入 DW-04，已实现并补测试。
- **Simplify：** 合并射击与受击的处理，实体/效果表共用一个带预算的建表函数，每 tick 一次分桶更新项并只排序一次，Core 爆炸按实体 ID 索引，去掉冗余的 `#effectKeys` 状态。未采纳：改动 voices.ts 提供 play 观察钩子（不在写入范围）、跨文件共享 `deepFreeze`/单位矩阵/假运行句柄（范围外）。
- **文档影响：** 写入范围内无需更新的文档；`docs/engineering/modules/app.md` 的音效模块说明归 17/27。原版事实未变，unknowns 不变。

