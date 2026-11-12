import { createMusicBoxAudio } from "./audio.js";
import { createDioramaStage } from "./diorama-stage.js";
import { mountScrubWorld, SCROLL_SECTIONS } from "./scrub-world.js";

async function loadGiftLetter() {
  try {
    const res = await fetch("./gift.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_) {
    return {
      recipient: "我最爱的老婆",
      salutation: "亲爱的老婆：",
      signature: "永远偏爱你的，老公",
      letter: [
        "想送你一束花，又贪心地想让它永远盛开。",
        "于是把一颗颗微小的光，写成了花瓣的模样。你指尖掠过的风，你随手点亮的星光，都是我想给你的浪漫。",
        "谢谢你，把平凡的日子，变成我最喜欢的人间。",
        "往后的每一个春天，都想和你一起看花。\n而每一个没有花的日子，也一样爱你。",
      ],
    };
  }
}

function renderLetterModal(gift) {
  const recipientEl = document.getElementById("letter-recipient");
  const salutationEl = document.getElementById("letter-salutation");
  const bodyEl = document.getElementById("letter-body");
  const sigEl = document.getElementById("letter-signature");

  if (recipientEl && gift.recipient) {
    recipientEl.textContent = `致 · ${gift.recipient}`;
  }
  if (salutationEl && gift.salutation) {
    salutationEl.textContent = gift.salutation;
  }
  if (bodyEl && Array.isArray(gift.letter)) {
    bodyEl.innerHTML = "";
    gift.letter.forEach((para) => {
      const p = document.createElement("p");
      p.textContent = para;
      bodyEl.appendChild(p);
    });
  }
  if (sigEl && gift.signature) {
    sigEl.textContent = gift.signature;
  }
}

async function init() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const audio = createMusicBoxAudio();

  const root = document.getElementById("world");
  const canvas = document.getElementById("diorama-canvas");
  const loaderEl = document.getElementById("sw-loader");
  const loaderText = document.getElementById("sw-loader-text");
  const audioBtn = document.getElementById("sw-audio-btn");
  const topCta = document.getElementById("sw-topcta");
  const brandLink = document.getElementById("sw-brand-link");

  const exploreBar = document.getElementById("sw-explore-bar");
  const btnToggleRoof = document.getElementById("btn-toggle-roof");
  const btnExploreLetter = document.getElementById("btn-explore-letter");
  const btnExitExplore = document.getElementById("btn-exit-explore");

  const letterModal = document.getElementById("letter-modal");
  const letterClose = document.getElementById("letter-close");

  const giftData = await loadGiftLetter();
  renderLetterModal(giftData);

  let stage = null;
  let scrub = null;

  function openLetter() {
    letterModal.hidden = false;
    document.body.classList.add("is-modal-open");
    audio.playChime(5);
  }

  function closeLetter() {
    letterModal.hidden = true;
    document.body.classList.remove("is-modal-open");
  }

  function enterExploreMode() {
    if (!stage) return;
    document.body.classList.add("is-exploring");
    exploreBar.hidden = false;
    stage.setExploreMode(true, true);
    btnToggleRoof.textContent = "合拢屋顶看外观";
    audio.playChime(3);
  }

  function exitExploreMode() {
    if (!stage) return;
    document.body.classList.remove("is-exploring");
    exploreBar.hidden = true;
    stage.setExploreMode(false);
    if (scrub) {
      stage.setScrollPose(scrub.evaluatePoseAtScrollY(window.scrollY || 0), true);
    }
  }

  topCta.addEventListener("click", openLetter);
  btnExploreLetter.addEventListener("click", openLetter);
  letterClose.addEventListener("click", closeLetter);
  letterModal.addEventListener("click", (ev) => {
    if (ev.target === letterModal) closeLetter();
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      if (!letterModal.hidden) closeLetter();
      else if (document.body.classList.contains("is-exploring")) exitExploreMode();
    }
  });

  audioBtn.addEventListener("click", () => {
    const on = audio.toggle();
    audioBtn.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) audio.playChime(0);
  });

  btnToggleRoof.addEventListener("click", () => {
    if (!stage) return;
    const isOpen = stage.toggleExploreRoof();
    btnToggleRoof.textContent = isOpen ? "合拢屋顶看外观" : "掀开屋顶看两室一厅";
  });

  btnExitExplore.addEventListener("click", exitExploreMode);

  brandLink.addEventListener("click", (ev) => {
    ev.preventDefault();
    exitExploreMode();
    if (scrub) scrub.jumpToSection(0);
  });

  try {
    stage = await createDioramaStage(canvas, { reduceMotion });
    scrub = mountScrubWorld(
      {
        root,
        particles: document.getElementById("sw-particles"),
        scrollbarFill: document.getElementById("sw-scrollbar-fill"),
        nav: document.getElementById("sw-nav"),
        copylayer: document.getElementById("sw-copylayer"),
        route: document.getElementById("sw-route"),
        hint: document.getElementById("sw-hint"),
        track: document.getElementById("sw-track"),
      },
      stage,
      {
        onBeforeJump: () => {
          if (document.body.classList.contains("is-exploring")) exitExploreMode();
        },
        onSectionChange: (idx) => {
          audio.playChime(idx);
        },
        onAction: (action) => {
          if (action === "letter") openLetter();
          else if (action === "explore") enterExploreMode();
        },
      }
    );

    loaderEl.classList.add("is-done");

    // Deterministic automation & QA hook
    window.__scrollWorldApp = {
      sections: SCROLL_SECTIONS,
      getDiagnostics: () => ({
        ...stage.getDiagnostics(),
        activeSection: scrub.getActiveIndex(),
        totalScrollPx: scrub.getTotalScrollPx(),
        letterOpen: !letterModal.hidden,
        recipient: giftData.recipient,
      }),
      getSegments: () => scrub.getSegments(),
      evaluatePoseAtScrollY: (y, m) => scrub.evaluatePoseAtScrollY(y, m),
      setScrollProgress: (p, snap = true) => scrub.setScrollProgress(p, snap),
      jumpToSection: (i, instant = true) => scrub.jumpToSection(i, instant),
      setExploreMode: (on) => (on ? enterExploreMode() : exitExploreMode()),
      setRoofOpen: (v, snap = true) => stage.setRoofOpen(v, snap),
      openLetter,
      closeLetter,
    };
  } catch (err) {
    console.error("Failed to initialize 3D Scroll World:", err);
    if (loaderText) {
      loaderText.textContent = "微缩花境加载遇到问题，请刷新重试。";
    }
  }
}

init();
