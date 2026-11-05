/* ============================================================
   VR viewer: owns the overlay, the desktop orbit preview and the
   WebXR session. The 3D scene itself lives in scene.js; the game
   is driven through engineApi (commands in, state snapshot out).
   ============================================================ */

import { createScene } from "./scene.js";
import { engineApi } from "../game/engine.js";
import { TABLE_LIST } from "../game/tables.js";
import { audio } from "../audio.js";
import {
  invertRigid,
  lookAt,
  multiply,
  normalize3,
  perspective,
  rotationY,
  transformDirection,
  transformPoint,
  translation,
} from "./math.js";

const VFOV = (54 * Math.PI) / 180;
/* Seated framing: the camera sits where the player's head is, looking at the
   lower half of the board. */
const TARGET = [0, 1.02, 0.22];
/* Preview camera distance for standing behind the stool / sitting on it. */
const PREVIEW_STANDING = 1.63;
const PREVIEW_SEATED = 1.09;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Cabinet distance from the player: on the stool, or standing behind it. */
const XR_SEATED = 1.31;
const XR_STANDING = 1.85;

/** Desktop orbit camera limits. */
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.4;

/** Portrait screens need to sit further back or the deck is clipped. */
function defaultZoom() {
  const rect = dom.canvas?.getBoundingClientRect();
  const aspect = rect ? rect.width / Math.max(rect.height, 1) : 1;
  return aspect < 0.8 ? 1.85 : 1;
}

/* The VR room: every machine stands in a row, all of them unlocked. */
const CABINET_SPACING = 1.15;
const cabinets = TABLE_LIST.map((table, index) => ({
  id: table.id,
  name: table.name,
  accent: table.palette?.primary || "#e7b566",
  x: (index - (TABLE_LIST.length - 1) / 2) * CABINET_SPACING,
}));
let activeIndex = Math.floor(cabinets.length / 2);
let cabinetModels = [];
let kioskModel = null;
let lastPose = null;
let resetHoldStart = 0;
/* True while the room is framed around the row centre instead of the active
   machine (the state the reset gesture returns to). */
let rowCentered = false;
let leaveArmedUntil = 0;
let hoverIndex = -1;
let bHoldStart = 0;
let bCharged = false;

const KIOSK_X = cabinets[0].x - 1.15;

const dom = {};
let scene = null;
let mode = "off"; // off | preview | xr
let rafId = 0;
let lastUpload = 0;
let resizeObserver = null;

const cam = { yaw: 0.12, pitch: 0.12, zoom: 1 };
let lastCamera = null;

let xr = null; // { session, layer, refSpace, floorSpace, model }

/* Interaction state shared by mouse and controllers. */
let hoverId = null;
let pressedId = null;
let pressedSource = null;
let leverGrab = null; // { y } in cabinet-local space
let endArmedUntil = 0;
let activeRay = null;
let feederNext = 0;
let lastFrameTime = 0;
let seated = false;
let targetDistance = XR_STANDING;
let snapReadyAt = 0;
let shopMessage = "";
const aButtons = new Map();
const xrRays = new Map(); // inputSource -> { origin, direction }

/* ── DOM ─────────────────────────────────────────────────── */

function collectDom() {
  if (dom.root) return true;
  dom.root = document.getElementById("vrScreen");
  dom.canvas = document.getElementById("vrCanvas");
  dom.hint = document.getElementById("vrHint");
  dom.note = document.getElementById("vrNote");
  dom.enter = document.getElementById("vrEnter");
  dom.exit = document.getElementById("vrExit");
  if (!dom.root || !dom.canvas) return false;
  return true;
}

function boardCanvas() {
  return document.getElementById("board");
}

function setNote(text) {
  if (dom.note) dom.note.textContent = text;
}

function setHint(text) {
  if (dom.hint) dom.hint.textContent = text;
}

