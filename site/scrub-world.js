// Direct 3D camera-flight adaptation of oso95/scroll-world's `scrub-engine.js`
// Preserves the exact interleaved dive+connector segment chain, `lingerEase`,
// copy fade curves, route rail, top pill nav, particles, and touch URL-bar guard.

export const SCROLL_SECTIONS = [
  {
    id: "brook",
    label: "花溪梯田",
    accent: "#7BA380",
    scroll: 1.5,
    linger: 0.46,
    eyebrow: "Chapter I · 花溪初遇",
    title: "故事，从一片花溪山坡开始。",
    body: "春水绕过暖石拱桥，橄榄枝与粉樱在微风里轻晃。顺着碎石花径往前飞，每一朵盛开都写着你的名字。",
    tags: ["暖石拱桥", "春水叠瀑", "漫坡繁花"],
    camStart: [-11.2, 5.2, 20.6],
    camEnd: [-12.2, 3.6, 16.8],
    lookStart: [-16.3, 0.55, 10.0],
    lookEnd: [-15.6, 0.65, 10.0],
    fov: [37, 34],
    camStartM: [-12.2, 5.9, 23.0],
    camEndM: [-13.0, 4.3, 19.0],
    lookStartM: [-14.0, -1.15, 10.0],
    lookEndM: [-14.0, -0.75, 10.0],
    fovM: [44, 41],
    roof: [0, 0],
  },
  {
    id: "plaza",
    label: "星灯花廊",
    accent: "#9B7EBD",
    scroll: 1.45,
    linger: 0.46,
    eyebrow: "Chapter II · 蔷薇暮光",
    title: "穿过暖灯轻垂的蔷薇花廊。",
    body: "泉水在石阶间细语，藤架上挂满暖黄星灯。想和你在这里并肩小坐，把黄昏聊成温柔的诗行。",
    tags: ["三叠石泉", "暖光星灯", "紫藤花架"],
    camStart: [-1.8, 4.8, 13.2],
    camEnd: [-2.8, 3.1, 9.6],
    lookStart: [-6.7, 0.85, 3.4],
    lookEnd: [-5.9, 0.95, 3.1],
    fov: [37, 34],
    camStartM: [-2.8, 5.5, 15.4],
    camEndM: [-3.5, 3.9, 11.6],
    lookStartM: [-4.5, -0.65, 3.4],
    lookEndM: [-4.5, -0.35, 3.2],
    fovM: [44, 41],
    roof: [0, 0],
  },
  {
    id: "villa",
    label: "山居庭院",
    accent: "#C96D53",
    scroll: 1.6,
    linger: 0.50,
    eyebrow: "Chapter III · 南法花墅",
    title: "推开院门，是为你筑的小家。",
    body: "赤陶筒瓦映着暖阳，粉白条纹遮阳篷下留着两盏迎归的灯，露台紫伞与垂蔓蔷薇替我守着四季。",
    tags: ["赤陶坡顶", "法式遮阳篷", "露台花园"],
    camStart: [10.4, 6.6, 8.6],
    camEnd: [8.8, 5.1, 5.4],
    lookStart: [1.8, 1.85, -5.2],
    lookEnd: [2.3, 1.85, -5.0],
    fov: [37, 35],
    camStartM: [9.8, 7.6, 12.8],
    camEndM: [8.6, 6.2, 9.8],
    lookStartM: [4.5, -0.45, -5.2],
    lookEndM: [4.5, -0.15, -5.0],
    fovM: [48, 45],
    roof: [0, 0],
  },
  {
    id: "living",
    label: "一厅烟火",
    accent: "#C9717E",
    scroll: 1.65,
    linger: 0.50,
    eyebrow: "Chapter IV · 两室一厅 · 一厅",
    title: "屋顶轻启，一厅藏着人间烟火。",
    body: "壁炉火光轻跳，留声机缓缓旋着旧唱片；餐桌上摆好双层莓果蛋糕，把最甜的日常留给你。",
    tags: ["暖火壁炉", "黑胶留声机", "莓果茶歇"],
    camStart: [9.8, 7.5, 2.5],
    camEnd: [9.0, 6.3, 0.8],
    lookStart: [4.5, 1.05, -5.6],
    lookEnd: [4.9, 1.00, -5.8],
    fov: [36, 33],
    camStartM: [8.6, 8.4, 3.6],
    camEndM: [7.8, 7.0, 1.6],
    lookStartM: [5.8, -0.35, -5.6],
    lookEndM: [5.9, -0.05, -5.8],
    fovM: [45, 42],
    roof: [1.0, 1.0],
  },
  {
    id: "bedrooms",
    label: "两室晴窗",
    accent: "#7D96B8",
    scroll: 1.65,
    linger: 0.50,
    eyebrow: "Chapter V · 两室一厅 · 主卧与画室",
    title: "一间画满繁花，一间留给甜梦。",
    body: "次卧书架收着你爱的故事，画架定格花开山坡；主卧晴窗洒满柔光，守候每一个安心入眠的夜晚。",
    tags: ["晴窗主卧", "繁花画室", "满架藏书"],
    camStart: [5.4, 6.4, 0.8],
    camEnd: [4.4, 5.5, -0.4],
    lookStart: [1.3, 1.25, -5.6],
    lookEnd: [1.5, 1.20, -5.9],
    fov: [35, 33],
    camStartM: [4.8, 7.5, 2.0],
    camEndM: [4.0, 6.4, 0.8],
    lookStartM: [3.4, -0.25, -5.6],
    lookEndM: [3.1, 0.0, -5.8],
    fovM: [44, 41],
    roof: [1.0, 1.0],
  },
  {
    id: "bouquet",
    label: "予你花开",
    accent: "#B85D6F",
    scroll: 1.6,
    linger: 0.45,
    eyebrow: "Chapter VI · 致我最爱的老婆",
    title: "万千花开，都捧到你面前。",
    body: "走过溪桥、星灯与为你筑起的两室一厅，最想递到你手心里的，是这束永不凋谢的花与滚烫的偏爱。",
    tags: ["手捧繁花", "火漆情书", "岁岁偏爱"],
    cta: {
      primary: { label: "展读致老婆的信", action: "letter" },
      secondary: { label: "360° 自由看房", action: "explore" },
    },
    camStart: [17.7, 3.20, -6.8],
    camEnd: [18.0, 2.88, -8.2],
    lookStart: [17.0, 2.05, -14.5],
    lookEnd: [17.25, 2.05, -14.5],
    fov: [36, 34],
    camStartM: [18.5, 3.25, -7.1],
    camEndM: [18.5, 2.95, -8.4],
    lookStartM: [18.5, 1.15, -14.5],
    lookEndM: [18.5, 1.32, -14.5],
    fovM: [44, 41],
    roof: [0, 0],
  },
];

