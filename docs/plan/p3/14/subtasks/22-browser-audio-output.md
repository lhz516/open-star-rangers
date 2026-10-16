---
type: plan
status: active
phase: P3
task: "14"
subtask: "22"
updated: 2026-10-15
---

# 22 — 开发与生产浏览器音频输出

**契约来源：** [spec](../spec.md#验证策略) 的 S-03、S-09、S-10、AC-06、AC-11、AC-12、AC-14。
**依赖：** 18, 19, 20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用合成任务包扩展现有浏览器探针，测最终输出路径的波形/左右声道、参数变化和源采样进度，而非只读取源缓冲或 start。
- 独立浏览器强制激活策略，CDP 无激活读法验证锁定，可信点击后解锁；p、菜单、Tab/焦点及 audio-unavailable 有明确 UI 结果。
- 覆盖 none/whole/repeat、初始参数先于 start、运行中变速/暂停；期望信号与窗口误差按采样率/粒度预先确定。
- 开发使用测试入口，生产用隔离合成缓存和真实恢复。生产无 DEV 日志/调试入口，无新增网络外传。

## 不包含

- 不使用原版内容作公开 fixture，不设置生产调试开关；原生隐藏/往返平衡集中在 23。

## 关键文件与契约

- 现有 [audio-playback.ts](../../../../../e2e/support/audio-playback.ts)、[browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[production-cache.ts](../../../../../e2e/support/production-cache.ts)。
- 计划新增 `e2e/flight-audio.spec.ts`（两种构建）、`flight-audio.development.spec.ts`（仅开发能力注入）与 `support/flight-audio.ts`。

## 写入范围

- `e2e/flight-audio.spec.ts`：开发/生产输出。
- `e2e/flight-audio.development.spec.ts`：锁定/故障/DEV 边界。
- `e2e/support/flight-audio.ts`：合成场景操作和只读音频取证。
- `e2e/support/audio-playback.ts`：必要的最终输出/参数探针复用。
- `e2e/support/browser-probes.ts`：只读资源探针的必要扩展。
- `src/app/app-entry.test-support.tsx`：仅开发测试能力注入。
- `src/workers/synthetic-import.test-support.ts`：合成声音/场景资料。
- `tools/e2e-configuration.test.ts`：新用例的 runner 归属回归。

## 验收标准

- [ ] 两种构建都有真实非零输出和参数效果证据，控制器暂停后源进度冻结。
- [ ] 锁定/启用、p/菜单、焦点和能力失败行为符合 AC-11；生产无日志或测试后门。
- [ ] 样本完全自建，网络审计通过，探针不改变被测控制流。

## 验证方法

- 必须使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；`pnpm test:e2e --project=development --project=production e2e/flight-audio.spec.ts e2e/flight-audio.development.spec.ts`。
- 修改测试支持后 `pnpm check`；挂起/关闭 analyser 缓存不能作为实时静音证据。对本项测试代码调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
