/**
 * Scroll-World 3D Continuous Camera-Flight Engine (`scroll-world-engine.js`)
 *
 * Adapted from `oso95/scroll-world` (`references/scrub-engine.js` & `SKILL.md`):
 * - Interleaved `dive` + `conn` segment timeline (`SEGMENTS`) with zero-cut seam handoffs
 * - Monotone cubic mid-scene dwell curve `lingerEase(x, L)` so camera settles as copy peaks
 * - Smooth rAF scroll scrubber (`cur += (target - cur) * 0.16`) reversible in both directions
 * - Pinned editorial chapter copy (`sw-copylayer`), right-hand route rail (`sw-route`),
 *   top progress bar (`sw-scrollbar`), and animated scroll-wheel invitation (`sw-hint`)
 * - Native 9:16 portrait camera framing on phones, touch URL-bar resize guard, safe-area
 *   insets, and `prefers-reduced-motion` instant transitions
 */

import { villaLocalToWorld } from "./flower-meadow.js";

export const FAIRYTALE_SCROLL_SECTIONS = [
  {
    id: "prologue",
    label: "序章 · 星夜入口",
    accent: "#fde047",
    scroll: 1.40,
    linger: 0.42,
    roofOpen: [0, 0],
    eyebrow: "STARRY FAIRYTALE WORLD · 序章",
    title: "星月夜下的童话花坡与小家",
    body: "轻滚滚轮或上下滑动，跟随提灯小精灵穿过繁花与蔷薇拱门，掀开山丘小屋的石板屋顶，走进为你筑造的两室一厅。",
    tags: ["一镜到底飞越", "Cycles 光追烘焙", "两室一厅微缩屋"],
    eggId: null,
    wonderId: "wonder-sprite",
    spriteSpot: [-0.06, 2.24],
    spriteWhisper: "向下滚动，我提着星光灯笼带你飞进山顶两室一厅的小家 ✨",
    skyParallax: [0, 0],
    desktop: {
      diveStart: { cam: [-0.24, 2.28, 7.35], look: [-0.82, 0.42, -1.85] },
      diveEnd: { cam: [-0.42, 1.16, 4.92], look: [-0.74, -0.18, 1.32] },
    },
    mobile: {
      diveStart: { cam: [0.0, 2.42, 7.65], look: [0.0, 0.16, -1.75] },
      diveEnd: { cam: [-0.08, 1.32, 5.12], look: [-0.08, -0.52, 1.38] },
    },
    actions: [
      { label: "🏠 直达两室一厅剖面小屋", kind: "special", target: "jump-villa", primary: true },
      { label: "♪ 开启星夜八音盒", kind: "special", target: "toggle-audio" },
    ],
  },
  {
    id: "hydrangea-pond",
    label: "壹 · 无尽夏露珠潭",
    accent: "#7dd3fc",
    scroll: 1.45,
    linger: 0.46,
    roofOpen: [0, 0],
    eyebrow: "CHAPTER I · 仲夏初遇",
    title: "无尽夏与睡莲露珠潭",
    body: "四萼蓝紫无尽夏簇拥着澄澈露珠小潭，金冠青蛙王子守在十六瓣立体睡莲旁，像初见你眼眸时的心动。",
    tags: ["无尽夏 × 满天星", "金冠青蛙王子", "16 瓣立体睡莲"],
    eggId: "egg-hydrangea",
    wonderId: "wonder-pond",
    spriteSpot: [-0.96, 1.26],
    spriteWhisper: "看！无尽夏花影旁，戴金冠的青蛙王子正在睡莲叶上等你呢 🐸",
    skyParallax: [14, 4],
    desktop: {
      diveStart: { cam: [-1.58, 1.04, 3.62], look: [-2.26, -0.40, 1.18] },
      diveEnd: { cam: [-1.48, 0.20, 2.34], look: [-1.90, -0.56, 0.85] },
    },
    mobile: {
      diveStart: { cam: [-1.76, 1.18, 3.92], look: [-1.78, -0.76, 1.25] },
      diveEnd: { cam: [-1.36, 0.34, 2.48], look: [-1.48, -0.78, 0.85] },
    },
    actions: [
      { label: "✉ 展读信笺壹 · 无尽夏", kind: "egg", target: "egg-hydrangea", primary: true },
      { label: "✧ 唤醒露珠潭青蛙王子", kind: "wonder", target: "wonder-pond" },
    ],
  },
  {
    id: "rose-bottle",
    label: "贰 · 玫瑰星砂瓶",
    accent: "#fda4af",
    scroll: 1.45,
    linger: 0.46,
    roofOpen: [0, 0],
    eyebrow: "CHAPTER II · 花间密语",
    title: "高心玫瑰与水晶星砂瓶",
    body: "四十瓣丝绒玫瑰与绿色反卷花萼层层托起浪漫，把系着红丝带与玫瑰火漆印章的长信封存在小路弯道旁。",
    tags: ["40 瓣大卫奥斯汀玫瑰", "火漆水晶许愿瓶", "立体满天星簇"],
    eggId: "egg-rose-bottle",
    wonderId: "wonder-signpost",
    spriteSpot: [0.16, 2.18],
    spriteWhisper: "高心螺旋玫瑰丛里，藏着封存火漆情书的水晶星砂瓶 🌹",
    skyParallax: [-6, 6],
    desktop: {
      diveStart: { cam: [0.28, 0.76, 4.08], look: [-0.04, -0.40, 1.92] },
      diveEnd: { cam: [0.22, -0.12, 3.52], look: [0.16, -0.54, 2.02] },
    },
    mobile: {
      diveStart: { cam: [0.64, 0.88, 4.22], look: [0.68, -0.68, 1.96] },
      diveEnd: { cam: [0.58, -0.02, 3.60], look: [0.68, -0.78, 2.04] },
    },
    actions: [
      { label: "✉ 展读信笺叁 · 玫瑰星瓶", kind: "egg", target: "egg-rose-bottle", primary: true },
      { label: "✧ 轻触岔路胖青鸟木牌", kind: "wonder", target: "wonder-signpost" },
    ],
  },
  {
    id: "iris-archway",
    label: "叁 · 鸢尾蔷薇门",
    accent: "#c4b5fd",
    scroll: 1.48,
    linger: 0.45,
    roofOpen: [0, 0],
    eyebrow: "CHAPTER III · 穿过花门回家",
    title: "紫蓝鸢尾与星灯蔷薇门",
    body: "掠过并肩盛放的羽冠鸢尾与唱歌蘑菇圈，穿过垂挂暖黄串灯的攀援蔷薇拱门，前方石阶上便是灯火温暖的小屋。",
    tags: ["羽冠鸢尾 × 郁金香", "攀援蔷薇花门", "庭院暖黄串灯"],
    eggId: "egg-iris-tulip",
    wonderId: "wonder-mushrooms",
    spriteSpot: [-0.42, -2.15],
    spriteWhisper: "穿过垂满暖黄串灯的蔷薇花拱门，前面石阶就是我们的小家啦 🏡",
    skyParallax: [-12, 10],
    constellation: true,
    desktop: {
      diveStart: { cam: [1.46, 1.06, 2.65], look: [1.35, -0.18, 0.35] },
      diveEnd: { cam: [0.12, 1.12, -0.22], look: [-0.78, 0.42, -3.25] },
    },
    mobile: {
      diveStart: { cam: [1.96, 1.16, 2.95], look: [2.05, -0.48, 0.35] },
      diveEnd: { cam: [0.10, 1.18, -0.05], look: [-0.48, 0.14, -3.25] },
    },
    actions: [
      { label: "✉ 展读信笺肆 · 鸢尾郁金香", kind: "egg", target: "egg-iris-tulip", primary: true },
      { label: "✧ 唤醒七彩唱歌蘑菇圈", kind: "wonder", target: "wonder-mushrooms" },
    ],
  },
  {
    id: "villa-cutaway",
    label: "肆 · 掀顶两室一厅",
    accent: "#fbbf24",
    scroll: 1.72,
    linger: 0.48,
    jumpProgress: 0.88,
    roofOpen: [0.06, 1.0],
    eyebrow: "CHAPTER IV · 微缩娃娃屋剖面",
    title: "屋顶轻启 · 俯瞰两室一厅",
    body: "二百一十片石板叠瓦与十字花窗缓缓升起，露出光线追踪全局光照烘焙的温暖小家：右侧壁炉餐厨一厅，左侧画室与双人主卧。",
    tags: ["Cycles 全局光追烘焙", "等距微缩娃娃屋", "白栅栏玫瑰庭院"],
    eggId: null,
    wonderId: "wonder-cottage",
    spriteSpot: [-0.70, -3.42],
    spriteWhisper: "哇！石板屋顶轻轻掀开啦，两室一厅每个角落都暖融融的 ✨",
    skyParallax: [8, 15],
    constellation: true,
    desktop: {
      diveStart: {
        cam: villaLocalToWorld(0.42, 1.68, 4.38),
        look: villaLocalToWorld(-0.78, 0.86, 0.15),
      },
      diveEnd: {
        cam: villaLocalToWorld(0.72, 3.46, 3.86),
        look: villaLocalToWorld(-0.74, 0.44, -0.08),
      },
    },
    mobile: {
      diveStart: {
        cam: villaLocalToWorld(0.22, 1.82, 5.15),
        look: villaLocalToWorld(0.0, 0.32, 0.12),
      },
      diveEnd: {
        cam: villaLocalToWorld(1.25, 4.45, 4.95),
        look: villaLocalToWorld(-0.04, -0.46, 0.06),
      },
    },
    actions: [
      { label: "🏠 切换屋顶开合视角", kind: "special", target: "toggle-roof", primary: true },
      { label: "✧ 点亮烟囱星尘烟圈", kind: "wonder", target: "wonder-cottage" },
    ],
  },
  {
    id: "villa-living-dining",
    label: "伍 · 一厅壁炉餐厨",
    accent: "#fda4af",
    scroll: 1.65,
    linger: 0.50,
    roofOpen: [1.0, 1.0],
    eyebrow: "CHAPTER V · 一厅 · 人间烟火",
    title: "壁炉客厅与草莓蛋糕餐桌",
    body: "奶油转角沙发围着热茶圆几，黄铜大喇叭留声机缓缓转动黑胶；炉火映亮开放式薄荷绿冰箱与摆好双人草莓蛋糕的原木餐桌。",
    tags: ["L 型奶油布艺沙发", "旋转黑胶留声机", "双人草莓蛋糕餐厨"],
    eggId: null,
    wonderId: "wonder-bell-lamp",
    spriteSpot: [-0.52, -3.55],
    spriteWhisper: "茶几上泡好了热茶，餐桌上还有双人草莓蛋糕和转动的留声机呢 🍰",
    skyParallax: [14, 18],
    constellation: true,
    desktop: {
      diveStart: {
        cam: villaLocalToWorld(0.62, 1.84, 2.38),
        look: villaLocalToWorld(0.50, 0.46, 0.24),
      },
      diveEnd: {
        cam: villaLocalToWorld(0.48, 1.66, 1.62),
        look: villaLocalToWorld(0.56, 0.56, -0.68),
      },
    },
    mobile: {
      diveStart: {
        cam: villaLocalToWorld(0.96, 2.15, 2.85),
        look: villaLocalToWorld(1.06, 0.06, 0.18),
      },
      diveEnd: {
        cam: villaLocalToWorld(0.86, 1.96, 2.08),
        look: villaLocalToWorld(1.04, 0.12, -0.70),
      },
    },
    actions: [
      { label: "✉ 展读致老婆珍藏长信", kind: "special", target: "open-letter", primary: true },
      { label: "♪ 开启留声机八音盒", kind: "special", target: "toggle-audio" },
    ],
  },
  {
    id: "villa-two-bedrooms",
    label: "陆 · 两室画室主卧",
    accent: "#7dd3fc",
    scroll: 1.68,
    linger: 0.50,
    roofOpen: [1.0, 1.0],
    eyebrow: "CHAPTER VI · 两室 · 星梦栖居",
    title: "星空画室次卧与浪漫主卧",
    body: "前侧次卧满墙彩绘书脊伴着《星月夜》木画架、原木书桌与吉他卧榻；后侧主卧双盏百褶暖灯轻拢软包大床与看星空的飘窗。",
    tags: ["《星月夜》油画架", "36 册彩绘满墙书柜", "百褶暖灯飘窗主卧"],
    eggId: "egg-sunflower",
    wonderId: "wonder-dandelions",
    spriteSpot: [-1.52, -3.52],
    spriteWhisper: "一间画满你喜欢的梵高星空，一间留给岁岁年年的甜梦 🌙",
    skyParallax: [4, 18],
    constellation: true,
    desktop: {
      diveStart: {
        cam: villaLocalToWorld(-1.26, 1.92, 2.36),
        look: villaLocalToWorld(-1.58, 0.48, 0.36),
      },
      diveEnd: {
        cam: villaLocalToWorld(-0.62, 2.08, 1.18),
        look: villaLocalToWorld(-1.52, 0.56, -0.78),
      },
    },
    mobile: {
      diveStart: {
        cam: villaLocalToWorld(-1.12, 2.22, 2.78),
        look: villaLocalToWorld(-1.18, 0.08, 0.32),
      },
      diveEnd: {
        cam: villaLocalToWorld(-0.78, 2.32, 1.52),
        look: villaLocalToWorld(-1.18, 0.14, -0.82),
      },
    },
    actions: [
      { label: "✉ 展读信笺贰 · 向日葵星光", kind: "egg", target: "egg-sunflower", primary: true },
      { label: "✧ 吹散窗外月光蒲公英", kind: "wonder", target: "wonder-dandelions" },
    ],
  },
  {
    id: "starry-finale",
    label: "终章 · 漫天星河",
    accent: "#fde047",
    scroll: 1.70,
    linger: 0.45,
    roofOpen: [0.0, 0.0],
    eyebrow: "FINALE · 致我最爱的老婆",
    title: "万千星河与小家，皆属于你",
    body: "屋顶轻柔合拢护住满室暖光，许愿流星划破梵高旋转的油画夜空——山坡繁花与山顶小家永远亮着灯，等你回家。",
    tags: ["星月夜许愿流星", "心形星群共鸣", "360° 自由缩放看房"],
    eggId: "egg-starry-sky",
    wonderId: "wonder-stump",
    spriteSpot: [-0.06, 2.24],
    spriteWhisper: "漫天梵高星河与山顶温暖的两室一厅，今晚都只为你盛放 ✨",
    skyParallax: [0, -6],
    constellation: true,
    meteorOnEnter: true,
    desktop: {
      diveStart: { cam: [-0.30, 2.06, 4.25], look: [-0.82, 0.95, -3.25] },
      diveEnd: { cam: [-0.18, 2.18, 6.65], look: [-0.74, 0.88, -2.65] },
    },
    mobile: {
      diveStart: { cam: [-0.12, 2.12, 4.45], look: [-0.08, 0.72, -3.15] },
      diveEnd: { cam: [0.0, 2.26, 6.85], look: [0.0, 0.65, -2.65] },
    },
    actions: [
      { label: "✦ 唤醒星夜终章盛典", kind: "special", target: "trigger-finale", primary: true },
      { label: "✉ 展读信笺伍 · 星夜流星", kind: "egg", target: "egg-starry-sky" },
      { label: "🏠 自由探索并掀顶看房", kind: "special", target: "explore-villa" },
    ],
  },
];

