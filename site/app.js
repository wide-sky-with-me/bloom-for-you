import { ParticleGarden } from "./particles.js?v=7";

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
    color: "#e2b49a",
  },
  tulip: {
    title: "把晴天给你",
    description: "你一笑，我的世界便有了好天气。",
    tag: "郁金香",
    color: "#e8d7b9",
  },
  hydrangea: {
    title: "月光的拥抱",
    description: "把细碎的温柔，攒成一个拥抱。",
    tag: "绣球",
    color: "#c7c9c4",
  },
  wildflower: {
    title: "和你有个春天",
    description: "日子慢慢过，花和你慢慢爱。",
    tag: "花园",
    color: "#d6c3ac",
  },
  peony: {
    title: "把盛大留给你",
    description: "最盛大的温柔，只为你层层盛开。",
    tag: "牡丹",
    color: "#d5b1a9",
  },
  lily: {
    title: "白昼的情书",
    description: "把清晨的光，折成一封写给你的信。",
    tag: "百合",
    color: "#eadfc9",
  },
  sunflower: {
    title: "只向着你",
    description: "我的晴天，永远朝着你的方向。",
    tag: "向日葵",
    color: "#d8c08a",
  },
  calla: {
    title: "温柔的回声",
    description: "一句喜欢，在岁月里轻轻回响。",
    tag: "马蹄莲",
    color: "#d4cbcf",
  },
};
const flowerNames = Object.freeze({
  rose: '玫瑰', tulip: '郁金香', hydrangea: '绣球', cosmos: '波斯菊',
  peony: '牡丹', lily: '百合', sunflower: '向日葵', calla: '马蹄莲',
  ranunculus: '洋牡丹', dahlia: '大丽花', lisianthus: '洋桔梗',
  champagne_ranunculus: '洋牡丹', garden_rose: '花园玫瑰',
  anemone: '银莲花', sweet_pea: '香豌豆',
});
const closeupNames = Object.freeze({
  champagne_ranunculus: '洋牡丹', garden_rose: '花园玫瑰',
  anemone: '银莲花', sweet_pea: '香豌豆',
});
let garden = null;
let activeId = 'rose';
let activeView = 'bouquet';
let requestedId = activeId;
let requestedView = activeView;
let selectionVersion = 0;
let motionPreference = null;
let systemMotionChange = false;
let manifest = null;
let fallbackMode = false;
let hasCommitted = false;
let disposed = false;
let currentRequest = null;
let preloadRequest = null;
let toastTimeout;
const cache = new Map();
const RAW_CACHE_LIMIT = 4;

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(
    () => $("toast").classList.remove("is-visible"),
    3400,
  );
}

function resourceURL(url) {
  const resource = new URL(url, location.href);
  resource.searchParams.set('v', '7');
  return resource;
}