/* ── Camera ──────────────────────────────────────────────── */

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cameraMatrices(width, height) {
  const aspect = width / Math.max(height, 1);
  const distance = (seated ? PREVIEW_SEATED : PREVIEW_STANDING) * cam.zoom;
  const cosPitch = Math.cos(cam.pitch);
  const eye = [
    TARGET[0] + Math.sin(cam.yaw) * cosPitch * distance,
    TARGET[1] + Math.sin(cam.pitch) * distance,
    TARGET[2] + Math.cos(cam.yaw) * cosPitch * distance,
  ];
  const forward = normalize3([TARGET[0] - eye[0], TARGET[1] - eye[1], TARGET[2] - eye[2]]);
  const right = normalize3(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return {
    eye,
    forward,
    right,
    up,
    projection: perspective(VFOV, aspect, 0.05, 40),
    view: lookAt(eye, TARGET, [0, 1, 0]),
  };
}

function mouseRay(clientX, clientY) {
  if (!lastCamera) return null;
  const rect = dom.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const halfV = Math.tan(VFOV / 2);
  const halfH = halfV * (rect.width / rect.height);
  const direction = normalize3([
    lastCamera.forward[0] + lastCamera.right[0] * ndcX * halfH + lastCamera.up[0] * ndcY * halfV,
    lastCamera.forward[1] + lastCamera.right[1] * ndcX * halfH + lastCamera.up[1] * ndcY * halfV,
    lastCamera.forward[2] + lastCamera.right[2] * ndcX * halfH + lastCamera.up[2] * ndcY * halfV,
  ]);
  return { origin: lastCamera.eye, direction };
}

/* ── Picking and controls ────────────────────────────────── */

function buildCabinetModels(rig) {
  const offset = rowCentered ? 0 : cabinets[activeIndex].x;
  cabinetModels = cabinets.map((cabinet) => {
    const local = translation(cabinet.x - offset, 0, 0);
    return rig ? multiply(rig, local) : local;
  });
  const kioskLocal = translation(KIOSK_X, 0, 0);
  kioskModel = rig ? multiply(rig, kioskLocal) : kioskLocal;
  if (xr) xr.model = cabinetModels[activeIndex];
}

function currentModel() {
  return cabinetModels[activeIndex] || IDENTITY;
}

function toLocalOn(model, ray) {
  if (!model || !ray) return null;
  const inverse = invertRigid(model);
  return {
    origin: transformPoint(inverse, ray.origin),
    direction: normalize3(transformDirection(inverse, ray.direction)),
  };
}

function toLocal(ray) {
  return toLocalOn(currentModel(), ray);
}

/** Nearest hit across every machine in the room. */
function pickTarget(ray) {
  // Controls on the active machine always win: the neighbours' "sit" volumes
  // are large spheres that can graze the lever of the machine you're at.
  const activeLocal = toLocalOn(cabinetModels[activeIndex], ray);
  if (activeLocal) {
    const activeHit = scene.hitTestRay(activeLocal.origin, activeLocal.direction, true);
    if (activeHit && activeHit.id !== "cabinet") {
      return { index: activeIndex, id: activeHit.id, t: activeHit.t };
    }
  }

  let best = null;
  for (let index = 0; index < cabinets.length; index += 1) {
    const local = toLocalOn(cabinetModels[index], ray);
    if (!local) continue;
    const hit = scene.hitTestRay(local.origin, local.direction, index === activeIndex);
    if (!hit) continue;
    if (!best || hit.t < best.t) best = { index, id: hit.id, t: hit.t };
  }
  const kioskLocal = toLocalOn(kioskModel, ray);
  if (kioskLocal) {
    const hit = scene.hitTestKiosk(kioskLocal.origin, kioskLocal.direction);
    if (hit && (!best || hit.t < best.t)) best = { index: -1, id: hit.id, t: hit.t };
  }
  return best;
}

function pickControl(ray) {
  const local = toLocal(ray);
  if (!local) return null;
  return scene.hitTest(local.origin, local.direction);
}

/**
 * Z where the ray crosses the plane of the plunger knob. Pulling the hand back
 * (or dragging the mouse down in the preview) increases this value.
 */
function leverPullReference(ray) {
  const local = toLocal(ray);
  if (!local) return null;
  const dy = local.direction[1];
  if (Math.abs(dy) < 0.0001) return null;
  const t = (scene.lever.y - local.origin[1]) / dy;
  if (!Number.isFinite(t) || t <= 0) return null;
  return local.origin[2] + local.direction[2] * t;
}

function trigger(id) {
  if (id === "start") engineApi.startRound();
}

function press(source, ray) {
  if (pressedId) return false;
  const target = pickTarget(ray);
  if (!target) return false;
  const id = target.id;

  if (id === "refresh") {
    window.location.reload();
    return true;
  }
  if (id === "shop") {
    audio.init();
    const result = engineApi.shopExchange();
    shopMessage = result?.message || "";
    if (result?.ok) audio.ticket();
    return true;
  }
  if (id === "cabinet" || id === "stool") {
    sitAt(target.index);
    return true;
  }
  if (target.index !== activeIndex) return false;
  if (!scene.isEnabled(id)) return false;

  activeRay = ray;
  feederNext = 0;

  if (id === "lever") {
    if (!engineApi.leverGrab()) return false;
    const reference = leverPullReference(ray);
    if (reference === null) {
      engineApi.leverCancel();
      return false;
    }
    leverGrab = { z: reference };
    scene.setLeverPull(0);
  } else if (id === "end") {
    const now = performance.now();
    if (now < endArmedUntil) {
      endArmedUntil = 0;
      if (engineApi.cashOut()) closeVR();
      return true;
    }
    endArmedUntil = now + 3000;
    return true;
  } else {
    trigger(id);
  }

  pressedId = id;
  pressedSource = source;
  hoverId = id;
  hoverIndex = target.index;
  scene.setControlState({ pressed: id, hover: id, hoverIndex: target.index });
  return true;
}

function release(source) {
  if (!pressedId || source !== pressedSource) return;
  if (pressedId === "lever") {
    engineApi.leverRelease();
    scene.releaseLever();
    leverGrab = null;
  }
  pressedId = null;
  pressedSource = null;
  activeRay = null;
  scene.setControlState({ pressed: null });
}

function dragLever(ray) {
  if (pressedId !== "lever" || !leverGrab) return;
  const reference = leverPullReference(ray);
  if (reference === null) return;
  const pull = clamp(reference - leverGrab.z, 0, scene.lever.travel);
  scene.setLeverPull(pull);
  engineApi.leverPull(pull / scene.lever.travel);
}

/** Active machine first (the scene uses it for the floor and HUD). */
function roomCabinets() {
  const list = [{ model: cabinetModels[activeIndex], live: true, index: activeIndex }];
  for (let index = 0; index < cabinets.length; index += 1) {
    if (index !== activeIndex) {
      list.push({ model: cabinetModels[index], live: false, index });
    }
  }
  list.push({ model: kioskModel, live: false, kind: "shop" });
  return list;
}

function updateHover(ray) {
  const target = pickTarget(ray);
  const id = target ? target.id : null;
  const index = target ? target.index : -1;
  if (id === hoverId && index === hoverIndex) return;
  hoverId = id;
  hoverIndex = index;
  scene.setControlState({ hover: id, hoverIndex: index });
}

/* ── State → deck ────────────────────────────────────────── */

/** QA helper: project a deck control to CSS pixels inside the overlay. */
function projectControl(id) {
  if (!scene || !lastCamera) return null;
  const kioskLocal = scene.kioskCenter(id);
  const local = kioskLocal || scene.controlCenter(id);
  if (!local) return null;
  const sourceModel = kioskLocal ? kioskModel : currentModel();
  const world = sourceModel ? transformPoint(sourceModel, local) : local;
  const view = transformPoint(lastCamera.view, world);
  const p = lastCamera.projection;
  const clipX = p[0] * view[0] + p[4] * view[1] + p[8] * view[2] + p[12];
  const clipY = p[1] * view[0] + p[5] * view[1] + p[9] * view[2] + p[13];
  const clipW = p[3] * view[0] + p[7] * view[1] + p[11] * view[2] + p[15];
  if (clipW <= 0) return null;
  const rect = dom.canvas.getBoundingClientRect();
  return {
    x: rect.left + ((clipX / clipW) * 0.5 + 0.5) * rect.width,
    y: rect.top + (1 - ((clipY / clipW) * 0.5 + 0.5)) * rect.height,
  };
}

function applyGameState() {
  const now = performance.now();

  if (pressedId === "feeder" && activeRay) {
    if (now >= feederNext) {
      const local = toLocal(activeRay);
      if (local) scene.pourAt(scene.trayPoint(local.origin, local.direction));
      feederNext = now + 150;
    }
  }

  const state = engineApi.state();
  scene.setControlState({
    enabled: {
      feeder: state.canBet,
      start: state.canStart,
      end: state.canBet,
      lever: state.phase === "ready" || pressedId === "lever",
      stool: true,
    },
  });
  const notice = performance.now() < leaveArmedUntil ? "再按一次 A 离开座位" : "";
  scene.updateHud({ ...state, notice });
  scene.updateShop({
    marbles: state.marbles,
    coins: state.coins || 0,
    tickets: state.tickets,
    message: shopMessage,
  });
}

/* ── Preview loop ────────────────────────────────────────── */

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(dom.canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(dom.canvas.clientHeight * ratio));
  if (dom.canvas.width !== width || dom.canvas.height !== height) {
    dom.canvas.width = width;
    dom.canvas.height = height;
  }
  return { width, height };
}

