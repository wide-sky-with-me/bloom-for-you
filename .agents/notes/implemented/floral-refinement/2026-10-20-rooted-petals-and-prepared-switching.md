# 根轴玫瑰、连续曲面柔光与异步主题准备

日期：2026-10-20（Asia/Shanghai）。
状态：已实施，最终新资产验证见[本轮本地验收](2026-10-20-validation.md)；仅本地完成，尚未发布。

后续（2026-10-25）：本页保留 v5 时点结论。现代主渲染与其它花材已由[Three.js 花艺静物决策](../three-gallery/2026-10-25-three-scene-and-floral-richness.md)局部替代，根轴玫瑰与异步准备原则仍有效；原生实现转为 WebGL1 兼容。原源码全文另在[重构前冻结副本](../../../../artifacts/three-refactor/baseline-source/site/particles.js)保留，不用当前入口路径冒充当时版本。

## 范围与替代关系

用户批准按[开源检索与卡顿诊断提案](../../proposed/floral-refinement/2026-10-20-open-source-and-switching.md)开始改进。修改玫瑰及其在八主题中的配花、所有曲面的光照、主题准备/提交生命周期；保留现有页面设计、其它原生花型、36 头/六大锚点、120000 粒子、version2/stride11、BFM1/BFG1 和既有资源上限。

局部替代[原曲面深度方案](../particle-depth/2026-10-19-normal-lit-bouquets.md)的曲面逐顶点光照，以及[含苞绽放方案](../botanical-growth/2026-10-19-bud-to-bloom.md)中应用的同步切束路径和玫瑰通用闭合包装。逐瓣增长、点面同源、暂停/隐藏时钟、八属性布局、真实深度与完整环绕布局仍保留；旧验收只描述当时版本。

## 背景与证据

原玫瑰同心极坐标扇片和螺旋条形成机械重复、薄侧和碎片观感。实际移除三次点绘制后，曲面本身仍破碎，因而不能把问题归咎于点层；成熟曲面本来就是不透明，`.58` 是粒子覆盖 alpha。

原缓存只保存解码数据。回切仍同步重新扫描支持方向、重包粒子、冻结源姿态和合并旧曲面；[初次诊断](../../../../artifacts/flower-research/performance/REPORT.md)与[同机对照](../../../../artifacts/floral-refinement/performance/REPORT.md)都测到近一秒主线程提交。后者使用冻结旧资产隔离管线改造，不能冒充新花型最终成绩。

## 选择一：每瓣独立根轴，而非整花极坐标扇片

[generator.py](../../../../generator.py)使用 28 片具有独立 root/heading/flank 的宽瓣：包心更直立、内瓣内卷，外瓣的反卷只发生在长度后半段。32 段 Simpson 积分和 Hermite 中线供点、面和导数法线共同求值；横向 cup、圆肩和纵向卷曲分开控制，轻微不对称完全确定，不加入噪声褶皱。

花苞采用同一根附件上的嵌套卵形薄片。根 collar 保留开放态坐标及导数法线，其后平滑过渡到包裹曲面；不套用第二层通用 cup/bud，不以缩小开放花朵、实心球盖洞或交叉全宽直立片代替花苞。

预算按暴露程度分配：主花内 8 瓣 6×6、中 12 瓣 8×8、外 8 瓣 10×12；配花采用 rank 分配，不能简单给所有花头相同高细分。牡丹主题的总体 mesh 预算接近 3MB 上限，故其它原生瓣形本轮不扩写。三角插值仍保持原严格 2% 门槛；原精确拓扑断言因 46 个 surface 改为 28 个而更新，新增[根轴行为回归](../../../../tests/test_petal_geometry.py)补充非退化花心遮挡、法线连续性、根附件和预算检查。

移植来源为固定 revision 的 rose-gen（MIT），参考 HelloFlower 的连续纵向曲线/横向杯形分工。完整来源、版权、MIT 正文和未复制原美术资产的说明在[第三方 notices](../../../../THIRD_PARTY_NOTICES.md)，由[构建器](../../../../build.py)随静态站点拷贝；没有引入 Unity、Three.js、作者纹理或新运行依赖。

## 选择二：曲面逐片元法线与克制的薄片背光

[particles.js](../../../../site/particles.js)在曲面分支重新归一化插值法线，再按视线朝向双面翻转。若在顶点先翻转，弯曲肩部的不同符号会被插值，形成并非几何接缝的明暗折痕。宽光源包裹、很弱的有色背光与低强度 sheen 只帮助曲率阅读，不降低成熟曲面 opacity，也不宣称物理 SSS。

保留点层原数值光照、深度核 `.72`、微粒纹理、成熟覆盖 `.58`、halo 与八属性。新增 varying 总计六个向量以内，仍满足 WebGL1 最低八向量限制。对照中进一步把点 alpha 降为 `.28` 对真实碎片轮廓改善有限，因此未采用这个额外改动。

[正式几何+旧材质](../../../../artifacts/floral-refinement/geometry-formal/review.json)、[柔光候选](../../../../artifacts/floral-refinement/material-soft/review.json)和[减点 alpha 对照](../../../../artifacts/floral-refinement/material-soft-fine/review.json)固定同一 1440×1100/DPR1、同一组真实 rose 资产、时钟和相机；不覆盖 shader/几何之外的绘制通道。它们是实际 WebGL 视觉证据，不是帧率测试，也不是最终异步管线集成验收。