async function fetchResource(url, type = 'json', signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, type === 'arrayBuffer' ? 45000 : 20000);
  try {
    const response = await fetch(resourceURL(url), {signal: controller.signal});
    if (!response.ok) throw new Error(`Resource ${response.status}: ${url}`);
    return await response[type]();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
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

function validComposition(record) {
  const expected = record.headCount ?? 36;
  const items = record.composition;
  return Number.isSafeInteger(expected) && expected > 0 && Array.isArray(items)
    && items.length > 0 && items.length <= 12
    && items.every(item => item && Object.hasOwn(flowerNames, item.species)
      && Number.isSafeInteger(item.count) && item.count > 0)
    && new Set(items.map(item => item.species)).size === items.length
    && items.reduce((sum, item) => sum + item.count, 0) === expected;
}

function validateManifest(value) {
  if (!value || value.version !== 2 || value.count !== 120000 || value.stride !== 11
      || !Array.isArray(value.bouquets) || value.bouquets.length !== Object.keys(bouquets).length
      || new Set(value.bouquets.map(record => record?.id)).size !== value.bouquets.length)
    throw new Error('Invalid manifest schema');
  for (const record of value.bouquets) {
    if (!record || !Object.hasOwn(bouquets, record.id)) throw new Error('Invalid bouquet id');
    validatePaths(record, record.id);
    if ((record.headCount !== undefined || record.composition !== undefined) && !validComposition(record))
      throw new Error('Invalid bouquet composition');
  }
  if (value.closeups !== undefined) {
    if (!Array.isArray(value.closeups) || value.closeups.length !== Object.keys(closeupNames).length
        || new Set(value.closeups.map(record => record?.id)).size !== value.closeups.length)
      throw new Error('Invalid closeup manifest');
    for (const record of value.closeups) {
      if (!record || !Object.hasOwn(closeupNames, record.id) || record.pointCount !== 16000
          || typeof record.title !== 'string' || !record.title.trim() || record.title.length > 100
          || typeof record.description !== 'string' || record.description.length > 300)
        throw new Error('Invalid closeup record');
      validatePaths(record, `closeup-${record.id}`);
    }
  }
  return value;
}

function validatePaths(record, prefix) {
  if (record.file !== `${prefix}.bin` || record.surface !== `${prefix}.mesh`
      || record.growth !== `${prefix}.growth` || (record.svg !== undefined && record.svg !== `${prefix}.svg`))
    throw new Error('Invalid bouquet resource paths');
}

function closeupRecord(id) { return manifest?.closeups?.find(record => record.id === id); }
function assetRecord(id, view) {
  return view === 'bouquet' ? manifest?.bouquets.find(record => record.id === id) : closeupRecord(view);
}
function assetKey(id, view) { return view === 'bouquet' ? `bouquet:${id}` : `closeup:${view}`; }
function fallbackPath(id, view) {
  return view === 'bouquet' ? (assetRecord(id, view)?.svg ?? `${id}.svg`) : closeupRecord(view)?.svg;
}

function syncViewControls() {
  let unavailable = false;
  document.querySelectorAll('button[data-view]').forEach(button => {
    const view = button.dataset.view;
    const available = view === 'bouquet' || (!!closeupRecord(view) && (!fallbackMode || !!fallbackPath(activeId, view)));
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(view === activeView));
    button.classList.toggle('is-selected', view === activeView);
    if (view !== 'bouquet' && !available) unavailable = true;
  });
  $('view-note').textContent = fallbackMode && unavailable
    ? '当前为花束插画；未提供插画的单花暂不支持近看，仍可挑选下方八束花。'
    : '近看一朵花，也能再回到这束心意。';
}

function updateCaption(id, view = 'bouquet') {
  activeId = id;
  activeView = view;
  const bouquet = bouquets[id], specimen = view === 'bouquet' ? bouquet : closeupRecord(view);
  document.body.dataset.bouquet = id;
  document.body.dataset.view = view;
  $('bouquet-title').textContent = specimen.title;
  $('bouquet-description').textContent = specimen.description;
  $('flower-tag').textContent = view === 'bouquet' ? bouquet.tag : '近看';
  const record = assetRecord(id, 'bouquet');
  const composition = record && validComposition(record) ? record.composition : null;
  const ingredients = $('bouquet-ingredients');
  ingredients.textContent = composition ? `花材：${composition.map(item => flowerNames[item.species]).join('、')}` : '';
  ingredients.setAttribute('aria-label', composition
    ? `本束花材：${composition.map(item => `${flowerNames[item.species]}${item.count}朵`).join('、')}` : '');
  canvas.setAttribute('aria-label', `${specimen.title}立体${view === 'bouquet' ? '花束' : '单花'}，拖动旋转，点击绽放，方向键旋转，空格绽放`);
  fallback.alt = `${specimen.title}${view === 'bouquet' ? '花束' : '单花'}投影`;
  document.documentElement.style.setProperty('--rose', bouquet.color);
  document.querySelectorAll('button[data-bouquet]').forEach(button => {
    const selected = button.dataset.bouquet === id;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  syncViewControls();
}

function updateLocation(id, view) {
  const url = new URL(location.href);
  url.hash = id;
  if (view === 'bouquet') url.searchParams.delete('view');
  else url.searchParams.set('view', view);
  history.replaceState(null, '', url.href);
}

function setPending(id, view, pending) {
  document.body.dataset.requestedBouquet = id;
  document.body.dataset.requestedView = view;
  document.querySelectorAll('button[data-bouquet]').forEach(button => {
    button.dataset.pending = String(pending && button.dataset.bouquet === id);
  });
  document.querySelectorAll('button[data-view]').forEach(button => {
    button.dataset.pending = String(pending && button.dataset.view === view);
  });
}

function cancelSelection() {
  currentRequest?.abort();
  preloadRequest?.abort();
  garden?.cancelPreparation();
}

async function feedbackPaint() {
  await new Promise(resolve => {
    if (document.hidden) return setTimeout(resolve, 0);
    let frame;
    const timer = setTimeout(() => { cancelAnimationFrame(frame); resolve(); }, 80);
    frame = requestAnimationFrame(() => { clearTimeout(timer); setTimeout(resolve, 0); });
  });
}

async function loadAsset(id, view, signal) {
  const key = assetKey(id, view);
  if (cache.has(key)) {
    const cached = cache.get(key);
    cache.delete(key); cache.set(key, cached);
    return cached;
  }
  const record = assetRecord(id, view);
  if (!record) throw new Error('Unavailable flower view');
  const buffers = await Promise.all([record.file, record.surface, record.growth]
    .map(file => fetchResource(`./assets/${file}`, 'arrayBuffer', signal)));
  if (signal?.aborted) throw new DOMException('Selection superseded', 'AbortError');
  const input = {buffers, count: view === 'bouquet' ? manifest.count : record.pointCount, stride: manifest.stride};
  cache.set(key, input);
  while (cache.size > RAW_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return input;
}

function loadIllustration(file, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let timer, settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      image.onload = image.onerror = null;
      if (error) reject(error); else resolve(image.src);
    };
    const abort = () => { finish(new DOMException('Illustration aborted', 'AbortError')); image.src = ''; };
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) return abort();
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Illustration unavailable'));
    timer = setTimeout(() => finish(new Error('Illustration timed out')), 20000);
    image.src = resourceURL(`./assets/${file}`).href;
  });
}

