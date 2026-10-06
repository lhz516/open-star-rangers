---
type: plan
status: active
phase: P2
task: "05"
subtask: "11"
updated: 2026-10-05
---

# 11 — 最近色规则研究（U-028 颜色部分）

**契约来源：** [spec](../spec.md) 的 S-11 的最近色部分；[payload 契约](../spec.md#payload-契约)中的“最近色映射”；[图形转换声明](../spec.md#图形转换声明)中关于 `nearest` 置信度的规定；技术决定 2；AC-15，AC-18 的 textures 与 unknowns 部分。
**依赖：** 02, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **EXE 证据（优先）：** 用本地 Ghidra 项目做只读分析，从 [executable](../../../../original/formats/executable.md) 已记录的 TEX 处理与准备路径入手，寻找把贴图颜色映射到 DATA 的代码，确定度量与并列规则。
  - 只把函数地址、行为与置信度写入 executable 或 textures，不粘贴反编译输出。
  - 不用 `-overwrite` 重新导入项目。
  - 研究有界：在已记录的入口及其直接调用者内追踪，未取得证据即转入下一步，不扩展为全面逆向。
- **取得证据时：** 若证据给出的规则与 02 的暂定规则不同，修改 02 的最近色函数及其测试使之一致，并在 textures 中标为已确认。
- **未取得证据时：**
  - textures 与 U-028 把实现规则记为暂定，置信度不高于高概率；
  - 本地脚本用 03 的源结构读取与 02 的最近色函数，核对全部 59 个 TEX 的嵌入调色板。候选规则集在研究记录中固定，至少包括实现规则与 6 位 VGA 空间中的同类规则；
  - 报告距离并列与候选规则不一致的条目数，逐一列出歧义条目（TEX 条目 ID 与调色板序号），写入 textures 并标为未确认；
  - 不以候选之间一致来宣称原版规则已确认。
- **一致性参考：** 用 04 的转换器与 02 的展开，按 `nearest` 声明转换 textures §3 记录的玩家座机三张贴图，与 `local/StarRang/captures/` 中的对应截图比较，复现颜色出现计数。结果只作参考，不作为度量证据。
- **文档：** 更新 [textures](../../../../original/formats/textures.md) §3、[unknowns](../../../../original/unknowns.md) 的 U-028（及其 `updated:`），必要时更新 [executable](../../../../original/formats/executable.md)。

## 不包含

- 光照与明暗的规则（U-028 光照部分）：归 P3。
- 切片贴图的选型及其映射置信度：归 P2-06。P2-06 须按本子任务的歧义清单，把受影响的映射标为未确认。
- 最终视觉保真判定：归 P2-12。

## 关键文件与契约

- **按需修改：** 02 的最近色函数与测试（只在取得 EXE 证据且规则不同时）。
- **原版文档：** [textures](../../../../original/formats/textures.md)、[unknowns](../../../../original/unknowns.md)、[executable](../../../../original/formats/executable.md)。
- **本地新增：** `local/research/p2-05/` 下的脚本、Ghidra 脚本输出与报告（被忽略）。
- **前提：** `local/ghidra/srangers.gpr`、`local/StarRang/SRANGERS/MAIN/SR.NOB` 与 `local/StarRang/captures/`（2026-10-05 均已存在）；缺少时本子任务为 blocked。

## 验收标准

- [ ] AC-15：先尝试 EXE 证据。取得时按证据实现并标为已确认；未取得时实现规则记为暂定（不高于高概率），全部 59 个 TEX 的候选规则核对完成，报告并列与不一致的条目数，并逐一列出歧义条目。
- [ ] 玩家座机三张贴图的颜色出现计数经生产展开路径复现，并标明只是一致性参考。
- [ ] textures、U-028（及按需 executable）更新，附置信度与证据；没有反编译输出、原版字节或截图进入仓库。
- [ ] 若修改了 02：`pnpm exec vitest run src/content`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 本地研究脚本与只读 Ghidra 分析；证据只记录命令、地址、计数与判定。
- 文档审阅：置信度标记与证据链接正确，未把暂定规则写成已确认。
- 不适用 browser-testing。
- 若有代码改动，完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
