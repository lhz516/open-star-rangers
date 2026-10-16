---
type: plan
status: active
phase: P3
task: "14"
subtask: "10"
updated: 2026-10-15
---

# 10 — 逐发声参数与源采样进度

**契约来源：** [spec](../spec.md#控制器扩展边界) 的 S-03、AC-04、AC-06。
**依赖：** 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 实现完整参数的播放前校验、初始应用、更新和发声状态查询；浏览器节点在 start 前取得正确参数。
- none/whole/repeat 的进度以源采样量解释，初始或运行中变速后仍按遍数停止；不按 repeats 复制缓冲。
- 同步更新假能力和浏览器能力；非法值/旧句柄/宿主失败分开，半途节点取得失败全部清理。
- 旧 play(id) 的采样率、路由与错误默认行为保持，查看器透传能力同步但不增加玩法逻辑。

## 不包含

- 任务暂停/隐藏竞态由 11，原版类别分配由 12；不实现混音规则或声音设置。

## 关键文件与契约

- 现有 [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts)、[browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts)和假能力。
- 如需进度辅助，计划新增平台内 `voice-progress.ts` 及邻接测试，具体字段遵循 06。

## 写入范围

- `src/platform/audio/**`：参数、进度、浏览器能力及测试。
- `src/app/viewer/viewer-audio.ts`：能力包装透传。
- `src/app/viewer/viewer-audio.test.ts`：查看器兼容回归。
- `docs/engineering/modules/platform.md`：端口契约说明。

## 验收标准

- [ ] start 前应用参数；非法参数不分配半个发声，旧句柄不影响新声音。
- [ ] 变速后的有限重复恰播放指定遍数，提前 stop 不续播；未中断的 warp-arrival 为 8 遍。
- [ ] 自然结束/stop 清理幂等，资源上限不被绕过，查看器旧行为回归通过。

## 验证方法

- 假上下文时间与独立源采样进度断言，速率边界/重复次数/迟到结束；`pnpm test -- src/platform/audio src/app/viewer/viewer-audio.test.ts`、`pnpm check`。
- 调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限定本项；真实输出信号另由 22 取得，不以假 start 证明可听。

## 完成证据
