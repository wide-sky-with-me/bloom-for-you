import { ParticleGarden } from "./particles.js?v=3";
import { decodeSurface } from "./surface-data.js?v=3";

const $ = (id) => document.getElementById(id);
const canvas = $("bouquet");
const fallback = $("fallback-art");
const loading = $("loading");
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
const bouquets = {
  rose: {
    title: "粉雾来信",
    description: "玫瑰替我说，那些藏不住的喜欢。",
    tag: "玫瑰",
    color: "#edb4c5",
  },
  tulip: {
    title: "把晴天给你",
    description: "你一笑，我的世界便有了好天气。",
    tag: "郁金香",
    color: "#f1cfad",
  },
  hydrangea: {
    title: "月光的拥抱",
    description: "把细碎的温柔，攒成一个拥抱。",
    tag: "绣球",
    color: "#b7c7ed",
  },
  wildflower: {
    title: "和你有个春天",
    description: "日子慢慢过，花和你慢慢爱。",
    tag: "花园",
    color: "#efc4b5",
  },
  peony: {
    title: "把盛大留给你",
    description: "最盛大的温柔，只为你层层盛开。",
    tag: "牡丹",
    color: "#efafc2",
  },
  lily: {
    title: "白昼的情书",
    description: "把清晨的光，折成一封写给你的信。",
    tag: "百合",
    color: "#f2ddcb",
  },
  sunflower: {
    title: "只向着你",
    description: "我的晴天，永远朝着你的方向。",
    tag: "向日葵",
    color: "#efc55b",
  },
  calla: {
    title: "温柔的回声",
    description: "一句喜欢，在岁月里轻轻回响。",
    tag: "马蹄莲",
    color: "#e6d8ef",
  },
};
let garden = null;
let activeId = "rose";
let selectionVersion = 0;
let manifest = null;
let fallbackMode = false;
let toastTimeout;
const cache = new Map();

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(
    () => $("toast").classList.remove("is-visible"),
    3400,
  );
}

async function fetchResource(url, type = "json") {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    type === "arrayBuffer" ? 45000 : 20000,
  );
  try {
    const resource = new URL(url, location.href);
    resource.searchParams.set("v", "3");
    const response = await fetch(resource, { signal: controller.signal });
    if (!response.ok) throw new Error(`Resource ${response.status}: ${url}`);
    return await response[type]();
  } finally {
    clearTimeout(timeout);
  }
}

function updateMotionButton() {
  const paused = !garden || garden.paused;
  $("motion-toggle").classList.toggle("is-paused", paused);
  $("motion-toggle").setAttribute("aria-pressed", String(paused));
  $("motion-toggle").setAttribute(
    "aria-label",
    paused ? "播放花束动画" : "暂停花束动画",
  );
  $("motion-toggle").title = paused ? "播放动画" : "暂停动画";
}

function showFallback() {
  fallbackMode = true;
  selectionVersion++;
  $("gallery").setAttribute("aria-busy", "false");
  fallback.hidden = false;
  fallback.src = `./assets/${activeId}.svg?v=3`;
  canvas.hidden = true;
  loading.classList.add("is-loaded");
  $("interaction-hint").textContent = "心意一直在，挑一束你喜欢的花。";
  updateMotionButton();
  $("motion-toggle").disabled = true;
  $("motion-toggle").setAttribute("aria-label", "当前为花束插画模式");
  document.body.dataset.mode = "illustration";
}

