---
type: plan
status: active
phase: P1
task: "05"
subtask: "04"
updated: 2026-10-02
---

# 04 — 会话控制与唯一调度

**契约来源：** [spec](../spec.md) 的 S-01 至 S-05、S-07、S-08，AC-01 至 AC-05、AC-07、AC-08、AC-11（控制/调度基础）、AC-14。
**依赖：** 01, 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 建立 `createSyntheticSession(runtimeOptions, host, onError)` 和基本 controller：control/status/currentRun/onStatus，状态/运行/帧/取消类型定义归该模块。只有创建时配置验证副本，没有运行时可修改配置。
- 复用真实 Runtime 创建与配置验证，不重造 Core；非法配置在宿主注册前失败。创建为 idle、runId=null、无请求，一份宿主订阅。错误 cause 与路径不丢失。
- 实现完整状态表、runId 单调分配与旧句柄校验；SessionRun 只提供已实现的输入/命令/读取/订阅能力，无 frame、Core 或事件发布。05 接入其资源与完整通知行为，未实现的方法不得暴露为成功占位。
- running/可见时只有一个请求；回调消费凭证后才能推进一次，结束时再排下一帧。请求 handle=0、复用 handle、重复/迟到回调、restart/exit→start 均由身份+代次阻断。
- 控制不是 Core 命令。暂停/hidden 清意图、折叠状态对，resume 清时钟首帧 0 tick；readVisibility 与 pagehide 阻断共同形成 environmentVisible，回前台不自动运行。
- 当前项自行保证建立/取消宿主订阅、创建/请求失败有明确收尾和错误，不能把所有异常吞到 06。06 补全系统性故障矩阵及跨消费者组合。
- 新增可复用的测试宿主，仅提供计数、手动交付帧/通知及注入端口失败，不实现任何世界规则。

## 不包含

- 05 的资源注册/边界内控制和取消消费者，06 的完整失败聚合及 replay 矩阵；本项不声称这些 AC 已全部满足。
- 不依赖真实浏览器模块，不接 React、键盘或渲染器，不给生产提供 fake host 默认回退。

## 关键文件与契约

- 计划新增 `src/app/synthetic-session.ts`、`src/app/synthetic-session.test.ts`、`src/app/synthetic-session.test-support.ts`。
- `src/app/session-host.ts`、`src/app/session-errors.ts`（01 计划交付）与 [Runtime](../../../../../src/app/synthetic-runtime.ts)（02 扩展后只读使用）。
- [engineering](../../../../engineering/README.md)（已有，本项记录 controller 与 run 的权限边界）。

## 验收标准

- [ ] AC-01：idle 初始化、非法输入无宿主残留、getter 取值副本、多实例隔离；runId 守卫在销毁旧 run 前拒绝 MAX_SAFE_INTEGER，代码审阅准确。
- [ ] AC-02：表驱动状态/幂等、pause 时不靠 tick 执行控制、新身份/commandId 重置、旧句柄读写注册拒绝。
- [ ] AC-03：稳定成功状态最多一个实际请求，0/重复/复用/迟到凭证都不能推进或续排旧循环；exit/dispose 正常后请求为 0。
- [ ] AC-04：1000/1020/1040/1050→暂停→100000/100020 为原样 spec 结果，折叠对 2/2 不倒退、下一 tick 2/3；较早新时间戳允许。
- [ ] AC-05/07：清空轴/队列、不重置世界，paused 拒绝游戏输入；hidden/pagehide 保持挂起到显式 resume，user 原因不被覆盖。
- [ ] AC-08/11 基础：正常 0 tick 通知与状态读取可靠；首次 request 失败有可读 faulted，初始化失败无无主监听；不自动重试。
- [ ] AC-14：目标测试、pnpm check 通过，模块无 DOM 依赖、真实 Core、无 App/main 接线。

## 验证方法

- `pnpm exec vitest run src/app/synthetic-session.test.ts src/app/synthetic-runtime-lifecycle.test.ts`；完整 `pnpm check`。
- 以固定 seed=0、50 Hz 和可控 host 交付时间戳；记录 outstanding 请求及代次，不拿页面 FPS/计时器近似 tick 验收。
- 状态、报告、ID 精确断言，运行句柄权限用类型负向测试。故障只注入 host/创建边界，真实 World 独立对照。
- rubber-duck 后 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 仅上述三个新文件；工程使用说明同步，不新增未实现媒体流程。实际浏览器验收在 07。

## 完成证据