function previewFrame(now) {
  if (mode !== "preview") return;
  rafId = requestAnimationFrame(previewFrame);

  const { width, height } = resizeCanvas();
  scene.resize(width, height);
  lastCamera = cameraMatrices(width, height);

  const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  scene.tick(dt);

  // The 2D board repaints at 30–60 fps; there is no point in re-uploading
  // the texture faster than that, and it is the most expensive GL call.
  if (now - lastUpload > 32) {
    scene.uploadBoard();
    lastUpload = now;
  }

  applyGameState();
  scene.draw(lastCamera.projection, lastCamera.view, roomCabinets(), lastCamera.eye);
}

function startPreview() {
  if (mode !== "preview" || rafId) return;
  lastUpload = 0;
  rafId = requestAnimationFrame(previewFrame);
}

function stopPreview() {
  cancelAnimationFrame(rafId);
  rafId = 0;
}

/* ── Open / close ────────────────────────────────────────── */

export function openVR() {
  if (!collectDom()) return;
  if (!dom.root.hidden) return;

  if (!scene) {
    scene = createScene(dom.canvas, boardCanvas());
    if (!scene) {
      // No WebGL: still show the overlay so the note and the exit button
      // are reachable instead of the click doing nothing.
      dom.root.hidden = false;
      if (dom.enter) dom.enter.hidden = true;
      setNote("当前浏览器无法创建 WebGL 画布，3D 预览不可用。请换用支持 WebGL 的浏览器。");
      return;
    }
    scene.setCabinetLabels(cabinets.map((cabinet) => ({ name: cabinet.name, accent: cabinet.accent })));
    scene.onMarbleIn(() => {
      engineApi.adjustBet(1);
      audio.marbleHit(0.35);
    });
    buildCabinetModels(null);
    wireInput();
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        if (mode === "preview") resizeCanvas();
      });
      resizeObserver.observe(dom.canvas);
    }
  }

  cam.yaw = 0.12;
  cam.pitch = 0.12;
  cam.zoom = defaultZoom();
  seated = false;
  rowCentered = false;
  targetDistance = XR_STANDING;
  activeRay = null;
  feederNext = 0;
  lastFrameTime = performance.now();
  hoverId = null;
  pressedId = null;
  pressedSource = null;
  leverGrab = null;
  endArmedUntil = 0;
  shopMessage = "";

  // Start on whichever machine the 2D game currently has equipped.
  const current = engineApi.state().tableId;
  const found = cabinets.findIndex((cabinet) => cabinet.id === current);
  activeIndex = found >= 0 ? found : Math.floor(cabinets.length / 2);
  buildCabinetModels(null);

  dom.root.hidden = false;
  engineApi.setExternalClock(false);
  mode = "preview";

  // The board keeps drawing behind the overlay so the cabinet is never blank.
  window.dispatchEvent(new CustomEvent("marble:vr-open"));

  // VR plays straight from the global wallet: no run, no minimum stake.
  audio.init();
  engineApi.setVrWallet(true);

  resizeCanvas();
  startPreview();
  probeXrSupport();
}

