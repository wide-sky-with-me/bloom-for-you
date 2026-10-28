const $ = (id) => document.getElementById(id);
const root = $("experience");
const stage = $("stage");
const paper = $("letter");
const portrait = $("garden-space");
const openButton = $("open-letter");
const touchButton = $("garden-touch");
const closerButton = $("closer");
const replayButton = $("replay");
const media = window.matchMedia("(prefers-reduced-motion: reduce)");
const DURATION = 4800;
const clamp = (n) => Math.min(1, Math.max(0, n));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const phase = (p, start, end) => ease((p - start) / (end - start));
const listeners = [];
let state = "closed";
let playback = "idle";
let openingProgress = 0;
let sceneProgress = 0;
let reducedMotion = media.matches;
let closeup = false;
let disposed = false;
let frameID = 0;
let sequence = null;
let startTime = null;
let layout = {};
let controller = null;
let sceneAttempt = 0;
let sceneAbort = null;
let giftAttempt = 0;
let giftAbort = null;
let sceneState = "loading";
let giftState = "loading";
let pullPointer = null;
let touchSession = null;
let reactionPoint = { x: .5, y: .45 };
let lastReactionTime = -Infinity;
let keyboardOpening = false;
let observer = null;

function listen(target, event, handler, options) {
  target.addEventListener(event, handler, options);
  listeners.push(() => target.removeEventListener(event, handler, options));
}
function announce(text) { $("announcement").textContent = text; }
function updateControls() {
  const ready = sceneState === "ready" && state === "open" && playback === "idle";
  closerButton.disabled = !ready;
  replayButton.disabled = sceneState !== "ready" || state !== "open";
  replayButton.setAttribute("aria-disabled", String(!ready));
  touchButton.disabled = !ready || reducedMotion;
  replayButton.textContent = playback === "replaying" ? "花正在开" : "再看花开";
  $("interaction-hint").textContent = sceneState === "error" ? "花暂时没打开，信可以先读" : sceneState !== "ready" ? "花在准备，信可以先读" :
    reducedMotion ? "花已静静盛开" : playback === "replaying" ? "花正慢慢舒展" : "轻触花叶，会有小小回应";
  $("scene-message").hidden = state !== "open" || sceneState === "ready";
  $("retry-scene").hidden = sceneState !== "error";
  $("scene-message-text").textContent = sceneState === "error" ? "花景暂时没有打开。信仍然可以读。" : "花景还在准备，信已经可以读了。";
}
function setState(next) {
  state = next;
  document.body.dataset.state = next;
  openButton.setAttribute("aria-expanded", String(next !== "closed"));
  openButton.disabled = next !== "closed";
  paper.inert = next !== "open";
  paper.setAttribute("aria-hidden", String(next !== "open"));
  updateControls();
}
function setPlayback(next) {
  playback = next;
  document.body.dataset.playback = next;
  updateControls();
}

function measure() {
  if (disposed) return;
  const width = stage.clientWidth;
  const mobile = width <= 600;
  const closedHeight = Math.max(mobile ? 460 : 500, window.innerHeight - (mobile ? 98 : 108));
  const envelopeWidth = Math.min(mobile ? width - (width <= 350 ? 54 : 60) : width - 88, 590);
  const envelopeHeight = envelopeWidth / (mobile ? 1.22 : 1.52);
  const envelopeTop = Math.max(76, (closedHeight - envelopeHeight - 120) * .46);
  const paperTop = mobile ? 47 : 64;
  const overhang = mobile ? 20 : 38;
  root.style.setProperty("--portrait-overhang", `${overhang}px`);
  const paperHeight = paper.offsetHeight;
  layout = {
    closedHeight, openHeight: Math.max(closedHeight, paperHeight + paperTop + (mobile ? 68 : 100)),
    envelopeTop, envelopeEnd: paperTop + paperHeight - envelopeHeight * .68,
    paperStart: envelopeTop + 24, paperTop, gardenTop: paperTop - overhang,
    noteTop: Math.min(closedHeight - 85, envelopeTop + envelopeHeight + (mobile ? 57 : 67)),
  };
  root.style.setProperty("--envelope-top", `${envelopeTop}px`);
  root.style.setProperty("--note-top", `${layout.noteTop}px`);
  paintPaper(openingProgress);
}

