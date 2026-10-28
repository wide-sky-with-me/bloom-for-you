# 花间来信

一封藏着花的信。拆开封口，信笺上一支深红玫瑰与一枝蝴蝶兰慢慢舒展，两枝花茎在纸根并拢、系一圈亚麻线，下面是写给老婆的话。

**在线来信： https://wide-sky-with-me.github.io/bloom-for-you/**

## 现在的线上版本：信中生花

线上发布的是[信中生花](studies/letter_garden/README.md)：玫瑰16片中外层花瓣按真实瓣壳分层舒展、9片卷芯保留原形，蝴蝶兰整枝从纸根抬入，轻触花瓣有短暂回应，「再看花开」只重播花景、不打断读信，「近一点」把两朵花一起拉近而不越出信纸。两份花材为 CC-BY-4.0 授权的现成模型，作者、许可与运行时改动见[制作说明](studies/letter_garden/ASSET_PROVENANCE.md)，页面底部「制作与素材」同样可访问。

```bash
python3 -m studies.letter_garden.build --release
python3 -m http.server 8000 --directory dist
```

推送 `main` 后，[Pages 工作流](.github/workflows/pages.yml) 运行信笺构建契约并以 `--release` 生成 `dist` 发布；`dist/study.json` 记录提交 revision 与每个文件的 SHA，可据此核对公网版本。原立体花束画廊不再上线，代码与测试保留在仓库中，下文为它的说明，仍可用 `python3 build.py` 在本地构建。

## 原画廊（已下线）：花会动，心意也会

粉雾玫瑰、奶油粉郁金香、月光绣球、香槟混合花园，以及牡丹、百合、向日葵、马蹄莲。每束从 Python 确定性参数曲面生成连续花瓣、细叶、弯茎与亚麻结，主花与不同轮廓的配花组成环绕花冠。四种代表花型——洋牡丹、花园玫瑰、银莲花和香豌豆——可以独立近看，也能随时回到刚才选中的整束。

现代浏览器由自托管 Three.js 呈现柔和哑光实体花瓣。默认不再用可见粒子覆盖花面，避免细碎亮砂遮住卷曲层次；点记录仍用于准备、取景和明确的兼容路径，不宣传为十二万个可见光点。每束花材说明来自实际花头计数。初次展示完整盛开造型，点击花束或「让心意绽放」可重放真正闭合、逐层展开的过程；花瓣共享同源闭态、法线与延迟，枝叶和亚麻结留在原位。盛开后保留轻摆，拖动可绕整束观察，右上角还藏着一封信。

手机可触碰、滑动和挑花；支持沉浸模式、暂停与键盘操作。页面跟随系统「减弱动态效果」设置，默认静止，可手动播放。Three.js 主路径需要 WebGL2；仅有 WebGL1 时使用明确的原生兼容渲染（没有新的物理材质），无 WebGL 或数据/着色器失败时显示同源 SVG 投影，不将降级假称为 Three 成功。

## 运行

构建只需要 Python 3.10 或更新版本，无第三方 Python 运行依赖，也没有 Node 构建依赖。Three.js 0.186.1 的官方 ESM 和 MIT 许可已锁版本自托管，运行不访问 CDN；构建会先核对 vendor 文件哈希。

```bash
python3 build.py
python3 -m http.server 8000 --directory dist
```

浏览器打开 `http://localhost:8000`。请通过 HTTP 打开，直接双击 HTML 的 `file://` 模式不支持模块和数据加载。

## 写成你们的故事

编辑 [site/gift.json](site/gift.json)，修改 `recipient`、`salutation`、`signature` 和 `letter`，重新构建后即可生效。正文每项为一段，`\n` 表示换行。

也支持链接参数 `?to=你的称呼&from=你的署名&message=想说的话`，参数应使用 URL 编码；`#rose`、`#tulip`、`#hydrangea`、`#wildflower`、`#peony`、`#lily`、`#sunflower`、`#calla` 指定花束。可加 `view=champagne_ranunculus`、`garden_rose`、`anemone` 或 `sweet_pea` 打开单花近看；分享保留实际选中的花束、近看方式与个性化文字。

GitHub 仓库与 Pages 是公开的。信件配置、URL 参数和站点内容都可被访问，请只放适合公开分享的文字。页面没有统计追踪、第三方远程脚本、远程字体或后台账号。

## 发布到 GitHub Pages

仓库设置中，进入 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。仓库设置保持 GitHub Actions 来源即可；当前工作流只发布信中生花（见上文），画廊构建不再进入 Pages。

## 实现

