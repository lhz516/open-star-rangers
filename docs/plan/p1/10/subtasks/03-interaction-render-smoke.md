---
type: plan
status: active
phase: P1
task: "10"
subtask: "03"
updated: 2026-10-10
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
- 只读[App](../../../../../src/app/App.tsx)、[面板](../../../../engineering/source-structure.md#r7-演示页面开发面板与画面)、[画面](../../../../engineering/source-structure.md#r7-演示页面开发面板与画面)、[键位规则](../../../../engineering/keyboard-input.md)。
- 只读[Core输入](../../../../engineering/source-structure.md#r1-合成-core)、[布局函数](../../../../../src/render/viewport/viewport-layout.ts)，不改世界/录制/相机。

## 验收标准

- [x] AC-02：两种构建原生焦点/控件/隔离与未实现导入均自动通过。
- [x] AC-03：左右各≥1s实际投影/图像同向，N/X/X结果身份唯一且像素阈值真实满足。
- [x] AC-04：P/按钮暂停稳定，失焦/换run清轴；旧可信repeat不恢复，≥3样本/≥300ms不是旧缓存假通过。
- [x] AC-06：两种构建宽→窄同owner布局/像素/唯一键盘动作通过；无意外应用错误。
- [x] 本范围pnpm check与开发/生产聚焦E2E通过，资源及截图按所有权收尾。

## 验证方法

使用[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)、01持久runner与可信输入，不用dispatchEvent伪造键盘或给状态赋值。记录origin/Chromium版本、像素/移动采样和run/result身份；失败保留对应场景。无原版/目标实机对照。

## 完成证据

- 2026-10-03：[interaction-render](../../../../../e2e/interaction-render.spec.ts)的2个场景在开发/生产各通过（4/4），Chrome154/macOS、4173/4174、1280×800/DPR1→480×900。全部经原生UI和可信keyboard驱动；正常场景默认错误fixture无意外错误。
- AC-02：菜单Tab→Enter进入，初始焦点heading，Tab依次Return→输入region；名称、help描述和active状态真实核对。menu/Return/面板Pause聚焦时n/x/p/Left不产生游戏结果或暂停；Return用Space激活，导入用Space进入、heading聚焦、明确未实现且无file/canvas，Enter返回并恢复Import焦点。
- AC-03：左右各等待1100ms（实测持有窗口≥1000ms），10Hz投影x沿预期方向变化>0.8，前后截图mover像素≥9且中心x同向；松键后新投影4样本跨≥360ms稳定。N/X/X分别accepted/accepted/rejected、同run且递增唯一commandId、pending为空；marker投影/实体2及≥9色像素一致，移除后marker色0。±3颜色判据直接复用02实际截图解码。
- AC-04：P暂停后400ms tick/draws均不变；可信repeat=true/isTrusted事件记录证明重复down不会恢复被清除的轴，fresh down后数字x增加>0.1再失焦仍running且停止。P恢复、按钮Pause/Resume、Restart、Exit→Start和新owner分别取得首新投影后4样本/≥360ms、tick推进且x相同；换run清marker/results，重进run1、旧canvas断开。没有在paused等待tick增长。
- AC-06：同canvas保持connected且run不变，宽→窄真实容器/设备上限通过现有布局函数的CSS四项≤1px、buffer完全相等及4:3取整≤1px；窄画面mover/marker可见，单N只新增一个accepted结果。
- rubber-duck指出fresh移动断言原先混用数字/格式化字符串可能空通过，已改为数值位移>0.1并实际重跑；补同run/递增身份与repeat意图注释。尚在review阶段未勾框不是缺失执行证据，最终证据随本项提交。simplify限定本文件及[观测helper](../../../../engineering/source-structure.md#r8-e2e-演示观察)新增focusView，抽出重复聚焦供后续场景复用，未改生产规则。
- `pnpm check`通过（47文件/1192测试、4类型程序、lint、build），产物未变。文档影响：现有键位、工程命令与架构继续准确，本项只补验收证据；完整覆盖/来源映射属07，无新原版事实/ADR/阶段退出。runner收尾自有contexts/browser/servers；合成附件在ignored目录，不提交截图。
