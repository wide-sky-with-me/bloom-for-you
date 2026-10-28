# 信中生花 · 进阶花艺与动作的制作说明

## 当前花材与许可

[Rose](https://sketchfab.com/3d-models/rose-6281bf3703584323bb4d8326f1f1b59d) — [Heliona](https://sketchfab.com/Heliona)，[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)。原始GLB为12,143,680字节（网页交付其压缩副本，见下文），SHA256 `cb1a96fe9327ebd8c55735ccb0fd2b677b76e854ac09b962860cc8bdba005ef6`，四材质/内嵌PBR贴图。原始文件字节未改，网页交付无损几何+WebP贴图的压缩副本；运行时改变取景、灯光与基于独立瓣壳/枝叶的动作，不把模型称项目原创或摄影扫描。

[Orchid](https://sketchfab.com/3d-models/orchid-ed453cd6b12f4dfa8d4f3dcf68c97cf1) — [Rigsters](https://sketchfab.com/rigsters)，[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)。原始GLB为5,090,400字节（网页交付其压缩副本），SHA256 `d0d47671e6568ff1c4028372195e09d075187646f7942f454eaea2cd40ad027d`，40,304三角、单材质、4幅内嵌1024²贴图。实际浏览器已看正面/斜侧：源BLEND透明排序造成碎三角，单降transmission无效；运行时改为opaque/alphaTest=.12、depthWrite=true、DoubleSide后完整，保留源色彩/法线/粗糙等贴图。GLB原字节不改；兰花的整体枝姿/显形不冒称其每片瓣有独立骨骼。

两者通过公开Objaverse按作者模型UID精确取得，当前官方Sketchfab API与内嵌extras的许可已核验，不需要登录或Token，不使用保护内容提取。完整许可随包 [CC-BY-4.0.txt](assets/CC-BY-4.0.txt)；文件摘要与运行改动的机器记录见 [catalog.json](assets/catalog.json)。作者署名和许可链接在本页可访问。

## 网页交付的压缩副本

2026-10-28起网页加载的是由 [tools/compress-models.mjs](tools/compress-models.mjs) 从未改动的原始GLB（保存在不发布的 `source-models/`，SHA见上文）离线派生的副本：`rose-heliona-web.glb` 3,033,496字节、`orchid-rigsters-web.glb` 1,402,628字节，合计约4.4MB（原17.2MB）。几何用 EXT_meshopt_compression 编码，不量化、不重排：全部顶点属性解码后逐字节相同，三角形顺序与绕向不变，仅meshopt索引编码会让部分三角形从另一个角起始；脚本逐项校验后才写出，重跑输出SHA不变。贴图转为 EXT_texture_webp，玫瑰花瓣与叶保持1024²，茎512²、刺256²；兰花1024²。实看渲染与原文件平均像素差约0.1/255。运行时以 three@0.186.1 随包的 meshopt 解码器（MIT）解码，派生副本SHA与原始SHA均记录在 [catalog.json](assets/catalog.json)，玫瑰动作mapping仍绑定原始SHA。

## 动作来源与边界

玫瑰动作mapping由本项目离线解析原GLB拓扑生成：UV缝不当成新瓣，实际25个独立瓣壳；其中16个中外层瓣在开场分层舒展，9个卷心瓣保留原形，避免强闭合产生相交刀片，不把拓扑壳数当成全部在动。叶与中脉按两组枝叶共同处理，不虚构现成骨架或五叶完全独立。数据与代码是派生制作，运行时保留原索引/属性，成熟端点回到原网格。兰花在极短淡显后以完整整枝从纸根抬起，不横向裁切花体；仅新增一段原创细弧枝接到原模型实际raycast切口，并与整枝协同运动，不伪称枝线原在源GLB中；该枝由切口处的原茎褐色渐变为近足的青褐，逐段贴着玫瑰主茎（动作mapping的0号不动部件）下行到纸根，并在并拢处加三圈原创亚麻线，花开尾段才淡显。实际阶段图与录屏仍与CPU/拓扑证据分开，最终审美由用户判断。

花笺排版、原创建模研究与动作代码由本项目制作。Three.js及官方addons采用MIT；本地中文字体采用随包 [FONT-LICENSE.txt](assets/FONT-LICENSE.txt)。字体许可文件仅在构建产物中复制，源文件来自现有站点而不修改。

## 未采用的研究

Emm的Blue flowers虽然实际取得、CC-BY4且轮廓不同，但扫描花瓣破碎萎缩、采用unlit单纹理，不为凑数量而导入产品。研究源thumbnail/对照模型仅留在私有artifact，不当作贴图或3D成果交付。上一版的单玫瑰静物与原有线上画廊原样保留，未覆盖。