function cancelPress() {
  if (pressedId === "lever") engineApi.leverCancel();
  pressedId = null;
  pressedSource = null;
  leverGrab = null;
  endArmedUntil = 0;
  scene?.releaseLever();
  scene?.setControlState({ pressed: null });
  scene?.setRays([]);
}

export function closeVR() {
  if (!dom.root || dom.root.hidden) return;
  cancelPress();
  if (xr) {
    try {
      xr.session.end();
    } catch {
      /* session may already be ending */
    }
    xr = null;
  }
  stopPreview();
  mode = "off";
  engineApi.setVrWallet(false);
  dom.root.hidden = true;
  window.dispatchEvent(new CustomEvent("marble:vr-close"));
}

function isOpen() {
  return Boolean(dom.root) && !dom.root.hidden;
}

/* ── Desktop input ───────────────────────────────────────── */

function wireInput() {
  const orbit = { pointerId: null, lastX: 0, lastY: 0 };

  dom.canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    dom.canvas.setPointerCapture?.(event.pointerId);
    const ray = mouseRay(event.clientX, event.clientY);
    if (ray && press("mouse", ray)) return;
    orbit.pointerId = event.pointerId;
    orbit.lastX = event.clientX;
    orbit.lastY = event.clientY;
    dom.canvas.classList.add("is-dragging");
  });

  dom.canvas.addEventListener("pointermove", (event) => {
    if (orbit.pointerId === event.pointerId) {
      const dx = event.clientX - orbit.lastX;
      const dy = event.clientY - orbit.lastY;
      orbit.lastX = event.clientX;
      orbit.lastY = event.clientY;
      cam.yaw = clamp(cam.yaw - dx * 0.0042, -0.75, 0.75);
      cam.pitch = clamp(cam.pitch + dy * 0.0032, -0.3, 0.42);
      return;
    }
    const ray = mouseRay(event.clientX, event.clientY);
    if (!ray) return;
    if (pressedId === "lever") dragLever(ray);
    else updateHover(ray);
  });

  const endDrag = (event) => {
    if (orbit.pointerId !== null && event.pointerId === orbit.pointerId) {
      orbit.pointerId = null;
      dom.canvas.classList.remove("is-dragging");
    }
    release("mouse");
  };
  dom.canvas.addEventListener("pointerup", endDrag);
  dom.canvas.addEventListener("pointercancel", endDrag);
  dom.canvas.addEventListener("pointerleave", () => {
    if (!pressedId) updateHover(null);
  });

  dom.canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      cam.zoom = clamp(cam.zoom * Math.exp(event.deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX);
    },
    { passive: false },
  );

  dom.canvas.addEventListener("dblclick", () => {
    cam.yaw = 0.12;
    cam.pitch = 0.12;
    cam.zoom = defaultZoom();
  });

  dom.exit?.addEventListener("click", closeVR);
  dom.enter?.addEventListener("click", () => {
    if (dom.enter.disabled) return;
    dom.enter.disabled = true;
    enterXr()
      .catch((error) => setNote(`无法进入 VR：${xrErrorMessage(error)}`))
      .finally(() => {
        dom.enter.disabled = false;
      });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) closeVR();
    if ((event.key === "a" || event.key === "A") && isOpen() && !event.metaKey && !event.ctrlKey) {
      if (seated) requestStand();
      else sitDown();
    }
  });
}

