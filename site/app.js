import { createVanGoghSky } from "./vangogh-sky.js";
import { createMeadowScene } from "./flower-meadow.js";
import { createNightAudio } from "./audio.js";

const STORAGE_KEY_EGGS = "bloom_for_you_vangogh_unlocked_v2";
const STORAGE_KEY_WONDERS = "bloom_for_you_fairytale_wonders_v1";

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

function loadSavedSet(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Ignore storage quota errors
  }
}

function normalizeProjectedEntries(projected) {
  if (!projected) return [];
  if (Array.isArray(projected)) return projected;
  return Object.entries(projected).map(([id, val]) => ({ id, ...val }));
}

async function initApp() {
  const appShell = document.getElementById("app-shell");
  const skyContainer = document.getElementById("sky-container");
  const meadowCanvas = document.getElementById("meadow-canvas");
  const wonderMarkersRoot = document.getElementById("wonder-markers");
  const eggMarkersRoot = document.getElementById("egg-markers");
  const quickNavRoot = document.getElementById("egg-quick-nav");
  const counterValueEl = document.getElementById("counter-value");
  const hintTextEl = document.getElementById("hint-text");

  const spriteBubbleEl = document.getElementById("sprite-bubble");
  const spriteBubbleTextEl = document.getElementById("sprite-bubble-text");

  const wonderToastEl = document.getElementById("wonder-toast");
  const wonderToastBadgeEl = document.getElementById("wonder-toast-badge");
  const wonderToastTitleEl = document.getElementById("wonder-toast-title");
  const wonderToastTextEl = document.getElementById("wonder-toast-text");
  const btnCloseToast = document.getElementById("btn-close-toast");

  const btnFollowSprite = document.getElementById("btn-follow-sprite");
  const followLabel = document.getElementById("follow-label");
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
  const drawerEggsHeading = document.getElementById("drawer-eggs-heading");
  const drawerWondersHeading = document.getElementById("drawer-wonders-heading");
  const drawerList = document.getElementById("drawer-list");
  const drawerWonderList = document.getElementById("drawer-wonder-list");
  const btnFinalePreview = document.getElementById("btn-finale-preview");

  const [confessionsData, giftData] = await Promise.all([
    fetchJson("./assets/confessions.json", { eggs: [], wonders: [], finale: null }),
    fetchJson("./gift.json", null),
  ]);

  const eggs = Array.isArray(confessionsData.eggs) ? confessionsData.eggs : [];
  const wonders = Array.isArray(confessionsData.wonders) ? confessionsData.wonders : [];
  const finaleData = confessionsData.finale || {
    id: "finale-starry-bloom",
    badge: "终章 · 梵高星月夜与童话繁花共绽",
    title: "漫天星河与整座童话花园，皆为你盛开",
    subtitle: "你寻获了花丛与星河里的全部五处心意",
    paragraphs: giftData?.letter || giftData?.message || [
      "老婆，当你把藏在无尽夏、向日葵、玫瑰、鸢尾郁金香和梵高星河里的心意一一唤醒，整座星夜童话花园都已经知道了我的秘密。",
    ],
    quote: "“星月夜永不落幕，我对你的爱也是。”",
    signature: giftData?.signature || "永远爱你的老公",
    accent: "gold",
  };

  const unlockedIds = loadSavedSet(STORAGE_KEY_EGGS);
  const unlockedWonders = loadSavedSet(STORAGE_KEY_WONDERS);
  const audio = createNightAudio();

  let activeCardId = null;
  let activeWonderId = null;
  let skyReady = false;
  let meadowStatus = "initializing";
  let spriteWhisperUntil = performance.now() + 4600;
  let toastHideTimer = null;

  function showSpriteWhisper(text, durationMs = 12000) {
    if (!text) return;
    spriteBubbleTextEl.textContent = text;
    spriteWhisperUntil = performance.now() + durationMs;
  }

  // 1. Initialize Upper Realm: p5.js Van Gogh Starry Night Sky
  const sky = createVanGoghSky(skyContainer, {
    onReady: () => {
      skyReady = true;
    },
  });

  // 2. Initialize Lower Realm: Three.js Lifelike Botanical Meadow, Slopes, Path & Sprite
  const meadow = createMeadowScene(meadowCanvas, {
    eggs,
    wonders,
    onEggTrigger: (eggId) => {
      openEggConfession(eggId);
    },
    onWonderTrigger: (wonderId) => {
      handleWonderDiscovered(wonderId);
    },
    onSpriteWhisper: (msg) => {
      showSpriteWhisper(msg, 4200);
    },
    onSkyTap: ({ nx, ny }) => {
      if (ny < 0.48) {
        sky.triggerMeteor({
          startX: Math.max(0.08, Math.min(0.84, nx - 0.06)),
          startY: Math.max(0.05, Math.min(0.34, ny)),
        });
      }
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

  // 3. Create Floating 3D-Projected Starlight Beacons, Wonder Sparkle Pins & Quick Nav Chips
  const beaconElements = new Map();
  const wonderPinElements = new Map();
  const quickChipElements = new Map();

  function buildMarkersAndNav() {
    eggMarkersRoot.innerHTML = "";
    wonderMarkersRoot.innerHTML = "";
    quickNavRoot.innerHTML = "";

    eggs.forEach((egg, index) => {
      const colorHex = ACCENT_HEX[egg.accent] || ACCENT_HEX.gold;
      const numeral = ROMAN_NUMERALS[index] || String(index + 1);
      const compactTitle = COMPACT_BEACON_LABELS[egg.id] || `${numeral} · ${egg.shortLabel || egg.title}`;

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

    wonders.forEach((wonder) => {
      const colorHex = ACCENT_HEX[wonder.accent] || ACCENT_HEX.gold;
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "wonder-pin";
      pin.dataset.wonderId = wonder.id;
      pin.dataset.label = `童话彩蛋 · ${wonder.shortLabel || wonder.title}`;
      pin.dataset.unlocked = unlockedWonders.has(wonder.id) ? "true" : "false";
      pin.style.setProperty("--wonder-color", colorHex);
      pin.setAttribute("aria-label", wonder.shortLabel || wonder.title);
      pin.innerHTML = `<span aria-hidden="true">✦</span>`;
      pin.addEventListener("click", (ev) => {
        ev.stopPropagation();
        meadow.triggerWonder(wonder.id);
      });
      wonderMarkersRoot.appendChild(pin);
      wonderPinElements.set(wonder.id, pin);
    });
  }

  function syncFollowButtonUI() {
    const following = meadow.isFollowingSprite();
    btnFollowSprite.setAttribute("aria-pressed", following ? "true" : "false");
    followLabel.innerHTML = following
      ? `<span class="hide-xs">视角</span>跟随中`
      : `<span class="hide-xs">跟随</span>精灵`;
  }

  function updateCollectionUI() {
    const eggCount = unlockedIds.size;
    const wonderCount = unlockedWonders.size;
    counterValueEl.textContent = `${eggCount}/${eggs.length} · ✧${wonderCount}/${wonders.length}`;

    if (drawerEggsHeading) {
      drawerEggsHeading.textContent = `✦ 爱的告白信笺 (${eggCount} / ${eggs.length})`;
    }
    if (drawerWondersHeading) {
      drawerWondersHeading.textContent = `✧ 童话秘境奇遇彩蛋 (${wonderCount} / ${wonders.length})`;
    }

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

    wonders.forEach((wonder) => {
      const pin = wonderPinElements.get(wonder.id);
      if (pin) {
        pin.dataset.unlocked = unlockedWonders.has(wonder.id) ? "true" : "false";
      }
    });

    // Rebuild 5 Core Love Confessions list
    drawerList.innerHTML = "";
    eggs.forEach((egg, idx) => {
      const isUnlocked = unlockedIds.has(egg.id);
      const li = document.createElement("li");
      li.className = "drawer-item";
      li.dataset.unlocked = isUnlocked ? "true" : "false";
      li.innerHTML = `
        <div class="drawer-item__top">
          <span>${egg.badge || `心意信笺 ${idx + 1}`}</span>
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

    // Rebuild 8 Fairytale World Wonders list
    if (drawerWonderList) {
      drawerWonderList.innerHTML = "";
      wonders.forEach((wonder, idx) => {
        const isUnlocked = unlockedWonders.has(wonder.id);
        const li = document.createElement("li");
        li.className = "drawer-item";
        li.dataset.unlocked = isUnlocked ? "true" : "false";
        li.innerHTML = `
          <div class="drawer-item__top">
            <span>${wonder.badge || `童话奇遇 ${idx + 1}`}</span>
            <span>${isUnlocked ? "✧ 已发现" : "待偶遇"}</span>
          </div>
          <h3 class="drawer-item__title">${wonder.shortLabel || wonder.title}</h3>
          <p class="drawer-item__sub">${isUnlocked ? wonder.whisper : `位置提示：${wonder.location || "童话草坡与小路旁"}`}</p>
        `;
        li.addEventListener("click", () => {
          closeDrawer();
          closeConfessionCard();
          meadow.triggerWonder(wonder.id);
        });
        drawerWonderList.appendChild(li);
      });
    }

    if (eggCount >= eggs.length && eggs.length > 0) {
      if (wonderCount >= wonders.length && wonders.length > 0) {
        hintTextEl.textContent = "✦ 已集齐全部 5 封心意信笺与 8 处童话奇遇！整座梵高星夜花园正为你全盛绽放";
      } else {
        hintTextEl.textContent = `✦ 5 封心意信笺已全盛点亮！还可沿小路与草坡偶遇童话彩蛋 (${wonderCount}/${wonders.length})`;
      }
    } else {
      const nextEgg = eggs.find((e) => !unlockedIds.has(e.id));
      if (nextEgg) {
        hintTextEl.textContent = `寻宝提示：${nextEgg.hint}（点击小路或草坡可唤精灵同行）`;
      }
    }
  }

  function closeWonderToast() {
    wonderToastEl.setAttribute("aria-hidden", "true");
    activeWonderId = null;
    if (toastHideTimer) {
      clearTimeout(toastHideTimer);
      toastHideTimer = null;
    }
  }

  let keepWonderToastPinned = false;

  function handleWonderDiscovered(wonderId) {
    const idx = wonders.findIndex((w) => w.id === wonderId);
    const wonder = idx >= 0 ? wonders[idx] : {
      id: wonderId,
      badge: "童话奇遇",
      title: "星夜草坡的小秘密",
      whisper: "提灯小精灵洒下一串金色星尘，把今晚的温柔悄悄收进花海里。",
    };

    unlockedWonders.add(wonder.id);
    saveSet(STORAGE_KEY_WONDERS, unlockedWonders);
    audio.playWonderTwinkle(idx >= 0 ? idx : 0);
    syncFollowButtonUI();
    updateCollectionUI();

    activeWonderId = wonder.id;
    wonderToastBadgeEl.textContent = `${wonder.badge || "童话奇遇"} (${unlockedWonders.size}/${wonders.length})`;
    wonderToastTitleEl.textContent = wonder.title || wonder.shortLabel || "";
    wonderToastTextEl.textContent = wonder.whisper || "";
    wonderToastEl.setAttribute("aria-hidden", "false");

    if (wonder.id === "wonder-dandelions" || wonder.id === "wonder-cottage") {
      sky.triggerMeteor({ startX: 0.34, startY: 0.12 });
    }

    if (toastHideTimer) clearTimeout(toastHideTimer);
    if (!keepWonderToastPinned) {
      toastHideTimer = window.setTimeout(() => {
        closeWonderToast();
      }, 9500);
    }
  }

  function showConfessionCard(item, { isFinale = false } = {}) {
    closeWonderToast();
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
      btnNextEgg.querySelector("span").textContent = "回到童话草坡与提灯精灵继续漫游";
    } else if (nextUndiscovered) {
      btnNextEgg.querySelector("span").textContent = `继续寻觅：${nextUndiscovered.shortLabel}`;
    } else {
      btnNextEgg.querySelector("span").textContent = "✦ 开启星夜童话终章盛典";
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
    saveSet(STORAGE_KEY_EGGS, unlockedIds);

    meadow.markEggUnlocked(egg.id);
    meadow.focusEgg(egg.id);
    syncFollowButtonUI();
    audio.playDiscoveryChime(index);

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
    saveSet(STORAGE_KEY_EGGS, unlockedIds);
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
      subtitle: `${giftData?.recipient || "我最爱的老婆"} · 漫天繁星与童话花海皆为你盛开`,
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

  // 4. Synchronize 3D Projected Beacons, Wonder Sparkle Glints & Sprite Speech Bubble!
  let rafId = 0;
  function updateOverlayLoop(nowMs = performance.now()) {
    rafId = window.requestAnimationFrame(updateOverlayLoop);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isCompact = width < 768;
    const modalOpen = modalEl.getAttribute("aria-hidden") === "false";

    const minX = isCompact ? 56 : 86;
    const maxX = Math.max(minX, width - minX);
    const meadowMinY = isCompact ? height * 0.44 : height * 0.40;
    const meadowMaxY = isCompact ? height - 102 : height - 106;

    // A. 5 Core Confession Beacons with 2D Pairwise Elliptical Repulsion
    const projectedEggs = normalizeProjectedEntries(meadow.getEggScreenPositions());
    const placedEggs = [];

    projectedEggs.forEach((pos) => {
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
        x = Math.min(Math.max(x, width * 0.30), width * 0.74);
        y = isCompact
          ? Math.min(Math.max(y, 106), height * 0.28)
          : Math.min(Math.max(y, height * 0.13), height * 0.28);
      } else {
        x = Math.min(Math.max(x, minX), maxX);
        y = Math.min(Math.max(y, meadowMinY), meadowMaxY);
      }

      placedEggs.push({ id: pos.id, beacon, x, y, isSkyEgg });
    });

    const sepX = isCompact ? 104 : 136;
    const sepY = isCompact ? 34 : 38;
    for (let iter = 0; iter < 5; iter++) {
      for (let i = 0; i < placedEggs.length; i++) {
        for (let j = i + 1; j < placedEggs.length; j++) {
          const a = placedEggs[i];
          const b = placedEggs[j];
          if (a.isSkyEgg !== b.isSkyEgg) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
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

    for (const item of placedEggs) {
      item.beacon.style.opacity = modalOpen ? "0.25" : "1";
      item.beacon.style.pointerEvents = modalOpen ? "none" : "auto";
      item.beacon.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0) translate(-50%, -50%)`;
    }

    // B. 8 Fairytale World Wonder Sparkle Glints (Subtle Jewel Orbs)
    const projectedWonders = normalizeProjectedEntries(meadow.getWonderScreenPositions());
    projectedWonders.forEach((pos) => {
      const pin = wonderPinElements.get(pos.id);
      if (!pin) return;

      const hideSpritePin = pos.id === "wonder-sprite" && (meadow.isFollowingSprite() || nowMs < spriteWhisperUntil);
      if (!pos.visible || modalOpen || hideSpritePin) {
        pin.style.opacity = "0";
        pin.style.pointerEvents = "none";
        return;
      }

      let wx = Math.min(Math.max(pos.x, 26), width - 26);
      let wy = Math.min(Math.max(pos.y, isCompact ? 96 : 74), height - 98);

      // Push any wonder pin away from nearby larger egg-beacons so they never overlap!
      for (const eb of placedEggs) {
        const dx = wx - eb.x;
        const dy = wy - eb.y;
        if (Math.abs(dx) < 64 && Math.abs(dy) < 26) {
          wy = eb.y > height * 0.62 ? eb.y - 28 : eb.y + 28;
        }
      }

      pin.style.opacity = "0.92";
      pin.style.pointerEvents = "auto";
      pin.style.transform = `translate3d(${Math.round(wx)}px, ${Math.round(wy)}px, 0) translate(-50%, -50%)`;
    });

    // C. Floating Speech Bubble Above the Free-Roaming Sprite
    const spritePos = meadow.getSpriteScreenPosition();
    const showBubble = !modalOpen && spritePos && spritePos.visible && nowMs < spriteWhisperUntil;
    if (showBubble) {
      const bx = Math.min(Math.max(spritePos.x, 126), width - 126);
      const by = Math.min(Math.max(spritePos.y - 24, isCompact ? 96 : 76), height - 116);
      spriteBubbleEl.setAttribute("aria-hidden", "false");
      spriteBubbleEl.style.transform = `translate3d(${Math.round(bx)}px, ${Math.round(by)}px, 0) translate(-50%, -100%)`;
    } else {
      spriteBubbleEl.setAttribute("aria-hidden", "true");
    }
  }

  // 5. Wire Pointer, Keyboard Steering, Resize & UI Events
  window.addEventListener("resize", () => {
    sky.resize();
    meadow.resize();
  });

  window.addEventListener("pointermove", (ev) => {
    const nx = ev.clientX / Math.max(1, window.innerWidth);
    const ny = ev.clientY / Math.max(1, window.innerHeight);
    sky.handlePointerMove(nx, ny);
  });

  btnFollowSprite.addEventListener("click", () => {
    const following = meadow.toggleFollowSprite();
    syncFollowButtonUI();
    if (following) {
      showSpriteWhisper("跟紧我的星光小灯笼，带你逛遍花坡和小路 ✨", 4500);
      hintTextEl.textContent = "✧ 正在跟随提灯精灵漫步！点击小路或按方向键 / WASD 可自由指引方向";
    } else {
      hintTextEl.textContent = "✧ 已切回星月夜全景视角，点击任意花丛、土坡、小屋或蘑菇圈触发童话彩蛋";
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
    hintTextEl.textContent = "彡 一颗梵高油彩流星划破夜空，将你的心愿洒向童话小屋与满坡繁花";
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
  btnCloseToast.addEventListener("click", closeWonderToast);

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
      closeWonderToast();
      return;
    }

    // WASD / Arrow keys steer the Exploring Fairy Sprite freely across grass & path!
    if (modalEl.getAttribute("aria-hidden") === "false") return;
    const step = 0.72;
    if (ev.key === "ArrowUp" || ev.key === "w" || ev.key === "W") {
      meadow.nudgeSprite(0, -step);
    } else if (ev.key === "ArrowDown" || ev.key === "s" || ev.key === "S") {
      meadow.nudgeSprite(0, step);
    } else if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") {
      meadow.nudgeSprite(-step, 0);
    } else if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") {
      meadow.nudgeSprite(step, 0);
    }
  });

  buildMarkersAndNav();
  syncFollowButtonUI();
  updateCollectionUI();
  updateOverlayLoop();
  appShell.dataset.ready = "true";

  // 6. Expose deterministic controller for automated evaluation & inspection
  const controller = {
    getDiagnostics() {
      return {
        ready: appShell.dataset.ready === "true" && skyReady,
        meadowStatus,
        unlockedCount: unlockedIds.size,
        totalEggs: eggs.length,
        unlockedIds: [...unlockedIds],
        unlockedWonderCount: unlockedWonders.size,
        totalWonders: wonders.length,
        unlockedWonders: [...unlockedWonders],
        activeCardId,
        activeWonderId,
        followingSprite: meadow.isFollowingSprite(),
        sky: sky.getDiagnostics(),
        meadow: meadow.getDiagnostics(),
      };
    },
    unlockEgg(eggId) {
      return openEggConfession(eggId);
    },
    triggerWonder(wonderId, opts = {}) {
      keepWonderToastPinned = Boolean(opts && opts.keepOpen);
      meadow.triggerWonder(wonderId);
      return this.getDiagnostics();
    },
    toggleFollowSprite(state) {
      const next = meadow.toggleFollowSprite(state);
      syncFollowButtonUI();
      return next;
    },
    walkSpriteTo(x, z, msg) {
      meadow.walkSpriteTo(x, z, msg);
      return this.getDiagnostics();
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
      closeWonderToast();
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
