---
type: plan
status: active
phase: P3
task: "13"
subtask: "32"
updated: 2026-10-28
---

# 32 — V-04/V-05 判定与未知项回填

**契约来源：** [spec](../spec.md#表现对照与判定) 的 S-13，AC-21/22。
**依赖：** 07, 26, 29, 31。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 汇总31逐元素原版外观、26规则/事件及29运行证据，分列代码一致、外观一致、节奏差异、已批准差异与未取得证据。
- 新事实回填original文档与U-029/U-030；Q-13如果发现规则副作用，核对实际解决/回交，不能只写“交给上游”便完成本任务。
- 明确原版版本/配置、候选/包身份、截图/运行ID与新DOSBox启动次数；无证据和差异都不可自动豁免。

## 不包含

不修改验收门槛/重写旧阶段评审，不实施代码修复；需要用户具体处置时保持blocked并交协调者。

## 关键文件与契约

- [unknowns](../../../../original/unknowns.md)、[hud](../../../../original/formats/hud.md)、[cockpit](../../../../original/formats/cockpit.md)。
- 07预注册方案和31私有对照，本文只保存允许的文字结论/统计。

## 写入范围

- `docs/original/formats/hud.md`：绘制/文字对照事实。
- `docs/original/formats/cockpit.md`：布局/调度事实。
- `docs/original/formats/executable.md`：代码依据与限制。
- `docs/original/formats/comm.md`：菜单与消息事实。
- `docs/original/formats/textures.md`：目标背景显示事实。
- `docs/original/behavior/B-001-strategic-map.md`：地图对照。
- `docs/original/unknowns.md`：受影响U项。

## 验收标准

- [ ] V-04/V-05每个必需元素都有分层判定和准确来源。
- [ ] 未取得的必需原版证据按 spec 的[执行期决定](../spec.md#原版证据途径与-dosbox-x-的使用)逐项记为经批准的外观证据缺口（写明缺什么、影响的 AC 与恢复方式），未伪造“一致”或继承外部豁免；其余缺口仍阻塞。
- [ ] 新事实/置信度/限制在权威位置唯一记录，所有改动文档更新日期。

## 验证方法

核对07、26、29、31证据与spec覆盖；链接/metadata/原版隔离检查。发现缺口新增修复/取证项并回验，不能就地降低阈值。

## 完成证据