function xrErrorMessage(error) {
  switch (error?.name) {
    case "SecurityError":
      return "WebXR 需要 HTTPS 或 localhost 才能启动。";
    case "NotSupportedError":
      return "这个浏览器不支持沉浸式 VR 会话。";
    case "InvalidStateError":
      return "当前没有可用的头显，或者设备刚刚断开。";
    default:
      return error?.message || String(error) || "未知错误";
  }
}

/* ── WebXR ───────────────────────────────────────────────── */

async function probeXrSupport() {
  if (!dom.enter) return;
  if (!navigator.xr?.isSessionSupported) {
    setUnsupported();
    return;
  }
  try {
    const supported = await navigator.xr.isSessionSupported("immersive-vr");
    if (!supported) {
      setUnsupported();
      return;
    }
    if (!isOpen()) return;
    dom.enter.hidden = false;
    setHint("拖拽旋转视角 · 滚轮远近 · 双击复位");
    setNote("检测到 WebXR 头显。戴上后走到机柜前，对着凳子按扳机坐下——坐下会自动开一局。");
  } catch {
    setUnsupported();
  }
}

function setUnsupported() {
  if (dom.enter) dom.enter.hidden = true;
  if (!isOpen()) return;
  setHint("拖拽旋转视角 · 滚轮远近 · 双击复位");
  setNote(
    "当前浏览器不支持 WebXR，这里是桌面预览：按 A 坐下，点投珠框往里投弹珠，点 START 开球，按住拉杆向下拖再松手。用 Quest / Pico 等头显浏览器打开可进入沉浸模式。",
  );
}

