# 花间来信

一座送给老婆的粒子花束画廊。把一颗颗光写成花瓣，让心意在指尖盛开。

**在线花园： https://wide-sky-with-me.github.io/bloom-for-you/**

## 花会动，心意也会

粉雾玫瑰、奶油粉郁金香、月光绣球、香槟混合花园，以及牡丹、百合、向日葵、马蹄莲。每束由 Python 确定性生成 120,000 个三维粒子，并从同一套参数曲面生成连续花瓣、枝叶与蝴蝶结。主花、重瓣配花和细枝小花交错组成环绕花冠，拖到背面也有完整花头，不是前面一排花、后面一层叶。

连续花瓣与细粒共享曲面法线光照、透视和深度遮挡；静息时读得出瓣缘和层次，风场与呼吸让花束轻摆。点击花束或「让心意绽放」时，连续表面淡出，粒子散开再重聚；切花时平滑变形。拖动可绕整束观察，右上角还藏着一封信。

手机可触碰、滑动和挑花；支持沉浸模式、暂停与键盘操作。页面跟随系统「减弱动态效果」设置，默认静止，可手动播放。设备未启用 WebGL 或首组数据加载失败时，显示由相同曲面与粒子生成的 SVG 花束投影。

## 运行

只需要 Python 3.10 或更新版本，无第三方 Python 运行依赖，也没有 Node 构建依赖。

```bash
python3 build.py
python3 -m http.server 8000 --directory dist
```

浏览器打开 `http://localhost:8000`。请通过 HTTP 打开，直接双击 HTML 的 `file://` 模式不支持模块和数据加载。

## 写成你们的故事

编辑 [site/gift.json](site/gift.json)，修改 `recipient`、`salutation`、`signature` 和 `letter`，重新构建后即可生效。正文每项为一段，`\n` 表示换行。

也支持链接参数 `?to=你的称呼&from=你的署名&message=想说的话`，参数应使用 URL 编码；`#rose`、`#tulip`、`#hydrangea`、`#wildflower`、`#peony`、`#lily`、`#sunflower`、`#calla` 可指定初始花束。

GitHub 仓库与 Pages 是公开的。信件配置、URL 参数和站点内容都可被访问，请只放适合公开分享的文字。页面没有统计追踪、第三方脚本、远程字体或后台账号。

## 发布到 GitHub Pages

仓库设置中，进入 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。推送 `main` 后，[Pages 工作流](.github/workflows/pages.yml) 会运行测试、生成花束并发布 `dist`。后续修改情书或代码后，提交推送即可自动更新。

## 实现

- [generator.py](generator.py)：标准库参数曲面，固定种子和预算，生成带单位法线的未烘焙底色粒子、索引曲面与 SVG 投影。
- [build.py](build.py)：生成花束、校验情书配置、生成同源曲面 PNG 缩略图，并构建可独立托管的 `dist`。
- [site/particles.js](site/particles.js)：原生 WebGL 曲面与粒子渲染，处理风场、呼吸、游离、绽放、重聚和交互，不依赖 CDN。
- [site/surface-data.js](site/surface-data.js)：验证 BFM1 曲面头、长度、颜色、法线及索引。
- [site/app.js](site/app.js)：同步加载点与面、竞态保护、个性化、情书、分享与降级。

点记录沿用 version 2 / stride 11，每束原始点数据 5.28 MB，另附紧凑的同源 `.mesh`；格式与取舍见下方决策。资源缓存修订为 `v=3`，点、面、清单与客户端须一并构建发布。首束优先，空闲时最多预取相邻一束；省流量或报告低速移动网络时不预取。预览为轻量 PNG，完整 SVG 只在降级时加载。移动端像素比限制在 1.8，页面切至后台和暂停后停止空转。Python 只负责静态生成，GitHub Pages 不需要常驻服务。

环绕构图、实拍参考、纯点方案的视觉失败，以及同源曲面与透明深度取舍见[环绕花束决策](.agents/notes/implemented/round-bouquets/2026-10-19-all-around-garden-composition.md)。当次完整测试和实图证据见[验收记录](.agents/notes/implemented/round-bouquets/2026-10-19-validation.md)。仍有效的法线、透视和生命周期背景见[此前实现决策](.agents/notes/implemented/particle-depth/2026-10-19-normal-lit-bouquets.md)。

## 验证

```bash
python3 -m unittest discover -s tests -v
python3 build.py
```

安装 Node.js 时，单元测试会在临时目录生成独立的真实花束夹具，并执行渲染器与暂停等生命周期契约；不依赖工作目录内已有的生成资产。Node.js 仅用于开发测试，构建和站点运行仍不需要它。

浏览器端检查使用独立开发依赖 `requirements-dev.txt`（Playwright 与 Chromium）；用 `python3 -m pip install -r requirements-dev.txt` 和 `python3 -m playwright install chromium` 安装。在另一个终端启动静态服务器后运行：

```bash
python3 tests/browser_smoke.py --url http://localhost:8000
```

检查真实曲面绘制、粒子深度通道及整圈彩色花冠，默认每束捕获完整环绕视角：

```bash
python3 tests/visual_depth.py --url http://localhost:8000
```

覆盖真实 WebGL 曲面与粒子绘制、持续动画、暂停帧稳定性、切花与快速点击、绽放、拖动、键盘、信件、沉浸、分享、手机尺寸、触碰、减弱动态、文本转义、缺少 uint 索引扩展、省流量、无 WebGL 与损坏点/面数据降级。环绕验图同时检查花冠面积、宽度和花材占比，避免只靠绿叶撑满背面；数值通过仍需人工看图。截图在 `artifacts/`，不提交。手机检查为 Chromium 触屏模拟，非 iPhone / Android 真机测试。

## 字体

页面自托管 Noto Serif SC 的常用文案字形子集，使用 SIL Open Font License 1.1，许可见 [site/assets/FONT-LICENSE.txt](site/assets/FONT-LICENSE.txt)。个性化文字中未收录的字形由设备宋体回退显示。