// Frame-locked aerial, archway fly-through & indoor room-to-room connector midpoints (7 connectors for 8 sections)
const CONNECTOR_ARCS = [
  // 0 -> 1: Prolog clearing -> swoop left over baby's-breath verge toward Hydrangeas & Dew Pond
  {
    desktop: { midCam: [-1.05, 1.36, 4.35], midLook: [-1.62, -0.26, 1.25] },
    mobile: { midCam: [-0.98, 1.46, 4.55], midLook: [-1.05, -0.58, 1.30] },
  },
  // 1 -> 2: Dew Pond -> glide over Bluebird Crossroads Signpost into Spiral Rose & Wish Bottle alcove
  {
    desktop: { midCam: [-0.55, 0.86, 3.45], midLook: [-0.62, -0.32, 1.55] },
    mobile: { midCam: [-0.32, 0.98, 3.65], midLook: [-0.28, -0.58, 1.62] },
  },
  // 2 -> 3: Rose Bottle -> rise past Mossy Stump onto Terraced Iris Slope toward Rose Archway
  {
    desktop: { midCam: [1.18, 0.92, 3.45], midLook: [1.05, -0.24, 1.15] },
    mobile: { midCam: [1.45, 1.04, 3.62], midLook: [1.52, -0.48, 1.15] },
  },
  // 3 -> 4: Signature Fly-Through — glide DIRECTLY THROUGH the Climbing-Rose Archway under courtyard string lights!
  {
    desktop: {
      midCam: [-0.38, 1.16, -1.25],
      midLook: villaLocalToWorld(-0.42, 0.72, 0.35),
    },
    mobile: {
      midCam: [-0.36, 1.22, -1.05],
      midLook: villaLocalToWorld(0.0, 0.35, 0.35),
    },
  },
  // 4 -> 5: Isometric Cutaway Overview -> swoop smoothly down into `一厅` Living Room & Dining Kitchen!
  {
    desktop: {
      midCam: villaLocalToWorld(0.76, 2.52, 3.05),
      midLook: villaLocalToWorld(-0.05, 0.45, 0.12),
    },
    mobile: {
      midCam: villaLocalToWorld(1.12, 3.15, 3.78),
      midLook: villaLocalToWorld(0.55, -0.18, 0.12),
    },
  },
  // 5 -> 6: `一厅` Living/Kitchen -> pan smoothly across central hallway into `两室` Art Studio & Master Bedroom!
  {
    desktop: {
      midCam: villaLocalToWorld(-0.38, 1.88, 2.08),
      midLook: villaLocalToWorld(-0.55, 0.50, -0.12),
    },
    mobile: {
      midCam: villaLocalToWorld(-0.15, 2.15, 2.48),
      midLook: villaLocalToWorld(-0.12, 0.10, -0.12),
    },
  },
  // 6 -> 7: `两室` Master Bedroom -> graceful high crane-up as the slate roof settles back onto the glowing Villa!
  {
    desktop: {
      midCam: [-0.85, 3.45, -0.35],
      midLook: [-1.12, 0.88, -4.65],
    },
    mobile: {
      midCam: [-0.65, 3.65, -0.15],
      midLook: [-0.72, 0.68, -4.55],
    },
  },
];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