- [garden_generator.py](garden_generator.py)：正式八主题与四近景的确定性生成入口，输出实际 `headCount`/`composition`、点、曲面、生长数据和 SVG。
- [generator.py](generator.py)：仍使用的公共数学/协议编码与明确的旧布局兼容实现；手动运行它不是生成当前完整自然花园的入口。
- [共享花型曲面](studies/natural_garden/flowers.py)：已认可的根轴花型与细分实现，正式生成器只读复用，研究页面不进入正式分发。
- [build.py](build.py)：生成花束、校验情书配置、生成同源曲面 PNG 缩略图，并构建可独立托管的 `dist`。
- [site/particles.js](site/particles.js)：选择真正 Three.js/WebGL2 主路径或明确的 WebGL1 兼容分支。
- [site/botanical-garden.js](site/botanical-garden.js)、[botanical-materials.js](site/botanical-materials.js)：正式自然花园主路径，连续实体花瓣拥有深度，默认关闭可见细粒和点core，保留清晰的渲染诊断。
- [site/three-garden.js](site/three-garden.js)、[three-materials.js](site/three-materials.js)：真实 Three 场景、透视相机、共享 GPU 生长/法线与暂停/旋转/释放的兼容基类。
- [site/legacy-garden.js](site/legacy-garden.js)：仍供 WebGL1-only 设备使用的原生兼容路径；旧断言继续测试该分支。
- [scripts/vendor_three.py](scripts/vendor_three.py)：重现/校验官方 ESM、SRI、精确 commit 与许可，`--check` 离线运行。
- [site/surface-data.js](site/surface-data.js)：验证 BFM1 曲面头、长度、颜色、法线及索引。
- [site/growth-data.js](site/growth-data.js)：验证 BFG1 数量绑定、紧凑坐标、闭合法线和展开延迟。
- [site/prepare-data.js](site/prepare-data.js)、[prepare-client.js](site/prepare-client.js)、[prepare-worker.js](site/prepare-worker.js)：完整校验、GPU 数据与支持扫描异步准备；无 Worker 时按预算分任务执行，缓存与取消生命周期有界。
- [site/app.js](site/app.js)：原子加载三资源，区分准备/等待/提交，只在真实提交后切标题；处理竞态、个性化、情书、分享与降级。

点记录沿用 version 2 / stride 11，整束120k记录为5.28 MB，近景16k记录为0.704 MB；另附同源 `.mesh` 与 `.growth`，两者各控制在3 MB内。清单扩展 `headCount`、`composition` 与四个 `closeups`，不将不同数量的近景误按整束解码。BFG1保存闭合坐标、法线与延迟，绑定点数与网格顶点数；GPU重包只在后台准备。资源修订为 `v=7`，官方Three模块另以锁版本目录标识，全部模块/资产须一并构建发布。fetch与prepared LRU各四项，连切只保留最新pending，等待当前交叠结束再提交；暂停/隐藏/失焦/减弱动态静态落地，常规交叠最多两份canonical mesh。显式同步兼容API可做较重的中途快照，app不走该路径。空闲最多预取相邻一束，省流量/低速网络不预取。缩略图来自盛开曲面，SVG仅降级加载；近景也有同源SVG。移动DPR上限1.8，后台与暂停冻结时钟并停止空转。Python交付独立静态站点，无常驻后端；自托管Three未压缩约2.12 MB，冷加载和首次GL编译仍有成本。[第三方notices](THIRD_PARTY_NOTICES.md)及完整许可随产物分发。

当前架构见[完整自然花园决策](.agents/notes/implemented/floral-style/2026-10-26-natural-garden-release.md)，实际验证与发布状态见[当前验收/部署记录](.agents/notes/implemented/floral-style/2026-10-26-validation-and-deployment.md)。[独立样张记录](.agents/notes/implemented/floral-style/2026-10-25-natural-garden-study.md)保留造型形成与取舍；[Three场景](.agents/notes/implemented/three-gallery/2026-10-25-three-scene-and-floral-richness.md)、[根轴/异步准备](.agents/notes/implemented/floral-refinement/2026-10-20-rooted-petals-and-prepared-switching.md)、[环绕](.agents/notes/implemented/round-bouquets/2026-10-19-all-around-garden-composition.md)及[增长时钟](.agents/notes/implemented/botanical-growth/2026-10-19-bud-to-bloom.md)继续解释底层选择，其历史验收不代替当前版本验证。


## 验证

```bash
python3 -m unittest discover -s tests -v
node tests/app_natural.mjs
python3 build.py
```

安装 Node.js 时，单元测试会在临时目录生成独立的真实花束夹具，分别执行原生兼容路径与 Three 的生命周期/同步 API、实际透视矩阵和全增长包络契约，不依赖工作目录已有资产。CPU 契约使用真实 Three 类，但 GPU 边界注入测试对象；下面的浏览器检查才证明真实 Three/WebGL2 绘制。Node.js 仅用于开发测试，构建和站点运行不需要它。

浏览器端检查使用独立开发依赖 `requirements-dev.txt`（Playwright 与 Chromium）；用 `python3 -m pip install -r requirements-dev.txt` 和 `python3 -m playwright install chromium` 安装。在另一个终端启动静态服务器后运行：

```bash
python3 tests/browser_smoke.py --url http://localhost:8000
```

检查实际实体深度通道及整圈彩色花冠，默认每束捕获完整环绕视角；兼容渲染分支仍检查它原来的点core合同：

```bash
python3 tests/visual_depth.py --url http://localhost:8000
```

覆盖真实Three/WebGL2物理曲面、同源生长、暂停、切花与连点、拖动、键盘、花材计数、信件、沉浸、分享、手机尺寸、触碰、减弱动态、文本转义、省流量、超时恢复，以及WebGL1/无uint扩展、无WebGL与破损数据降级。环绕验图保留花冠面积/宽度/花材占比门槛，真实像素观察兼容WebGL1/2；数值通过仍需人工看图。`python3 tests/visual_growth.py --url http://localhost:8000` 从真实重放操作检查花苞、半开、盛开和暂停，只控制时钟，不替换着色器或资产。截图在 `artifacts/`，不提交；手机检查是Chromium触屏模拟，不是真机横评。当前造型仍为艺术化曲面，没有照片级细脉、碰撞求解或物理SSS。

## 字体

页面自托管 Noto Serif SC 的常用文案字形子集，使用 SIL Open Font License 1.1，许可见 [site/assets/FONT-LICENSE.txt](site/assets/FONT-LICENSE.txt)。个性化文字中未收录的字形由设备宋体回退显示。