// Paper completes first. All botanical stages consume the same master p in the scene.
function paintPaper(p) {
  openingProgress = clamp(p);
  const unfold = phase(p, .035, .34);
  const settle = phase(p, .09, .37);
  const styles = {
    "--paper-progress": unfold,
    "--flap-angle": `${-177 * phase(p, 0, .15)}deg`,
    "--paper-opacity": phase(p, .02, .08),
    "--paper-clip": `${76 * (1 - unfold)}%`,
    "--paper-rotate": `${mix(-5, -.65, unfold)}deg`,
    "--paper-scale": mix(.91, 1, unfold),
    "--paper-top": `${mix(layout.paperStart || 170, layout.paperTop || 64, unfold)}px`,
    "--garden-top": `${mix((layout.paperStart || 170) - 25, layout.gardenTop || 26, unfold)}px`,
    "--copy-opacity": phase(p, .84, .99),
    "--note-opacity": 1 - phase(p, 0, .10),
    "--envelope-y": `${((layout.envelopeEnd || 800) - (layout.envelopeTop || 150)) * settle}px`,
    "--envelope-rotate": `${mix(-7, 3.5, settle)}deg`,
    "--envelope-opacity": mix(1, .65, phase(p, .20, .38)),
    "--stage-height": `${mix(layout.closedHeight || 600, layout.openHeight || 1300, unfold)}px`,
  };
  for (const [name, value] of Object.entries(styles)) root.style.setProperty(name, String(value));
  // This is a visibility gate, never a scene-wide fade/scale masquerading as blooming.
  portrait.dataset.visible = String(p >= .10 || state === "open");
}
function setSceneProgress(p) {
  sceneProgress = clamp(p);
  controller?.setProgress(sceneProgress);
}
function finishSequence() {
  if (disposed || !sequence) return;
  const finished = sequence;
  cancelAnimationFrame(frameID);
  frameID = 0; sequence = null; startTime = null;
  setSceneProgress(1);
  if (finished === "opening") {
    paintPaper(1);
    setState("open");
    if (keyboardOpening) paper.focus({ preventScroll: true });
    announce("信打开了。花和信，都送给你。");
  } else announce("花已舒展，可以继续读信。");
  setPlayback("idle");
}
function tick(time) {
  if (disposed || !sequence) return;
  if (startTime === null) startTime = time;
  const p = clamp((time - startTime) / DURATION);
  if (sequence === "opening") paintPaper(p);
  setSceneProgress(p);
  if (p === 1) finishSequence();
  else frameID = requestAnimationFrame(tick);
}
function beginSequence(kind) {
  cancelAnimationFrame(frameID);
  frameID = 0; startTime = null; sequence = kind;
  if (reducedMotion || document.hidden) finishSequence();
  else { setSceneProgress(0); frameID = requestAnimationFrame(tick); }
}
function openLetter(event) {
  if (disposed || state !== "closed") return;
  keyboardOpening = event?.detail === 0;
  pullPointer = null;
  root.style.setProperty("--pull", "0px");
  setState("opening");
  paintPaper(0);
  beginSequence("opening");
}
function replayGarden() {
  if (disposed || state !== "open" || playback !== "idle" || sceneState !== "ready") return;
  closeup = false;
  controller?.setCloseup(false);
  closerButton.textContent = "近一点";
  closerButton.setAttribute("aria-pressed", "false");
  setPlayback("replaying");
  announce("再看一次花开，信会留在原处。");
  // Do not touch paper state, its text, focus or the reader's scroll position.
  beginSequence("replay");
}
function resetLetter() {
  if (disposed) return;
  cancelAnimationFrame(frameID);
  frameID = 0; sequence = null; startTime = null;
  closeup = false; touchSession = null; pullPointer = null;
  controller?.setCloseup(false);
  closerButton.textContent = "近一点";
  closerButton.setAttribute("aria-pressed", "false");
  root.style.setProperty("--pull", "0px");
  openButton.disabled = false;
  openButton.focus({ preventScroll: true });
  setState("closed"); setPlayback("idle");
  paintPaper(0); setSceneProgress(0);
  window.scrollTo({ top: 0, behavior: "instant" });
  announce("信已重新合好，可以再拆一次。");
}

function onSceneStatus(status, attempt) {
  if (disposed || attempt !== sceneAttempt) return;
  const next = typeof status === "string" ? status : status?.state || status?.status;
  if (next === "error" || next === "loading") sceneState = next;
  else if (next === "ready" && controller) sceneState = "ready";
  updateControls();
}
async function fetchJSON(path, signal) {
  const response = await fetch(path, { signal, cache: "no-cache", credentials: "same-origin" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 500000) throw new Error("Data too large");
  return JSON.parse(text);
}
function bounded(promise, signal, milliseconds) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true; clearTimeout(timer); signal.removeEventListener("abort", aborted); fn(value);
    };
    const aborted = () => finish(reject, new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(() => finish(reject, new Error("Garden preparation timed out")), milliseconds);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    promise.then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}
