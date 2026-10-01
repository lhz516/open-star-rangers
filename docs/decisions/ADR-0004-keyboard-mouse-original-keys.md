---
id: ADR-0004
type: adr
status: accepted
phase: all
updated: 2026-09-30
related: [U-011, U-012]
---

# ADR-0004：首版只支持键鼠，默认保留原版键位

## 决定

- 首版只支持键盘与鼠标。手柄/摇杆只预留接口：输入层按“输入源 → 游戏动作”组织，连续操纵以 −1…1 的模拟值进入 Input Snapshot。首版不调用 Gamepad API。
- 默认键位即原版键位，包括 Alt/Option 开火与 F1–F9 视角。页面层 `preventDefault` 加全屏 Keyboard Lock 尽量拦截；系统层无法拦截的组合（如 Alt+F4）用关闭确认、风险提示和可选重映射兜底。
- 按键按 `KeyboardEvent.code` 识别。

细节见总计划 §1.2 与 [key-map](../original/input/key-map.md)。

## 后果

- 原版的摇杆操控手感暂不还原；P0 记录键鼠下的原版行为作为对照基准。