async function enterXr() {
  if (!scene) return;
  if (!navigator.xr) {
    setUnsupported();
    return;
  }
  setNote("正在连接头显…");

  const gl = scene.gl;
  if (gl.makeXRCompatible) await gl.makeXRCompatible();

  let session = null;
  try {
    session = await navigator.xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor", "bounded-floor"],
    });
    // The overlay may have been closed while the headset was waking up.
    if (!isOpen()) {
      await session.end();
      return;
    }
    const layer = new XRWebGLLayer(session, gl);
    session.updateRenderState({ baseLayer: layer });

    let refSpace;
    let floorSpace = true;
    try {
      refSpace = await session.requestReferenceSpace("local-floor");
    } catch {
      refSpace = await session.requestReferenceSpace("local");
      floorSpace = false;
    }

    xr = { session, layer, refSpace, floorSpace, model: null };
  } catch (error) {
    if (session) {
      try {
        await session.end();
      } catch {
        /* already gone */
      }
    }
    throw error;
  }

  session.addEventListener("end", onXrEnd);
  session.addEventListener("selectstart", (event) => {
    const source = event.inputSource;
    const ray = xrRays.get(source);
    if (ray) press(source, ray);
  });
  session.addEventListener("selectend", (event) => {
    release(event.inputSource);
  });
  session.addEventListener("squeezestart", () => {
    // Squeeze re-centres the cabinet in front of the player.
    if (xr) xr.model = null;
  });

  stopPreview();
  // Immersive sessions suspend the page rAF; the XR loop becomes the clock.
  engineApi.setExternalClock(true);
  mode = "xr";
  if (dom.enter) dom.enter.hidden = true;
  setNote("已进入 VR。对着凳子按扳机坐下，投珠框投弹珠，START 开球，拉杆发射；A 键站起来。");
  session.requestAnimationFrame(onXrFrame);
}

function onXrEnd() {
  xr = null;
  xrRays.clear();
  engineApi.setExternalClock(false);
  if (!isOpen()) return;
  mode = "preview";
  cancelPress();
  buildCabinetModels(null);
  if (dom.enter) dom.enter.hidden = false;
  setNote("已退出 VR，回到桌面预览。");
  startPreview();
}

/** Remember where the cabinet should stand relative to the player. */
function captureAnchor(pose) {
  const m = pose.transform.matrix;
  const px = m[12];
  const py = m[13];
  const pz = m[14];
  let fx = -m[8];
  let fz = -m[10];
  const length = Math.hypot(fx, fz) || 1;
  fx /= length;
  fz /= length;

  xr.anchor = {
    px,
    pz,
    fx,
    fz,
    yaw: Math.atan2(-fx, -fz),
    // `local` spaces put the origin at head height; `local-floor` already
    // has the floor at y = 0, which is where the cabinet stands.
    y: xr.floorSpace ? 0 : -py,
    distance: targetDistance,
  };
  updateModel();
}

function updateModel() {
  const anchor = xr?.anchor;
  if (!anchor) return;
  const rig = multiply(
    translation(anchor.px + anchor.fx * anchor.distance, anchor.y, anchor.pz + anchor.fz * anchor.distance),
    rotationY(anchor.yaw),
  );
  buildCabinetModels(rig);
}

/** Smoothly dolly between the stool and standing behind it. */
function approachDistance(dt) {
  const anchor = xr?.anchor;
  if (!anchor) return;
  const delta = targetDistance - anchor.distance;
  if (Math.abs(delta) < 0.001) return;
  anchor.distance += delta * Math.min(1, dt * 6);
  updateModel();
}

function sitAt(index) {
  if (rowCentered) {
    rowCentered = false;
    if (mode === "xr" && xr?.anchor) updateModel();
    else buildCabinetModels(null);
  }
  if (index !== activeIndex) {
    const result = engineApi.setTable(cabinets[index].id);
    if (!result?.ok) {
      setNote("开奖中不能换机台，等这一球结束再看。");
      return;
    }
    activeIndex = index;
    if (mode === "xr" && xr?.anchor) updateModel();
    else buildCabinetModels(null);
  }
  sitDown();
}

function sitDown() {
  if (seated) return;
  if (rowCentered) {
    rowCentered = false;
    if (mode === "xr" && xr?.anchor) updateModel();
    else buildCabinetModels(null);
  }
  seated = true;
  leaveArmedUntil = 0;
  targetDistance = XR_SEATED;
  // Place the machine the player just chose directly in front of their head,
  // so sitting always lands on the stool instead of wherever the rig was.
  if (mode === "xr" && lastPose) captureAnchor(lastPose);
  const result = engineApi.quickStart();
  if (!result?.ok) {
    setNote("坐下了，但开局失败：弹珠不足，先在街机模式领取补助。");
    return;
  }
  setNote("坐下了。往投珠框里投弹珠，START 开球，拉下拉杆发射；按 A 站起来。");
}