function updateCaption(id) {
  activeId = id;
  document.body.dataset.bouquet = id;
  const bouquet = bouquets[id];
  $("bouquet-title").textContent = bouquet.title;
  $("bouquet-description").textContent = bouquet.description;
  $("flower-tag").textContent = bouquet.tag;
  canvas.setAttribute(
    "aria-label",
    `${bouquet.title}粒子花束，拖动旋转，点击绽放，方向键旋转，空格绽放`,
  );
  fallback.alt = `${bouquet.title}立体花束投影`;
  document.documentElement.style.setProperty("--rose", bouquet.color);
  document.querySelectorAll("button[data-bouquet]").forEach((button) => {
    const selected = button.dataset.bouquet === id;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

async function loadBouquet(id) {
  if (cache.has(id)) return cache.get(id);
  const record = manifest.bouquets.find((bouquet) => bouquet.id === id);
  if (!record || record.file !== `${id}.bin` || record.surface !== `${id}.mesh`)
    throw new Error("Invalid bouquet manifest");
  const promise = Promise.all([
    fetchResource(`./assets/${record.file}`, "arrayBuffer"),
    fetchResource(`./assets/${record.surface}`, "arrayBuffer"),
  ])
    .then(([buffer, surfaceBuffer]) => {
      if (buffer.byteLength !== manifest.count * manifest.stride * 4)
        throw new Error("Invalid particle data length");
      const data = new Float32Array(buffer);
      for (const value of data)
        if (!Number.isFinite(value))
          throw new Error("Invalid particle coordinate");
      for (let i = 0; i < data.length; i += manifest.stride) {
        const normalLength = Math.hypot(data[i + 8], data[i + 9], data[i + 10]);
        if (normalLength < 0.95 || normalLength > 1.05)
          throw new Error("Invalid particle surface normal");
      }
      return { particles: data, surface: decodeSurface(surfaceBuffer) };
    })
    .catch((error) => {
      cache.delete(id);
      throw error;
    });
  cache.set(id, promise);
  return promise;
}

async function selectBouquet(id, immediate = false) {
  if (!Object.hasOwn(bouquets, id)) return;
  if (!manifest && !fallbackMode) {
    updateCaption(id);
    return;
  }
  const version = ++selectionVersion;
  if (fallbackMode) {
    updateCaption(id);
    fallback.src = `./assets/${id}.svg?v=3`;
    history.replaceState(null, "", `#${id}`);
    return;
  }
  $("gallery").setAttribute("aria-busy", "true");
  try {
    const data = await loadBouquet(id);
    if (version !== selectionVersion) return;
    garden.setBouquet(data.particles, immediate, data.surface);
    updateCaption(id);
    history.replaceState(null, "", `#${id}`);
    document.body.dataset.bouquet = id;
    loading.classList.add("is-loaded");
  } catch (error) {
    if (version !== selectionVersion) return;
    if (!garden?.data) showFallback();
    else toast("这束花还在路上，轻点再试一次。");
    console.warn("Bouquet load:", error.message);
  } finally {
    if (version === selectionVersion)
      $("gallery").setAttribute("aria-busy", "false");
  }
}

function bloom() {
  if (fallbackMode) {
    if (!motionQuery.matches)
      fallback.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.04)" },
          { transform: "scale(1)" },
        ],
        { duration: 1800, easing: "ease-in-out" },
      );
    toast("这束花，和全部的偏爱，都给你。");
    return;
  }
  if (!garden?.data) return;
  garden.bloom();
  updateMotionButton();
  if (garden.reducedMotion) toast("这束花，和全部的偏爱，都给你。");
}

async function loadGift() {
  try {
    const gift = await fetchResource("./gift.json");
    const params = new URLSearchParams(location.search);
    const recipient = params.get("to")?.slice(0, 60) || gift.recipient;
    if (typeof recipient === "string") $("recipient").textContent = recipient;
    if (typeof gift.salutation === "string")
      $("letter-salutation").textContent = params.has("to")
        ? `亲爱的${recipient}：`
        : gift.salutation;
    if (typeof gift.signature === "string")
      $("letter-signature").textContent =
        params.get("from")?.slice(0, 60) || gift.signature;
    const paragraphs = params.has("message")
      ? [params.get("message").slice(0, 2000)]
      : gift.letter;
    if (
      Array.isArray(paragraphs) &&
      paragraphs.every((p) => typeof p === "string")
    ) {
      $("letter-body").replaceChildren(
        ...paragraphs.map((text) => {
          const paragraph = document.createElement("p");
          paragraph.textContent = text;
          return paragraph;
        }),
      );
    }
  } catch {
    /* The built-in letter remains available offline or on a failed request. */
  }
}

