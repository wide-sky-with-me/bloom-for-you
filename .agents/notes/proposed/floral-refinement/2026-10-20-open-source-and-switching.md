# 花瓣建模与主题切换：开源调研提案

日期：2026-10-20（Asia/Shanghai；取证跨 10 月 19–20 日）。状态：**提案，尚未实施**。

范围：回应“切换卡顿、花朵不好看，参考开源优美实现”。本次仅研究来源、运行隔离演示、诊断当前构建；未修改产品源码、生成资产或测试，未提交、推送或部署。

后续（2026-10-20）：用户已批准开始改进；本页保留实施前调研事实，当前实现及取舍见[根轴玫瑰与异步准备决策](../../implemented/floral-refinement/2026-10-20-rooted-petals-and-prepared-switching.md)。本页的“尚未实施”描述提案形成时点，不代表后续工作状态；研究时源码基线为 `d1cc8a9`，下文旧源码行号对应当时版本。

## 背景与证据

当前 [花型生成器](../../../../generator.py#L224-L280) 将玫瑰分为固定同心层，单瓣仍以全花极坐标定义；[曲面细分](../../../../generator.py#L931-L950) 对主花多为 6×4、小花更低。画面能辨认花束，但花瓣呈重复扇片、边缘硬碎，花头相互遮挤。过去的几何/环绕数值检查不衡量这些审美问题。

为避免把原因直接归咎于粒子，本次通过浏览器包装 GL 的 drawArrays，仅跳过三遍 120000 点绘制；原文件、材质、几何和相机保持不变。对照使用减弱动态，完整开放，视口相同：[原点面叠加截图](../../../../artifacts/flower-research/visual/current-rose-original.png)、[仅网格曲面截图](../../../../artifacts/flower-research/visual/current-rose-surface-only.png)、[调用记录](../../../../artifacts/flower-research/visual/overlay-ab.json)、[复现脚本](../../../../artifacts/flower-research/visual/compare_point_overlay.py)。**关闭粒子后扇片和硬碎感仍在**，所以减少点数不是单独成立的花型方案；几何与曲面着色需要联合改善。本次没有进一步将两者完全隔离，不能把每一处瑕疵都归为同一种原因。

性能另有独立的[只读诊断报告](../../../../artifacts/flower-research/performance/REPORT.md)：无网络下载的四次预热切换中，setBouquet 同步耗时 1013–1144ms，取景支持点扫描占约 59–64%；GPU 上传调用返回约 9.5–17.3ms。禁用所有 draw 后仍需 533–841ms；不注入模块、不包装原型的对照，点击到文案更新仍为 937–1400ms。主要问题是 [setBouquet](../../../../site/particles.js#L526-L675) 的冻结、重包和[重复全扫描](../../../../site/particles.js#L945-L1012)，而不只是下载。

连切会反复合并 outgoing 快照，增加顶点和扫描量；准备时间还会吃掉已经起算的 1.6 秒 morph。环境是 Chromium 145、WSL2、SwiftShader、共享宿主。这些证据定位主线程阻塞，不代表手机/物理 GPU 的帧率或最终屏幕呈现时间。

## 值得借鉴的来源

### 首选单花：rose-gen

[仓库](https://github.com/tantaneity/rose-gen)，冻结 `09d4a42a99853d7124678436ea08e4921989bf79`，完整 MIT，2026 tantaneity。

[Petals.cs:50–86](https://github.com/tantaneity/rose-gen/blob/09d4a42a99853d7124678436ea08e4921989bf79/Assets/Scripts/Petals.cs#L50-L86) 用每瓣独立 root/heading/flank 与黄金角、rank，让内瓣短窄直立、向花心包拢，外瓣逐渐舒展；[Blade.cs:34–78](https://github.com/tantaneity/rose-gen/blob/09d4a42a99853d7124678436ea08e4921989bf79/Assets/Scripts/Blade.cs#L34-L78) 沿生长轴逐行推进，只在后半段增加反卷，不是把整瓣转倒。[作者玫瑰近景](../../../../artifacts/flower-research/references/rose-gen/media/head.png) 确实显示包心和反卷。

取它的几何组织，不照搬尖缘、粗分段与卡通两段色。此为 Unity/C# 源项目，本次查看作者媒体、未运行 Unity；不是浏览器即插即用库，也没有现成 PBR 花模包。移植代码保留 MIT 版权和许可。

### 首选可控曲面：HelloFlower

[仓库](https://github.com/C4RL05/helloflower)，冻结 `fb816bd80bd63a69ba52bc96b510846c5dedcb48`；[在线演示](https://helloflower.pages.dev)。本次在隔离目录安装锁定依赖并构建，实际运行 Three.js 演示，取得[玫瑰](../../../../artifacts/flower-research/visual/helloflower-rose.png)、[百合](../../../../artifacts/flower-research/visual/helloflower-lily.png)、[莲花](../../../../artifacts/flower-research/visual/helloflower-lotus.png) 的真实截图；[运行记录](../../../../artifacts/flower-research/visual/captures.json) 的页面异常为空。

[Petal.ts](https://github.com/C4RL05/helloflower/blob/fb816bd80bd63a69ba52bc96b510846c5dedcb48/src/engine/geometry/Petal.ts) 用样条轮廓和横向杯形控制单瓣；Corolla 对不同层赋予开角和旋转。借可编辑瓣形与连续曲率，不照搬默认高饱和配色和尖瓣。PetalMaterial 是双面自定义高光/漫反射，不是真实薄片散射；Corolla 实际逐瓣创建 Mesh，不是已经验证的 GPU 实例化范本。

**代码 MIT，2026 HelloEnjoy；原始纹理、艺术设计素材、渐变与商标明确排除在代码许可之外。** 参考实现时采用自己的配色和纹理，不将演示截图中的艺术资产当作可直接发布素材。

### 首选花种轮廓与组织：bouquet-gen

[仓库](https://github.com/tantaneity/bouquet-gen)，冻结 `75e7fb276e7d19005819883d25b522c9953991bc`，完整 MIT，2026 tantaneity。[作者花束图](../../../../artifacts/flower-research/references/bouquet-gen/media/bouquet.png) 是疏朗插画风。

[BloomHeads.cs](https://github.com/tantaneity/bouquet-gen/blob/75e7fb276e7d19005819883d25b522c9953991bc/Assets/Scripts/BloomHeads.cs#L19-L131) 的不对称肩缘、错层、不同杯角可帮助花种摆脱同一种放射小碗；StalkClearance 做花头包络与枝叶避让。借轮廓与避让，不照搬重墨线和稀疏细茎。它面向前向插花，后方能看见花背；我们的侧后方独立花头与环绕饱满要求继续保留，不把原项目布局直接当新花束布局。本次未运行 Unity。

### 辅助与暂缓

- [webgl-flowers](https://github.com/keaukraine/webgl-flowers)，冻结 `350d2aff9a5be469fd982266b7160b86b4de21a4`，完整 MIT。已本地运行并[截图](../../../../artifacts/flower-research/visual/webgl-flowers.png)，页面异常为空。WebGL2 植被实例化、分区剔除可参考；蒲公英草地不是玫瑰/花束的直接替换，不能从它有实例化推断换库便能修复当前 CPU 全扫描。
- [Floraison](https://github.com/Wally869/Floraison) 有控制网格/B-spline 和 MeshPhysicalMaterial 透射参数；不是真 SSS。manifest 明示 MIT，但完整许可正文和版权 notice 待补。线上控件及 WASM 加载已核验，SwiftShader 截图超时，未完成实时可视帧验收；不列为已经跑通且可直接复用的成品。全部细节见[建模核验报告](../../../../artifacts/flower-research/references/MODELING-RESEARCH.md)。
- `mattatz/THREE.Flower` 本次页面 404；真实的 `mattatz/unity-procedural-flower` 是旧 Unity 示例，不能当成存在的 Three.js 花库推荐。详细纠正与冻结来源见同一建模报告。

## 建议路线与实际考虑过的替代方案

1. **先把单朵花做好。** 从 rose-gen 的根轴扫掠组织出发，结合 HelloFlower 可控肩缘和曲率，分开控制内瓣包心、外瓣反卷、花瓣弧度和小幅不对称。先给单花正面/侧面/背面与开合状态样张，再组成整束。保持侧后视要求，不先对八束全部重做后才看效果。
2. **材质服务花型。** 先保证稳定双面法线、瓣间遮挡和柔和色阶，再试低强度有色背光、微弱织物般高光；透光不等于整瓣透明。粒子保留细密感，但不再用粒子数量或光晕掩盖轮廓缺陷。具体粒子/网格占比由同机 A/B 决定，不预先用减点绕开现有数据契约。
3. **切换拆为 prepare 和 commit。** 原始目标的 packed 数据与取景支持结果按资产身份及 octBase 缓存，重计算移至 worker 或分帧准备；只提交最新选择，旧花仍能渲染。有界地处理中断快照，并在准备完成/首个新状态帧起算过渡。保留校验、暂停/失焦/减弱动态语义及最终选择正确性。
4. **不以换栈代替诊断。** Python 离线生成、静态托管继续适用。当前原生 WebGL 可以接移植后的曲面公式，兼容既有格式与测试，但自维护材质和生命周期成本较高。Three.js 本地打包有成熟几何、材质、实例化及资源管理，代价是依赖/包体和现有点云、生长属性适配；是否引入由单花原型的效果与性能决定，而不是以“依赖少”排除它。完整引入 Unity 或 Rust/WASM 工具链成本更高，本轮不推荐。

不选“只加点/调色”：曲面 A/B 已证明症状仍在。不选“只预取网络”：已缓存回切仍秒级阻塞。不选“只更新文案后紧接原同步计算”：同一任务仍会阻止浏览器呈现。不选“直接减少取景采样或放宽环绕门槛”：会以裁切/漏界换速度。不将 HelloFlower 默认素材、Unity 墨线风或 Floraison 透射参数整套照抄为新成品。

## 后果、限制与后续验证

本提案意味着花瓣表示和切换生命周期将有实质改造，当前尚未选择最终前端运行库，也没有新的审美或性能验收成绩。之前已实施的协议/增长逻辑并未被本提案宣布替换；任何格式或旧断言变化都需单独记录原因。

实施时将对同一版本、同一环境分别比较冷选、预取首选、预热回切、真实分次连切，记录输入响应、长任务、首目标提交与最终状态。物理设备另测连续交互，不把 SwiftShader FPS 当手机成绩。视觉检查覆盖单瓣连续性、完整单花、各花种辨识、内外瓣开合、整束侧后视；保留原始几何、法线、资源和环绕检查。

本次实际执行的是隔离演示构建/截图、当前构建浏览器取证与源码/许可阅读，**未执行产品全量单测或产品 build**。研究产物为本地 artifacts，不代表线上部署变更；本次不改历史冻结验收。