function standUp() {
  if (!seated) return;
  seated = false;
  leaveArmedUntil = 0;
  targetDistance = XR_STANDING;
  setNote("已离开座位。对着凳子按扳机可以再坐下。");
}

/**
 * Thumbstick locomotion: left stick walks the rig, right stick snap-turns it.
 * WebXR gives us the head pose, so head turning is native; this only adds the
 * ability to move around the arcade floor and to re-aim in 30° steps.
 */
function pollLocomotion(dt, pose) {
  if (!xr?.anchor) return;
  // Seated means seated: no stick movement or snap turn; head tracking stays.
  if (seated) return;
  const m = pose.transform.matrix;
  let fx = -m[8];
  let fz = -m[10];
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl;
  fz /= fl;
  const rx = -fz;
  const rz = fx;

  let moveX = 0;
  let moveY = 0;
  let turn = 0;

  for (const source of xr.session.inputSources) {
    const axes = source.gamepad?.axes;
    if (!axes || axes.length < 2) continue;
    const ax = axes.length >= 4 ? axes[2] || 0 : axes[0] || 0;
    const ay = axes.length >= 4 ? axes[3] || 0 : axes[1] || 0;
    if (source.handedness === "right") turn = ax;
    else {
      moveX += ax;
      moveY += ay;
    }
  }

  if (Math.abs(moveX) > 0.18 || Math.abs(moveY) > 0.18) {
    const speed = 1.6 * dt;
    const forward = -moveY;
    const strafe = moveX;
    const anchor = xr.anchor;
    anchor.px -= (fx * forward + rx * strafe) * speed;
    anchor.pz -= (fz * forward + rz * strafe) * speed;
    clampToRoom(anchor, pose);
    updateModel();
  }

  if (Math.abs(turn) > 0.72 && performance.now() > snapReadyAt) {
    const angle = turn > 0 ? -Math.PI / 6 : Math.PI / 6;
    const anchor = xr.anchor;
    const px = m[12];
    const pz = m[14];
    const dx = anchor.px - px;
    const dz = anchor.pz - pz;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    anchor.px = px + dx * c - dz * sn;
    anchor.pz = pz + dx * sn + dz * c;
    anchor.yaw += angle;
    updateModel();
    snapReadyAt = performance.now() + 320;
  }
}

/** Quest A/B buttons sit at gamepad index 4/5. Also used as "stand up". */
/**
 * A = sit/stand. Holding B (right controller) or Y (left) for 0.8 s resets the
 * view: stand up and put the active machine back in front of the player, which
 * rescues anyone whose rig drifted somewhere unusable.
 */
function pollFaceButtons(dt) {
  for (const source of xr.session.inputSources) {
    const buttons = source.gamepad?.buttons;
    if (!buttons) continue;

    const aPressed = Boolean(buttons[4]?.pressed);
    const previous = aButtons.get(source) || false;
    if (aPressed && !previous) {
      if (seated) requestStand();
      else sitDown();
    }
    aButtons.set(source, aPressed);

    const bPressed = Boolean(buttons[5]?.pressed || buttons[3]?.pressed);
    if (bPressed) {
      if (bHoldStart === 0) bHoldStart = performance.now();
      if (!bCharged && performance.now() - bHoldStart > 800) {
        bCharged = true;
        resetView();
      }
    } else if (bHoldStart !== 0) {
      if (!bCharged && performance.now() < leaveArmedUntil) {
        leaveArmedUntil = 0;
        setNote("已取消，继续坐着。");
      }
      bHoldStart = 0;
      bCharged = false;
    }
  }
}

function requestStand() {
  if (!seated) return;
  const now = performance.now();
  if (now < leaveArmedUntil) {
    leaveArmedUntil = 0;
    standUp();
    return;
  }
  leaveArmedUntil = now + 4000;
  setNote("再按一次 A 离开座位（按 B 取消）");
}

/** Keep the player inside the four walls by sliding the room under them. */
function clampToRoom(anchor, pose) {
  const dx = pose.transform.position.x - anchor.px;
  const dz = pose.transform.position.z - anchor.pz;
  const c = Math.cos(anchor.yaw);
  const s = Math.sin(anchor.yaw);
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const cx = clamp(lx, -4.9, 4.9);
  const cz = clamp(lz, -2.7, 4.9);
  if (cx === lx && cz === lz) return;
  const dLocalX = cx - lx;
  const dLocalZ = cz - lz;
  anchor.px -= c * dLocalX + s * dLocalZ;
  anchor.pz -= -s * dLocalX + c * dLocalZ;
}