async function showFallback() {
  if (disposed) return;
  const id = hasCommitted ? activeId : requestedId;
  let view = hasCommitted ? activeView : requestedView;
  if (!fallbackPath(id, view)) view = 'bouquet';
  fallbackMode = true;
  selectionVersion++;
  cancelSelection();
  garden?.dispose();
  cache.clear();
  canvas.hidden = true;
  $('motion-toggle').disabled = true;
  $('motion-toggle').setAttribute('aria-label', '当前为花束插画模式');
  document.body.dataset.mode = 'illustration';
  syncViewControls();
  await selectScene(id, view, true);
}

async function selectScene(id, view = 'bouquet', immediate = false) {
  if (disposed || !Object.hasOwn(bouquets, id)
      || (view !== 'bouquet' && !Object.hasOwn(closeupNames, view))) return false;
  if (view !== 'bouquet' && ((manifest && !closeupRecord(view)) || (fallbackMode && !fallbackPath(id, view)))) {
    toast('这朵花暂不支持近看，可以先看看整束。');
    return false;
  }
  const version = ++selectionVersion;
  requestedId = id; requestedView = view;
  cancelSelection();
  const gallery = $('gallery'), hint = $('interaction-hint');
  gallery.setAttribute('aria-busy', 'true');
  gallery.dataset.prepareState = 'preparing';
  setPending(id, view, true);
  $('gallery-error').hidden = true;
  const name = view === 'bouquet' ? bouquets[id].tag : closeupNames[view];
  hint.textContent = `正在准备${name}，眼前的花仍为你盛开。`;
  // Remember startup intent; the manifest continuation uses this same route.
  if (!manifest && !fallbackMode) return false;
  const controller = new AbortController();
  currentRequest = controller;
  if (!hasCommitted) loading.classList.remove('is-loaded');
  try {
    await feedbackPaint();
    if (version !== selectionVersion || disposed) return false;
    if (fallbackMode) {
      const file = fallbackPath(id, view);
      await loadIllustration(file, controller.signal);
      if (version !== selectionVersion || disposed) return false;
      fallback.src = `./assets/${file}?v=7`;
      fallback.hidden = false;
    } else {
      const input = await loadAsset(id, view, controller.signal);
      if (version !== selectionVersion || disposed) return false;
      const prepared = await garden.prepareBouquet(assetKey(id, view), input);
      if (version !== selectionVersion || disposed) return false;
      // A change of specimen/count is an explicit static view, not a pause toggle.
      await garden.queuePrepared(prepared, immediate || view !== activeView || !hasCommitted, () => {
        if (version !== selectionVersion) return;
        gallery.dataset.prepareState = 'waiting';
        hint.textContent = `已备好${name}，等眼前这次交叠轻轻结束。`;
      });
      if (version !== selectionVersion || disposed) return false;
    }
    updateCaption(id, view);
    updateLocation(id, view);
    hasCommitted = true;
    gallery.dataset.prepareState = 'committed';
    hint.textContent = fallbackMode ? '心意一直在，挑一束你喜欢的花。' : '拖动看看花的另一面，轻点让心意再绽放。';
    loading.classList.add('is-loaded');
    if (!fallbackMode) updateMotionButton();
    return true;
  } catch (error) {
    // A current timeout is a real failure, not a superseded selection.
    if (version !== selectionVersion || disposed) return false;
    controller.abort();
    cache.delete(assetKey(id, view));
    gallery.dataset.prepareState = 'error';
    if (!fallbackMode && !garden?.data) await showFallback();
    else {
      hint.textContent = '眼前的花还在，轻点再试一次。';
      toast('这朵花还在路上，轻点再试一次。');
      if (!hasCommitted) {
        loading.classList.add('is-loaded');
        $('gallery-error').hidden = false;
      }
    }
    console.warn('Flower view:', error.message);
    return false;
  } finally {
    if (currentRequest === controller) currentRequest = null;
    if (version === selectionVersion && !disposed) {
      gallery.setAttribute('aria-busy', 'false');
      setPending(id, view, false);
    }
  }
}