async function loadGift() {
  const attempt = ++giftAttempt;
  giftAbort?.abort(); giftAbort = new AbortController();
  const abort = giftAbort;
  const timeout = setTimeout(() => abort.abort(), 12000);
  giftState = "loading";
  $("letter-loading").hidden = false;
  $("letter-error").hidden = true;
  $("letter-copy").hidden = true;
  try {
    const gift = await fetchJSON("./gift.json", abort.signal);
    if (disposed || attempt !== giftAttempt) return;
    if (!gift || typeof gift.salutation !== "string" || typeof gift.signature !== "string" ||
      !Array.isArray(gift.letter) || !gift.letter.length || gift.letter.some((p) => typeof p !== "string")) throw new Error("Invalid letter");
    $("salutation").textContent = gift.salutation;
    $("signature").textContent = gift.signature;
    $("envelope-recipient").textContent = typeof gift.recipient === "string" ? gift.recipient : "";
    const fragment = document.createDocumentFragment();
    for (const text of gift.letter) {
      const paragraph = document.createElement("p"); paragraph.textContent = text; fragment.append(paragraph);
    }
    $("letter-body").replaceChildren(fragment);
    $("letter-copy").hidden = false; giftState = "ready";
  } catch {
    if (disposed || attempt !== giftAttempt) return;
    giftState = "error"; $("letter-error").hidden = false;
  } finally {
    clearTimeout(timeout);
    if (!disposed && attempt === giftAttempt) { $("letter-loading").hidden = true; measure(); }
  }
}
async function loadScene() {
  const attempt = ++sceneAttempt;
  sceneAbort?.abort(); controller?.dispose(); controller = null;
  sceneAbort = new AbortController();
  const abort = sceneAbort;
  sceneState = "loading"; updateControls();
  let pending = null;
  let expired = false;
  try {
    const work = (async () => {
      const module = await import("./garden-scene.js");
      if (disposed || abort.signal.aborted || attempt !== sceneAttempt || expired) return null;
      const createGardenScene = module.default || module.createGardenScene;
      if (typeof createGardenScene !== "function") throw new Error("Missing garden renderer");
      const scene = await createGardenScene($("garden-canvas"), {
        catalogURL: "./assets/catalog.json",
        onStatus: (status) => { if (!expired && !abort.signal.aborted) onSceneStatus(status, attempt); },
      });
      pending = scene;
      if (disposed || abort.signal.aborted || attempt !== sceneAttempt || expired) { scene?.dispose(); return null; }
      return scene;
    })();
    const scene = await bounded(work, abort.signal, 30000);
    if (!scene || disposed || attempt !== sceneAttempt) return;
    for (const method of ["setProgress", "setCloseup", "setReducedMotion", "react", "requestFrame", "getDiagnostics", "dispose"]) {
      if (typeof scene[method] !== "function") throw new Error(`Missing scene.${method}`);
    }
    controller = scene; pending = null;
    scene.setReducedMotion(reducedMotion); scene.setProgress(sceneProgress); scene.setCloseup(closeup); scene.requestFrame();
    sceneState = "ready"; updateControls();
  } catch {
    expired = true; pending?.dispose();
    if (disposed || attempt !== sceneAttempt) return;
    abort.abort(); controller?.dispose(); controller = null;
    sceneState = "error"; updateControls();
  }
}