// Monotone cubic mid-scene dwell from oso95/scroll-world scrub-engine.js:
// f(0) = 0, f(0.5) = 0.5 (with slowed slope 1 - L while copy peaks), f(1) = 1.
function lingerEase(x, L) {
  const l = clamp(L, 0, 1);
  const c = clamp(x, 0, 1) - 0.5;
  return (1 - l) * clamp(x, 0, 1) + l * (4 * c * c * c + 0.5);
}

function lerp3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

function quadBez3(out, p0, p1, p2, t) {
  const u = 1 - t;
  const b0 = u * u;
  const b1 = 2 * u * t;
  const b2 = t * t;
  out[0] = b0 * p0[0] + b1 * p1[0] + b2 * p2[0];
  out[1] = b0 * p0[1] + b1 * p1[1] + b2 * p2[1];
  out[2] = b0 * p0[2] + b1 * p1[2] + b2 * p2[2];
  return out;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function mountFairytaleScrollWorld({
  shellEl,
  trackEl,
  meadow,
  sky,
  skyContainer,
  sections = FAIRYTALE_SCROLL_SECTIONS,
  connectors = CONNECTOR_ARCS,
  diveScroll = 1.5,
  connScroll = 0.82,
  onEggAction = () => {},
  onWonderAction = () => {},
  onSpecialAction = () => {},
  onModeChange = () => {},
  onChapterChange = () => {},
}) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const smallMQ = window.matchMedia("(max-width: 860px)");
  const isMobile = () => coarse || smallMQ.matches;

  const N = sections.length;
  const SEGMENTS = [];
  sections.forEach((s, i) => {
    const dive = {
      kind: "dive",
      si: i,
      section: s,
      accent: s.accent,
      w: s.scroll || diveScroll,
      linger: s.linger || 0,
    };
    SEGMENTS.push(dive);
    s._seg = dive;
    if (i < N - 1 && connectors[i]) {
      SEGMENTS.push({
        kind: "conn",
        si: i,
        fromSection: s,
        toSection: sections[i + 1],
        arc: connectors[i],
        accent: sections[i + 1].accent,
        w: connScroll,
      });
    }
  });
  const NSEG = SEGMENTS.length;

  // ---- Build Scroll-World Chrome inside fixed `shellEl` ----
  const scrollbar = document.createElement("div");
  scrollbar.className = "sw-scrollbar";
  scrollbar.setAttribute("aria-hidden", "true");
  const scrollbarFill = document.createElement("span");
  scrollbar.appendChild(scrollbarFill);

  const copylayer = document.createElement("div");
  copylayer.id = "sw-copylayer";
  copylayer.className = "sw-copylayer";
  copylayer.setAttribute("aria-label", "星夜童话滚动飞越章节叙事");

  const route = document.createElement("nav");
  route.id = "sw-route";
  route.className = "sw-route";
  route.setAttribute("aria-label", "童话飞越航线导览");

  const hint = document.createElement("div");
  hint.id = "sw-hint";
  hint.className = "sw-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.innerHTML = `<span>向下滚动 · 一镜飞越童话世界</span><i></i>`;

  shellEl.append(scrollbar, copylayer, route, hint);

  const copies = [];
  const statusBadges = [];
  const dots = [];

  sections.forEach((s, i) => {
    const article = document.createElement("article");
    article.className = "sw-copy";
    article.dataset.sectionId = s.id;
    article.style.setProperty("--sw-accent", s.accent || "#fde047");

    const actionsHtml = (s.actions || [])
      .map(
        (act, idx) =>
          `<button type="button" class="sw-btn ${act.primary ? "sw-btn--primary" : "sw-btn--ghost"}" data-act-idx="${idx}">${esc(act.label)}</button>`
      )
      .join("");

    article.innerHTML =
      `<div class="sw-copy__meta">` +
      `<span class="sw-copy__num">${pad2(i + 1)} / ${pad2(N)}</span>` +
      `<span class="sw-copy__unlocked" data-unlocked="false"></span>` +
      `</div>` +
      (s.eyebrow ? `<span class="sw-copy__eyebrow">${esc(s.eyebrow)}</span>` : "") +
      (s.title ? `<h2 class="sw-copy__title">${esc(s.title)}</h2>` : "") +
      (s.body ? `<p class="sw-copy__body">${esc(s.body)}</p>` : "") +
      (s.tags && s.tags.length
        ? `<ul class="sw-copy__tags">${s.tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
        : "") +
      (actionsHtml ? `<div class="sw-copy__cta">${actionsHtml}</div>` : "");

    article.querySelectorAll("button[data-act-idx]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const act = s.actions[Number(btn.dataset.actIdx)];
        if (!act) return;
        if (act.kind === "egg") onEggAction(act.target);
        else if (act.kind === "wonder") onWonderAction(act.target);
        else if (act.kind === "special") onSpecialAction(act.target);
      });
    });

    copylayer.appendChild(article);
    copies.push(article);
    statusBadges.push(article.querySelector(".sw-copy__unlocked"));

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "sw-route__dot";
    dot.dataset.sectionId = s.id;
    dot.style.setProperty("--sw-accent", s.accent || "#fde047");
    dot.setAttribute("aria-label", s.label || s.title);
    dot.innerHTML = `<span class="sw-route__label">${esc(s.label || "")}</span><i></i>`;
    dot.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!enabled) setEnabled(true);
      jumpTo(i);
    });
    route.appendChild(dot);
    dots.push(dot);
  });

  // ---- Layout & Scroll Scrubbing State ----
  let enabled = true;
  let vh = Math.max(1, window.innerHeight || 900);
  let laidOutW = window.innerWidth || 1440;
  let totalW = 0;
  let maxScrollPx = 1;
  let targetY = 0;
  let curY = 0;
  let activeIndex = -1;
  let currentSegIndex = 0;
  let ticking = false;
  let rafId = 0;
  let disposed = false;
  let finaleMeteorFired = false;

  const camOut = [0, 0, 0];
  const lookOut = [0, 0, 0];
  let roofOut = 0;

  function syncModeDOM() {
    document.documentElement.dataset.scrollWorld = enabled ? "true" : "false";
    shellEl.dataset.mode = enabled ? "scroll" : "explore";
    trackEl.style.display = enabled ? "block" : "none";
  }

  function layout() {
    vh = Math.max(1, window.innerHeight || 900);
    laidOutW = window.innerWidth || 1440;
    let off = 0;
    SEGMENTS.forEach((s) => {
      s.start = off * vh;
      off += s.w;
      s.end = off * vh;
    });
    totalW = off;
    maxScrollPx = Math.max(1, totalW * vh);
    trackEl.style.height = `${Math.round(totalW * vh + vh)}px`;
    readScroll(true);
  }

  function computeCameraAtY(yPx, mobileFlag) {
    const clampedY = clamp(yPx, 0, maxScrollPx);
    let ci = 0;
    for (let i = 0; i < NSEG; i++) {
      if (clampedY >= SEGMENTS[i].start) ci = i;
    }
    const seg = SEGMENTS[ci];
    const span = Math.max(1, seg.end - seg.start);
    const local = clamp((clampedY - seg.start) / span, 0, 1);

    if (seg.kind === "dive") {
      const kf = mobileFlag ? seg.section.mobile : seg.section.desktop;
      const eased = seg.linger ? lingerEase(local, seg.linger) : local;
      lerp3(camOut, kf.diveStart.cam, kf.diveEnd.cam, eased);
      lerp3(lookOut, kf.diveStart.look, kf.diveEnd.look, eased);
      const [r0, r1] = seg.section.roofOpen || [0, 0];
      roofOut = r0 + (r1 - r0) * eased;
    } else {
      const kfFrom = mobileFlag ? seg.fromSection.mobile : seg.fromSection.desktop;
      const kfTo = mobileFlag ? seg.toSection.mobile : seg.toSection.desktop;
      const arcKf = mobileFlag ? seg.arc.mobile : seg.arc.desktop;
      // Blend linear + smoothstep so velocity across seams stays lively and continuous (no pause at seam!)
      const u = 0.28 * local + 0.72 * smooth(local);
      quadBez3(camOut, kfFrom.diveEnd.cam, arcKf.midCam, kfTo.diveStart.cam, u);
      quadBez3(lookOut, kfFrom.diveEnd.look, arcKf.midLook, kfTo.diveStart.look, u);
      const rFrom = (seg.fromSection.roofOpen || [0, 0])[1];
      const rTo = (seg.toSection.roofOpen || [0, 0])[0];
      roofOut = rFrom + (rTo - rFrom) * u;
    }
    return { ci, seg, local, roofOut };
  }

  function updateOverlaysAtY(yPx) {
    let ci = 0;
    for (let i = 0; i < NSEG; i++) {
      if (yPx >= SEGMENTS[i].start) ci = i;
    }
    currentSegIndex = ci;

    // Pinned per-section copy opacity & subtle drift (from oso95/scroll-world scrub-engine.js)
    for (let i = 0; i < N; i++) {
      const seg = sections[i]._seg;
      const span = Math.max(1, seg.end - seg.start);
      const pr = clamp((yPx - seg.start) / span, 0, 1);
      const before = yPx < seg.start;
      const after = yPx > seg.end;
      let cop;
      const peak = sections[i].jumpProgress || 0.5;
      if (i === 0) cop = after ? 0 : smooth(1 - pr / 0.68);
      else if (i === N - 1) cop = before ? 0 : smooth(pr / 0.42);
      else if (peak > 0.65) cop = before || after ? 0 : smooth(1 - Math.abs(pr - 0.68) / 0.55);
      else cop = before || after ? 0 : smooth(1 - Math.abs(pr - 0.5) / 0.5);

      const c = copies[i];
      c.style.opacity = cop.toFixed(3);
      c.style.transform = reduceMotion ? "none" : `translate3d(0, ${((0.5 - pr) * 3.4).toFixed(2)}vh, 0)`;
      c.style.pointerEvents = enabled && cop > 0.48 ? "auto" : "none";
      c.setAttribute("aria-hidden", enabled && cop > 0.15 ? "false" : "true");
    }

    const cur = SEGMENTS[ci];
    const curLocal = clamp((yPx - cur.start) / Math.max(1, cur.end - cur.start), 0, 1);
    const near = clamp(cur.kind === "dive" ? cur.si : curLocal > 0.5 ? cur.si + 1 : cur.si, 0, N - 1);

    if (near !== activeIndex) {
      activeIndex = near;
      const activeSec = sections[near];
      dots.forEach((d, k) => d.classList.toggle("is-active", k === near));
      shellEl.style.setProperty("--sw-accent", activeSec.accent || "#fde047");

      if (enabled) {
        if (activeSec.spriteSpot) {
          meadow.walkSpriteTo(activeSec.spriteSpot[0], activeSec.spriteSpot[1], activeSec.spriteWhisper || "", 8.5);
        }
        if (activeSec.constellation) {
          sky.setConstellationActive(true);
        }
        if (activeSec.meteorOnEnter && !finaleMeteorFired) {
          finaleMeteorFired = true;
          sky.triggerMeteor({ startX: 0.24, startY: 0.10 });
          sky.triggerMeteor({ startX: 0.58, startY: 0.08 });
        }
      }
      onChapterChange(near, activeSec);
    }

    const normProgress = clamp(yPx / maxScrollPx, 0, 1);
    scrollbarFill.style.transform = `scaleX(${normProgress.toFixed(4)})`;
    hint.style.opacity = enabled ? clamp(1 - yPx / (0.42 * vh), 0, 1).toFixed(3) : "0";

    // Subtle GPU multi-plane parallax on the p5.js Starry Night oil-impasto sky!
    if (skyContainer && enabled) {
      const secA = cur.kind === "dive" ? cur.section : cur.fromSection;
      const secB = cur.kind === "dive" ? cur.section : cur.toSection;
      const pA = secA.skyParallax || [0, 0];
      const pB = secB.skyParallax || [0, 0];
      const t = cur.kind === "dive" ? 0 : smooth(curLocal);
      const sx = pA[0] + (pB[0] - pA[0]) * t;
      const sy = pA[1] + (pB[1] - pA[1]) * t;
      skyContainer.style.transform = `scale(1.05) translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
    }
  }

  function readScroll(initial = false) {
    ticking = false;
    if (!enabled) return;
    targetY = clamp(window.scrollY || window.pageYOffset || 0, 0, maxScrollPx);
    if (!initial) {
      meadow.clearFocus();
    }
    if (initial || reduceMotion) {
      curY = targetY;
      computeCameraAtY(curY, isMobile());
      meadow.setScrollCameraPose(camOut, lookOut, true);
      meadow.setVillaRoofOpen(roofOut, true);
      updateOverlaysAtY(curY);
    }
  }

  function rafLoop() {
    if (disposed) return;
    if (enabled) {
      const diff = targetY - curY;
      if (reduceMotion || Math.abs(diff) < 0.35) {
        curY = targetY;
      } else {
        curY += diff * 0.16;
      }
      computeCameraAtY(curY, isMobile());
      meadow.setScrollCameraPose(camOut, lookOut, false);
      meadow.setVillaRoofOpen(roofOut, false);
      updateOverlaysAtY(curY);
    }
    rafId = window.requestAnimationFrame(rafLoop);
  }

  function jumpTo(sectionIndex, instant = false) {
    const idx = clamp(sectionIndex, 0, N - 1);
    const sec = sections[idx];
    const seg = sec._seg;
    let targetTop;
    if (idx === 0) {
      targetTop = 0;
    } else if (idx === N - 1) {
      targetTop = seg.start + (seg.end - seg.start) * 0.85;
    } else {
      const frac = typeof sec.jumpProgress === "number" ? sec.jumpProgress : 0.5;
      targetTop = seg.start + (seg.end - seg.start) * frac;
    }

    if (instant || reduceMotion) {
      window.scrollTo({ top: targetTop, behavior: "auto" });
      targetY = clamp(targetTop, 0, maxScrollPx);
      curY = targetY;
      computeCameraAtY(curY, isMobile());
      meadow.setScrollCameraPose(camOut, lookOut, true);
      meadow.setVillaRoofOpen(roofOut, true);
      updateOverlaysAtY(curY);
    } else {
      window.scrollTo({ top: targetTop, behavior: "smooth" });
    }
  }

  function setProgressNormalized(p, snap = true) {
    if (!enabled) setEnabled(true);
    const topPx = clamp(p, 0, 1) * maxScrollPx;
    window.scrollTo({ top: topPx, behavior: "auto" });
    targetY = topPx;
    if (snap) {
      curY = topPx;
      computeCameraAtY(curY, isMobile());
      meadow.setScrollCameraPose(camOut, lookOut, true);
      meadow.setVillaRoofOpen(roofOut, true);
      updateOverlaysAtY(curY);
    }
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    meadow.setScrollCameraMode(enabled);
    syncModeDOM();
    if (enabled) {
      layout();
      targetY = clamp(window.scrollY || window.pageYOffset || 0, 0, maxScrollPx);
      curY = targetY;
      computeCameraAtY(curY, isMobile());
      meadow.setScrollCameraPose(camOut, lookOut, false);
      meadow.setVillaRoofOpen(roofOut, false);
      updateOverlaysAtY(curY);
    } else {
      copies.forEach((c) => {
        c.style.pointerEvents = "none";
      });
      if (skyContainer) {
        skyContainer.style.transform = "none";
      }
    }
    onModeChange(enabled);
    return enabled;
  }

  function syncUnlockedState(unlockedEggIds, unlockedWonderIds) {
    sections.forEach((s, i) => {
      const badgeEl = statusBadges[i];
      const dotEl = dots[i];
      const eggDone = s.eggId ? unlockedEggIds.has(s.eggId) : false;
      const wonderDone = s.wonderId ? unlockedWonderIds.has(s.wonderId) : false;
      if (badgeEl) {
        if (eggDone) {
          badgeEl.textContent = "✦ 信笺已点亮";
          badgeEl.dataset.unlocked = "true";
        } else if (wonderDone) {
          badgeEl.textContent = "✧ 奇遇已偶遇";
          badgeEl.dataset.unlocked = "wonder";
        } else {
          badgeEl.textContent = "";
          badgeEl.dataset.unlocked = "false";
        }
      }
      if (dotEl) {
        dotEl.classList.toggle("is-completed", eggDone || wonderDone);
      }
    });
  }

  function onScroll() {
    if (!enabled) return;
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(() => readScroll(false));
    }
  }

  function onResize() {
    // Ignore mobile URL-bar height-only resize events so scroll position never jumps!
    if (coarse && window.innerWidth === laidOutW) return;
    layout();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", layout);

  syncModeDOM();
  meadow.setScrollCameraMode(true);
  layout();
  rafId = window.requestAnimationFrame(rafLoop);

  return {
    isEnabled: () => enabled,
    setEnabled,
    toggleEnabled: () => setEnabled(!enabled),
    jumpTo,
    setProgressNormalized,
    syncUnlockedState,
    getActiveIndex: () => activeIndex,
    getSections: () => sections,
    getSegments: () => SEGMENTS.map((s, idx) => ({
      index: idx,
      kind: s.kind,
      sectionIndex: s.si,
      start: Math.round(s.start),
      end: Math.round(s.end),
      normStart: Number((s.start / maxScrollPx).toFixed(5)),
      normEnd: Number((s.end / maxScrollPx).toFixed(5)),
    })),
    getDiagnostics: () => ({
      enabled,
      sectionCount: N,
      segmentCount: NSEG,
      activeIndex,
      activeSectionId: sections[Math.max(0, activeIndex)]?.id || null,
      segmentIndex: currentSegIndex,
      segmentKind: SEGMENTS[currentSegIndex]?.kind || "dive",
      roofOpen: Number(roofOut.toFixed(3)),
      progress: Number(clamp(curY / maxScrollPx, 0, 1).toFixed(4)),
      maxScrollPx: Math.round(maxScrollPx),
      isMobile: isMobile(),
    }),
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", layout);
    },
  };
}
