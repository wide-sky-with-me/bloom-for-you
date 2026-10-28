# 信中生花：从单花显色到分层绽放

日期：2026-10-27（研究目录保留2026-10-26启动日期）。状态：独立进阶样板已实现、实际看图与Native交互核验完成，待用户审美确认，不替换线上。[原提案](../../proposed/letter-garden/2026-10-26-layered-floral-choreography.md)保留意图；[本轮验收](2026-10-27-validation.md)统一保存执行结果与限制。

## 选择与原因

用户认可花笺创意但指出花朵和动效单一普通。因此保留私人纸笺与原文，替代“单朵模型显色/放大”为非对称的玫瑰与蝴蝶兰花艺、分阶段开场和局部触碰回应，而非恢复八卡片或加烟花/泛滥粒子。不同轮廓真实花材的作者、许可、原SHA和运行改动只在[制作说明](../../../../studies/letter_garden/ASSET_PROVENANCE.md)维护，不能用研究缩略图或低模凑数量。

原Heliona模型离线分析确认25个独立瓣壳而非UV缝造成的75组。第一稿对全部花瓣使用连续根权重，因Jacobian安全限幅实际变形过弱；第二稿刚体强闭合全部25瓣又使原卷心相交成刀片。最终保留9个原卷芯，16个中外层壳绕真实候选根枢轴刚体错峰舒展；两组枝叶沿连续根权重协同弯摆，保持中脉关联，不冒称已有作者骨架或五片叶均独立。原索引/POSITION/NORMAL/TANGENT/UV保留，成熟静息显式旁路恢复，影深使用同一变形。

兰花原BLEND配置在实际WebGL中出现碎三角，单降transmission无效；运行时采用opaque cutout后实图完整。最初横向高度揭示会切出紫色碎片，最终改整枝围绕纸根抬入加极短全材质显现，三花一直完整；只新增一条细弧枝补原短枝，连接点来自实际原生raycast而非bbox猜根。没有改原始GLB字节，也不假称兰花每瓣有动作。

## 节奏与交互

[新UI](../../../../studies/letter_garden/site/app.js)用一条4800ms原生时序控制纸折→茎/枝叶→主花/配花→静读；[场景](../../../../studies/letter_garden/site/garden-scene.js)与[分瓣模块](../../../../studies/letter_garden/site/petal-motion.js)接0..1进度，成熟后停绘。镜头仅一次克制俯视转变，不常驻旋转。轻拉触发开封，不宣称全程跟手scrub。减弱动态直接终态，无GL保留信。

开封后的“再看花开”只重播花景，不藏正文、不重折纸、不跳读信位置。近看受portrait边界隔离；40px操作区节奏收敛减少工具栏感。触碰只在成熟原mesh实际Raycast命中后让附近真实部件短暂回应并归位，空白无回应、回应中不重入，不用大范围投影中心近邻假装触中。键盘开封与花区方向键/确认保留。

真实Native发现旧UI把miss也算入240ms冷却，会吞掉紧随的合法hit；通过原条件150ms复现后只修accept===true才计时，不延长等待掩盖。该修正与源码/失败证据归验收记录。

## 隔离与接口

新源为[letter_garden](../../../../studies/letter_garden/README.md)，不写旧study。独立builder校验生产139输入和旧样板源/交付43文件，拒绝往保护目录装配、校验模型和动作侧车摘要，要求两种不同SHA的真实花材与已实看状态才允许正式样板构建，显式draft只供私有合成。原生产与冻结档案不受新接口约束，不改旧测试预算。

createGardenScene(canvas,{catalogURL,onStatus})返回setProgress、setCloseup、setReducedMotion、react、requestFrame、getDiagnostics、dispose。单GLTF批次通过每原顶点1byte组件ID使用原PBR材质，侧车与源GLB SHA绑定；片段读取、阴影、自阴影与法线/切线随动作一致。getDiagnostics用于区分25拓扑壳/16开场动画瓣/当帧移动量、部分加载、材质覆盖和真实命中；不将数量当审美评分。

运行方式唯一归属[样板README](../../../../studies/letter_garden/README.md)。公开依赖为自托管Three/addons、字体与两份合法GLB，原信仍textContent逐字读取。模型合计约17.23MB，未压缩、未做冷加载/FPS/真机评测；这轮优先以真实画面回答用户反馈，不夸大性能或摄影扫描身份。