function resetView() {
  leaveArmedUntil = 0;
  standUp();
  seated = false;
  targetDistance = XR_STANDING;
  // Frame the whole row: the room centre goes in front of the player and the
  // machines face them, so the view is the canonical "standing in the arcade".
  rowCentered = true;
  if (xr && lastPose) {
    captureAnchor(lastPose);
    updateModel();
  } else {
    buildCabinetModels(null);
  }
  cam.yaw = 0.12;
  cam.pitch = 0.12;
  cam.zoom = defaultZoom();
  setNote("视角已重置：回到厅中央，正对机台。");
}

function controllerRays(frame) {
  const rays = [];
  if (!xr) return rays;
  for (const source of xr.session.inputSources) {
    let pose = null;
    try {
      pose = frame.getPose(source.targetRaySpace, xr.refSpace);
    } catch {
      pose = null;
    }
    if (!pose) continue;
    const m = pose.transform.matrix;
    rays.push({
      source,
      origin: [m[12], m[13], m[14]],
      direction: normalize3([-m[8], -m[9], -m[10]]),
    });
  }
  return rays;
}

function onXrFrame(time, frame) {
  if (!xr) return;
  xr.session.requestAnimationFrame(onXrFrame);

  const pose = frame.getViewerPose(xr.refSpace);
  if (!pose) return;

  const dt = Math.min(0.05, Math.max(0, (time - lastFrameTime) / 1000));
  lastFrameTime = time;
  // The page has no rAF inside immersive mode, so the game clock runs here.
  engineApi.step(time, dt);
  if (!xr.anchor) captureAnchor(pose);
  approachDistance(dt);
  scene.tick(dt);
  lastPose = pose;
  pollFaceButtons(dt);
  pollLocomotion(dt, pose);

  xrRays.clear();
  let hover = { id: null, index: -1 };
  for (const ray of controllerRays(frame)) {
    xrRays.set(ray.source, ray);
    if (!hover.id) {
      const target = pickTarget(ray);
      if (target) hover = { id: target.id, index: target.index };
    }
  }
  const hoverTarget = hover;
  if (hoverTarget.id !== hoverId || hoverTarget.index !== hoverIndex) {
    hoverId = hoverTarget.id;
    hoverIndex = hoverTarget.index;
    scene.setControlState({ hover: hoverId, hoverIndex });
  }

  if (pressedId && pressedSource) {
    const ray = xrRays.get(pressedSource);
    if (ray) {
      activeRay = ray;
      if (pressedId === "lever") dragLever(ray);
    }
  }

  if (time - lastUpload > 32) {
    scene.uploadBoard();
    lastUpload = time;
  }

  applyGameState();

  const inverse = invertRigid(xr.model);
  const localRays = [];
  for (const ray of xrRays.values()) {
    localRays.push({
      origin: transformPoint(inverse, ray.origin),
      direction: normalize3(transformDirection(inverse, ray.direction)),
      length: 1.2,
    });
  }
  scene.setRays(localRays);

  const gl = scene.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, xr.layer.framebuffer);

  const position = pose.transform.position;
  const eye = [position.x, position.y, position.z];

  for (const view of pose.views) {
    const viewport = xr.layer.getViewport(view);
    scene.draw(view.projectionMatrix, view.transform.inverse.matrix, roomCabinets(), eye, viewport);
  }
}

/* ── Wiring ──────────────────────────────────────────────── */

export function initVR() {
  // VR is a first-class mode on the main menu, next to arcade and challenge.
  document.getElementById("vrModeBtn")?.addEventListener("click", openVR);

  // Small debug surface for QA and future tooling.
  window.__VR__ = {
    open: openVR,
    close: closeVR,
    isOpen,
    project: projectControl,
    sit: sitDown,
    stand: standUp,
    sitAt,
    resetView,
    debugCenter(id) {
      return scene?.controlCenter(id) || scene?.kioskCenter(id) || null;
    },
    debugLocal(x, y) {
      const ray = mouseRay(x, y);
      const local = toLocal(ray);
      if (!local) return null;
      return { origin: local.origin, dir: local.direction, hit: scene.hitTestRay(local.origin, local.direction, true) };
    },
    debugPick(x, y) {
      const ray = mouseRay(x, y);
      return ray ? pickTarget(ray) : null;
    },
    get activeTable() {
      return cabinets[activeIndex].id;
    },
  };
}