正式全环绕首轮发现百合的有色花冠面积比仅 `.716`，低于原 `.72` 门槛。保留[失败原记录](../../../../artifacts/floral-refinement/depth/coverage.json)，未调阈值或加盖片。冻结新资产下，[旧材质对照](../../../../artifacts/floral-refinement/lily-old-material/coverage.json)为 `.754`；同一新管线的[原系数片元版](../../../../artifacts/floral-refinement/lily-old-like/coverage.json)为 `.773`，[窄柔光版](../../../../artifacts/floral-refinement/lily-narrow/coverage.json)为 `.729`，定位到照明和既有颜色掩膜的分布变化。采用最后一款：wrap `.10`，环境底光回到 `.18`，保留点层已有 `.91` 正背保色比例，并收窄背光/边缘高光；保留柔光意图而不把颜色计数最大化当作审美目标。真实[玫瑰/百合样张](../../../../artifacts/floral-refinement/material-narrow-visual/review.json)与所有变体输入哈希均保留，几何和布局未因该轮材质修正改变。

## 选择三：immutable prepare 与小型 GL commit 分离

- [prepare-data.js](../../../../site/prepare-data.js)用一个可暂停 generator 完成完整解码/校验、packed、所有原有静态/运动/增长支持扫描和 no-uint 展开。支持方向、游离点并集、采样预算均不减少。
- [prepare-client.js](../../../../site/prepare-client.js)管理唯一 active job；[module Worker](../../../../site/prepare-worker.js)接收输入私有副本并 transfer 返回缓冲，结束即回收。新请求终止旧 Worker 并 settle promise；dispose/context loss 一并取消。Worker 初始化/通信失败转 cooperative fallback；校验失败直接原子失败，避免把相同坏输入重复放回主线程扫描。
- 无 Worker/CSP 或启动错误时，同一 generator 按约 5ms 预算分任务执行。原始 fetch LRU 和 prepared LRU 各限四项，按输入对象身份及 renderer 固定能力使用；这是对象数上界，不是 RSS/显存总量证明。
- 应用经 `prepareBouquet → queuePrepared → commitPrepared`。GL commit 交换复用旧 canonical buffer，只上传新目标并处理有界取景支持；不再对应用连切做全点姿态冻结或曲面拼接。
- 过渡中只保留最新 pending，当前 1.6s morph 完成后再提交。可见曲面最多一个 canonical outgoing 与一个 target，和中断次数无关；源增长姿态只捕获一个标量，继续从真实形状收拢。
- 暂停/隐藏/失焦/减弱动态的 pending 静态原子落地，不无限等冻结的 mix；prepare/排队不计入新动画，提交后重置首帧时间基准。同步 `setBouquet` 保留旧兼容契约，成功校验后取消异步任务并失效 canonical 引用，避免两条 API 混用错源。

[app.js](../../../../site/app.js)区分 preparing / waiting / committed。意图先反馈；旧标题、选中状态和 hash 到真实 commit 才切换，避免把提前改文案当作已经完成。失败保留旧束；首束失败或 context loss 才进入插画。资源修订统一升 v5，新模块由现有 `copytree` 构建流程复制。

独立静态复核还发现并修复两处边界：当前 fetch 的 45 秒超时同样产生 `AbortError`，仅凭名称忽略会遗留加载态，因此只对版本已失效的请求静默；浏览器回归缩短这个实际 deadline，验证首束降级、旧束保留和重试。失焦但仍可见时，先取消旧 RAF，再落地 pending 并保留一次静态绘制；帧末以 focused 限制重排，既不取消最后这帧，也不启动失焦空转。新增真实 draw/时钟/无后续 RAF 断言，而不只检查 CPU target。

## 真正考虑的替代方案与代价

- 直接迁入完整 Unity/Three.js 工程：不符合当前 Python 标准库、原生 WebGL 静态站和既有协议，且参考项目原美术资产不能当作随意可用的代码素材。本轮借鉴曲面与材质组织，不换技术栈。
- 只减点、只降低曲面 alpha：既有去点实验仍暴露机械扇片；成熟曲面本来已不透明，因此不把透明化当作模型修复。
- 只缓存原始解码结果：没有移走重复支持扫描、冻结和拼接，旧版本已证实缓存回切仍慢。
- 继续合并可见快照以立即任意中断：保留了中断连续性，但连切顶点/CPU成本随历史扩大。应用改为有限等待的 latest-only；代价是最后一次点击可能等待当前剩余 morph，准备自身也仍有异步耗时。
- 删除同步 API：会损坏原已有调用及中断契约。保留兼容入口的代价是维护两条路径，以真实八束 packed/支持逐项相等及 async 包络/混用回归约束漂移。

## 验证口径与尚存限制

几何开发证据见[几何交接](../../../../artifacts/floral-refinement/geometry/HANDOFF.md)，管线隔离证据见[性能报告](../../../../artifacts/floral-refinement/performance/REPORT.md)；最终集成须另跑全量标准库测试、新资产 Node 契约、完整构建、真实 GL 生长/环绕/交互和最终输入哈希。保留面积 `.72`、宽度 `.82`、裁切 `.98`、2% 近似及 3MB 门槛，不以历史通过替代本轮。

仍有少量瓣片交叉，未实现逐瓣碰撞求解；有限网格近看仍可见分段，本轮不是照片级花卉重建。牡丹等其它原生花型尚未重塑。冷 GL 初始化约 191ms 的同步任务仍在旧输入管线实验中出现；不把它写成已经消除，也不从 SwiftShader 推断实体 GPU、手机帧率或功耗。线上站点在本轮本地交付期间保持原样。
