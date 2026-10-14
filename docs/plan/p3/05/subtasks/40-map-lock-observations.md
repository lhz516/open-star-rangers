---
type: plan
status: active
phase: P3
task: "05"
subtask: "40"
updated: 2026-10-12
---

# 40 — 地图锁定事件观察与退出屏障回归

**契约来源：** [spec](../spec.md) S-11、S-14、AC-12、AC-16；[战略地图输入](../spec.md#战略地图输入)、[生命周期与资源](../spec.md#生命周期与资源)。
**依赖：** 21、27、39。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 地图测试以有界等待观察原生 change 事件的精确历史，不假设应用确认锁与测试监听收到事件发生在同一步。
- 保留实际锁目标、请求次数、命令、像素、资源及错误断言，不改测试超时或应用能力。
- 受控回归覆盖取得旧锁后撤销、解锁通知前再次申请、禁止旧锁期间指针输入与自动复锁、通知后显式申请成功；为 27 的快速重开观察提供确定性裁决。
- 收窄能力模块顶部概述的 `closing` 描述，使其与既有方法注释和实际幂等行为一致；只改注释，不改变生产逻辑。

## 写入范围

- `e2e/map-input.development.spec.ts`
- `src/ui/game-input/capabilities.test.ts`
- `src/ui/game-input/capabilities.ts`：仅退出屏障的概述注释。

## 验收标准

- [x] change 历史以有界等待断言精确值，地图浏览器用例重复运行通过，未弱化实际锁/像素/资源门槛。
- [x] 受控退出屏障回归通过，27 的发现有代码与测试支撑的明确裁决，不以时序等待掩盖功能缺陷。
- [x] `pnpm check`、聚焦单元/浏览器检查、链接/元数据/diff 检查通过，一次 scoped rubber-duck 与 scoped simplify 完成。

## 验证方法

- 读取平台 Promise/event 确认路径与测试观察器；聚焦 Vitest、完整地图文件至少五轮、`pnpm check`，保持原生 API 与独立合成 context。

## 完成证据

- **观察次序：** `PointerLock.#confirm` 在宿主 Promise 完成后核对实际目标并通知消费者；测试在另一个 document change 监听器记录历史。既有平台测试“lets only the promise answer a promise request…”以未收到目标 change 的实际目标和 Promise 完成确认锁，证明两个观察不是同一屏障。首次浏览器失败没有追踪 Promise/event 的具体调度，不能断言那一次的精确先后；但原立即断言要求了契约没有保证的同步性。三处历史断言改用既有默认有界 `expect.poll`，仍精确要求 `zone`、`zone,none`、`zone,none,zone`，没有放宽内容或超时。
- **27 裁决：** 旧锁确认后撤销但未收到结束通知时，重入申请为既有方法注释规定的幂等调用，而不是新的申请失败；旧锁实际状态仍 active。受控回归证明 requests/exits 均保持 1；真实结束后清输入恰一次、状态 idle，随后的会话帧不自动申请；新显式动作才产生第 2 个申请并确认 generation 2。既有 pointer-input 回归还证明撤销旧锁期间的鼠标输入被抑制。无卡死或屏障绕过，不更改行为；收窄顶部概述中 `closing` 的宽泛描述。
- **检查：** `pnpm exec vitest run src/platform/input/pointer-lock.test.ts src/ui/game-input/capabilities.test.ts` 为 2 文件/54 测试通过；`OSR_E2E_DEV_PORT=5301 OSR_E2E_PREVIEW_PORT=5302 pnpm exec playwright test e2e/map-input.development.spec.ts --project=development --repeat-each=5` 为 55/55 通过（11 例各 5 次，单 worker、无重试、2.1 分钟）。实际目标、像素误差、hover/select、资源和错误门槛保持原值。
- `pnpm check` 最初发现测试调用了仅控制器拥有的 `update`；改为既有公开会话帧驱动，无类型断言或新 API。修正后 typecheck/lint、243 Vitest 文件/7306 测试及 build 全通过；指定聚焦 Vitest 为 46 文件/831 测试通过，compliance `passed: true`。链接/锚点零问题，元数据与 diff 检查通过。
- **审阅/清理：** 一次 scoped rubber-duck 无阻断或非阻断发现；scoped simplify 按复用、复杂度、效率与抽象层级检查，只用既有测试辅助与轮询，无需提取新 helper 或改生产实现。
- **文档影响与回收：** 方法注释本已准确，只有概述需要修正；32/38 的工程指南无需改变。浏览器 runner 使用独立合成 context 和自有开发/预览服务器，结束后正常回收。最终聚焦/完整浏览器复验仍由 33 执行，未提前宣称通过。
