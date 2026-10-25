# Three.js 花艺静物与花材丰富度

日期：2026-10-25（Asia/Shanghai）。
状态：实现与本地验收完成；完整实际结果、性能取舍及剩余限制见[本轮验收](2026-10-25-validation.md)。本轮不提交、推送或部署。

2026-10-26局部替代：用户随后认可自然花园并授权完整整合/发布，[当前自然花园决策](../floral-style/2026-10-26-natural-garden-release.md)将现代默认改为实体Mesh深度、不画可见粒子覆盖；本页Three基类、同源GPU生长与兼容分支的取舍继续有效。上面的本地状态是本页历史时点，不代表新一轮发布状态，实际结果见[当前验收/部署](../floral-style/2026-10-26-validation-and-deployment.md)。

## 背景与继承

用户明确要求采用 Three.js，并提升艺术表现与花朵丰富度。此前[根轴玫瑰与异步准备](../floral-refinement/2026-10-20-rooted-petals-and-prepared-switching.md)继续有效；此次替换现代主渲染与其它花材的规则排列，不退回旧极坐标玫瑰或同步重计算切换。[本轮方案](../../proposed/three-gallery/2026-10-25-three-scene-and-floral-richness.md)和[94 文件冻结输入](../../../../artifacts/three-refactor/baseline-hashes.json)保留。

## 选择一：真正 Three 场景，而非包装旧 GL

[入口](../../../../site/particles.js)在 WebGL2 可用时构造独立的 [ThreeGarden](../../../../site/three-garden.js)，真实管理 Scene、PerspectiveCamera、BufferGeometry、InterleavedBuffer、Points、Mesh 和 WebGLRenderer；不继承原生绘制器、不让 Three 成为未使用的依赖。只有不支持 WebGL2 时进入明确的[WebGL1 兼容路径](../../../../site/legacy-garden.js)，Three 编译失败不会冒充兼容成功，仍按既有失败策略显示 SVG。

保留 Python 生成器与普通 DOM，不为这次引入 React/R3F、Node 打包链或运行时 CDN。锁定已核对的 Three `0.186.1`、官方 commit `9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8`；官方 ESM 两文件原样自托管约 2.12 MB，MIT 与包 SRI/逐文件哈希随附。代价是首屏脚本增加、保留兼容分支的维护成本；[重现脚本](../../../../scripts/vendor_three.py)和[构建器](../../../../build.py)离线核对完整性，不依赖 npm。新增[构建回归](../../../../tests/test_build.py)验证所有模块/许可被复制，以及破损 vendor 在昂贵生成前被拒绝。

## 选择二：软光实体曲面、克制细粒

[材质](../../../../site/three-materials.js)为 MeshPhysicalMaterial：粗糙度 `.79`、sheen `.28`、specularIntensity `.22`，无 clearcoat、transmission buffer、阴影贴图、环境纹理或 Bloom。温暖主光、冷青填光、温和背光使卷瓣和叶片有层次；薄片背光是艺术近似，不称物理 SSS。磁盘 sRGB 先在 GPU 解码为线性空间，再由 ACES Filmic 和单次 sRGB 输出处理，避免重复 gamma 或把原色当作线性光。

生长坐标/闭合法线、展开延迟、风场与 Jacobian 法线仍由 GPU 执行。每个 Points 的属性直接引用后台已准备的 16-float 私有数组，不为物理材质在 commit 重算法线/颜色或全量包围球。无色深度 core 与可见细粒共享同一几何，继续保留 `.72` 核心、真实深度测试与可见点不写深度；实体曲面为不透明深度拥有者，短暂交叠使用 alphaHash。它省去透明双面多 pass，代价是过渡中可见短时颗粒覆盖。

原取景支持点、相机距离和增长/变形包络通过真正 PerspectiveCamera 与 off-axis projection 保留，非任意放大到裁边。移动 DPR 仍上限 1.8。舞台降噪、去掉装饰轨道，保留自托管宋体与纪念感排版；艺术幅度集中在花本身，而非增加工具面板。

## 选择三：花材区分，不以更多重复面片充数

[生成器](../../../../generator.py)把牡丹和洋牡丹改为 42 片各有根附件与深浅变化的独立宽瓣/勺形瓣，替代原 72/98 片机械圆环。牡丹外瓣反卷，洋牡丹保持上举包裹唇；内侧瓣以真实三角覆盖花轴，不加中心圆盖。六瓣郁金香保留 3+3 关系，增加圆肩、杯口、六花药与柱头。向日葵用 32 条长短交错舌状瓣与 128 个凸起盘花形成盘/舌分界。玫瑰四个根轴函数 AST 与单花两份资源保持原样。

没有增加花头、枝花或散点数量：八主题、36 头/6 主锚、每束 120k 和原协议保持；共用洋牡丹使所有主题均受益。只读 `composition:[{species,count}]` 从实际花头计数生成，每束五物种/总 36；[界面](../../../../site/app.js)按已知品种安全映射，展示花材而不臆造数量。[新几何契约](../../../../tests/test_floral_richness.py)验证类别、根附件、中心、繁殖器官与盘/舌区分；原 2% 逼近、预算及构图断言未降低。

严格加密到 48×32 的实际三角检验曾抓到牡丹外肩 2.0675% 与旧纵深断言失败；通过局部加细分和更深碗形修正，不放宽标准。最终改型误差 1.09–1.865%，牡丹 mesh 2,979,444 字节，只余 20,556 字节。大丽花/洋桔梗未全面重塑，有限折线、相交和没有碰撞求解仍属限制；[几何交接](../../../../artifacts/three-refactor/geometry/HANDOFF.md)给出完整预算与单花前后输入。

## 生命周期与验证边界

生产 app 仍仅走 Worker prepare → latest-only queue → commit；CPU LRU 仍四项，常规交叠最多两份 canonical mesh。暂停、隐藏和失焦冻结时钟，静态落地留一次实际绘制；上下文丢失和 dispose 取消等待/Worker，并释放 Three 资源。同步 setBouquet 签名与中途姿态兼容保留，只有显式同步调用才复用原 CPU 快照算法；极端同步重定向的复合网格不宣称具有 canonical 双 mesh 上界。

旧 49 项原生断言继续指向仍在生产使用的兼容分支；新增[Three 独立契约](../../../../tests/three_renderer.mjs)与[独立真实资产夹具](../../../../tests/test_three_renderer.py)。CPU 用真实 Three 类，只有 GPU 边界为注入对象，不将其冒充浏览器。Three WebGL2 材质可使用内置属性，按保证的 16 属性与实际设备上限检查；旧 WebGL1 的八属性要求不变。

[真实像素观察](../../../../tests/webgl_observation.py)兼容 WebGL1/2，只有发生真实 draw 的 RAF 结束后才读像素，不再依赖最后 360 个装饰点；保留全部旧颜色/面积/宽度门槛，并记录观察中实际 GL 错误。相机/时钟受控的截图不充当 FPS，原生点击性能另以无响应/时钟/渲染替换的观察脚本测量。r186 的 vColor 实为 vec4（即便 RGB 属性），首轮真实编译失败已通过读取锁定 chunk 修正，未用 SVG 降级冒充 Three 成功；详见[渲染交接](../../../../artifacts/three-refactor/renderer/HANDOFF.md)。最终验收另记，不以早期三主题通过覆盖整站结论。
