# 自然花园花型：在线参考与替换方向

日期：2026-10-25（Asia/Shanghai）。状态：已完成参考/许可/文件审计与视觉筛选；这是样式提案，不是花型替换已经实施。当前 Three 运行源码与分发文件哈希仍与[本地验收](../../implemented/three-gallery/2026-10-25-validation.md)一致，未改现有预览、构建、提交或部署。

## 目标与推荐

用户希望花朵样式可以更换，并要求上网寻找更精致、更丰富的方向。现有真实 Three 引擎、生长与异步切换可继续用；不把升级引擎、更多重复瓣数或更多发光点当作花型质量本身。

优先方向：**奶油香槟·自然花园**。先做一束新的独立视觉样张，而不是未经审美确认就把八主题全部重写。主花选择宽圆、薄而有不规则卷褶的重瓣花；配花有真正不同的花脸和轮廓，构图兼有大花、小花、花苞、半开、正脸/侧脸/低垂与弯茎留隙。不能把“丰富”做成同向密堆、整齐球壳或只换颜色。

## 优先实拍参考：Floret La Belle Champagne

[作者原页](https://library.floretflowers.com/products/ranunculus-la-belle-champagne) · [单花原图](https://library.floretflowers.com/cdn/shop/products/Ranunculus_Champagne_Floret-5_d4afe3c6-bd6b-4c88-8d01-ae3956b093e0_768x.jpg?v=1671751481) · [花艺原图](https://library.floretflowers.com/cdn/shop/products/La_Belle_Champagne_Ranunculus-9651_8c5d0ad4-753e-4939-990a-329706f57aa4_768x.jpg?v=1671751480)。本次真实阅读了[单花浏览取证](../../../../artifacts/floral-style-research/2026-10-25/style-audit/floret-champagne-browser-reference.png)和[花艺浏览取证](../../../../artifacts/floral-style-research/2026-10-25/style-audit/floret-champagne-bouquet-browser-reference.png)，不是按标题猜图。

单花的宽圆薄瓣彼此挤压、局部反折，轮廓不等齐；瓣缘细波折和局部细脉比统一锯齿、统一亮边自然。瓶插中同品种有香槟、杏、珊瑚粉、奶黄等变化，花头大小/方向/开合各异，有暗色开放花心和紧卷心的对比，细弯茎与外围空隙让繁密不闷。

这是**2D审美参考，不是已完成3D效果或可用模型**。[官方照片FAQ](https://www.floretflowers.com/faq/)明确照片/文字受版权保护，未经许可不要取用；署名回链不等于免许可。照片不纳入网站资产，后续自行建模/原创纹理或另找明确可用资产，也不以照片平面替代交互3D。

可进一步对照的真实品种页：[Dahlia Café au Lait](https://library.floretflowers.com/products/dahlia-cafe-au-lait)、[Larkspur Smokey Eyes](https://library.floretflowers.com/products/larkspur-smokey-eyes)。本轮主会话读取了这些页面与原图链接，但没有亲自完成其图像核看，不把它们写成已视觉验证的3D或已建模花材。

## 实际排除的现成方案

[代码与样式审计](../../../../artifacts/floral-style-research/2026-10-25/style-audit/audit.md)：`hubshashwat/flowers` 固定提交 `e037910d1ca9ae6f2ffad33d8635ad6d5051c69c` 的真实 LICENSE 为 MIT，目录确有50页程序化体验，却没有3D模型包。本轮只运行核看其中 photorealistic-rose / translucent-petals 两页：前者重复尖瓣、饱和色团，后者整齐尖瓣与偏瓷塑白亮斑，不因标题/参数称写实或自然薄透。它们只适合局部配色/层级借鉴，不作直接替换；没有全量评测其余48页。

[实际模型与许可审计](../../../../artifacts/floral-style-research/2026-10-25/asset-audit/REPORT.md)：Innerscene Mixed / Wildflower 两束确为公开可无登录下载的 CC0 GLB，分别实得9,296,508 / 12,438,588字节，读取GLB2头与JSON。原官方预览实际稀疏、低模，文件大小主要来自2048² baseColor图片，不代表精细几何。默认场景11,264 / 13,908三角；没有 animation、skin 或 morph，虽然花瓣部件可分，仍无局部pivot/根轴与闭合态。保持自然含苞展开需另制形变/骨骼或重建局部曲面，不是换GLB就能获得。仅审计元数据和图像header、未实渲染二进制模型，未冒称完全匹配。整束不作本需求首选。

主会话也读取了 [LOLIPOP高模玫瑰页面](https://sketchfab.com/3d-models/rose-flower-realistic-high-poly-98edd35f37fc4010a469425699110ceb)：作者写446.1k三角、4K贴图、CC BY 4.0。主会话未成功视觉核验/下载，未列作已经取得且适用的资产；不能只凭high-poly或realistic词汇推荐。没有纳入NoAI、NC或无许可的模型。

## 下一步边界

若用户认可自然花园方向，先制作“单朵近看＋一束组合”样张，确认宽圆瓣曲率、花心、瓣缘、非机械排列与柔光，再扩大到其它主题。花园玫瑰/洋牡丹可作主花候选；银莲花、香豌豆、穗状小花等作不同轮廓候选，不把尚未核看/制作的花种写成已具备。

保留当前含苞展开、旋转、减弱动态和有界切换目标，但新花型是否适配原几何/字节预算须真实验证；需要调整架构或预算则先说明代价，不为美术目标暗改既有断言。先做可见的审美验收，不先大规模重建并用数值通过替代花型质量。当前研究未运行或声称新的产品回归通过，也未启动新服务。

## 工具与证据限制

主会话 `web_fetch` 因provider歧义失败，公开页面由read_page读取；外部图片通道有public-IP解析guard，modlens路由的旧模型选择失效。子研究以公开浏览器页面取证并实际读图，主会话随后读取本地取证图；未改代理/DNS/全局模型设置。网络/图片故障未被说成素材不可用或许可拒绝。两个研究任务已完成并清理自启任务/浏览器；下载原件与许可/哈希证据仅在各自研究目录，未复制进生产分发。