// Mid-flight arc offsets [dx, dy, dz] for the 5 aerial connectors between the 6 sections
const CONNECTOR_ARCS = [
  { camLift: [0.4, 2.4, 0.6], lookLift: [0.0, 0.4, 0.0], w: 0.95 }, // 01 花溪 -> 02 花廊
  { camLift: [0.6, 2.8, 0.8], lookLift: [0.0, 0.5, 0.0], w: 1.0 },  // 02 花廊 -> 03 庭院
  { camLift: [0.4, 0.9, 0.3], lookLift: [0.0, 0.1, 0.0], w: 0.75 }, // 03 庭院 -> 04 一厅 (begins roof lift!)
  { camLift: [0.0, 0.7, 0.4], lookLift: [0.0, 0.0, 0.0], w: 0.75 }, // 04 一厅 -> 05 两室
  { camLift: [1.8, 3.6, 1.4], lookLift: [0.6, 0.8, 0.0], w: 1.15 }, // 05 两室 -> 06 花束
];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
export const lingerEase = (x, L) => {
  const l = clamp(L);
  const c = x - 0.5;
  return (1 - l) * x + l * (4 * c * c * c + 0.5);
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function quadBezier3(p0, pMid, p1, t) {
  const u = 1 - t;
  const b0 = u * u;
  const b1 = 2 * u * t;
  const b2 = t * t;
  return [
    b0 * p0[0] + b1 * pMid[0] + b2 * p1[0],
    b0 * p0[1] + b1 * pMid[1] + b2 * p1[1],
    b0 * p0[2] + b1 * pMid[2] + b2 * p1[2],
  ];
}

function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mid3(a, b) {
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
}

function seedParticles(host, skip) {
  if (!host || skip) return;
  const kinds = ["dot", "dot", "ring"];
  const seeds = [7, 23, 41, 58, 71, 88, 12, 34, 52, 66, 83, 95, 18, 29, 47, 63, 77, 91, 5, 38, 55, 69, 82, 97];
  for (let k = 0; k < 20; k++) {
    const s = document.createElement("span");
    s.className = "sw-pt sw-pt--" + kinds[k % kinds.length];
    s.style.left = seeds[k % seeds.length] + "vw";
    s.style.top = ((seeds[(k * 3) % seeds.length] * 1.3) % 100).toFixed(1) + "vh";
    s.style.setProperty("--sw-sc", (0.5 + ((seeds[(k * 5) % seeds.length] % 60) / 60) * 1.05).toFixed(2));
    const dur = 15 + (seeds[(k * 7) % seeds.length] % 20);
    s.style.animationDuration = dur + "s";
    s.style.animationDelay = -(seeds[(k * 2) % seeds.length] % dur) + "s";
    host.appendChild(s);
  }
}

export function mountScrubWorld(elements, stage, callbacks = {}) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const smallMQ = window.matchMedia("(max-width: 860px)");
  const isMobile = () => smallMQ.matches;

  const SECTIONS = SCROLL_SECTIONS;
  const N = SECTIONS.length;
  const SEGMENTS = [];

  SECTIONS.forEach((s, i) => {
    const dive = {
      kind: "dive",
      si: i,
      accent: s.accent,
      w: s.scroll || 1.4,
      linger: s.linger || 0,
    };
    SEGMENTS.push(dive);
    s._seg = dive;
    if (i < N - 1) {
      const connSpec = CONNECTOR_ARCS[i] || { camLift: [0, 1.5, 0], lookLift: [0, 0.2, 0], w: 0.9 };
      SEGMENTS.push({
        kind: "conn",
        si: i,
        accent: SECTIONS[i + 1].accent,
        w: connSpec.w,
        camLift: connSpec.camLift,
        lookLift: connSpec.lookLift,
      });
    }
  });
  const NSEG = SEGMENTS.length;

  const {
    root,
    particles,
    scrollbarFill,
    nav,
    copylayer,
    route,
    hint,
    track,
  } = elements;

  // Build section copy articles, route dots, and top nav pills (verbatim `scrub-engine.js` structure)
  const copies = [];
  const dots = [];
  const navItems = [];
  const pad = (n) => String(n).padStart(2, "0");

  SECTIONS.forEach((s, i) => {
    const c = document.createElement("article");
    c.className = "sw-copy";
    c.dataset.section = s.id;
    c.style.setProperty("--sw-accent", s.accent);

    const num = document.createElement("span");
    num.className = "sw-copy__num";
    num.textContent = `${pad(i + 1)} / ${pad(N)}`;
    c.appendChild(num);

    if (s.eyebrow) {
      const eb = document.createElement("span");
      eb.className = "sw-copy__eyebrow";
      eb.textContent = s.eyebrow;
      c.appendChild(eb);
    }

    const h2 = document.createElement("h2");
    h2.className = "sw-copy__title";
    h2.textContent = s.title;
    c.appendChild(h2);

    const body = document.createElement("p");
    body.className = "sw-copy__body";
    body.textContent = s.body;
    c.appendChild(body);

    if (s.tags && s.tags.length) {
      const ul = document.createElement("ul");
      ul.className = "sw-copy__tags";
      s.tags.forEach((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
      });
      c.appendChild(ul);
    }

    if (s.cta) {
      const ctaWrap = document.createElement("div");
      ctaWrap.className = "sw-copy__cta";
      if (s.cta.primary) {
        const btnP = document.createElement("button");
        btnP.type = "button";
        btnP.className = "sw-btn sw-btn--primary";
        btnP.dataset.action = s.cta.primary.action;
        btnP.textContent = s.cta.primary.label;
        btnP.addEventListener("click", () => callbacks.onAction && callbacks.onAction(s.cta.primary.action));
        ctaWrap.appendChild(btnP);
      }
      if (s.cta.secondary) {
        const btnS = document.createElement("button");
        btnS.type = "button";
        btnS.className = "sw-btn sw-btn--ghost";
        btnS.dataset.action = s.cta.secondary.action;
        btnS.textContent = s.cta.secondary.label;
        btnS.addEventListener("click", () => callbacks.onAction && callbacks.onAction(s.cta.secondary.action));
        ctaWrap.appendChild(btnS);
      }
      c.appendChild(ctaWrap);
    }

    copylayer.appendChild(c);
    copies.push(c);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "sw-route__dot";
    dot.setAttribute("aria-label", s.label);
    dot.style.setProperty("--sw-accent", s.accent);
    const lbl = document.createElement("span");
    lbl.className = "sw-route__label";
    lbl.textContent = s.label;
    dot.appendChild(lbl);
    dot.appendChild(document.createElement("i"));
    dot.addEventListener("click", () => jumpToSection(i));
    route.appendChild(dot);
    dots.push(dot);

    const navBtn = document.createElement("button");
    navBtn.type = "button";
    navBtn.className = "sw-nav__item";
    navBtn.textContent = s.label;
    navBtn.addEventListener("click", () => jumpToSection(i));
    nav.appendChild(navBtn);
    navItems.push(navBtn);
  });

  function sectionKeyframes(sec, mobile) {
    if (mobile) {
      return {
        c0: sec.camStartM,
        c1: sec.camEndM,
        l0: sec.lookStartM,
        l1: sec.lookEndM,
        f0: sec.fovM[0],
        f1: sec.fovM[1],
        r0: sec.roof[0],
        r1: sec.roof[1],
      };
    }
    return {
      c0: sec.camStart,
      c1: sec.camEnd,
      l0: sec.lookStart,
      l1: sec.lookEnd,
      f0: sec.fov[0],
      f1: sec.fov[1],
      r0: sec.roof[0],
      r1: sec.roof[1],
    };
  }

  let vh = window.innerHeight || 800;
  let totalW = 0;
  let laidOutW = window.innerWidth || 1280;
  let activeIndex = -1;
  let ticking = false;
  let targetY = 0;
  let smoothY = 0;

  function evaluatePoseAtScrollY(scrollY, mobileOverride = null) {
    const mobile = mobileOverride !== null ? mobileOverride : isMobile();
    const maxY = Math.max(1, totalW * vh);
    const y = clamp(scrollY, 0, maxY);

    let ci = 0;
    for (let i = 0; i < NSEG; i++) {
      if (y >= SEGMENTS[i].start) ci = i;
    }
    const seg = SEGMENTS[ci];
    const span = Math.max(1e-5, seg.end - seg.start);
    const local = clamp((y - seg.start) / span, 0, 1);

    if (seg.kind === "dive") {
      const sec = SECTIONS[seg.si];
      const kf = sectionKeyframes(sec, mobile);
      const t = seg.linger ? lingerEase(local, seg.linger) : local;
      return {
        segmentIndex: ci,
        segmentKind: "dive",
        sectionIndex: seg.si,
        local,
        eased: t,
        pos: lerp3(kf.c0, kf.c1, t),
        look: lerp3(kf.l0, kf.l1, t),
        fov: lerp(kf.f0, kf.f1, t),
        roofOpen: lerp(kf.r0, kf.r1, smooth(local)),
      };
    }

    // Connector flight: exact C0 endpoint lock between SECTIONS[si].end and SECTIONS[si+1].start!
    const secA = SECTIONS[seg.si];
    const secB = SECTIONS[seg.si + 1];
    const kfA = sectionKeyframes(secA, mobile);
    const kfB = sectionKeyframes(secB, mobile);
    const t = smooth(local);
    const camMid = add3(mid3(kfA.c1, kfB.c0), seg.camLift);
    const lookMid = add3(mid3(kfA.l1, kfB.l0), seg.lookLift);

    return {
      segmentIndex: ci,
      segmentKind: "conn",
      sectionIndex: local > 0.5 ? seg.si + 1 : seg.si,
      local,
      eased: t,
      pos: quadBezier3(kfA.c1, camMid, kfB.c0, t),
      look: quadBezier3(kfA.l1, lookMid, kfB.l0, t),
      fov: lerp(kfA.f1, kfB.f0, t),
      roofOpen: lerp(kfA.r1, kfB.r0, t),
    };
  }

  function updateDOMAtScrollY(y) {
    let ci = 0;
    for (let i = 0; i < NSEG; i++) {
      if (y >= SEGMENTS[i].start) ci = i;
    }

    for (let i = 0; i < N; i++) {
      const seg = SECTIONS[i]._seg;
      const pr = clamp((y - seg.start) / Math.max(1, seg.end - seg.start), 0, 1);
      const before = y < seg.start;
      const after = y > seg.end;
      let cop;
      if (i === 0) cop = after ? 0 : smooth(1 - pr / 0.65);
      else if (i === N - 1) cop = before ? 0 : smooth(pr / 0.42);
      else cop = before || after ? 0 : smooth(1 - Math.abs(pr - 0.5) / 0.5);

      const c = copies[i];
      c.style.opacity = cop.toFixed(4);
      c.style.transform = reduce ? "none" : `translateY(${((0.5 - pr) * 4).toFixed(2)}vh)`;
      c.style.pointerEvents = cop > 0.5 ? "auto" : "none";
    }

    const cur = SEGMENTS[ci];
    const near = clamp(
      cur.kind === "dive"
        ? cur.si
        : (y - cur.start) / Math.max(1, cur.end - cur.start) > 0.5
        ? cur.si + 1
        : cur.si,
      0,
      N - 1
    );
    if (near !== activeIndex) {
      const prev = activeIndex;
      activeIndex = near;
      dots.forEach((d, k) => d.classList.toggle("is-active", k === near));
      navItems.forEach((n, k) => n.classList.toggle("is-active", k === near));
      root.style.setProperty("--sw-accent", SECTIONS[near].accent);
      if (prev !== -1 && callbacks.onSectionChange) {
        callbacks.onSectionChange(near, SECTIONS[near]);
      }
    }

    scrollbarFill.style.transform = `scaleX(${clamp(y / Math.max(1, totalW * vh)).toFixed(4)})`;
    hint.style.opacity = clamp(1 - y / (0.5 * vh)).toFixed(3);
    if (particles) {
      particles.style.transform = `translate3d(0, ${(-y * 0.045).toFixed(1)}px, 0)`;
    }
  }

  function read() {
    targetY = window.scrollY || window.pageYOffset || 0;
    updateDOMAtScrollY(targetY);
    ticking = false;
  }

  function layout(snap = false) {
    vh = window.innerHeight || 800;
    laidOutW = window.innerWidth || 1280;
    let off = 0;
    SEGMENTS.forEach((s) => {
      s.start = off * vh;
      off += s.w;
      s.end = off * vh;
    });
    totalW = off;
    track.style.height = totalW * vh + vh + "px";
    stage.resize();
    read();
    if (snap) {
      smoothY = targetY;
      stage.setScrollPose(evaluatePoseAtScrollY(smoothY), true);
    }
  }

  function jumpToSection(i, instant = false) {
    const idx = clamp(i, 0, N - 1);
    if (callbacks.onBeforeJump) callbacks.onBeforeJump(idx);
    const seg = SECTIONS[idx]._seg;
    const destRatio = idx === 0 ? 0.0 : idx === N - 1 ? 0.85 : 0.5;
    const top = seg.start + (seg.end - seg.start) * destRatio;
    window.scrollTo({
      top,
      behavior: instant || reduce ? "auto" : "smooth",
    });
    if (instant || reduce) {
      targetY = top;
      smoothY = top;
      updateDOMAtScrollY(top);
      stage.setScrollPose(evaluatePoseAtScrollY(top), true);
    }
  }

  function setScrollProgress(p, snap = true) {
    const maxScroll = Math.max(1, totalW * vh);
    const top = clamp(p, 0, 1) * maxScroll;
    window.scrollTo({ top, behavior: "auto" });
    targetY = top;
    if (snap) {
      smoothY = top;
      updateDOMAtScrollY(top);
      const pose = evaluatePoseAtScrollY(top);
      stage.setScrollPose(pose, true);
      stage.renderNow();
      return pose;
    }
    read();
    return evaluatePoseAtScrollY(top);
  }

  let rafId = 0;
  function raf() {
    const diff = targetY - smoothY;
    if (Math.abs(diff) > 0.15) {
      smoothY += diff * (reduce ? 1.0 : 0.16);
      stage.setScrollPose(evaluatePoseAtScrollY(smoothY), false);
    } else if (smoothY !== targetY) {
      smoothY = targetY;
      stage.setScrollPose(evaluatePoseAtScrollY(smoothY), false);
    }
    rafId = requestAnimationFrame(raf);
  }

  seedParticles(particles, reduce || coarse);

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(read);
      }
    },
    { passive: true }
  );

  function onResize() {
    // Verbatim `scrub-engine.js` mobile URL-bar height-only resize guard
    if (coarse && window.innerWidth === laidOutW) return;
    layout(false);
  }

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => layout(false));
  layout(true);
  rafId = requestAnimationFrame(raf);

  return {
    layout,
    jumpToSection,
    setScrollProgress,
    evaluatePoseAtScrollY,
    getActiveIndex: () => activeIndex,
    getTotalScrollPx: () => totalW * vh,
    getSegments: () =>
      SEGMENTS.map((s, idx) => ({
        index: idx,
        kind: s.kind,
        si: s.si,
        w: s.w,
        start: s.start,
        end: s.end,
      })),
    destroy: () => cancelAnimationFrame(rafId),
  };
}
