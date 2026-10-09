---
type: plan
status: active
phase: P3
task: "03"
subtask: "09"
updated: 2026-10-09
---

# 09 — 飞行表现数据的 payload 契约

**契约来源：** [spec](../spec.md) 的 S-08（视角标签）、S-09（场景设置）、S-10、S-11、AC-11、AC-14（结构限值）、AC-18；[Asset 与角色](../spec.md#asset-与角色)、[规范 payload](../spec.md#规范-payload)。
**依赖：** 04, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在计划新增的 `src/content/flight/` 中定义 models 组的 4 个 data 角色：
  - `scene-settings`：两组灯光颜色、+0x18 字节、+0x1C–+0x24 的三个 `f32`、三组屏幕闪光参数，以及 04 确定的其余头部字段；
  - `explosion-table`：`lists` 恰为 3 张，每项为 `{ sound, animation }` 两个 Asset 引用，以及 05 确定的 EXPL 其他字段；
  - `explosion-animation`：`frames` 为按帧序的图像引用，至少 1 项，以及 05 确定的逐帧或动画参数；
  - `nebula-backgrounds`：`images` 为按 NEBC 顺序的图像引用。
- 在计划新增的 `src/content/hud/view-labels-payload.ts` 中定义 cockpit-hud-map 组的 `view-labels`：`labels` 恰为 `{ subMode: 8, text }` 一项，文字为字节串。
- 每个族的 payload schema 版本初始为 1；编码经 06 的共用模块；结构限值按 04、05 的观测值推导。错误码为 `invalid-flight-data-payload`、`flight-data-reference-mismatch` 与 `non-canonical-payload`。
- 绑定检查：kind 为 `data`、角色正确，依赖恰为 payload 内的 Asset 引用。爆炸表引用动画 data Asset 与 sound Asset，动画引用 image Asset，星云列表引用 image Asset，引用的 kind 都须一致。
- 用代码生成的合成内容编写单元测试，覆盖 AC-11 的往返、坏输入、引用与依赖不一致，以及隔离。

## 不包含

- 原版解析：归 13、14。
- 图像与调色板 payload：沿用 P2-05，不新增。
- 转换、映射与 ID 链：归 16、17。
- 爆炸选择、背景方向等表现规则：归 P3-07、P3-12。
- 模块分册：由 22 同步。

## 关键文件与契约

- [effect-payload.ts](../../../../../src/content/effects/effect-payload.ts) 与 [status-messages-payload.ts](../../../../../src/content/hud/status-messages-payload.ts)（只读）：同组 data payload 的先例。
- 06 新增的 `src/content/canonical-json.ts`。
- 04、05 的完成证据，以及 [executable](../../../../original/formats/executable.md) 与 [textures](../../../../original/formats/textures.md)。
- 计划新增：`src/content/flight/` 下的模块与测试，`src/content/hud/view-labels-payload.ts` 与其测试。

## 写入范围

- `src/content/flight/**`：4 个 payload 族的类型、限值、读取器、编码、测试与合成支持（新建）。
- `src/content/hud/view-labels-payload.ts`：视角标签 payload（新建）。
- `src/content/hud/view-labels-payload.test.ts`：单元测试（新建）。

## 验收标准

- [ ] AC-11（5 个族）：往返逐字节相同；各类坏输入按 code 拒绝；引用与描述符依赖不一致时报 `flight-data-reference-mismatch`；结果冻结且与输入隔离。
- [ ] AC-14（结构限值）：恰等于上限时通过，超出 1 时拒绝；观测值写入完成证据。
- [ ] 字段名与类型符合字段处理规则；没有表现规则或默认值。
- [ ] AC-18：不导入 `original-data`，测试不读取文件。
- [ ] `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 单元测试，使用代码生成的合成内容。不涉及浏览器或原版数据。

## 完成证据
