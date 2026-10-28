# 信中生花：独立花笺与实体玫瑰

日期：2026-10-26。状态：独立艺术样板已实现并完成本轮实际看图/交互核验，供用户确认审美；[实际验收](2026-10-26-validation.md)记录输入、失败修正、证据和限制。不是正式站点替换，没有提交、推送或部署授权扩张。[原方案](../../proposed/letter-bloom/2026-10-26-letter-as-bloom.md)保留方向形成与边界。

## 决定与原因

用户认为上一版花朵粗糙、页面缺少精致与艺术惊喜，明确批准先做主花近景/拆信开场，并允许高品质合法模型/材质。此次把主要体验从“看八束花、选择功能”改为“收到一件私人信物、亲手拆开、让真实花与信一起出现”。棉纸、盲压线稿与轻斜封套承载初始画面；深红绒面实体玫瑰形成开启后的颜色转折，原文自然展开，近看退为次级操作。不增加星尘烟花、假日期、自动音乐或卡片货架。

纸折、文字、花的揭幕共用UI的原生时序；主花由纸色浅态到原始材质的显露，不假称重新生成了实体花瓣生长动画。减弱动态由用户操作直接到终态。静态成景后停止GPU空转，近看只在独立portrait区域内取景，纸上全文始终可读；无GL时明确关闭近看但保留信件。

## 素材与真正考虑过的替代

首轮限时调研没有取得可用第三方文件，便做了独立原创高细分UV花瓣。真实图仍是五角折板中圈和脱节球芯，已明确否决，未用CPU/GL成功或增加顶点数量代替美术判断。[失败图](../../../../artifacts/letter-bloom/2026-10-26/first-real/desktop-flower.png)与候选保留，不刷新成新结论。

随后用公共Objaverse索引按已知UID检索，实际取得两份GLB，逐一重新核验当前作者许可和真实模型渲染。Innerscene低模预览此前已否决；Emm的Pink rose有自然纹理，但明确采用KHR_materials_unlit与烘焙图，不能把动态侧光/PBR效果归功于它。本次选择Heliona的Rose：实际卷边/枝叶明显优于原创失败稿，四材质PBR/法线与全部贴图内嵌；不是项目原创，也不宣称新摄影扫描。署名、来源、原始SHA、CC-BY4完整文本、未改变GLB字节与运行时调整均在唯一所属[素材说明](../../../../studies/letter_bloom/ASSET_PROVENANCE.md)维护。

代价是主花12.14MB的单一资源，不能声称冷加载或FPS提升；压缩与进一步分级尚未做。该选择是以本轮单场景质感优先，不拿旧八束的120k/3MB/BFM/BFG预算约束新资产，也不删除或弱化旧产品契约。

## 合成与运行语义

[独立builder](../../../../studies/letter_bloom/build.py)将[新页面](../../../../studies/letter_bloom/site/index.html)、[UI时序](../../../../studies/letter_bloom/site/app.js)、[样式](../../../../studies/letter_bloom/site/letter.css)、[主花场景](../../../../studies/letter_bloom/site/flower-scene.js)、本地字体、只读原信、锁定Three和新官方addons装配成可独立托管产物。生产入口及Pages workflow不引用这份研究。构建前后比对139个原输入；输出只能是独立artifact或外部目录，拒绝生产源、祖先、冻结baseline与symlink逃逸，校验vendor与声明的模型SHA/许可文件，不递归删除输出。

主花使用真实Mesh与原始PBR贴图，不是旋转照片。以m_petal世界包围盒锚定花冠，长茎不主导相机；默认25°方位/30°俯视，近看受portrait约束而非盖在原信上。GLTF加载、GPU场景与UI揭幕独立，迟到载入接上当前进度，失败/超时不阻止读信，重试和释放有各自代际。轻拉和按钮键盘共用操作，原信与称谓只通过textContent读取。

接口createFlowerScene(canvas,{assetURL,onStatus})返回setReveal、setCloseup、setReducedMotion、requestFrame、getDiagnostics、dispose。资源为本地ESM/GLB，无CDN运行依赖。Three与addons固定同一0.186.1官方MIT字节，主站vendor只读，新增加载器在本study内锁定。完整运行说明只在[样板README](../../../../studies/letter_bloom/README.md)维护。

## 验证边界

[隔离构建](../../../../studies/letter_bloom/tests/test_build.py)与[真实浏览器探针](../../../../studies/letter_bloom/check_browser.py)按影响范围实际执行；具体计数、源锁、桌面/手机画面、真实录屏、失败修正与未测项统一见[本轮验收](2026-10-26-validation.md)。CPU/DOM模拟与真实GPU分开，实际看图不由自动测试替代；本轮交的是独立样板，最终审美由用户确认。