function reactAt(point, force = false) {
  if (disposed || state !== "open" || playback !== "idle" || sceneState !== "ready" || reducedMotion || !controller) return;
  reactionPoint = { x: clamp(point.x), y: clamp(point.y) };
  const now = performance.now();
  if (!force && now - lastReactionTime < 240) return;
  const accepted = controller.react(reactionPoint);
  if (accepted === true) lastReactionTime = now;
}
function pointFromEvent(event) {
  const rect = touchButton.getBoundingClientRect();
  return { x: clamp((event.clientX - rect.left) / Math.max(1, rect.width)), y: clamp((event.clientY - rect.top) / Math.max(1, rect.height)) };
}
function onGardenClick(event) {
  if (event.detail !== 0 && touchSession?.cancelled) { touchSession = null; return; }
  const point = event.detail === 0 ? reactionPoint : pointFromEvent(event);
  touchSession = null;
  reactAt(point, event.detail === 0);
}
function onGardenKey(event) {
  const directions = { ArrowLeft: [-.08, 0], ArrowRight: [.08, 0], ArrowUp: [0, -.08], ArrowDown: [0, .08] };
  const delta = directions[event.key];
  if (!delta || touchButton.disabled) return;
  event.preventDefault(); touchSession = null;
  reactAt({ x: reactionPoint.x + delta[0], y: reactionPoint.y + delta[1] }, true);
}
function onGardenDown(event) {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
  touchSession = { id: event.pointerId, x: event.clientX, y: event.clientY, type: event.pointerType, cancelled: false };
}
function onGardenMove(event) {
  if (!touchSession || touchSession.id !== event.pointerId) return;
  if (touchSession.type === "touch") {
    if (Math.abs(event.clientY - touchSession.y) > 10 || Math.abs(event.clientX - touchSession.x) > 18) touchSession.cancelled = true;
    return; // Native vertical scrolling always wins; no preventDefault or capture.
  }
  if (event.buttons === 1) reactAt(pointFromEvent(event));
}
function onPullDown(event) {
  if (state !== "closed" || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
  pullPointer = { id: event.pointerId, y: event.clientY };
  openButton.setPointerCapture?.(event.pointerId);
}
function onPullMove(event) {
  if (!pullPointer || pullPointer.id !== event.pointerId || state !== "closed") return;
  const distance = Math.max(0, pullPointer.y - event.clientY);
  root.style.setProperty("--pull", `${Math.min(distance * .25, 11)}px`);
  if (distance >= 32) openLetter(event);
}
function releasePull(event) {
  if (pullPointer?.id !== event.pointerId) return;
  pullPointer = null; root.style.setProperty("--pull", "0px");
}
function onMotionChange(event) {
  reducedMotion = event.matches;
  controller?.setReducedMotion(reducedMotion);
  if (reducedMotion && sequence) finishSequence();
  updateControls();
}
function dispose() {
  if (disposed) return;
  disposed = true; sceneAttempt++; giftAttempt++;
  cancelAnimationFrame(frameID); frameID = 0; sequence = null;
  sceneAbort?.abort(); giftAbort?.abort(); observer?.disconnect();
  controller?.dispose(); controller = null; pullPointer = null; touchSession = null;
  for (const remove of listeners.splice(0)) remove();
}

listen(openButton, "click", openLetter);
listen(openButton, "pointerdown", onPullDown);
listen(openButton, "pointermove", onPullMove);
listen(openButton, "pointerup", releasePull);
listen(openButton, "pointercancel", releasePull);
listen($("reread"), "click", resetLetter);
listen(replayButton, "click", replayGarden);
listen($("retry-letter"), "click", loadGift);
listen($("retry-scene"), "click", loadScene);
listen(touchButton, "click", onGardenClick);
listen(touchButton, "keydown", onGardenKey);
listen(touchButton, "pointerdown", onGardenDown);
listen(touchButton, "pointermove", onGardenMove);
listen(touchButton, "pointercancel", () => { touchSession = null; });
listen(closerButton, "click", () => {
  if (state !== "open" || playback !== "idle" || !controller || sceneState !== "ready") return;
  closeup = !closeup; controller.setCloseup(closeup);
  closerButton.textContent = closeup ? "回到信边" : "近一点";
  closerButton.setAttribute("aria-pressed", String(closeup));
  const top = stage.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? "instant" : "smooth" });
});
listen(window, "resize", measure, { passive: true });
listen(document, "visibilitychange", () => {
  if (document.hidden && sequence) finishSequence();
  if (!document.hidden) controller?.requestFrame();
});
if (media.addEventListener) listen(media, "change", onMotionChange);
else { media.addListener(onMotionChange); listeners.push(() => media.removeListener(onMotionChange)); }
listen(window, "pagehide", dispose);
window.addEventListener("pageshow", (event) => { if (event.persisted && disposed) window.location.reload(); });
if (typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(measure); observer.observe($("letter-content")); }
window.__letterGarden = Object.freeze({
  getDiagnostics: () => ({ state, playback, openingProgress, sceneProgress, sequence, reducedMotion, closeup, giftState, sceneState, disposed, scene: controller?.getDiagnostics() || null }),
  dispose,
});
measure(); setState("closed"); setPlayback("idle"); loadGift(); loadScene();
