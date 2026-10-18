---
type: plan
status: active
phase: P3
task: "12"
subtask: "23"
updated: 2026-10-17
---

# 23 — 绘制 pass 接入渲染器

**契约来源：** [spec](../spec.md) 的 S-02、S-12、S-15；AC-07、AC-08、AC-09、AC-10、AC-13、AC-14、AC-15、AC-16、AC-23 的集成部分。
**依赖：** 17, 18, 19, 20, 21, 22, 31。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 17 至 22 的 pass 按 Q-03 定稿的层次接入 16 的合成与 15 的渲染器；每帧只读 `renderFrame()`、表现模块的当前状态与最新 projection。
- 按视角选择绘制内容（地图、基地与 0x13 不画世界；不可达视角按契约错误）；屏幕闪光最后作用于完整游戏画面。
- 资源：各 pass 的 GPU 资源进入 15 的运行内缓存与预算，释放后计数归零。
- 测试：记录表面上的完整帧（F1、Warp、被毁视角、带闪光）层次与资源计数；重试暖态计数相等。

## 不包含

- 浏览器回归（25）。

## 关键文件与契约

- 16 的合成、15 的渲染器与 17 至 22 的 pass。

## 写入范围

- `src/render/flight/renderer/**`：pass 接入。
- `src/render/flight/composition/**`：层次登记。
- `src/render/flight/scene/**`：按视角选择。
- `src/app/mission/**`：运行内容的解码与接线（星云图像、模型表面等）。
- `src/original-data/conversion/flight-data.test-support.ts`：合成生产 RENS 的光照字段落在研究过的范围内。
- `src/original-data/conversion/production-flight-graphics.test-support.ts`、`src/original-data/conversion/production-models.test-support.ts`：合成生产包的图形与模型落在各 pass 支持的范围内（受击闪烁尺寸、128×128 星云、同尺寸爆炸帧、部件标志与第 2 列表外壳）。

## 验收标准

- [ ] 各 pass 按层次接入，按视角正确选择；资源进入缓存与预算，释放归零。
- [ ] `pnpm exec vitest run src/render` 与 `pnpm typecheck` 通过。

## 验证方法

- Node 测试（记录表面）。

## 完成证据
