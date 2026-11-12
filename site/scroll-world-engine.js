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

export const FAIRYTALE_SCROLL_SECTIONS = [
  {
    id: "prologue",
    label: "序章 · 星夜入口",
    accent: "#fde047",
    scroll: 1.45,
    linger: 0.42,
    eyebrow: "STARRY FAIRYTALE WORLD · 序章",
    title: "星月夜下的童话花坡",
    body: "轻滚滚轮或上下滑动，跟随戴风铃草花帽的提灯小精灵，一镜到底飞越为你盛开的梵高星夜秘境。",
    tags: ["一镜到底飞越", "Blender 3D 精雕", "13 处隐藏彩蛋"],
    eggId: null,
    wonderId: "wonder-sprite",
    spriteSpot: [-0.06, 2.24],
    spriteWhisper: "向下滚动，我提着星光灯笼带你飞越整座童话花坡 ✨",
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
      { label: "✧ 唤小精灵旋转洒星尘", kind: "wonder", target: "wonder-sprite", primary: true },
      { label: "♪ 开启星夜八音盒", kind: "special", target: "toggle-audio" },
    ],
  },
  {
    id: "hydrangea-pond",
    label: "壹 · 无尽夏露珠潭",
    accent: "#7dd3fc",
    scroll: 1.55,
    linger: 0.48,
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
    scroll: 1.55,
    linger: 0.48,
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
    id: "iris-mushrooms",
    label: "叁 · 鸢尾蘑菇圈",
    accent: "#c4b5fd",
    scroll: 1.50,
    linger: 0.46,
    eyebrow: "CHAPTER III · 朝暮并肩",
    title: "紫蓝鸢尾与唱歌蘑菇圈",
    body: "暖褐土坡上并肩盛开的羽冠鸢尾与丝绸郁金香，伴着七朵立体菌褶波点蘑菇仙女圈，把朝暮写成童话。",
    tags: ["羽冠有髯鸢尾", "杯形郁金香", "七彩波点蘑菇圈"],
    eggId: "egg-iris-tulip",
    wonderId: "wonder-mushrooms",
    spriteSpot: [1.54, 0.42],
    spriteWhisper: "紫蓝鸢尾与七彩波点蘑菇圈，正在晚风里轻轻弹跳呢 🍄",
    skyParallax: [-18, 8],
    desktop: {
      diveStart: { cam: [1.58, 1.02, 3.25], look: [1.38, -0.18, 0.72] },
      diveEnd: { cam: [1.62, 0.48, 2.08], look: [1.70, -0.22, -0.15] },
    },
    mobile: {
      diveStart: { cam: [2.12, 1.14, 3.48], look: [2.16, -0.52, 0.72] },
      diveEnd: { cam: [2.06, 0.58, 2.28], look: [2.22, -0.48, -0.15] },
    },
    actions: [
      { label: "✉ 展读信笺肆 · 鸢尾郁金香", kind: "egg", target: "egg-iris-tulip", primary: true },
      { label: "✧ 唤醒七彩唱歌蘑菇圈", kind: "wonder", target: "wonder-mushrooms" },
    ],
  },
  {
    id: "arch-dandelion",
    label: "肆 · 蔷薇花拱门",
    accent: "#fde047",
    scroll: 1.50,
    linger: 0.46,
    eyebrow: "CHAPTER IV · 向光而行",
    title: "蔷薇花门与星夜向日葵",
    body: "哥特铁艺拱门缠满攀援玫瑰与双悬星灯，高挑向日葵在夜色中依然仰望你，蒲公英冠毛正把喜欢吹向星河。",
    tags: ["攀援玫瑰花拱门", "双层花瓣向日葵", "3D 冠毛蒲公英"],
    eggId: "egg-sunflower",
    wonderId: "wonder-dandelions",
    spriteSpot: [-0.18, -1.55],
    spriteWhisper: "穿过攀援蔷薇花拱门，向日葵和月光蒲公英都在向你招手 🌻",
    skyParallax: [-4, 12],
    constellation: true,
    desktop: {
      diveStart: { cam: [0.22, 1.24, 0.88], look: [-0.74, 0.28, -2.55] },
      diveEnd: { cam: [0.08, 0.96, -0.28], look: [-0.72, 0.34, -3.05] },
    },
    mobile: {
      diveStart: { cam: [0.18, 1.34, 1.12], look: [-0.28, 0.02, -2.55] },
      diveEnd: { cam: [0.12, 1.04, -0.12], look: [-0.32, 0.06, -3.08] },
    },
    actions: [
      { label: "✉ 展读信笺贰 · 向日葵", kind: "egg", target: "egg-sunflower", primary: true },
      { label: "✧ 吹散月光蒲公英绒球", kind: "wonder", target: "wonder-dandelions" },
    ],
  },
  {
    id: "storybook-cottage",
    label: "伍 · 山丘暖光小屋",
    accent: "#fbbf24",
    scroll: 1.55,
    linger: 0.50,
    eyebrow: "CHAPTER V · 归途暖灯",
    title: "穿过花门抵达童话小屋",
    body: "一百四十八片石板叠瓦下亮着橘黄圆窗与玫瑰花箱，歪斜红砖烟囱冒出粉金星尘烟圈——这是我们温暖的小家。",
    tags: ["148 片叠瓦屋顶", "半木构暖窗花箱", "粉金星尘烟囱"],
    eggId: null,
    wonderId: "wonder-cottage",
    spriteSpot: [-1.28, -3.95],
    spriteWhisper: "蜿蜒小路的尽头，就是亮着暖黄窗灯的童话小家呀 🏡",
    skyParallax: [10, 16],
    constellation: true,
    desktop: {
      diveStart: { cam: [-0.76, 1.28, -2.02], look: [-2.34, 0.78, -5.35] },
      diveEnd: { cam: [-0.96, 1.22, -2.78], look: [-2.38, 0.86, -5.35] },
    },
    mobile: {
      diveStart: { cam: [-0.86, 1.34, -1.85], look: [-1.76, 0.42, -5.35] },
      diveEnd: { cam: [-1.04, 1.26, -2.65], look: [-1.82, 0.50, -5.35] },
    },
    actions: [
      { label: "✧ 点亮小屋粉金星尘烟圈", kind: "wonder", target: "wonder-cottage", primary: true },
      { label: "✧ 摇响小路许愿风铃灯", kind: "wonder", target: "wonder-bell-lamp" },
    ],
  },
  {
    id: "starry-finale",
    label: "终章 · 漫天星河",
    accent: "#fde047",
    scroll: 1.70,
    linger: 0.45,
    eyebrow: "FINALE · 致我最爱的老婆",
    title: "万千星河，皆为你盛开",
    body: "当许愿流星划破梵高旋转的油画夜空，整座山坡的繁花与心形星群同时苏醒——星月夜永不落幕，我对你的偏爱也是。",
    tags: ["星月夜许愿流星", "心形星群共鸣", "致老婆珍藏长信"],
    eggId: "egg-starry-sky",
    wonderId: "wonder-stump",
    spriteSpot: [-0.06, 2.24],
    spriteWhisper: "漫天梵高星河与整座童话花坡，今晚都只为你一人盛放 ✨",
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
      { label: "✧ 切换自由探索模式", kind: "special", target: "enter-explore" },
    ],
  },
];

