import { createVanGoghSky } from "./vangogh-sky.js";
import { createMeadowScene } from "./flower-meadow.js";
import { createNightAudio } from "./audio.js";

const STORAGE_KEY = "bloom_for_you_vangogh_unlocked_v2";

const ACCENT_HEX = {
  rose: "#fda4af",
  gold: "#fde047",
  cyan: "#7dd3fc",
  violet: "#c4b5fd",
};

const ROMAN_NUMERALS = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];

const COMPACT_BEACON_LABELS = {
  "egg-hydrangea": "Ⅰ · 无尽夏",
  "egg-sunflower": "Ⅱ · 向日葵",
  "egg-rose-bottle": "Ⅲ · 玫瑰星瓶",
  "egg-iris-tulip": "Ⅳ · 鸢尾郁金香",
  "egg-starry-sky": "Ⅴ · 星夜流星",
};

async function fetchJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) {
      return fallback;
    }
    return await res.json();
  } catch {
    return fallback;
  }
}

function loadSavedUnlocked() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveUnlocked(set) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Ignore storage quota errors
  }
}

async function initApp() {
  const appShell = document.getElementById("app-shell");
  const skyContainer = document.getElementById("sky-container");
  const meadowCanvas = document.getElementById("meadow-canvas");
  const eggMarkersRoot = document.getElementById("egg-markers");
  const quickNavRoot = document.getElementById("egg-quick-nav");
  const counterValueEl = document.getElementById("counter-value");
  const hintTextEl = document.getElementById("hint-text");

  const btnAudio = document.getElementById("btn-audio");
  const audioLabel = document.getElementById("audio-label");
  const btnMeteor = document.getElementById("btn-meteor");
  const btnLetter = document.getElementById("btn-letter");
  const btnCollection = document.getElementById("btn-collection");

  const modalEl = document.getElementById("confession-modal");
  const modalBackdrop = document.getElementById("modal-backdrop");
  const cardEl = modalEl.querySelector(".confession-card");
  const btnCloseCard = document.getElementById("btn-close-card");
  const cardBadge = document.getElementById("card-badge");
  const cardSubtitle = document.getElementById("card-subtitle");
  const cardTitle = document.getElementById("card-title");
  const cardBody = document.getElementById("card-body");
  const cardQuote = document.getElementById("card-quote");
  const cardSignature = document.getElementById("card-signature");
  const btnNextEgg = document.getElementById("btn-next-egg");

  const drawerEl = document.getElementById("collection-drawer");
  const btnCloseDrawer = document.getElementById("btn-close-drawer");
  const drawerList = document.getElementById("drawer-list");
  const btnFinalePreview = document.getElementById("btn-finale-preview");

  const [confessionsData, giftData] = await Promise.all([
    fetchJson("./assets/confessions.json", { eggs: [], finale: null }),
    fetchJson("./gift.json", null),
  ]);

  const eggs = Array.isArray(confessionsData.eggs) ? confessionsData.eggs : [];
  const finaleData = confessionsData.finale || {
    id: "finale-starry-bloom",
    badge: "终章 · 梵高星月夜与繁花共绽",
    title: "漫天星河与人间繁花，皆为你盛开",
    subtitle: "你寻获了花丛与星河里的全部五处心意",
    paragraphs: giftData?.letter || giftData?.message || [
      "老婆，当你把藏在无尽夏、向日葵、玫瑰、鸢尾郁金香和梵高星河里的心意一一唤醒，整座星夜花园都已经知道了我的秘密。",
    ],
    quote: "“星月夜永不落幕，我对你的爱也是。”",
    signature: giftData?.signature || "永远爱你的老公",
    accent: "gold",
  };

  const unlockedIds = loadSavedUnlocked();
  const audio = createNightAudio();
  let activeCardId = null;
  let skyReady = false;
  let meadowStatus = "initializing";

  // 1. Initialize Upper Realm: p5.js Van Gogh Starry Night Sky
  const sky = createVanGoghSky(skyContainer, {
    onReady: () => {
      skyReady = true;
    },
  });

  // 2. Initialize Lower Realm: Three.js Multi-Species 3D Painterly Flower Meadow
  const meadow = createMeadowScene(meadowCanvas, {
    eggs,
    onEggTrigger: (eggId) => {
      openEggConfession(eggId);
    },
    onRipple: () => {
      audio.playRippleSparkle();
    },
    onStatus: (status) => {
      meadowStatus = status;
    },
  });

  // Sync previously unlocked state
  unlockedIds.forEach((id) => {
    meadow.markEggUnlocked(id);
    if (id === "egg-sunflower") {
      sky.setConstellationActive(true);
    }
  });
  if (unlockedIds.size >= eggs.length && eggs.length > 0) {
    sky.setConstellationActive(true);
    meadow.triggerFinaleState();
  }

  // 3. Create Floating 3D-Projected Starlight Beacons & Quick Nav Chips
  const beaconElements = new Map();
  const quickChipElements = new Map();

  function buildMarkersAndNav() {
    eggMarkersRoot.innerHTML = "";
    quickNavRoot.innerHTML = "";

    eggs.forEach((egg, index) => {
      const colorHex = ACCENT_HEX[egg.accent] || ACCENT_HEX.gold;
      const numeral = ROMAN_NUMERALS[index] || String(index + 1);
      const compactTitle = COMPACT_BEACON_LABELS[egg.id] || `${numeral} · ${egg.shortLabel || egg.title}`;

      // Floating starlight gem beacon on scene
      const beacon = document.createElement("button");
      beacon.type = "button";
      beacon.className = "egg-beacon";
      beacon.dataset.eggId = egg.id;
      beacon.dataset.unlocked = unlockedIds.has(egg.id) ? "true" : "false";
      beacon.style.setProperty("--beacon-color", colorHex);
      beacon.title = egg.hintLabel || egg.shortLabel || egg.title;
      beacon.innerHTML = `
        <span class="egg-beacon__orb" aria-hidden="true"></span>
        <span class="egg-beacon__label">${compactTitle}</span>
        <span class="egg-beacon__status">${unlockedIds.has(egg.id) ? "已点亮" : "✦"}</span>
      `;
      beacon.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openEggConfession(egg.id);
      });
      eggMarkersRoot.appendChild(beacon);
      beaconElements.set(egg.id, beacon);

      // Quick nav chip at bottom
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.dataset.eggId = egg.id;
      chip.dataset.unlocked = unlockedIds.has(egg.id) ? "true" : "false";
      chip.style.setProperty("--chip-color", colorHex);
      chip.innerHTML = `
        <span class="quick-chip__dot" aria-hidden="true"></span>
        <span>${index + 1}. ${egg.shortLabel || egg.title}</span>
      `;
      chip.addEventListener("click", () => {
        openEggConfession(egg.id);
      });
      quickNavRoot.appendChild(chip);
      quickChipElements.set(egg.id, chip);
    });
  }

  function updateCollectionUI() {
    const count = unlockedIds.size;
    counterValueEl.textContent = `${count} / ${eggs.length}`;

    eggs.forEach((egg) => {
      const isUnlocked = unlockedIds.has(egg.id);
      const beacon = beaconElements.get(egg.id);
      if (beacon) {
        beacon.dataset.unlocked = isUnlocked ? "true" : "false";
        const statusSpan = beacon.querySelector(".egg-beacon__status");
        if (statusSpan) {
          statusSpan.textContent = isUnlocked ? "已点亮" : "✦";
        }
      }
      const chip = quickChipElements.get(egg.id);
      if (chip) {
        chip.dataset.unlocked = isUnlocked ? "true" : "false";
      }
    });

    // Rebuild drawer list
    drawerList.innerHTML = "";
    eggs.forEach((egg, idx) => {
      const isUnlocked = unlockedIds.has(egg.id);
      const li = document.createElement("li");
      li.className = "drawer-item";
      li.dataset.unlocked = isUnlocked ? "true" : "false";
      li.innerHTML = `
        <div class="drawer-item__top">
          <span>${egg.badge || `彩蛋 ${idx + 1}`}</span>
          <span>${isUnlocked ? "✦ 已点亮" : "待寻觅"}</span>
        </div>
        <h3 class="drawer-item__title">${egg.title}</h3>
        <p class="drawer-item__sub">${egg.subtitle || egg.hint || ""}</p>
      `;
      li.addEventListener("click", () => {
        closeDrawer();
        openEggConfession(egg.id);
      });
      drawerList.appendChild(li);
    });

    if (count >= eggs.length && eggs.length > 0) {
      hintTextEl.textContent = "✦ 已寻获全部 5 处花间与星夜心意！梵高星空心形星群与繁花正为你全盛绽放";
    } else {
      const nextEgg = eggs.find((e) => !unlockedIds.has(e.id));
      if (nextEgg) {
        hintTextEl.textContent = `寻宝提示：${nextEgg.hint}`;
      }
    }
  }

  function showConfessionCard(item, { isFinale = false } = {}) {
    activeCardId = item.id;
    cardEl.dataset.accent = item.accent || "gold";
    cardBadge.textContent = item.badge || "星夜告白";
    cardSubtitle.textContent = item.subtitle || "";
    cardTitle.textContent = item.title || "";

    cardBody.innerHTML = "";
    const paragraphs =
      item.useGiftLetter && Array.isArray(giftData?.letter) && giftData.letter.length > 0
        ? giftData.letter
        : Array.isArray(item.paragraphs)
          ? item.paragraphs
          : [];
    paragraphs.forEach((text) => {
      const p = document.createElement("p");
      p.textContent = text;
      cardBody.appendChild(p);
    });

    cardQuote.textContent = item.quote || "";
    cardSignature.textContent = item.signature || "永远爱你的老公";

    const nextUndiscovered = eggs.find((e) => !unlockedIds.has(e.id));
    if (isFinale) {
      btnNextEgg.querySelector("span").textContent = "回到梵高星夜花丛继续漫游";
    } else if (nextUndiscovered) {
      btnNextEgg.querySelector("span").textContent = `继续寻觅：${nextUndiscovered.shortLabel}`;
    } else {
      btnNextEgg.querySelector("span").textContent = "✦ 开启星夜繁花终章盛典";
    }

    modalEl.setAttribute("aria-hidden", "false");
  }

  function closeConfessionCard() {
    modalEl.setAttribute("aria-hidden", "true");
    activeCardId = null;
  }

  function openEggConfession(eggId) {
    const index = eggs.findIndex((e) => e.id === eggId);
    if (index === -1) {
      return false;
    }
    const egg = eggs[index];
    const wasNew = !unlockedIds.has(egg.id);
    unlockedIds.add(egg.id);
    saveUnlocked(unlockedIds);

    meadow.markEggUnlocked(egg.id);
    meadow.focusEgg(egg.id);
    audio.playDiscoveryChime(index);

    // Special celestial effects per egg
    if (egg.id === "egg-sunflower") {
      sky.setConstellationActive(true);
    }
    if (egg.id === "egg-starry-sky") {
      sky.triggerMeteor({ startX: 0.22, startY: 0.11 });
      sky.triggerMeteor({ startX: 0.54, startY: 0.08 });
    }

    if (unlockedIds.size >= eggs.length) {
      sky.setConstellationActive(true);
      meadow.triggerFinaleState();
    }

    updateCollectionUI();
    showConfessionCard(egg, { isFinale: false });
    return wasNew;
  }

  function triggerFinale() {
    eggs.forEach((egg) => {
      unlockedIds.add(egg.id);
      meadow.markEggUnlocked(egg.id);
    });
    saveUnlocked(unlockedIds);
    sky.setConstellationActive(true);
    sky.triggerFinaleBurst();
    meadow.triggerFinaleState();
    audio.playFinaleFanfare();
    updateCollectionUI();
    showConfessionCard(finaleData, { isFinale: true });
  }

  function openOriginalLoveLetter() {
    const letterParagraphs = Array.isArray(giftData?.letter)
      ? giftData.letter
      : Array.isArray(giftData?.message)
        ? giftData.message
        : finaleData.paragraphs;
    const letterCard = {
      id: "original-love-letter",
      badge: "珍藏信笺 · 致我最爱的老婆",
      title: giftData?.salutation || "亲爱的老婆：",
      subtitle: `${giftData?.recipient || "我最爱的老婆"} · 漫天繁星与花海皆为你盛开`,
      paragraphs: letterParagraphs,
      quote: "“我见过万千星河与人间繁花，却只为你一人驻足。”",
      signature: giftData?.signature || "永远偏爱你的，老公",
      accent: "rose",
    };
    sky.setConstellationActive(true);
    sky.triggerMeteor({ startX: 0.28, startY: 0.10 });
    audio.playDiscoveryChime(2);
    showConfessionCard(letterCard, { isFinale: false });
  }

  function openDrawer() {
    drawerEl.setAttribute("aria-hidden", "false");
    btnCollection.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    drawerEl.setAttribute("aria-hidden", "true");
    btnCollection.setAttribute("aria-expanded", "false");
  }

  // 4. Synchronize 3D Projected Beacon Positions with 2D Pairwise Collision Avoidance!
  let rafId = 0;
  function updateBeaconLoop() {
    rafId = window.requestAnimationFrame(updateBeaconLoop);
    const projected = meadow.getEggScreenPositions();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isCompact = width < 768;

    const minX = isCompact ? 58 : 88;
    const maxX = Math.max(minX, width - minX);
    const meadowMinY = isCompact ? height * 0.48 : height * 0.45;
    const meadowMaxY = isCompact ? height - 102 : height - 106;

    const placed = [];

    projected.forEach((pos) => {
      const beacon = beaconElements.get(pos.id);
      if (!beacon) return;

      if (!pos.visible) {
        beacon.style.opacity = "0";
        beacon.style.pointerEvents = "none";
        return;
      }

      let x = pos.x;
      let y = pos.y;
      const isSkyEgg = pos.id === "egg-starry-sky";

      if (isSkyEgg) {
        x = Math.min(Math.max(x, width * 0.30), width * 0.72);
        y = isCompact
          ? Math.min(Math.max(y, 108), height * 0.30)
          : Math.min(Math.max(y, height * 0.14), height * 0.30);
      } else {
        x = Math.min(Math.max(x, minX), maxX);
        y = Math.min(Math.max(y, meadowMinY), meadowMaxY);
      }

      placed.push({ id: pos.id, beacon, x, y, isSkyEgg });
    });

    // Pairwise 2D elliptical repulsion so two beacons NEVER overlap on mobile or desktop!
    const sepX = isCompact ? 106 : 138;
    const sepY = isCompact ? 34 : 38;
    for (let iter = 0; iter < 5; iter++) {
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          if (a.isSkyEgg !== b.isSkyEgg) continue;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const nx = dx / sepX;
          const ny = dy / sepY;
          const distSq = nx * nx + ny * ny;
          if (distSq < 1.0) {
            const dist = Math.sqrt(distSq) || 0.01;
            const overlap = (1.0 - dist) * 0.52;
            const ux = Math.abs(nx) < 0.02 ? (i % 2 === 0 ? -1 : 1) : nx / dist;
            const uy = ny / dist;
            a.x = Math.min(Math.max(a.x - ux * overlap * sepX, minX), maxX);
            b.x = Math.min(Math.max(b.x + ux * overlap * sepX, minX), maxX);
            a.y = Math.min(Math.max(a.y - uy * overlap * sepY, meadowMinY), meadowMaxY);
            b.y = Math.min(Math.max(b.y + uy * overlap * sepY, meadowMinY), meadowMaxY);
          }
        }
      }
    }

    for (const item of placed) {
      item.beacon.style.opacity = "1";
      item.beacon.style.pointerEvents = "auto";
      item.beacon.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0) translate(-50%, -50%)`;
    }
  }

  // 5. Wire Pointer, Resize & UI Events
  window.addEventListener("resize", () => {
    sky.resize();
    meadow.resize();
  });

  window.addEventListener("pointermove", (ev) => {
    const nx = ev.clientX / Math.max(1, window.innerWidth);
    const ny = ev.clientY / Math.max(1, window.innerHeight);
    sky.handlePointerMove(nx, ny);
    meadow.handlePointerMove(ev.clientX, ev.clientY);
  });

  meadowCanvas.addEventListener("pointerdown", (ev) => {
    meadow.handlePointerDown(ev.clientX, ev.clientY);
  });

  window.addEventListener("pointerup", (ev) => {
    const result = meadow.handlePointerUp(ev.clientX, ev.clientY);
    if (result && !result.dragged && !result.hitEggId) {
      const ny = ev.clientY / Math.max(1, window.innerHeight);
      const nx = ev.clientX / Math.max(1, window.innerWidth);
      if (ny < 0.46) {
        sky.triggerMeteor({
          startX: Math.max(0.08, Math.min(0.82, nx - 0.08)),
          startY: Math.max(0.05, Math.min(0.32, ny)),
        });
      }
    }
  });

  btnAudio.addEventListener("click", () => {
    const active = audio.toggle();
    btnAudio.setAttribute("aria-pressed", active ? "true" : "false");
    audioLabel.innerHTML = active
      ? `<span class="hide-xs">八音盒</span>演奏中`
      : `<span class="hide-xs">星夜</span>八音盒`;
    if (active) {
      audio.playDiscoveryChime(0);
    }
  });

  btnMeteor.addEventListener("click", () => {
    sky.triggerMeteor();
    meadow.spawnRipple();
    audio.playRippleSparkle();
    hintTextEl.textContent = "彡 一颗梵高油彩流星划破夜空，将你的心愿洒向满天星与花海";
  });

  btnLetter.addEventListener("click", () => {
    openOriginalLoveLetter();
  });

  btnCollection.addEventListener("click", () => {
    const isHidden = drawerEl.getAttribute("aria-hidden") !== "false";
    if (isHidden) {
      openDrawer();
    } else {
      closeDrawer();
    }
  });

  btnCloseDrawer.addEventListener("click", closeDrawer);

  btnFinalePreview.addEventListener("click", () => {
    closeDrawer();
    triggerFinale();
  });

  btnCloseCard.addEventListener("click", closeConfessionCard);
  modalBackdrop.addEventListener("click", closeConfessionCard);

  btnNextEgg.addEventListener("click", () => {
    const nextUndiscovered = eggs.find((e) => !unlockedIds.has(e.id));
    if (activeCardId === finaleData.id) {
      closeConfessionCard();
      return;
    }
    if (nextUndiscovered) {
      openEggConfession(nextUndiscovered.id);
    } else {
      triggerFinale();
    }
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      closeConfessionCard();
      closeDrawer();
    }
  });

  buildMarkersAndNav();
  updateCollectionUI();
  updateBeaconLoop();
  appShell.dataset.ready = "true";

  // 6. Expose deterministic controller for testing & inspection
  const controller = {
    getDiagnostics() {
      return {
        ready: appShell.dataset.ready === "true" && skyReady,
        meadowStatus,
        unlockedCount: unlockedIds.size,
        totalEggs: eggs.length,
        unlockedIds: [...unlockedIds],
        activeCardId,
        sky: sky.getDiagnostics(),
        meadow: meadow.getDiagnostics(),
      };
    },
    unlockEgg(eggId) {
      return openEggConfession(eggId);
    },
    triggerFinale() {
      triggerFinale();
      return this.getDiagnostics();
    },
    triggerMeteor() {
      sky.triggerMeteor();
      meadow.spawnRipple();
      return this.getDiagnostics();
    },
    openLoveLetter() {
      openOriginalLoveLetter();
      return this.getDiagnostics();
    },
    closeModal() {
      closeConfessionCard();
    },
    dispose() {
      window.cancelAnimationFrame(rafId);
      sky.dispose();
      meadow.dispose();
    },
  };

  window.__starryMeadow = controller;
  window.__summerNight = controller;
}

initApp();
