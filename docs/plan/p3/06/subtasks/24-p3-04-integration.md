---
type: plan
status: active
phase: P3
task: "06"
subtask: "24"
updated: 2026-10-10
---

# 24 — 正式 Runtime/Session 与界面接入 P3-06 契约（合并 P3-04 后的修复）

**契约来源：** [spec](../spec.md) 的 S-02、S-08、AC-01、AC-08；D-01（世界创建输入 `craftInfo`）、D-05（`flight` 分区）、D-06（领域事件）；goal [前提](../goal.md#代码现状与前提)中“P3-04：09 执行时若已接入，09 同时更新其调用者，并按 browser-testing 运行既有合成会话回归”。
**依赖：** 09、12、13、14、15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在执行中新增本项（2026-10-10，依用户对新增修复子任务的预先授权，不需审阅）。09 执行时 P3-04 尚未接入正式 Core；之后 P3-04 快进进入 main，协调者把 main 合并进本分支（`854cfdb2`）。合并后 `pnpm check` 的类型检查有四处失败，都在 P3-04 的调用者中：

- `src/app/mission/mission-owner.ts`：`GameRunSpec` 缺少必需的 `craftInfo`；
- `src/app/runtime/game-event-bus.ts`：`EVENT_TYPES` 未列出 `speed-assist-toggled`、`speed-matched`、`speed-assist-released`、`object-left-world`；
- `src/ui/dev/event-log.ts`：`fieldsOf` 未覆盖这四个事件；
- `src/ui/game/game-session-bridge.ts`：读取已拆分的 `flight.readiness`（现为 `{ motion, combat }`）。

## 工作范围

- **世界创建输入：** 任务所有者与诊断按 D-01 从同一个已验证的资源包读取 `data/craft-info`（与三份逻辑 Asset 同包，经 `decodeRuleDataPayload`），作为 `craftInfo` 传给会话；缺失或解码错误按既有的启动失败路径报告，不回显导入值。任务资格检查若需要同样的输入，一并更新。
- **事件：** 事件总线列出四个新事件；开发事件日志为它们给出固定次序的主要字段。
- **会话桥与界面：** 关键事实改用 `flight.motion` 与 `flight.combat` 的就绪状态（或运动组的就绪），保持“只在事实变化时发布”的语义；不在界面中声明尚未接入的玩法已完成。
- **测试与 e2e：** 更新受影响的 app/ui 单元测试、合成资源包与 e2e 夹具（例如 `e2e/browser-replay.spec.ts` 的 `ReplayContent` 需要 `craftInfo`），使用合成数据，不读原版文件。
- **浏览器回归：** 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行受影响的既有合成会话回归（任务流程、replay、诊断），至少覆盖从任务开始到飞行、退出，以及浏览器 replay。
- **文档：** 同步 [app](../../../../engineering/modules/app.md) 与 [ui](../../../../engineering/modules/ui.md) 模块说明中受影响的段落；Core 分册与源码结构归 19，不在本项。

## 不包含

- Core 契约本身的改动（09–15 已定）；新的玩法、绑定或界面（P3-05、P3-13）。
- Core 分册与源码结构指南（19）。

## 关键文件与契约

- `src/app/mission/mission-owner.ts`、`src/app/resources/mission-input.ts`、`src/app/mission/mission-eligibility*.ts`、`src/app/session/game-session.ts`、`src/app/runtime/game-runtime.ts`、`src/app/runtime/game-event-bus.ts`、`src/ui/dev/event-log.ts`、`src/ui/game/game-session-bridge.ts`。
- `src/content/rule-data/rule-data-payload.ts`、`src/content/slice-definition.ts`；09 的 `src/core/world/craft-info-input.ts`。

## 写入范围

- `src/app/**`、`src/ui/**`：调用者、事件、会话桥及其测试与 test-support。
- `e2e/**`：受影响的规格与夹具。
- `docs/engineering/modules/app.md`、`docs/engineering/modules/ui.md`：受影响段落。
- `src/original-data/conversion/production-rule-data.test-support.ts`：使生产结构的合成 craft-info 满足 Core 的语义检查（2026-10-10 协调者按 scope-request 加入）。
- `src/workers/mission-scenarios.test.ts`：世界创建输入加入 `craftInfo`（同上）。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：replay 内容从同一已验证资源包读取 `data/craft-info`，事件样本表列出四个新事件（同上）。
- `docs/engineering/README.md`：正式会话 `start` 输入的说明（同上）。

## 验收标准

- [ ] `pnpm check` 通过（类型检查、ESLint、全部 Vitest、构建）。
- [ ] 任务开始从同一资源包读取 `craftInfo`；缺失或损坏的 craft-info 有确定的启动失败反馈，并有测试。
- [ ] 事件总线与开发事件日志覆盖四个新事件；会话桥使用拆分后的 `flight` 分区，并有测试。
- [ ] 按 browser-testing 运行的受影响 e2e 回归通过（列出命令与结果），或记录无法运行的项与原因。
- [ ] 改动文档的 `updated:`、链接与锚点有效；不读原版文件。

## 验证方法

- `pnpm check`；受影响的 `pnpm test:e2e` 规格（按 browser-testing 的端口与环境约定）。
- 文档链接与 front matter 检查。

## 完成证据