// Frame-locked aerial & trail-gliding connector midpoints between consecutive sections
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
  // 2 -> 3: Rose Bottle -> rise past Mossy Stump Honey Jars onto Terraced Iris & Mushroom Slope
  {
    desktop: { midCam: [1.18, 0.88, 3.55], midLook: [1.05, -0.28, 1.38] },
    mobile: { midCam: [1.45, 1.02, 3.72], midLook: [1.52, -0.52, 1.38] },
  },
  // 3 -> 4: Mushroom Ring -> sweep across Wishing-Bell Streetlamp up toward Climbing-Rose Archway
  {
    desktop: { midCam: [1.02, 1.18, 1.55], midLook: [0.35, 0.08, -1.45] },
    mobile: { midCam: [1.15, 1.28, 1.75], midLook: [0.68, -0.15, -1.45] },
  },
  // 4 -> 5: Signature Scroll-World Fly-Through — glide DIRECTLY THROUGH the Climbing-Rose Archway!
  {
    desktop: { midCam: [-0.36, 1.08, -1.22], midLook: [-1.52, 0.58, -4.35] },
    mobile: { midCam: [-0.38, 1.14, -1.08], midLook: [-1.12, 0.28, -4.35] },
  },
  // 5 -> 6: Hilltop Cottage -> majestic crane-up reveal of full Starry Night & illuminated meadow!
  {
    desktop: { midCam: [-0.58, 1.88, 1.15], midLook: [-1.42, 0.92, -4.45] },
    mobile: { midCam: [-0.52, 1.98, 1.35], midLook: [-0.85, 0.66, -4.35] },
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
    } else {
      const kfFrom = mobileFlag ? seg.fromSection.mobile : seg.fromSection.desktop;
      const kfTo = mobileFlag ? seg.toSection.mobile : seg.toSection.desktop;
      const arcKf = mobileFlag ? seg.arc.mobile : seg.arc.desktop;
      // Blend linear + smoothstep so velocity across seams stays lively and continuous (no pause at seam!)
      const u = 0.28 * local + 0.72 * smooth(local);
      quadBez3(camOut, kfFrom.diveEnd.cam, arcKf.midCam, kfTo.diveStart.cam, u);
      quadBez3(lookOut, kfFrom.diveEnd.look, arcKf.midLook, kfTo.diveStart.look, u);
    }
    return { ci, seg, local };
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
      if (i === 0) cop = after ? 0 : smooth(1 - pr / 0.68);
      else if (i === N - 1) cop = before ? 0 : smooth(pr / 0.42);
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
      updateOverlaysAtY(curY);
    }
    rafId = window.requestAnimationFrame(rafLoop);
  }

  function jumpTo(sectionIndex, instant = false) {
    const idx = clamp(sectionIndex, 0, N - 1);
    const seg = sections[idx]._seg;
    let targetTop;
    if (idx === 0) {
      targetTop = 0;
    } else if (idx === N - 1) {
      targetTop = seg.start + (seg.end - seg.start) * 0.85;
    } else {
      targetTop = seg.start + (seg.end - seg.start) * 0.5;
    }

    if (instant || reduceMotion) {
      window.scrollTo({ top: targetTop, behavior: "auto" });
      targetY = clamp(targetTop, 0, maxScrollPx);
      curY = targetY;
      computeCameraAtY(curY, isMobile());
      meadow.setScrollCameraPose(camOut, lookOut, true);
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
