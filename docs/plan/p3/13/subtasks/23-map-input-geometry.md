---
type: plan
status: active
phase: P3
task: "13"
subtask: "23"
updated: 2026-10-28
---

# 23 — 生产地图几何、右键与 ready 握手

**契约来源：** [spec](../spec.md#地图输入几何与指针) 的 S-11，AC-17/18。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 提供同payload几何到MapInputGeometry的转换，含端点右/下加1，ViewportFrame相对同一输入容器。
- 适配cursor.draw/ready为实际呈现凭证，首画不等待输入资格，不产生第二次GPU提交；错误/丢布局明确失效。
- 右键按下/释放经既有PointerLock链进入22，支持合格区域的电平、按住重复/短按、双调用计数、开图复位。
- 暂停/隐藏/失焦/解锁/离区清按住状态，保留m/Esc/左键/首次锁定不选点的原契约。

## 不包含

不改应用装配热文件（24），不新增Core命令、监听循环或鼠标飞行。

## 关键文件与契约

- [map-input.ts](../../../../../src/ui/game-input/map-input.ts)、[input-consumer.ts](../../../../../src/ui/game-input/input-consumer.ts)。
- [map-input-geometry.ts](../../../../../src/render/map/map-input-geometry.ts)、[map-cursor.ts](../../../../../src/render/map/map-cursor.ts)。
- 计划新增 `src/render/map/map-presentation-port.ts` 与测试，供24接生产。

## 写入范围

- `src/render/map/*.ts`：几何/ready端口与测试，保留隔离测试十字光标。
- `src/ui/game-input/*.ts`：电平、资格与清键接线和单元测试。
- `src/platform/input/pointer-lock.ts`：仅D-01确认必要的右键契约增量。
- `src/platform/input/pointer-lock.test.ts`：平台事件测试。
- `src/platform/input/browser-pointer-lock.ts`：浏览器宿主的右键菜单抑制（23 的范围请求）。
- `docs/engineering/keyboard-input.md`：绑定/去抖/资格说明。

## 验收标准

- [ ] 同源几何、容器偏移/黑边/全屏/像素比正确，非法与未就绪区分。
- [ ] 只有实际画面凭证授予ready；丢上下文清键解锁、恢复先画。
- [ ] 右键边界、contextmenu作用域与既有左键/Esc/失败回退回归通过。

## 验证方法

`pnpm test -- src/render/map src/ui/game-input src/platform/input`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限既有输入链，无独立引擎。

## 完成证据
