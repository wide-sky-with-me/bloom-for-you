# 予你花开 · Bloom for You

一份献给老婆的 **3D 微缩粘土花境漫游（Scroll World）** 互动礼物网站。参考 [oso95/scroll-world](https://github.com/oso95/scroll-world) 的暖米色摄影棚微缩岛屿美学与丝滑滚动运镜引擎，结合 Blender 4.0 Cycles 全局光照（GI + AO）烘焙与 Three.js WebGL2 实时渲染打造。

## 漫游章节（6 幕连续飞行）

1. **`01 / 06` 花溪梯田 (`brook`)** — 春水叠瀑、暖石拱桥与漫坡盛放的橄榄树与粉樱花丛。
2. **`02 / 06` 星灯花廊 (`plaza`)** — 三叠石泉广场、法式小圆桌与垂挂暖黄串灯的紫藤蔷薇花架。
3. **`03 / 06` 山居庭院 (`villa`)** — 非对称三体块南法粘土花墅：西翼赤陶筒瓦坡顶与十字山墙圆花窗、中庭石砌拱廊与粉白波浪边遮阳篷、东翼阳光花房与带薰衣草遮阳伞的雕花栏杆露台花园。
4. **`04 / 06` 一厅烟火 (`living`)** — 屋顶与前立面随滚动轻盈升起，俯瞰**两室一厅**中的「一厅」：暖火壁炉、旋转黑胶留声机、羊羔绒转角沙发、鼠尾草绿复古冰箱与双层莓果蛋糕餐桌。
5. **`05 / 06` 两室晴窗 (`bedrooms`)** — 横移掠过「两室」：次卧满架彩虹藏书、繁花山坡画架、火漆信笺书桌与卧榻；主卧晴窗软包大床、暖光百褶台灯与金框花卉挂画。
6. **`06 / 06` 予你花开 (`bouquet`)** — 飞向纯净暖米色天空中的法式锥形手捧花束与火漆情书，轻点即可展读 `site/gift.json` 中的情书原文，或开启 **360° 自由看房模式** 任意旋转缩放欣赏花墅外观与两室一厅内部细节。

## 目录结构

- `site/index.html`、`site/style.css`、`site/app.js` — `scroll-world` 极简暖米色界面、章节文案层与棉纸火漆情书弹窗。
- `site/scrub-world.js` — 6 幕 Dive + 5 段二阶贝塞尔空中过渡（11 段零跳变连续运镜）滚动引擎。
- `site/diorama-stage.js` — Three.js `0.186.1` WebGL2 粘土微缩舞台、屋顶平滑掀开剖面与 360° 自由看房控制器。
- `site/audio.js` — 纯本地 Web Audio API 八音盒五声音阶合成器（零外部音频依赖）。
- `site/gift.json` — 致老婆的情书原文数据。
- `site/assets/models/bloom_scroll_world.glb` — 由 Blender 4.0 Cycles 烘焙导出的完整 3D 微缩花境与两室一厅别墅模型。
- `tools/` — Blender 4.0 程序化粘土建模与双通道（闭合外观 + 掀顶室内）Cycles 光照贴图烘焙脚本（`generate_scroll_world.py`、`villa_rooms.py`、`clay_kit.py`）。

## 本地验证与构建

```bash
# 运行发布契约与零外链自包含单元测试
python3 -m unittest discover -s tests -v

# 构建静态发布产物至 dist/
python3 build.py --output dist

# 本地预览
python3 -m http.server 8000 --directory dist
```

如修改 3D 场景几何或家具布局，可通过 Blender 4.0 重新烘焙模型：

```bash
blender -b --python tools/generate_scroll_world.py
```
