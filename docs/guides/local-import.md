---
type: guide
status: active
phase: P2
updated: 2026-10-07
related: [ADR-0008, ADR-0012]
---

# 本地导入与最小资源查看器

本指南对应当前 P2-11 的诊断界面：导入自己的数据、查看切片资源、试听核心音效和检查任务能否载入 Core。它不运行原版任务，不是原版菜单或飞行画面。独立的 `Start synthetic demo` 仍只使用代码生成的合成内容，不需要也不使用导入资源。

## 准备文件与浏览器

- 自行合法取得自己的 Star Rangers 光盘数据；权利范围见[根说明](../../README.md#许可证与原版权利)。项目不提供原版内容，也不授予使用它的权利。
- 选择同一组、同名（扩展名前的名称相同）的 `.ccd` 与 `.img`，可选同组的 `.sub`、`.cue`。一次至多 4 个文件，每个名称至多 255 个 UTF-16 单元。不要只选 `.cue`，也不要把其他镜像格式改扩展名当作 CloneCD。
- 当前不是通用光盘导入器：仅接受受支持的布局和生产白名单版本。结构依据见 [disc-image](../original/formats/disc-image.md)，基准身份见[原版文件清单](../original/manifest.md)；其他版本会明确拒绝。
- 本地核对使用已安装的桌面 Chrome，正常画面需要 WebGL 2；试听需要浏览器音频能力及真实点击。Firefox、Safari、移动设备和原版保真判定不在本指南的已验证范围。
- 原版文件只放在被 Git 忽略的 `local/`，不要放进 `public/`、`dist/` 或任何跟踪目录。只在本机文件选择器中选取，别上传文件、画面、音频或解码结果。

## 本地生产预览

从仓库根目录运行，Node/pnpm 版本和安装前提见[工程约定](../engineering/README.md#环境)。首次缺少依赖时运行 `pnpm install --frozen-lockfile`。

```sh
pnpm build
pnpm preview --host 127.0.0.1 --port 4174 --strictPort
```

保持这个终端运行，用 Chrome 打开 `http://127.0.0.1:4174/`。端口被占用时，选择另一个空闲端口并同步更改下方 URL，不终止他人的服务；核对期间始终使用同一个地址与浏览器 profile。结束后在自己的预览终端按 Ctrl+C。

- E2E runner 默认独占 4173/4174，且不复用已有服务器。运行 `pnpm test:e2e` 前先停止自己的手工预览，或给 runner 配置其他空闲端口（见[工程约定](../engineering/README.md#本地浏览器-runner)）；不要让两者争用同一端口。
- `preview` 只服务当前构建，不会自动构建。修改源码或切换提交后先重新执行 `pnpm build`，不要把旧产物当作当前代码。
- 必须使用此生产预览，而非 `pnpm dev` 或直接打开 HTML 文件。开发服务器支持热更新，但不发送拟定 CSP；开发测试入口也不是用户导入入口。
- 另开终端检查响应头：

  ```sh
  curl -I http://127.0.0.1:4174/
  ```

  应为 HTTP 200 且含 `Content-Security-Policy`。完整策略的唯一说明见[工程约定：生产预览的 CSP](../engineering/README.md#本地浏览器-runner)，配置取自 [preview-csp.ts](../../tools/preview-csp.ts)。不要通过关掉 CSP 或添加不安全许可来让导入通过。
- 在 Chrome DevTools 的 Network 中选中文档请求可核对响应头；导入时 Worker 应是同源 `/assets/` 下带哈希的 JavaScript，状态 200，不是 HTML。观察 Console 的 CSP 违规或异常，但不要复制含私人路径或原版内容的输出。
- 这只是本地预览。真实 Azure SWA 部署、响应头与 `/assets/*` 排除 SPA 回退的实测归 P5，不能用本地结果代替。

## 导入、取消与状态

1. 在菜单点击 `Import original game data`，在 `Disc files` 一次多选上述文件组，再点击 `Start import`。
2. 空间不足的建议性预检会显示估计所需/可用 MiB：可选 `Import anyway` 继续（保存仍可能失败），或 `Do not import` 放弃。未提示空间不足也不保证之后一定保存成功。
3. 等待识别、图形、任务、声音、模型与效果阶段。进度显示阶段和累计读取 MiB，不是百分比；识别后显示版本标识。
4. 可用 `Cancel import` 终止正在运行的 Worker；返回菜单同样终止未完成作业。取消或失败不保留此次部分结果，也不替换此前持有的资源或缓存。
5. 作业结束后记录 `Import finished in …` 的作业耗时与四组状态，再看下面的状态阶梯。返回菜单后用 `View resources` 打开查看器。已开始的缓存提交属于应用外壳，返回菜单不会中断它；关闭或刷新整页前应等保存完成。

这些标记是独立判定，不是进度条，也不保证每个短暂状态都能被肉眼看到：

| 页面文字 | 含义 |
|---|---|
| `Source identified` | 来源已识别，不代表全部转换成功 |
| `Partial conversion: not a usable resource package` | 作业正常结束，但组缺失/不完整或全包校验未通过；只允许查看完整验证的组，不缓存 |
| `Complete resources, viewable` | 已通过全包完整性校验，可查看 |
| `Held in memory only` | 完整资源当前只在页面内存中；可能尚在保存或保存失败，刷新可能丢失 |
| `Saving in this browser` | 保存正在进行，不等于已保存 |
| `Saved in this browser` | 缓存提交成功或恢复并重新校验成功；括号显示 `saved in …` 或 `restored and verified in …` 的耗时 |
| `Mission loads into Core` | 任务纯载入检查成功，不表示游戏可运行或任务正在执行 |
| `Mission does not load into Core` | 载入校验失败，查看类别、结构位置与原因；不把它当作成功 |

## 缓存与重新导入

- 完整导入结果自动保存到 IndexedDB。部分结果不保存；新作业失败或取消不会覆盖旧结果，但正常结束的部分结果会替换当前内存包，菜单如实显示不完整。
- 页面刷新后先回到菜单，只列出缓存元数据。`Saved resources found in this browser, not yet verified.` 不代表资源已恢复；点击 `Open saved resources` 才会读取 payload、重新校验并载入任务。成功后再用 `View resources`。
- 缓存属于同一浏览器 profile 和同一源（协议、主机、端口）。`localhost` 与 `127.0.0.1`、不同端口或无痕窗口不能当作同一份缓存。缓存不是备份，浏览器可能清除它。
- 保存失败时查看原因，可在菜单或导入结果中用 `Save again` 重试。若页面尚持有完整包、但浏览器已清除缓存，返回菜单后的重新检查会改为仅内存并报告 `not-found`，仍可查看及重新保存；若已刷新且缓存不存在，就重新选择文件导入。
- 仅提供身份与当前生产配置一致的缓存。当前版本以[生产包配置](../../src/workers/production-package.ts)和[源码结构中的转换器版本](../engineering/source-structure.md#内容基础契约与切片定义)为准。**P2-11 子任务 16 已递增模型转换器组件：此前导入的旧版本条目不提供 `Open saved resources`，不会迁移或自动清理。此前核对过也必须重新导入，再核对导入与查看。** 不要把“没有可恢复条目”误认为旧记录必然已被删除。
- 同键保存是原子替换；不提供删除、迁移或缓存管理界面，也不申请持久存储。不要为本指南随意清除用户其他站点或浏览器数据。

## 查看器操作与限制

- 按 `Models`、`Effects`、`Images`、`Palettes`、`Layouts`、`Fonts` 选择 Asset；刚打开时没有选择，空的 4:3 画面正常。包完整时页面显示 manifest 身份与转换器版本，可核对刷新恢复前后是否相同。
- 模型可选 `Part list` 0、1、2，页面显示用途与置信度；效果可选记录、导弹类型或有/无贴图碎片的 `Effect view`。导弹贴图只用旋转 0，没有映射旋转选择控件。含跨接缝面的项标注 `Seam interpolation unconfirmed`，不是导入失败；原版依据见 [executable](../original/formats/executable.md#effect-texture-mappings-p2-1115-research)。
- `Turn left/right/up/down`、`Zoom in/out`、`Reset view` 操作三维视角。Tab 到画面区域后可用方向键旋转、`+`/`=` 与 `-` 缩放、`0` 复位；焦点在列表或按钮上时不改变画面。步长、限制与键位说明见[键位文档](../engineering/keyboard-input.md#资源查看器的诊断键p2-11)。按钮可用 Tab、Enter/Space 操作。
- 图像、调色板、布局与字库由查看渲染显示；透明处是棋盘格，字形表是黑底白字。没有游戏循环，空闲不持续绘制。`Refresh diagnostics` 只刷新诊断计数。
- `Sounds` 中每个声音列出 Asset ID 与角色：点击 `Play` 解锁音频并播放一次，`Stop` 停止该声音，`Stop all sounds` 停止全部。页面隐藏或返回菜单会停止；返回菜单会释放音频与画布，但保留资源包。短音效可能在按停止前自然结束。
- 任务区只显示结构计数、引用校验与载入结果，不显示原版任务名、简报或消息文字。
- **呈现限制：** 坐标、UV、双面显示、采样和接缝等呈现约定仍需 P2-12 原版截图对照；集中说明与置信度见[源码结构：资源查看渲染](../engineering/source-structure.md#资源查看渲染)。默认无光照，`Neutral light (not the original lighting)` 只是诊断照明，不是原版光照。资源显示成功不等于原版保真已通过。

## 失败时如何处理

页面的固定类别文字及技术细节按 layer/code 分类，不应包含所选文件名、私人路径或原版字节。反馈只需日期、浏览器版本、类别、code、结构位置、限值与是否可重试。

| 失败或状态 | 处理 |
|---|---|
| `invalid-files`、`disc/unsupported-file-set` | 核对同名 CCD/IMG、可选附件、数量与名称长度后重新选择 |
| disc 结构/限值/读取失败 | 核对自己的文件是否完整且属于受支持布局；不要改字节或绕过限值来强行通过 |
| source 版本不支持、结构或转换校验失败；content 校验失败 | 保存安全的 code/结构位置供诊断；已识别不代表可转换，不用其他版本冒充成功 |
| `import/worker-start-failed`、`worker-failed` 或内部/协议失败 | 检查当前生产构建、Worker 200/JavaScript 响应和 CSP；重建并重试，持续失败则报告，勿放宽策略 |
| `quota-exceeded`、`storage-unavailable`、写入失败 | 当前完整资源仍可在内存中查看；按浏览器许可/空间情况处理后 `Save again`，失败前别把仅内存状态当作已保存 |
| `not-found`、`cache-corrupt`、`cache-incompatible` | 重新导入；不同转换器版本的旧键保留不动，同键损坏记录由成功提交原子替换 |
| `storage-newer-version` 或其他缓存错误 | 保留 code；不要降级写入或强行删除，使用匹配的应用版本或报告问题 |
| 任务载入失败 | 记录 Core/content 类别和结构位置；其他已完整的资源可用于诊断，不声称任务已载入 |
| WebGL 2 不可用 | 不回退到 2D Canvas；列表、任务诊断与试听仍可用。要完成实机画面核对须在正常支持 WebGL 2 的 Chrome 中重试 |
| 单个条目读取/展开失败 | 记录该 Asset ID 和 code，其他条目不受影响 |
| 画面失败或上下文丢失 | 按页面提示等待浏览器恢复，或返回菜单再打开；释放失败锁存时须整页重载，导入与合成演示不受查看器锁存影响 |
| 音频不可用、失败或无声 | 检查真实点击、系统输出/静音及页面提示；其他查看能力不受影响，不能把音频状态为 running 代替真人听到 |

## 用户实机核对

供 [P2-11/19](../plan/p2/11/subtasks/19-user-real-machine-check.md) 使用。**由用户本人**用上述带拟定 CSP 的生产预览与自己的数据完成；agent 浏览器验证和自动 E2E 只用合成内容，不能替代这份确认。

记录日期、Chrome 完整版本、当前提交与预览地址（仅本地），逐项记录通过/失败及安全错误信息：

1. 重新导入当前版本：此前保存的旧转换器版本条目不会提供恢复，必须先完成本次导入。确认识别出版本，四组完整，显示 `Complete resources, viewable`、`Saved in this browser`、`Mission loads into Core`。记录作业耗时与保存耗时：它们不是单独的字段，而是附在句末，分别是导入页面结果行 `Import finished in …` 中的时间，以及状态列表 `Saved in this browser (saved in …)` 括号中的时间（保存完成后才出现）。
2. 在同一源、同一 profile 刷新：用 `Open saved resources` 恢复成功，任务再次载入；记录恢复耗时（菜单状态列表 `Saved in this browser (restored and verified in …)` 括号中的时间），并核对查看器身份。
3. 打开玩家、敌机、基地模型；三种效果；每类图像、调色板；两个布局；全部字库，各项无错误。必要时展开效果变体；不把默认空画面当作已检查。呈现差异只记录现象，保真判定留给 P2-12。
4. 在 `Sounds` 中按角色分别试听开火、导弹、爆炸、Warp，确认实际能听到；确认停止按钮有效，返回菜单后不再发声。短声音可重新播放后立即停止；不能只看发声数。
5. 核对文档与 Worker 的 CSP 响应头，记录有无 CSP 违规或其他异常。未完成的项明确保留未验证，不凭既有自动化代替。

只提交文字结论、计数、耗时和错误 code；截图如确有需要仅存于 `local/`，不上传、不粘贴到对话或跟踪文档，不录制原版声音。上述结果不等于 P2 阶段退出或真实 SWA 已部署。

## 隐私边界

原版文件只在本浏览器中读取、转换与保存，不上传。应用与 Worker 脚本仍由本地预览服务器载入，这不等于把选中的数据发送给服务器。当前导入资源的持久化只用 IndexedDB，不用 localStorage、Cache Storage 或 Service Worker，也没有资源导出、上传、分享或诊断导出入口。

主线程网络 API 静态边界由[工程回归](../../tools/engineering-boundaries.test.ts)守护，Worker 另有既有边界；这不能替代 P2-12 对页面与 Worker 的完整网络审计。权利与隐私说明不构成法律授权或安全审计结论。
