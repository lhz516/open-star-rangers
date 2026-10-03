---
type: plan
status: active
phase: P1
task: "12"
subtask: "02"
updated: 2026-10-03
---

# 02 — 四范围完整文件 SHA-256 扫描

**契约来源：** [Spec](../spec.md) 的 S-02、S-06；AC-02、AC-03、AC-04、AC-13。
**依赖：** 01。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- Git NUL安全枚举worktree、index和标准排除规则外的untracked；index读候选blob而非工作树。未合并index/特殊条目/无法完整读取明确失败，不能用旧版本或空列表补缺。
- dist递归完整普通文件，包含nested/map/notice/inventory，不按扩展名跳过。完整SHA-256与01黑名单匹配，报告scope/相对path/digest/来源标签；只成功完成所有必要范围且零命中才可passed。
- 检查输入根及路径组成部分，不追随symlink/越界；tracked local路径在读取blob/目标之前拒绝。忽略未跟踪路径不读取，应存在候选缺失、非Git、Git失败、缺/空dist都拒绝。
- 附带临时Git/文件fixture：原名/改名/无关扩展名四范围命中，先暂存命中再改回工作树，ignored同内容不读，嵌套map/声明不漏；访问记录证明没有读取禁止目标。真实CLI退出由07接入，不拖延本项扫描负向测试。
- 按[简化](../../../../../.agents/skills/simplify/SKILL.md)复用01报告/临时fixture，不复制黑名单或自写通用秘密检测。

## 不包含

不扫Git历史/ignored用户目录、片段/压缩/转码、不修.gitignore或清用户文件；依赖读取仅属03，不用完整hash冒称版权识别或法律审核。

## 关键文件与契约

- 计划新增 tools/compliance/scan.ts、scan.test.ts；扩展01 test-support.ts仅生成自有Git/目录样本。
- 只读[忽略规则](../../../../../.gitignore)、[manifest](../../../../original/manifest.md)，使用01的report/manifest。

## 验收标准

- [x] AC-02：四scope同hash改名等命中与干净结果正确；ignored路径无读取，报告无内容。
- [x] AC-03：index/worktree反例被检测，dist所有嵌套普通文件与独立清单/count一致。
- [x] AC-04：Git/读取/缺候选/local跟踪/symlink/越界/缺或空dist均passed=false并说明未完成范围，不跟随禁止目标。
- [x] AC-13：负向bytes自建，读访问审计和finally清理；目标Vitest、pnpm check通过。

## 验证方法

新增后 pnpm exec vitest run tools/compliance/scan.test.ts；真实临时Git支持空格/换行路径、暂存blob与工作树不同，文件访问记录结合临时链接/禁止目标夹具。并非仅mock返回hash来证明枚举。07再验证真实CLI退出，浏览器/原版对照不适用。

## 完成证据

- 2026-10-03：[scan](../../../../../tools/compliance/scan.ts)分别枚举worktree/index/untracked/build；Git NUL及UTF-8完整性校验，index解析mode/stage后读实际cat-file blob，不替换为工作树。完整普通dist递归包含map/notice，无扩展过滤；范围显式completed/count，任一故障/命中非passed。
- [12项真实Git fixture测试](../../../../../tools/compliance/scan.test.ts)通过：四scope改名命中、暂存命中再改回、空格/换行路径、ignored无读取、nested/map/notice数量、tracked local与symlink/index特殊模式、实际unmerged、遍历逃逸、非Git/subdir、缺候选/空或缺dist、Git/read失败。onRead证明禁止目标未打开；私有原因/root不进报告，缺文件含安全相对路径。
- 工作树采用O_NOFOLLOW及FD dev/inode/普通文件校验、64KiB完整流式SHA256、读后size/mtime/ctime核对；路径每一层先lstat，local及链接不追随。index未合并/特殊mode在blob读取前拒绝，Git根需完整repo。错误带稳定code/范围及相对path，命中只含digest和manifest来源标签。
- `pnpm check`通过（50文件/1228测试、type/lint/build），无生产/原版记录变化。rubber-duck建议补index独立escape及真实ENOENT隐私断言，均已补；simplify限定scan/test与Finding字段扩展，清除无断言的空目录样本，复用01report/hash/fixture。
- 文档影响检查：CLI尚属07，工程Node/test发现与hash能力说明仍准确；本项只记录扫描证据，不更改.gitignore/原版事实/ADR/阶段摘要。fixture finally删除自有目录，不扫描历史或ignored用户数据。