const dialog = $("letter-dialog");
$("open-letter").addEventListener("click", () => {
  dialog.showModal();
  document.body.style.overflow = "hidden";
  document.querySelector(".unread-dot").hidden = true;
});
function unlockLetterScroll() {
  document.body.style.overflow = "";
}
function closeLetter() {
  dialog.close();
  unlockLetterScroll();
}
dialog.addEventListener("cancel", unlockLetterScroll);
dialog.addEventListener("close", unlockLetterScroll);
$("close-letter").addEventListener("click", closeLetter);
dialog.addEventListener("click", (event) => {
  const rect = dialog.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    closeLetter();
});
$("letter-bloom").addEventListener("click", () => {
  closeLetter();
  bloom();
});
$("bloom-button").addEventListener("click", bloom);
document
  .querySelectorAll("button[data-bouquet]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      selectBouquet(button.dataset.bouquet),
    ),
  );
$("motion-toggle").addEventListener("click", () => {
  if (!garden) return;
  garden.setPaused(!garden.paused);
  updateMotionButton();
});
motionQuery.addEventListener("change", (event) => {
  garden?.setReducedMotion(event.matches);
  updateMotionButton();
});

function setImmersive(value) {
  document.body.classList.toggle("is-immersive", value);
  $("fullscreen-toggle").setAttribute("aria-pressed", String(value));
  $("fullscreen-toggle").setAttribute(
    "aria-label",
    value ? "退出沉浸模式" : "进入沉浸模式",
  );
  $("fullscreen-toggle").title = value ? "退出沉浸模式" : "沉浸模式";
  // Hidden background controls must also leave the keyboard and accessibility tree.
  for (const selector of [
    ".site-header",
    ".intro",
    ".collection",
    ".site-footer",
  ])
    document.querySelector(selector).inert = value;
  document.body.style.overflow = value ? "hidden" : "";
  garden?.requestFrame();
}
$("fullscreen-toggle").addEventListener("click", () =>
  setImmersive(!document.body.classList.contains("is-immersive")),
);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    document.body.classList.contains("is-immersive")
  )
    setImmersive(false);
});
window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (Object.hasOwn(bouquets, id) && id !== activeId) selectBouquet(id);
});
$("share-button").addEventListener("click", async () => {
  const url = location.href;
  try {
    if (navigator.share)
      await navigator.share({
        title: "花间来信 · 给最爱的你",
        text: "花期有时，爱你无期。",
        url,
      });
    else {
      await navigator.clipboard.writeText(url);
      toast("花园链接已复制，把浪漫留在身边。");
    }
  } catch (error) {
    if (error.name !== "AbortError")
      toast("在浏览器菜单中收藏，就能随时回来。");
  }
});

async function initialize() {
  loadGift();
  const initialId = Object.hasOwn(bouquets, location.hash.slice(1))
    ? location.hash.slice(1)
    : "rose";
  updateCaption(initialId);
  try {
    garden = new ParticleGarden(canvas, {
      reducedMotion: motionQuery.matches,
      onLost: showFallback,
      onMotionChange: updateMotionButton,
    });
    updateMotionButton();
    manifest = await fetchResource("./assets/manifest.json");
    if (
      manifest.version !== 2 ||
      manifest.stride !== 11 ||
      !Array.isArray(manifest.bouquets) ||
      !Object.keys(bouquets).every((id) =>
        manifest.bouquets.some((entry) => entry.id === id),
      ) ||
      !Number.isSafeInteger(manifest.count) ||
      manifest.count < 1 ||
      manifest.count > 200000
    )
      throw new Error("Invalid manifest schema");
    await selectBouquet(activeId, true);
    // Larger all-around bouquets preload one neighbor, only on a fast connection.
    const connection = navigator.connection;
    if (
      !fallbackMode &&
      !connection?.saveData &&
      !/^(slow-)?[23]g$/.test(connection?.effectiveType ?? "")
    ) {
      const preload = () => {
        const ids = Object.keys(bouquets);
        const start = ids.indexOf(activeId);
        const id = ids[(start + 1) % ids.length];
        loadBouquet(id).catch(() => {});
      };
      if ("requestIdleCallback" in window)
        requestIdleCallback(preload, { timeout: 3000 });
      else setTimeout(preload, 1000);
    }
  } catch (error) {
    console.warn("Garden initialization:", error.message);
    showFallback();
  }
  document.body.dataset.ready = "true";
}
initialize();
