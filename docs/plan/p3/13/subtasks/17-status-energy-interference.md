---
type: plan
status: active
phase: P3
task: "13"
subtask: "17"
updated: 2026-10-25
---

# 17 — 状态、能量页与 SNIP 干扰

**契约来源：** [spec](../spec.md#左显示屏) 的 S-06，AC-08/10。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 页0 按 Core 相位/字段绘制 MFDD 背景/叠加、DIAG 两行打字/轮换/光标；零间隔不无限追赶。
- 页1 按分配档位与满刻度绘制背景、条带和导入标签。
- 提供左右显示屏共用的 SNIP 帧/切换模块，状态/页面门禁与随机节奏按03/08；不重新解析SNIP。

## 不包含

不写 Core 页面/损伤状态、不实现通讯页或 Warp 页、不接应用循环。

## 关键文件与契约

- [status-messages-payload.ts](../../../../../src/content/hud/status-messages-payload.ts)、12 的 blink 输出。
- 计划新增 `src/render/cockpit/left-display/`、`interference/`；20 可只读复用 interference。

## 写入范围

- `src/render/cockpit/left-display/**`：状态和能量模块及测试。
- `src/render/cockpit/interference/**`：通用显示干扰及测试。

## 验收标准

- [ ] 背景/层叠次序、blink、文字换行/光标均有精确像素断言。
- [ ] 切页/受损/零间隔/首次画面与暂停保持无重复推进。
- [ ] SNIP 状态0/1/2与相位、预算及不支持输入按合同处理。

## 验证方法

`pnpm test -- src/render/cockpit/left-display src/render/cockpit/interference`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限两页与干扰模块。

## 完成证据
