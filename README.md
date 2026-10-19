# 花间来信

一座送给老婆的粒子花束画廊。把一颗颗光写成花瓣，让心意在指尖盛开。

**在线花园： https://wide-sky-with-me.github.io/bloom-for-you/**

## 花会动，心意也会

粉雾玫瑰、奶油粉郁金香、月光绣球、香槟混合花园，以及新增的牡丹、百合、向日葵、马蹄莲。每束由 Python 确定性生成 52,000 个三维粒子，包含真实花瓣曲面、枝条、叶片与蝴蝶结。

花瓣使用曲面法线实时光照和深度遮挡，配合透视投影、斜角展示与缓慢空间转动呈现体积，而不是把所有光点叠成透明光雾。花瓣持续呼吸、枝叶轻摆，少量光点游离后回到花束。点击花束或「让心意绽放」会散开再重聚；拖动可看侧面，切换花束时粒子平滑变形。还有一封藏在右上角的信。

手机可触碰、滑动和挑花；支持沉浸模式、暂停与键盘操作。页面跟随系统「减弱动态效果」设置，默认静止，可手动播放。设备未启用 WebGL 或首组数据加载失败时，显示由同一份粒子生成的 SVG 花束投影。

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

- [generator.py](generator.py)：标准库参数曲面与带光照的粒子采样，固定种子、固定预算，生成 Float32LE 数据与 SVG 备用投影。
- [build.py](build.py)：生成花束、校验情书配置、将静态网页构建到 `dist`。
- [site/particles.js](site/particles.js)：原生 WebGL 着色器，处理风场、呼吸、游离、绽放、重聚、花束形变与交互，不依赖 CDN。
- [site/app.js](site/app.js)：异步加载、竞态保护、个性化、情书、分享与降级。

资源清单为 version 2，粒子记录为 11 个小端 Float32：`x y z r g b size phase nx ny nz`，末三项是单位曲面法线。每束原始数据约 2.29 MB，首束优先，空闲时最多预取相邻两束；开启省流量时不预取。预览图由 Python 同源投影成轻量 PNG，完整 SVG 仅在降级时加载。移动端像素比限制在 1.8；页面切至后台时停止绘制，暂停后停止空转。采用静态构建是因为 GitHub Pages 不运行 Python 服务：Python 负责生成形态，浏览器 WebGL 负责实时动画，站点不需要常驻服务器。新资源与新渲染器需要一并构建发布，旧版 8 字段数据不会当成新版读取。

三维法线、遮挡、取景与资源兼容的选择原因见[实现决策](.agents/notes/implemented/particle-depth/2026-10-19-normal-lit-bouquets.md)。

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

单独检查真实深度通道、花束画布占比与正侧面差异，并生成验图截图：

```bash
python3 tests/visual_depth.py --url http://localhost:8000
```

覆盖真实 WebGL 绘制、持续动画、暂停帧稳定性、花束切换与快速点击、绽放、拖动、键盘、信件、沉浸、链接分享、手机尺寸、触碰、减弱动态、个性化文本转义、无 WebGL 与损坏数据降级。截图保存在 `artifacts/`，不提交到仓库。手机检查为 Chromium 触屏模拟，非 iPhone / Android 真机测试。

## 字体

页面自托管 Noto Serif SC 的常用文案字形子集，使用 SIL Open Font License 1.1，许可见 [site/assets/FONT-LICENSE.txt](site/assets/FONT-LICENSE.txt)。个性化文字中未收录的字形由设备宋体回退显示。
