---
type: plan
status: active
phase: P1
task: "10"
subtask: "03"
updated: 2026-10-03
---

# 03 — 代表性交互、像素与缩放回归

**契约来源：** [Spec](../spec.md) 的 S-02；AC-02、AC-03、AC-04、AC-06。
**依赖：** 02。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 同一组持久用例在开发/生产运行：菜单原生进入、heading初始焦点、Tab/点击输入区及aria-describedby说明；菜单/导入/Return/面板按钮不触发游戏键，Enter/Space保持原生激活，导入明确未实现。
- 可信ArrowLeft/Right各持有≥1s，同时比较投影与截图mover位置方向。在1280×800/DPR1按现有合成色±3容差验证mover与存在marker各≥9像素；N accepted、X accepted、第二次X rejected，按runId/commandId检查单次结算、marker/实体/像素一致。
- P及面板pause/resume、元素失焦、Restart、Exit→Start和返回重进都走现有UI。暂停固定尺寸下tick/draws稳定，继续无旧轴；仍running/显式resume后先等新投影，再≥3样本跨≥300ms验证tick递增且x相同。真实repeat=true不能恢复已清轴，新按下可移动。
- 同owner1280×800→480×900缩放：容器/画布CSS边缘≤1px，缓冲4:3取整误差≤1px，实体可见、一次N仅一个结果；采用02 helper，不复制布局公式。
- 按[简化](../../../../../.agents/skills/simplify/SKILL.md)只清理用例与helper新增调用，不改已批准生产规则。

## 不包含

不穷举modifiers/IME/双键所有顺序，不重跑DPR/50marker压力与手工HMR；资源计数属04，native hidden属06。

## 关键文件与契约

- 计划新增 e2e/interaction-render.spec.ts；复用02的观测/像素helper。
- 只读[App](../../../../../src/app/App.tsx)、[面板](../../../../../src/ui/dev/SyntheticDevPanel.tsx)、[画面](../../../../../src/ui/render/SyntheticRenderView.tsx)、[键位规则](../../../../engineering/keyboard-input.md)。
- 只读[Core输入](../../../../../src/core/synthetic/synthetic-scene.ts)、[布局函数](../../../../../src/render/viewport/viewport-layout.ts)，不改世界/录制/相机。

## 验收标准

- [ ] AC-02：两种构建原生焦点/控件/隔离与未实现导入均自动通过。
- [ ] AC-03：左右各≥1s实际投影/图像同向，N/X/X结果身份唯一且像素阈值真实满足。
- [ ] AC-04：P/按钮暂停稳定，失焦/换run清轴；旧可信repeat不恢复，≥3样本/≥300ms不是旧缓存假通过。
- [ ] AC-06：两种构建宽→窄同owner布局/像素/唯一键盘动作通过；无意外应用错误。
- [ ] 本范围pnpm check与开发/生产聚焦E2E通过，资源及截图按所有权收尾。

## 验证方法

使用[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)、01持久runner与可信输入，不用dispatchEvent伪造键盘或给状态赋值。记录origin/Chromium版本、像素/移动采样和run/result身份；失败保留对应场景。无原版/目标实机对照。

## 完成证据
