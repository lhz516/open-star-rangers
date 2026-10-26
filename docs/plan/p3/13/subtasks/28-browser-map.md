---
type: plan
status: active
phase: P3
task: "13"
subtask: "28"
updated: 2026-10-25
---

# 28 — 生产地图像素、输入与缓存恢复验证

**契约来源：** [spec](../spec.md#验证策略) 的 AC-02/05/13/16/17/19/20。
**依赖：** 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 合成包验证地图palette/图元、覆盖/标签/多选框、信息行超窗、零能量项目标记、消息行及无系统十字。
- 实际PointerLock/输入链覆盖首画ready、首次点击锁定不选点、左键重复、右键双调用、开图保留计数、m与两次Esc。
- 黑边/容器偏移/全屏/缩放边界、失焦/解锁清电平及无锁回退；不让旧代价跟随未确认位置。
- 隔离站点内旧版本合成缓存拒绝、新导入恢复；不清用户站点数据。

## 不包含

不改变地图规则/去抖，不将DOM合成按键当OS拦截证据，不读取原版文件。

## 关键文件与契约

- [map-input.development.spec.ts](../../../../../e2e/map-input.development.spec.ts)、[mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts)。
- 计划新增 `e2e/map-picture.development.spec.ts`、`map-picture.production.spec.ts`、`support/map-picture.ts`。

## 写入范围

- `e2e/map-picture.development.spec.ts`：计划新增地图回归。
- `e2e/map-picture.production.spec.ts`：计划新增生产地图回归。
- `e2e/support/map-picture.ts`：计划新增独立辅助。
- `e2e/map-input.development.spec.ts`：原光标夹具与输入回归。
- `e2e/mission-flow.development.spec.ts`：生产几何就绪断言。
- `e2e/mission-flow.production.spec.ts`：生产几何和实际选择。

## 验收标准

- [ ] 画面像素与Core确认信息一致，非法/未就绪不能被误认为空地图。
- [ ] 首画/锁定/回退/右键/清键/边界有真实浏览器结果。
- [ ] 旧缓存拒绝与重导入恢复可复现且不影响用户数据。

## 验证方法

使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；`pnpm test:e2e -- e2e/map-picture.development.spec.ts e2e/map-picture.production.spec.ts e2e/map-input.development.spec.ts e2e/mission-flow.production.spec.ts`（新增文件落地后）。实际权限/锁定行为单独记录，必要且agent无法完成的手势才请用户。测试维护的[simplify](../../../../../.agents/skills/simplify/SKILL.md)仅限地图回归。

## 完成证据