function selectBouquet(id, immediate = false) { return selectScene(id, 'bouquet', immediate); }
function selectView(view) { return selectScene(requestedId, view); }

function bloom() {
  if (fallbackMode) {
    if (!motionQuery.matches && motionPreference !== true)
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
document.querySelectorAll('button[data-view]').forEach(button =>
  button.addEventListener('click', () => selectView(button.dataset.view)));
$('retry-bouquet').addEventListener('click', () => selectScene(requestedId, requestedView, true));
$('motion-toggle').addEventListener('click', () => {
  if (!garden || fallbackMode) return;
  const paused = !garden.paused;
  if (!paused && garden.reducedMotion) garden.setReducedMotion(false);
  garden.setPaused(paused);
  motionPreference = paused;
  updateMotionButton();
});
motionQuery.addEventListener('change', event => {
  if (!garden || fallbackMode) return;
  const paused = event.matches || (motionPreference ?? false);
  systemMotionChange = true;
  try { garden.setReducedMotion(event.matches); garden.setPaused(paused); }
  finally { systemMotionChange = false; }
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
  if (Object.hasOwn(bouquets, id)) selectBouquet(id);
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

function disposePage(event) {
  if (event?.persisted || disposed) return;
  disposed = true;
  selectionVersion++;
  cancelSelection();
  cache.clear();
  clearTimeout(toastTimeout);
  garden?.dispose();
}
window.addEventListener('pagehide', disposePage);

async function initialize() {
  loadGift();
  const initialId = Object.hasOwn(bouquets, location.hash.slice(1)) ? location.hash.slice(1) : 'rose';
  requestedId = initialId;
  const viewParam = new URLSearchParams(location.search).get('view');
  requestedView = Object.hasOwn(closeupNames, viewParam) ? viewParam : 'bouquet';
  updateCaption(initialId, 'bouquet');
  let rendererError;
  try {
    garden = new ParticleGarden(canvas, {
      reducedMotion: motionQuery.matches,
      onLost: () => { void showFallback(); },
      onMotionChange: paused => {
        if (!systemMotionChange) motionPreference = paused;
        updateMotionButton();
      },
    });
    updateMotionButton();
  } catch (error) { rendererError = error; }
  try {
    manifest = validateManifest(await fetchResource('./assets/manifest.json'));
    if (disposed) return;
    syncViewControls();
    if (requestedView !== 'bouquet' && !closeupRecord(requestedView)) requestedView = 'bouquet';
    if (rendererError) await showFallback();
    else await selectScene(requestedId, requestedView, true);
    const connection = navigator.connection;
    if (!fallbackMode && !connection?.saveData && !/^(slow-)?[23]g$/.test(connection?.effectiveType ?? '')) {
      const preload = async () => {
        if (disposed || fallbackMode || $('gallery').getAttribute('aria-busy') === 'true') return;
        const ids = Object.keys(bouquets), id = ids[(ids.indexOf(activeId) + 1) % ids.length];
        const version = selectionVersion, controller = new AbortController();
        preloadRequest = controller;
        try {
          const input = await loadAsset(id, 'bouquet', controller.signal);
          if (version === selectionVersion && !disposed && !fallbackMode && !controller.signal.aborted
              && $('gallery').getAttribute('aria-busy') !== 'true')
            await garden.prepareBouquet(assetKey(id, 'bouquet'), input);
        } catch { /* Optional prefetch never changes the chosen flower or its status. */ }
        finally { if (preloadRequest === controller) preloadRequest = null; }
      };
      if ('requestIdleCallback' in window) requestIdleCallback(preload, {timeout: 3000});
      else setTimeout(preload, 1000);
    }
  } catch (error) {
    if (disposed) return;
    console.warn('Garden initialization:', error.message);
    await showFallback();
  } finally {
    if (!disposed) document.body.dataset.ready = 'true';
  }
}
initialize();
