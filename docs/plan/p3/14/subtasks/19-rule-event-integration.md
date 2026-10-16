---
type: plan
status: active
phase: P3
task: "14"
subtask: "19"
updated: 2026-10-15
---

# 19 — 正式规则事件到声音的集成

**契约来源：** [spec](../spec.md#触发表) 的 S-02、S-07、AC-02、AC-03、AC-09、AC-10。
**依赖：** 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 外部前提：P3-08/09/10/11 已交付 07 列出的正式输出和测试证据。只集成这些输出，不替上游实现规则。
- 从正式 Core 推进取得地图设置、Warp 开始/到达、通讯、基地键、可达 Xpon、救援/结果事实，补齐事件映射和停止边界。
- 覆盖请求拒绝、目的地重复、武器选择未变、无服务执行、同帧模式改变及来源退场；关联按事实契约，不按最终 UI 页面猜测。
- 不可达必须有原版结论；缺接口保持受阻，不能用手造事件完成本项。

## 不包含

- 不更改 P3-08 至 P3-11 游戏规则；发现上游缺陷回责任任务或新增修复项，不能悄悄扩展本项。

## 关键文件与契约

- 现有 Core 公开 world/step、[GameSessionRun](../../../../../src/app/session/game-session.ts)和正式合成任务支持。
- 本 goal 的 events/consumer 模块；计划新增 `rule-integration.test.ts` 和专用合成支持。

## 写入范围

- `src/app/flight-audio/events.ts`：已交付事件接线。
- `src/app/flight-audio/events.test.ts`：相关事件分类同步。
- `src/app/flight-audio/consumer.ts`：正式模式/结果接线。
- `src/app/flight-audio/rule-integration.test.ts`：正式规则链测试。
- `src/app/flight-audio/rule-integration.test-support.ts`：合成配置与合法动作序列。

## 验收标准

- [ ] AC-09 所有生产可达事实由真实规则产生并消费，基地音效未随 G-05 省略。
- [ ] 拒绝与正常无声区分，重复合法操作按合同提示；结果页和结束后无飞行声音。
- [ ] 外部交付引用与实际测试绑定，缺失路径没有被 fixture 冒充。

## 验证方法

- `pnpm test -- src/app/flight-audio/rule-integration.test.ts src/app/flight-audio/events.test.ts`、`pnpm check`。
- 用正式 API 和合成包，不在测试中替换规则为成功回调；调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限定适配代码。

## 完成证据
