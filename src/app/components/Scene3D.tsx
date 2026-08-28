import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import posterUrls from "virtual:posters";
import galleryUrls from "virtual:gallery";
import { parseGIF, decompressFrame } from "gifuct-js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { RESUME_HTML, RESUME_CSS } from "./resumeMarkup";

// Full 3D-polygon rendition of the workstation: CRT monitor, keyboard and
// mouse are low-poly meshes with flat lambert shading and dark edge outlines.
// The agent-sphere POC renders into a texture mapped onto the monitor's
// screen face; tabs + cursor + scanlines composite on a HUD canvas texture.

type SphereMode = "lattice" | "terminal";
type PageId = "about" | "howto" | "projects" | "extras" | "chat";

// LamOS desktop — icons boot in after the splash screen
const DESKTOP_ICONS: { id: PageId; label: string; kind: "folder" | "exe" }[] = [
  { id: "about", label: "about me", kind: "folder" },
  { id: "howto", label: "how_to", kind: "folder" },
  { id: "projects", label: "personal projects", kind: "folder" },
  { id: "extras", label: "extras", kind: "folder" },
  { id: "chat", label: "let's chat.exe", kind: "exe" },
];

const WINDOW_TITLES: Record<PageId, string> = {
  about: "about_me",
  howto: "how_to.txt",
  projects: "personal_projects",
  extras: "extras",
  chat: "lets_chat.exe",
};

// Extras photo-dump captions, keyed by the filename in public/gallery/.
// Shown in a hover tooltip over the slide. Edit freely as photos change.
const GALLERY_CAPTIONS: Record<string, string> = {
  "photo1.jpg": "UCLA class of 2024 — Royce Hall grad shoot",
  "photo2.jpg": "Anthropic × Menlo builder day — the whole room",
  "photo3.jpg": "Shoutout to the cop in Tokyo for letting me borrow his honda",
  "photo4.jpg": "Self-intro as a summer intern in HK (ofc I quoted jake the dog)",
  "photo5.jpg": "The builder day team — me, wei chun & benedict",
  "photo6.jpg": "UCLA × slalom data challenge, preparing parking for LA28",
  "photo7.jpg": "LA city council commendation for the hillside streets project",
  "photo8.png": "My first A Capella duet, check us out at OnThatNoteUCLA!",
};

// Screen palette — the POC's locked tokens
const S_INK = "#ede4d3";
const S_DIM = "#857d6e";
const S_LINE = "#262118";
const S_ACCENT = "#e8c547";
const S_BG = "#12100c";

// Hardware palette
const CREAM = 0xf4eede;
const CREAM_DARK = 0xc9c0a6;
const OUTLINE = 0x241a0a;

type KeySpec = { code: string; w?: number };

const KEY_ROWS: KeySpec[][] = [
  [
    { code: "Backquote" }, { code: "Digit1" }, { code: "Digit2" }, { code: "Digit3" },
    { code: "Digit4" }, { code: "Digit5" }, { code: "Digit6" }, { code: "Digit7" },
    { code: "Digit8" }, { code: "Digit9" }, { code: "Digit0" }, { code: "Minus" },
    { code: "Equal" }, { code: "Backspace", w: 1.8 },
  ],
  [
    { code: "Tab", w: 1.5 }, { code: "KeyQ" }, { code: "KeyW" }, { code: "KeyE" },
    { code: "KeyR" }, { code: "KeyT" }, { code: "KeyY" }, { code: "KeyU" },
    { code: "KeyI" }, { code: "KeyO" }, { code: "KeyP" }, { code: "BracketLeft" },
    { code: "BracketRight" }, { code: "Backslash", w: 1.3 },
  ],
  [
    { code: "CapsLock", w: 1.8 }, { code: "KeyA" }, { code: "KeyS" }, { code: "KeyD" },
    { code: "KeyF" }, { code: "KeyG" }, { code: "KeyH" }, { code: "KeyJ" },
    { code: "KeyK" }, { code: "KeyL" }, { code: "Semicolon" }, { code: "Quote" },
    { code: "Enter", w: 2 },
  ],
  [
    { code: "ShiftLeft", w: 2.2 }, { code: "KeyZ" }, { code: "KeyX" }, { code: "KeyC" },
    { code: "KeyV" }, { code: "KeyB" }, { code: "KeyN" }, { code: "KeyM" },
    { code: "Comma" }, { code: "Period" }, { code: "Slash" }, { code: "ShiftRight", w: 2.2 },
  ],
  [
    { code: "ControlLeft", w: 1.4 }, { code: "AltLeft", w: 1.3 }, { code: "Space", w: 6.5 },
    { code: "AltRight", w: 1.3 }, { code: "ControlRight", w: 1.4 },
  ],
];

// Touch-first devices get the locked lean-in view; the full room needs
// hover, right-click, and a keyboard. `(pointer: coarse) and (hover: none)`
// catches phones/tablets without a mouse but not touchscreen laptops (whose
// primary pointer reports hover: hover). The width fallback catches narrow
// desktop windows where the room layout is cramped anyway.
const detectMobile = () => {
  // ?forceMobile / ?forceDesktop override the auto-detect, so either
  // experience can be tested without the matching hardware.
  const q = new URLSearchParams(location.search);
  if (q.has("forceDesktop")) return false;
  return (
    q.has("forceMobile") ||
    window.matchMedia("(pointer: coarse) and (hover: none)").matches ||
    window.innerWidth < 768
  );
};

export default function Scene3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  // Decided once per mount, mirrored into the effect — a mid-session mode
  // switch would need state we don't want to manage.
  const [mobileNote] = useState(detectMobile);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const isMobile = detectMobile();

    // ─── Renderer / camera / lights ──────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x060606, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 2.3, 10.8);
    camera.lookAt(0, 0.35, 0);

    // ─── Lighting — soft-shadowed key light + ambient fill ───
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene.add(new THREE.HemisphereLight(0xfff6e0, 0x2c2318, 0.85));
    // Sunlight angling in from the window on the right
    const dir = new THREE.DirectionalLight(0xffeecf, 1.05);
    dir.position.set(7, 8, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -12;
    dir.shadow.camera.right = 12;
    dir.shadow.camera.top = 12;
    dir.shadow.camera.bottom = -6;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 40;
    dir.shadow.bias = -0.0005;
    scene.add(dir);
    // Amber spill from the CRT onto the desk and keyboard (off with the screen)
    const crtGlow = new THREE.PointLight(0xe8c547, 0.55, 9, 2);
    crtGlow.position.set(0, 1.2, 2.7); // stays ahead of the closer monitor
    scene.add(crtGlow);

    // ─── Shared materials / helpers ──────────────────────────
    const matCream = new THREE.MeshLambertMaterial({ color: CREAM });
    const matCreamDark = new THREE.MeshLambertMaterial({ color: CREAM_DARK });
    const edgeMat = new THREE.LineBasicMaterial({ color: OUTLINE });

    function addEdges(mesh: THREE.Mesh) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry), edgeMat);
      mesh.add(edges);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    function box(w: number, h: number, d: number, mat: THREE.Material = matCream) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      addEdges(m);
      return m;
    }

    // ─── Paintable faces — edit the PNGs in public/textures/ ─
    // (guides/ has annotated copies marking zones hidden by other meshes.)
    // Each material starts as the flat base colour and swaps to the texture
    // once it loads, so a slow/missing PNG never flashes black.
    const texLoader = new THREE.TextureLoader();
    function paintedMat(url: string, base: number) {
      const m = new THREE.MeshLambertMaterial({ color: base });
      texLoader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        m.map = t;
        m.color.set(0xffffff);
        m.needsUpdate = true;
      });
      return m;
    }
    // BoxGeometry face order: 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z.
    function faceMats(face: number, painted: THREE.Material, rest: THREE.Material) {
      const mats: THREE.Material[] = new Array(6).fill(rest);
      mats[face] = painted;
      return mats;
    }
    // Point one box face at a sub-rectangle of its texture (v from the bottom).
    function remapFaceUV(geo: THREE.BoxGeometry, face: number, u0: number, v0: number, u1: number, v1: number) {
      const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
      const i = face * 4;
      uv.setXY(i, u0, v1);
      uv.setXY(i + 1, u1, v1);
      uv.setXY(i + 2, u0, v0);
      uv.setXY(i + 3, u1, v0);
    }

    // ─── Wooden desk ─────────────────────────────────────────
    const DESK_Y = -1.45; // desk top
    function createWoodTexture() {
      const c = document.createElement("canvas");
      c.width = 512; c.height = 512;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(0, 0, 512, 512);
      // Grain streaks — wavy horizontal strands in darker/lighter browns
      for (let i = 0; i < 90; i++) {
        const y = Math.random() * 512;
        const dark = Math.random() > 0.5;
        ctx.strokeStyle = dark
          ? `rgba(52, 33, 16, ${0.08 + Math.random() * 0.22})`
          : `rgba(178, 128, 82, ${0.05 + Math.random() * 0.15})`;
        ctx.lineWidth = 1 + Math.random() * 2.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 64) {
          ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 4 + (Math.random() - 0.5) * 6);
        }
        ctx.stroke();
      }
      // Plank seams
      ctx.strokeStyle = "rgba(40, 24, 10, 0.5)";
      ctx.lineWidth = 3;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 128);
        ctx.lineTo(512, i * 128);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3, 2);
      return tex;
    }
    const matWood = new THREE.MeshLambertMaterial({ map: createWoodTexture() });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, 15), matWood);
    desk.position.set(0, DESK_Y - 0.15, 3.2);
    desk.receiveShadow = true;
    scene.add(desk);

    // ─── Wall — single-color light cream ─────────────────────
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(40, 24, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xf1e8d0 }) // lightened from 0xe9e0c8
    );
    wall.position.set(0, 8, -4.5);
    wall.receiveShadow = true;
    scene.add(wall);

    // ─── Window — white frame, half open, behind the computer ─
    // Sky repaints with New York's time of day.
    const windowGroup = new THREE.Group();
    windowGroup.position.set(5.3, 3.6, -4.3);
    scene.add(windowGroup);

    const WIN_W = 4.4, WIN_H = 3.3;
    const matWhite = new THREE.MeshLambertMaterial({ color: 0xf7f4ec });

    function paintSky(ctx: CanvasRenderingContext2D, W: number, H: number) {
      // New York local hour (fractional)
      const nyParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hour12: false,
        hour: "numeric", minute: "numeric",
      }).formatToParts(new Date());
      const h = Number(nyParts.find(p => p.type === "hour")?.value ?? 12) % 24;
      const m = Number(nyParts.find(p => p.type === "minute")?.value ?? 0);
      const hour = h + m / 60;

      // Clean gradient sky — no cloud sprites (they rendered badly)
      let top: string, bottom: string;
      if (hour >= 6 && hour < 8)       { top = "#7f9cc9"; bottom = "#f2b27a"; } // dawn
      else if (hour >= 8 && hour < 17) { top = "#4d8ad2"; bottom = "#a9cdf2"; } // day
      else if (hour >= 17 && hour < 20){ top = "#45528c"; bottom = "#e8875c"; } // dusk
      else                             { top = "#0c142c"; bottom = "#233458"; } // night
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      // Stars at night
      if (hour >= 20 || hour < 6) {
        ctx.fillStyle = "rgba(240, 244, 255, 0.9)";
        for (let i = 0; i < 40; i++) {
          ctx.fillRect(((i * 137) % W), ((i * 89) % (H * 0.7)), 1.6, 1.6);
        }
      }
    }

    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 512; skyCanvas.height = 384;
    const skyCtx = skyCanvas.getContext("2d")!;
    paintSky(skyCtx, 512, 384);
    const skyTexture = new THREE.CanvasTexture(skyCanvas);
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    const skyInterval = setInterval(() => {
      paintSky(skyCtx, 512, 384);
      skyTexture.needsUpdate = true;
    }, 60_000);

    // ─── Window easter egg — a dark silhouette walks past ────────────
    // Summoned by greeting the terminal ("hey" / "hello" + enter). Drawn as an
    // overlay on the sky canvas so it composites with whatever time-of-day is
    // showing.
    let walkerActive = false;
    let walkerStart = 0;
    let walkerDir = 1;
    const WALKER_DURATION = 7200;

    // The face that pops up at the pane partway through the routine.
    const nikkiImg = new Image();
    nikkiImg.src = "/nikki.png";
    let nikkiReady = false;
    nikkiImg.onload = () => { nikkiReady = true; };

    function triggerWalker() {
      walkerActive = true;
      walkerStart = performance.now();
      walkerDir = Math.random() < 0.5 ? 1 : -1; // still a coin flip which way
    }

    // Routine beats, as fractions of WALKER_DURATION. She strolls in, breaks
    // into a run at the window, drops out of sight, pops up over the sill,
    // sinks back down, then carries on the way she was heading.
    const W_RUN = 0.20, W_DROP = 0.30, W_GONE = 0.37;
    const W_POP = 0.50, W_HOLD = 0.70, W_SINK = 0.84;
    const SCALE = 2.6; // she read as a distant speck at 1x

    const easeOutBack = (u: number) => {
      const c = 1.9;
      return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
    };
    const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

    function drawFigure(
      ctx: CanvasRenderingContext2D, x: number, groundY: number,
      phase: number, running: boolean, drop: number
    ) {
      const s = SCALE;
      const stride = Math.sin(phase);
      const bob = Math.abs(stride) * 2 * s;
      const y = groundY + drop;
      const lean = running ? 0.16 : 0; // tipped forward into the run
      ctx.save();
      ctx.translate(x, y - bob);
      ctx.rotate(lean);
      ctx.fillStyle = "rgba(4, 4, 8, 0.66)";
      ctx.beginPath();
      ctx.ellipse(0, -30 * s, 5 * s, 6 * s, 0, 0, Math.PI * 2); // head
      ctx.fill();
      ctx.fillRect(-4 * s, -24 * s, 8 * s, 18 * s);             // torso
      const kick = running ? 7 : 4;
      ctx.fillRect(-4 * s, -6 * s, 3 * s, (10 + stride * kick) * s); // legs
      ctx.fillRect(1 * s, -6 * s, 3 * s, (10 - stride * kick) * s);
      const swing = running ? 5 : 3;
      ctx.fillRect(-6 * s, -22 * s, 2 * s, (12 - stride * swing) * s); // arms
      ctx.fillRect(4 * s, -22 * s, 2 * s, (12 + stride * swing) * s);
      ctx.restore();
    }

    function drawWalker(ctx: CanvasRenderingContext2D, W: number, H: number, tt: number, dir: number) {
      const groundY = H * 0.74; // roughly sidewalk level within the window view
      const entry = dir === 1 ? -50 : W + 50;
      const exit = dir === 1 ? W + 50 : -50;
      const mid = W * 0.5;

      if (tt < W_DROP) {
        // Stroll in, then break into a run for the last stretch
        const running = tt >= W_RUN;
        const u = tt / W_DROP;
        // Ease into the run so the speed-up is visible
        const eased = u < W_RUN / W_DROP ? u : u + (u - W_RUN / W_DROP) * 0.9;
        const x = entry + Math.min(1, eased) * (mid - entry);
        // Drops out of sight over the last sliver of the run
        const drop = tt > W_DROP - 0.03
          ? ((tt - (W_DROP - 0.03)) / 0.03) * 150
          : 0;
        drawFigure(ctx, x, groundY, tt * Math.PI * (running ? 34 : 18), running, drop);
        return;
      }
      if (tt < W_GONE) return; // the small beat where she's just gone

      if (tt < W_SINK) {
        // Face slides up past the pane, overshoots into a pop, holds, sinks
        if (!nikkiReady) return;
        const iw = 216, ih = iw * (nikkiImg.height / nikkiImg.width);
        // A peek, not a reveal: only the top of her head and her eyes clear
        // the sill, the rest stays below the frame. The eyes sit ~36% down the
        // source image, so this stops just past them.
        const PEEK_FRAC = 0.45;
        const restY = H - ih * PEEK_FRAC;
        const hiddenY = H + 10;    // fully below the view
        let top: number;
        if (tt < W_POP) {
          top = hiddenY + easeOutBack(clamp01((tt - W_GONE) / (W_POP - W_GONE))) * (restY - hiddenY);
        } else if (tt < W_HOLD) {
          top = restY;
        } else {
          const u = (tt - W_HOLD) / (W_SINK - W_HOLD);
          top = restY + (u * u) * (hiddenY - restY); // slow at first, then away
        }
        ctx.drawImage(nikkiImg, mid - iw / 2, top, iw, ih);
        return;
      }

      // Back on her feet, carrying on the way she was going
      const u = (tt - W_SINK) / (1 - W_SINK);
      const x = mid + u * (exit - mid);
      drawFigure(ctx, x, groundY, tt * Math.PI * 18, false, 0);
    }

    const skyPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(WIN_W, WIN_H),
      new THREE.MeshBasicMaterial({ map: skyTexture })
    );
    // Clearly proud of the wall face — coplanar placement z-fought with the
    // wall and striped the view.
    skyPlane.position.z = 0.12;
    windowGroup.add(skyPlane);

    // Outer frame — chunky white casing
    const FR = 0.46, FR_D = 0.24;
    const frTop = box(WIN_W + FR * 2, FR, FR_D, matWhite);
    frTop.position.set(0, WIN_H / 2 + FR / 2, 0.12);
    const frBot = box(WIN_W + FR * 2, FR, FR_D, matWhite);
    frBot.position.set(0, -(WIN_H / 2 + FR / 2), 0.12);
    const frL = box(FR, WIN_H, FR_D, matWhite);
    frL.position.set(-(WIN_W / 2 + FR / 2), 0, 0.12);
    const frR = box(FR, WIN_H, FR_D, matWhite);
    frR.position.set(WIN_W / 2 + FR / 2, 0, 0.12);
    // Center rail + sill
    const frMid = box(WIN_W, 0.24, FR_D, matWhite);
    frMid.position.set(0, 0, 0.12);
    const sill = box(WIN_W + FR * 3, 0.18, 0.55, matWhite);
    sill.position.set(0, -(WIN_H / 2 + FR + 0.09), 0.26);
    windowGroup.add(frTop, frBot, frL, frR, frMid, sill);

    // Half-open bottom sash — slid up over the top half, so the lower half
    // of the window is open air.
    const sash = new THREE.Group();
    sash.position.set(0, WIN_H / 4, 0.3); // raised to cover the upper half
    const SA = 0.24;
    const saTop = box(WIN_W + 0.1, SA, 0.12, matWhite);
    saTop.position.y = WIN_H / 4 - SA / 2;
    const saBot = box(WIN_W + 0.1, SA, 0.12, matWhite);
    saBot.position.y = -(WIN_H / 4 - SA / 2);
    const saL = box(SA, WIN_H / 2, 0.12, matWhite);
    saL.position.x = -(WIN_W / 2 - SA / 2 + 0.05);
    const saR = box(SA, WIN_H / 2, 0.12, matWhite);
    saR.position.x = WIN_W / 2 - SA / 2 + 0.05;
    const saMull = box(SA * 0.8, WIN_H / 2, 0.1, matWhite);
    sash.add(saTop, saBot, saL, saR, saMull);
    windowGroup.add(sash);

    // ─── Poster on the wall, left of the monitor ─────────────
    function createPosterTexture() {
      const c = document.createElement("canvas");
      c.width = 512; c.height = 768;
      const ctx = c.getContext("2d")!;
      // White mat border + dark print, like a printed poster with margin
      const BORDER = 34;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 512, 768);
      ctx.fillStyle = "#12100c";
      ctx.fillRect(BORDER, BORDER, 512 - BORDER * 2, 768 - BORDER * 2);
      // Star field
      for (let i = 0; i < 130; i++) {
        ctx.fillStyle = `rgba(237, 228, 211, ${0.25 + Math.random() * 0.6})`;
        const s = Math.random() * 2.2 + 0.6;
        ctx.fillRect(30 + Math.random() * 452, 30 + Math.random() * 560, s, s);
      }
      // Digit-orb: rings of glyphs, echoing the CRT sphere
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cx = 256, cy = 300;
      for (let ring = 0; ring < 6; ring++) {
        const r = 34 + ring * 26;
        const n = 8 + ring * 5;
        ctx.font = `700 ${22 - ring * 2}px ui-monospace, Menlo, monospace`;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring * 0.7;
          const fade = 1 - ring / 7;
          ctx.fillStyle = ring % 2 === 0
            ? `rgba(232, 197, 71, ${0.85 * fade})`
            : `rgba(237, 228, 211, ${0.7 * fade})`;
          ctx.fillText(String((i * 7 + ring) % 10), cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92);
        }
      }
      // Title block
      ctx.fillStyle = "#e8c547";
      ctx.font = "900 64px 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText("APOLLO", 256, 618);
      ctx.fillStyle = "#ede4d3";
      ctx.font = "900 64px 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText("DRIFT", 256, 684);
      ctx.fillStyle = "#857d6e";
      ctx.font = "500 20px ui-monospace, Menlo, monospace";
      ctx.fillText("· mission control radio ·", 256, 730);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    // A movie poster from public/posters/, picked at random each visit —
    // downsampled onto a small canvas and magnified with nearest-neighbour
    // sampling for a slight pixelation that matches the low-poly room.
    // Until it loads (or if the folder is empty) the Apollo Drift print shows.
    const posterMat = new THREE.MeshLambertMaterial({ map: createPosterTexture() });
    if (posterUrls.length > 0) {
      const url = posterUrls[Math.floor(Math.random() * posterUrls.length)];
      const img = new Image();
      img.onload = () => {
        const PW = 144, PH = 216; // pixelation grid, same 2:3 as the print
        const BORDER = Math.round(PW * (34 / 512)); // same margin ratio as the fallback print
        const c = document.createElement("canvas");
        c.width = PW; c.height = PH;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, PW, PH);
        // cover-fit crop, clipped to inside the white mat border
        const innerW = PW - BORDER * 2, innerH = PH - BORDER * 2;
        const s = Math.max(innerW / img.width, innerH / img.height);
        ctx.save();
        ctx.beginPath();
        ctx.rect(BORDER, BORDER, innerW, innerH);
        ctx.clip();
        ctx.drawImage(
          img,
          BORDER + (innerW - img.width * s) / 2,
          BORDER + (innerH - img.height * s) / 2,
          img.width * s, img.height * s
        );
        ctx.restore();
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        posterMat.map?.dispose();
        posterMat.map = tex;
        posterMat.needsUpdate = true;
      };
      img.src = url;
    }

    // ─── Media for the personal-projects & extras HUD pages ───────
    // Static images — a plain Image() decodes fine off-DOM.
    const loadImg = (src: string) => {
      const img = new Image();
      img.src = src;
      return img;
    };
    const nookImg = loadImg("/projects/nook.png");
    const matchaImg = loadImg("/projects/matcha-game.jpg");
    const shorthandImg = loadImg("/projects/shorthand-example.png");
    const galleryImgs = galleryUrls.map(url => {
      const img = new Image();
      img.src = url;
      return img;
    });
    const galleryCaption = (i: number) => {
      const base = decodeURIComponent((galleryUrls[i] ?? "").split("/").pop() ?? "");
      return GALLERY_CAPTIONS[base] ?? "";
    };

    // Animated GIFs — canvas drawImage() only ever grabs a still frame from an
    // <img>, and browsers pause GIF decoding on elements with no visible
    // area anyway, so the frames are decoded by hand once up front and
    // played back on our own clock (advanced in the animate loop below).
    // Frames are downscaled to maxW so big gifs don't hoard memory.
    type GifFrame = { canvas: HTMLCanvasElement; delay: number };
    type GifAnim = { frames: GifFrame[]; idx: number; elapsed: number };
    const gifAnims: GifAnim[] = [];
    let disposed = false; // stops sliced gif decoding after unmount
    function loadGifAnim(url: string, maxW = 720, skipFetch = false) {
      const anim: GifAnim = { frames: [], idx: 0, elapsed: 0 };
      gifAnims.push(anim);
      // Empty frames render as the placeholder box — used to skip heavy gifs on mobile.
      if (skipFetch) return anim;
      fetch(url)
        .then(r => r.arrayBuffer())
        .then(buf => {
          // Decoding every frame in one go blocks the main thread for seconds
          // on big gifs (the 27 MB one: ~1.3s of LZW alone + compositing) and
          // froze the whole scene on load. Instead: parse the structure (fast),
          // then decompress + composite frames in ≤12ms time slices, yielding
          // between slices so the render loop keeps its frame rate. Frames
          // append progressively — playback starts as soon as the first lands.
          const gif = parseGIF(buf);
          const raw = (gif.frames as any[]).filter((f) => f.image);
          const W = gif.lsd.width, H = gif.lsd.height;
          const s = Math.min(1, maxW / W);
          const SW = Math.round(W * s), SH = Math.round(H * s);
          const work = document.createElement("canvas");
          work.width = W; work.height = H;
          const wctx = work.getContext("2d")!;
          let prevSnapshot: ImageData | null = null;
          let i = 0;
          const step = () => {
            if (disposed) return; // component unmounted mid-decode
            const t0 = performance.now();
            while (i < raw.length && performance.now() - t0 < 12) {
              const f = decompressFrame(raw[i], gif.gct, true)!;
              if (f.disposalType === 2) wctx.clearRect(0, 0, W, H);
              else if (f.disposalType === 3 && prevSnapshot) wctx.putImageData(prevSnapshot, 0, 0);
              if (f.disposalType === 3) prevSnapshot = wctx.getImageData(0, 0, W, H);
              const patch = document.createElement("canvas");
              patch.width = f.dims.width; patch.height = f.dims.height;
              const pctx = patch.getContext("2d")!;
              const patchData = pctx.createImageData(f.dims.width, f.dims.height);
              patchData.data.set(f.patch);
              pctx.putImageData(patchData, 0, 0);
              wctx.drawImage(patch, f.dims.left, f.dims.top);
              const snap = document.createElement("canvas");
              snap.width = SW; snap.height = SH;
              snap.getContext("2d")!.drawImage(work, 0, 0, SW, SH);
              anim.frames.push({ canvas: snap, delay: Math.max(20, f.delay) });
              i++;
            }
            if (i < raw.length) setTimeout(step, 0);
          };
          step();
        })
        .catch(() => { /* thumb just stays a placeholder box */ });
      return anim;
    }
    const captchaAnim = loadGifAnim("/projects/ai-proof-captcha.gif");
    const neocitiesAnim = loadGifAnim("/projects/neocities-site.gif");
    const chinatownAnim = loadGifAnim("/projects/chinatown-hacks.gif"); // compressed to 360px / 2.7 MB
    const toodlesAnim = loadGifAnim("/projects/toodles-demo.gif"); // compressed to 320px / 0.7 MB

    // Contain-fit draws the WHOLE src into (x,y,w,h), centered and letterboxed
    // so nothing is cropped. sw/sh are the source's natural dimensions; pass 0
    // for "not ready yet".
    function drawThumb(
      ctx: CanvasRenderingContext2D, src: CanvasImageSource | null, sw: number, sh: number,
      x: number, y: number, w: number, h: number
    ) {
      ctx.fillStyle = "#12100c"; // letterbox backing
      ctx.fillRect(x, y, w, h);
      if (src && sw > 0 && sh > 0) {
        const s = Math.min(w / sw, h / sh);
        const iw = sw * s, ih = sh * s;
        ctx.drawImage(src, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
      }
      ctx.strokeStyle = "#3a342a";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }

    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 8.1), // slightly shrunk so the white mat border reads clearly
      posterMat
    );
    poster.position.set(-6.9, 3.4, -4.24); // nudged left, clear of the monitor
    poster.rotation.z = 0.015; // hung ever-so-slightly crooked
    poster.receiveShadow = true; // fan shadow sweeps across the print, not behind it
    scene.add(poster);

    // ─── Ceiling fan — hangs out of frame, its shadow sweeps the desk ─
    const fan = new THREE.Group();
    // Sits out in the room — further from the wall than the monitor — but the
    // key light rakes in at about 34°, so pushing it much further forward
    // throws the blade shadow off the poster entirely. This is the spot where
    // both hold: the sweep still crosses the print.
    fan.position.set(0.0, 7.6, 2.8);
    scene.add(fan);
    const fanMat = new THREE.MeshLambertMaterial({ color: 0x6b5f4a });
    const fanHub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10), fanMat);
    fanHub.castShadow = true;
    fan.add(fanHub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.07, 0.8), fanMat);
      blade.position.x = Math.cos((i / 4) * Math.PI * 2) * 2.4;
      blade.position.z = Math.sin((i / 4) * Math.PI * 2) * 2.4;
      blade.rotation.y = -(i / 4) * Math.PI * 2;
      blade.castShadow = true;
      fan.add(blade);
    }

    // ─── Mousepad ────────────────────────────────────────────
    const mousepad = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.03, 2.5),
      new THREE.MeshLambertMaterial({ color: 0x24242a })
    );
    addEdges(mousepad);
    mousepad.position.set(3.35, DESK_Y + 0.015, 2.8);
    scene.add(mousepad);

    // ─── Monitor ─────────────────────────────────────────────
    const monitor = new THREE.Group();
    // Pulled toward the viewer; the foot ends at z≈1.55, keyboard starts at
    // z≈2.28, so nothing clips.
    monitor.position.set(0, 1.42, 1.1);
    monitor.rotation.y = -0.12;
    scene.add(monitor);

    const OUTER_W = 5.3, OUTER_H = 4.05, OPEN_W = 4.2, OPEN_H = 3.15, FRAME_D = 0.34;
    // Rear body
    const body = box(OUTER_W, OUTER_H, 1.7);
    body.position.z = -0.85;
    monitor.add(body);
    // Bezel frame around the screen opening. All four bars sample
    // monitor-bezel.png — one image spanning the whole OUTER_W × OUTER_H
    // front, with each bar's UVs remapped to its slice of it.
    const barH = (OUTER_H - OPEN_H) / 2;
    const barW = (OUTER_W - OPEN_W) / 2;
    const bezelMat = paintedMat("/textures/monitor-bezel.png", CREAM);
    const uBar = barW / OUTER_W, vBar = barH / OUTER_H;
    function bezelBar(w: number, h: number, u0: number, v0: number, u1: number, v1: number) {
      const geo = new THREE.BoxGeometry(w, h, FRAME_D);
      remapFaceUV(geo, 4, u0, v0, u1, v1);
      const m = new THREE.Mesh(geo, faceMats(4, bezelMat, matCream));
      addEdges(m);
      return m;
    }
    const topBar = bezelBar(OUTER_W, barH, 0, 1 - vBar, 1, 1);
    topBar.position.set(0, OPEN_H / 2 + barH / 2, FRAME_D / 2);
    const botBar = bezelBar(OUTER_W, barH, 0, 0, 1, vBar);
    botBar.position.set(0, -(OPEN_H / 2 + barH / 2), FRAME_D / 2);
    const leftBar = bezelBar(barW, OPEN_H, 0, vBar, uBar, 1 - vBar);
    leftBar.position.set(-(OPEN_W / 2 + barW / 2), 0, FRAME_D / 2);
    const rightBar = bezelBar(barW, OPEN_H, 1 - uBar, vBar, 1, 1 - vBar);
    rightBar.position.set(OPEN_W / 2 + barW / 2, 0, FRAME_D / 2);
    monitor.add(topBar, botBar, leftBar, rightBar);
    // Stand
    const neck = box(0.9, 0.6, 0.8);
    neck.position.set(0, -OUTER_H / 2 - 0.3, -0.5);
    const foot = box(2.3, 0.18, 1.5);
    foot.position.set(0, -OUTER_H / 2 - 0.68, -0.3);
    monitor.add(neck, foot);

    // Power button — bottom-left of the bezel; toggles the screen
    let screenOn = true;
    const POWER_OUT = 0.41, POWER_IN = 0.36;
    const powerButton = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.14), // small square
      matCreamDark
    );
    addEdges(powerButton);
    powerButton.position.set(-2.15, -(OPEN_H / 2 + barH / 2), POWER_OUT);
    monitor.add(powerButton);

    // Dark glass shown when the screen is off
    const offPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(OPEN_W, OPEN_H),
      new THREE.MeshBasicMaterial({ color: 0x0b0a08 })
    );
    offPlane.position.z = 0.03;
    monitor.add(offPlane);

    // ─── Post-it on the bottom-right bezel — right-click to lean in ─
    function createPostItTexture() {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256; // doubled — the handwriting face needs the pixels
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = "#f2df6d";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0, 232, 256, 24); // bottom-edge curl shadow
      ctx.fillStyle = "#2b2417";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Comic Sans reads far better at this size than a thin handwriting face.
      const hand = `'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive`;
      ctx.font = `700 58px ${hand}`;
      ctx.fillText("lean", 128, 62);
      ctx.fillText("in!", 128, 122);
      // Spelled out both ways — "right-click" alone read as unclear on laptops
      ctx.font = `700 26px ${hand}`;
      ctx.fillText("right-click or", 128, 184);
      ctx.fillText("two-finger click", 128, 216);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    const postItG = new THREE.Group();
    // Top-right corner of the bezel, clear of the mouse cable below. Low
    // enough that the note's top edge sits on the bezel for the tape to grab.
    postItG.position.set(2.26, 1.52, 0.36);
    postItG.rotation.z = -0.07; // taped on in a hurry
    postItG.visible = !isMobile; // "lean in! (right-click)" is meaningless on touch
    monitor.add(postItG);
    const postItMat = new THREE.MeshLambertMaterial({ map: createPostItTexture() });
    const postIt = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), postItMat);
    postItG.add(postIt);
    const tape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.15),
      new THREE.MeshLambertMaterial({ color: 0xfffdf2, transparent: true, opacity: 0.55 })
    );
    tape.position.set(0, 0.43, 0.005); // straddles the note's top edge onto the bezel
    tape.rotation.z = 0.12;
    postItG.add(tape);

    // ─── Lean-in camera — straight-on, screen fills the viewport ─
    monitor.updateMatrixWorld(true);
    const CAM_BASE_POS = camera.position.clone();
    const CAM_BASE_LOOK = new THREE.Vector3(0, 0.35, 0); // matches the init lookAt
    const leanLookAt = new THREE.Vector3(0, 0, 0.04).applyMatrix4(monitor.matrixWorld);
    const leanNormal = new THREE.Vector3(0, 0, 1).transformDirection(monitor.matrixWorld);
    const leanCamPos = new THREE.Vector3();
    function computeLeanCamPos() {
      // Desktop keeps the hand-tuned distance (fills a landscape 4:3 viewport).
      // Mobile fits the bezel opening's width into the horizontal FOV so a
      // portrait phone letterboxes vertically instead of overflowing sideways.
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const dist = isMobile
        ? (OPEN_W / 2) * 1.08 / Math.tan(hFov / 2) // 8% margin
        : 4.2;                                      // desktop keeps the tuned value
      leanCamPos.copy(leanLookAt).addScaledVector(leanNormal, dist);
    }
    computeLeanCamPos();
    const camLook = new THREE.Vector3();

    // Leaning in accelerates (slow shoulders-first start, ease-in power);
    // leaning back out is a quick push-off (fast ease-out).
    let leanOn = isMobile;        // mobile boots locked into the lean-in view
    let leanT = isMobile ? 1 : 0; // start already leaned in — no fly-in
    const LEAN_IN_DUR = 1.4, LEAN_OUT_DUR = 0.45, LEAN_EXP = 2.6;
    const leanBlendOf = () =>
      leanOn ? Math.pow(leanT, LEAN_EXP) : 1 - Math.pow(1 - leanT, 3);
    let lastLeanToggle = 0;
    function toggleLean() {
      if (isMobile) return; // locked leaned in — no escape (also catches iOS long-press contextmenu)
      // Debounce duplicate events from synthetic input pipelines
      const nowMs = performance.now();
      if (nowMs - lastLeanToggle < 250) return;
      lastLeanToggle = nowMs;
      const blend = leanBlendOf();
      leanOn = !leanOn;
      // Re-seat the linear param so the eased position stays continuous when
      // toggling mid-animation
      leanT = leanOn ? Math.pow(blend, 1 / LEAN_EXP) : 1 - Math.pow(1 - blend, 1 / 3);
    }

    // ─── Sphere pipeline (ported from the agent-sphere POC) ──
    const RT_W = 1280, RT_H = 960;

    const sphereScene = new THREE.Scene();
    const sphereCamera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 100);
    sphereCamera.position.z = 4.5;

    const COUNT = 5500; // the terminal face's head outline alone needs ~3960 particles; don't cut this
    const positions = new Float32Array(COUNT * 3);
    const originals = new Float32Array(COUNT * 3);
    const targets = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const randoms = new Float32Array(COUNT);
    let phase = 0;
    let phaseStart = 0;

    for (let i = 0; i < COUNT; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const x = Math.cos(theta) * Math.sin(phi);
      const y = Math.sin(theta) * Math.sin(phi);
      const z = Math.cos(phi);
      originals[i * 3] = x; originals[i * 3 + 1] = y; originals[i * 3 + 2] = z;
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      randoms[i] = Math.random();
    }

    const sphereGeometry = new THREE.BufferGeometry();
    sphereGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: { uNear: { value: 3.2 }, uFar: { value: 5.8 } },
      vertexShader: `
        uniform float uNear;
        uniform float uFar;
        varying float vBrightness;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 1.2 * (80.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          float depth = -mv.z;
          float t = 1.0 - clamp((depth - uNear) / (uFar - uNear), 0.0, 1.0);
          vBrightness = mix(0.35, 1.0, t);
        }
      `,
      fragmentShader: `
        varying float vBrightness;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d);
          a = pow(a, 2.0);
          gl_FragColor = vec4(vec3(vBrightness), a * 0.35);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(sphereGeometry, particleMaterial);
    sphereScene.add(points);

    // Twin orb — same particle field, opposite phase, smaller + tighter orbit
    const points2 = new THREE.Points(sphereGeometry, particleMaterial);
    sphereScene.add(points2);

    function createDigitAtlas() {
      const canvas = document.createElement("canvas");
      const s = 128;
      canvas.width = s * 10;
      canvas.height = s;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.floor(s * 0.88)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const digitsByWeight = ["8", "0", "5", "3", "2", "9", "4", "6", "1", "7"];
      for (let i = 0; i < 10; i++) ctx.fillText(digitsByWeight[i], s * i + s / 2, s / 2 + 2);
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      return tex;
    }

    const particleRT = new THREE.WebGLRenderTarget(RT_W, RT_H, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const screenRT = new THREE.WebGLRenderTarget(RT_W, RT_H, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    function hexToVec3(hex: string) {
      const n = parseInt(hex.slice(1), 16);
      return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    }

    const asciiScene = new THREE.Scene();
    const asciiCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const asciiMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: particleRT.texture },
        uAtlas: { value: createDigitAtlas() },
        uCellSize: { value: new THREE.Vector2(9, 20) },
        uSqueeze: { value: 0.54 },
        uInk: { value: hexToVec3(S_INK) },
        uBg: { value: hexToVec3(S_BG) },
        uGlowColor: { value: hexToVec3(S_ACCENT) },
        uGlow: { value: 0.14 },
        uGain: { value: 1.8 },
        uResolution: { value: new THREE.Vector2(RT_W, RT_H) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uScene;
        uniform sampler2D uAtlas;
        uniform vec2 uCellSize;
        uniform float uSqueeze;
        uniform vec2 uResolution;
        uniform vec3 uInk;
        uniform vec3 uBg;
        uniform vec3 uGlowColor;
        uniform float uGlow;
        uniform float uGain;
        varying vec2 vUv;
        void main() {
          vec2 pixel = vUv * uResolution;
          vec2 cellIdx = floor(pixel / uCellSize);
          vec2 cellCenter = (cellIdx + 0.5) * uCellSize;

          vec3 sceneCol = texture2D(uScene, cellCenter / uResolution).rgb;
          float brightness = dot(sceneCol, vec3(0.299, 0.587, 0.114));
          brightness = clamp(brightness * uGain, 0.0, 1.0);

          float fieldLum = dot(texture2D(uScene, vUv).rgb, vec3(0.299, 0.587, 0.114));
          float halo = pow(clamp(fieldLum * uGain, 0.0, 1.0), 1.4) * uGlow;

          if (brightness < 0.05) {
            gl_FragColor = vec4(uBg + uGlowColor * halo, 1.0);
            return;
          }

          float pos = floor((1.0 - brightness) * 9.999);

          vec2 cellFrac = fract(pixel / uCellSize);
          float atlasX = 0.5 + (cellFrac.x - 0.5) * uSqueeze;
          float u = (pos + atlasX) / 10.0;
          vec4 glyph = texture2D(uAtlas, vec2(u, cellFrac.y));

          vec3 col = uBg + uGlowColor * halo;
          col = mix(col, uInk, glyph.a);
          col += uGlowColor * glyph.a * brightness * 0.12;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    asciiScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), asciiMaterial));

    // Screen face textured with the ASCII pipeline output. A raw pass-through
    // shader (custom ShaderMaterials skip the renderer's output encoding) so
    // the POC's display colors reach the canvas exactly — a MeshBasicMaterial
    // would re-encode the dark background into washed-out grey.
    // Slight pixelation: both screen layers snap their UVs to a coarse grid,
    // like the tube can't quite resolve the framebuffer.
    const PIX_GRID = new THREE.Vector2(640, 480);
    const screenPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(OPEN_W, OPEN_H),
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: screenRT.texture }, uPix: { value: PIX_GRID } },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform vec2 uPix;
          varying vec2 vUv;
          void main() {
            vec2 puv = (floor(vUv * uPix) + 0.5) / uPix;
            gl_FragColor = vec4(texture2D(uMap, puv).rgb, 1.0);
          }
        `,
      })
    );
    screenPlane.position.z = 0.04; // recessed behind the bezel frame front
    monitor.add(screenPlane);

    // ─── HUD (tabs · cursor · scanlines · vignette) ──────────
    const HUD_W = 1024, HUD_H = 768;
    const hudCanvas = document.createElement("canvas");
    hudCanvas.width = HUD_W;
    hudCanvas.height = HUD_H;
    const hud = hudCanvas.getContext("2d")!;
    const hudTexture = new THREE.CanvasTexture(hudCanvas);
    // No color-space tag: the HUD shader below skips the renderer's output
    // encoding, so decoding sRGB on sample would darken the whole screen.
    // Raw in, raw out keeps the canvas colors exact.
    const hudPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(OPEN_W, OPEN_H),
      // Same UV-snap pixelation as the screen layer, but alpha-aware so the
      // HUD keeps compositing over the particles
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: hudTexture }, uPix: { value: PIX_GRID } },
        transparent: true,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform vec2 uPix;
          varying vec2 vUv;
          void main() {
            vec2 puv = (floor(vUv * uPix) + 0.5) / uPix;
            gl_FragColor = texture2D(uMap, puv);
          }
        `,
      })
    );
    hudPlane.position.z = 0.055;
    monitor.add(hudPlane);

    // Digit-face shapes for the terminal avatar — drawn as canvas strokes,
    // sampled into particle targets so the face gets the same 3D ascii-digit
    // treatment as the word morphs. Box head, not circular.
    // Face parts are sampled separately (box / eyes / mouth) and each owns a
    // fixed particle index range — an expression swap or mouth flap only
    // re-targets the particles of the part that actually changed. Sampling
    // the whole face as one list reshuffled every particle on any change
    // (different point counts shift the i % pts.length mapping), which made
    // the entire face churn while a reply was typing.
    const partCache: Record<string, [number, number][]> = {};
    function samplePart(key: string, draw: (ctx: CanvasRenderingContext2D) => void) {
      if (partCache[key]) return partCache[key];
      const S = 320;
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#fff";
      draw(ctx);
      const img = ctx.getImageData(0, 0, S, S).data;
      const pts: [number, number][] = [];
      for (let y = 0; y < S; y += 2)
        for (let x = 0; x < S; x += 2)
          if (img[(y * S + x) * 4 + 3] > 128)
            pts.push([(x / S - 0.5) * 1.7, (0.5 - y / S) * 1.7]);
      partCache[key] = pts;
      return pts;
    }
    function faceParts(expr: string, open: boolean) {
      const head = samplePart("head", (ctx) => {
        ctx.lineWidth = 13;
        ctx.strokeRect(34, 34, 252, 252);
      });
      const eyeKey = expr === "laugh" || expr === "surprised" || expr === "confused" || expr === "sad"
        ? expr : "neutral"; // smile shares the neutral eyes
      const eyes = samplePart(`eyes|${eyeKey}`, (ctx) => {
        if (eyeKey === "laugh") {
          ctx.lineWidth = 11;
          ctx.beginPath(); ctx.arc(110, 140, 22, Math.PI, 2 * Math.PI); ctx.stroke();
          ctx.beginPath(); ctx.arc(210, 140, 22, Math.PI, 2 * Math.PI); ctx.stroke();
        } else if (eyeKey === "surprised") {
          ctx.beginPath(); ctx.arc(110, 128, 24, 0, 2 * Math.PI); ctx.fill();
          ctx.beginPath(); ctx.arc(210, 128, 24, 0, 2 * Math.PI); ctx.fill();
        } else if (eyeKey === "confused") {
          ctx.lineWidth = 11;
          ctx.beginPath(); ctx.arc(110, 128, 26, 0, 2 * Math.PI); ctx.stroke();
          ctx.fillRect(198, 116, 26, 30);
        } else if (eyeKey === "sad") {
          ctx.fillRect(92, 122, 36, 40);
          ctx.fillRect(192, 122, 36, 40);
        } else {
          ctx.fillRect(92, 110, 36, 42);
          ctx.fillRect(192, 110, 36, 42);
        }
      });
      const mouthKey = expr === "smile" || expr === "sad" || expr === "laugh" || expr === "surprised" || expr === "confused"
        ? expr : `neutral|${open ? 1 : 0}`;
      const mouth = samplePart(`mouth|${mouthKey}`, (ctx) => {
        ctx.lineWidth = 12;
        if (expr === "smile") {
          ctx.beginPath(); ctx.arc(160, 192, 52, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        } else if (expr === "sad") {
          ctx.beginPath(); ctx.arc(160, 254, 52, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
        } else if (expr === "laugh") {
          ctx.beginPath(); ctx.arc(160, 198, 46, 0, Math.PI); ctx.closePath(); ctx.fill();
        } else if (expr === "surprised") {
          ctx.beginPath(); ctx.arc(160, 226, 28, 0, 2 * Math.PI); ctx.stroke();
        } else if (expr === "confused") {
          ctx.lineWidth = 11;
          ctx.beginPath();
          ctx.moveTo(112, 230); ctx.lineTo(140, 214); ctx.lineTo(168, 232); ctx.lineTo(198, 216);
          ctx.stroke();
        } else if (open) {
          ctx.fillRect(110, 202, 100, 14);
          ctx.fillRect(110, 236, 100, 14);
        } else {
          ctx.fillRect(110, 216, 100, 16);
        }
      });
      return { head, eyes, mouth };
    }

    let mode: SphereMode = "lattice";
    function computeTargets() {
      const parts = mode === "terminal" ? faceParts(faceExpr, faceFlap) : null;
      // Particle budgets track each part's point count so density — and with
      // it the digit brightness — stays uniform across the face. The head
      // budget is constant (its point count never changes), so head particles
      // keep their targets through every expression/flap; only the small
      // eyes/mouth boundary sliver ever hops parts.
      const headN = parts ? Math.round(parts.head.length * 1.21) : 0;
      const eyesN = parts
        ? Math.round((COUNT - headN) * parts.eyes.length / (parts.eyes.length + parts.mouth.length))
        : 0;
      for (let i = 0; i < COUNT; i++) {
        const ox = originals[i * 3], oy = originals[i * 3 + 1], oz = originals[i * 3 + 2];
        let tx: number, ty: number, tz: number;
        if (!parts) {
          const s = 0.28;
          tx = Math.round(ox * 1.3 / s) * s;
          ty = Math.round(oy * 1.3 / s) * s;
          tz = Math.round(oz * 1.3 / s) * s;
        } else {
          const p = i < headN
            ? parts.head[i % parts.head.length]
            : i < headN + eyesN
              ? parts.eyes[(i - headN) % parts.eyes.length]
              : parts.mouth[(i - headN - eyesN) % parts.mouth.length];
          tx = p[0] - 1.45 + (randoms[i] - 0.5) * 0.02;
          ty = p[1] + 0.1 + ((randoms[i] * 7.31) % 1 - 0.5) * 0.02;
          tz = (((randoms[i] * 13.7) % 1) - 0.5) * 0.3;
        }
        targets[i * 3] = tx; targets[i * 3 + 1] = ty; targets[i * 3 + 2] = tz;
      }
    }
    computeTargets();

    function setMode(m: SphereMode) {
      if (m === mode) return;
      mode = m;
      computeTargets();
      if (m === "terminal") {
        // Snap-cut into the face: park the object transform at screen centre
        // immediately — otherwise the orb glides in from its orbit position,
        // un-rotating and re-scaling on the way (the "swing"). The quick
        // particle re-piece (phase 2) carries the whole transition instead.
        points.position.set(0, 0, 0);
        points.rotation.set(0, 0, 0);
        points.scale.setScalar(1);
        phase = 2;
        phaseStart = performance.now() / 1000;
      } else phase = 0; // lattice settles normally
    }

    // ─── Keyboard mesh ───────────────────────────────────────
    const keyboard = new THREE.Group();
    keyboard.position.set(-0.7, DESK_Y + 0.09, 3.2);
    keyboard.rotation.y = 0.04;
    scene.add(keyboard);

    const KB_W = 4.6, KB_D = 1.85;
    // Top face paints from keyboard-top.png (image top = far edge)
    const kbBase = new THREE.Mesh(
      new THREE.BoxGeometry(KB_W, 0.18, KB_D),
      faceMats(2, paintedMat("/textures/keyboard-top.png", CREAM), matCream)
    );
    addEdges(kbBase);
    keyboard.add(kbBase);

    const keyMeshes = new Map<string, { mesh: THREE.Mesh; baseY: number }>();
    const keyGeoCache = new Map<number, THREE.BoxGeometry>();
    const INNER_W = KB_W - 0.24;
    const ROW_D = 0.3, ROW_GAP = 0.05;
    KEY_ROWS.forEach((row, ri) => {
      const totalUnits = row.reduce((s, k) => s + (k.w ?? 1), 0);
      const unit = INNER_W / totalUnits;
      let xCursor = -INNER_W / 2;
      const z = -((KEY_ROWS.length - 1) * (ROW_D + ROW_GAP)) / 2 + ri * (ROW_D + ROW_GAP);
      for (const k of row) {
        const w = (k.w ?? 1) * unit;
        const keyW = Math.round((w - 0.05) * 1000);
        let geo = keyGeoCache.get(keyW);
        if (!geo) {
          geo = new THREE.BoxGeometry(keyW / 1000, 0.16, ROW_D);
          keyGeoCache.set(keyW, geo);
        }
        const mesh = new THREE.Mesh(geo, matCream);
        addEdges(mesh);
        const baseY = 0.09 + 0.08;
        mesh.position.set(xCursor + w / 2, baseY, z);
        keyboard.add(mesh);
        keyMeshes.set(k.code, { mesh, baseY });
        xCursor += w;
      }
    });

    // ─── Mouse mesh ──────────────────────────────────────────
    const mouse3d = new THREE.Group();
    scene.add(mouse3d);
    // Top face paints from mouse-top.png (image top = far edge, where the buttons sit)
    const mouseBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.26, 1.08),
      faceMats(2, paintedMat("/textures/mouse-top.png", CREAM), matCream)
    );
    addEdges(mouseBody);
    mouseBody.position.y = 0.13;
    mouse3d.add(mouseBody);
    const btnL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.44), matCream);
    addEdges(btnL);
    btnL.position.set(-0.18, 0.29, -0.3);
    const btnR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.44), matCream);
    addEdges(btnR);
    btnR.position.set(0.18, 0.29, -0.3);
    const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.24), matCreamDark);
    addEdges(wheel);
    wheel.position.set(0, 0.3, -0.3);
    mouse3d.add(btnL, btnR, wheel);

    // ─── Radio — grey box with a press-in play button ────────
    const radio = new THREE.Group();
    radio.position.set(4.7, DESK_Y, -2.5); // out to the right of the monitor's edge so the bezel stops clipping it
    radio.rotation.y = -0.5;               // angled toward the viewer
    scene.add(radio);

    const matRadio = new THREE.MeshLambertMaterial({ color: 0xb2b4b4 });
    // Front face paints from radio-front.png
    const radioBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 1.85, 0.95),
      faceMats(4, paintedMat("/textures/radio-front.png", 0xb2b4b4), matRadio)
    );
    addEdges(radioBody);
    radioBody.position.y = 0.925;
    radio.add(radioBody);

    // Readout panel — shows "now playing" only while the radio plays
    function createRadioFace(withText: boolean) {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 128;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#0c0c0c";
      ctx.fillRect(0, 0, 256, 128);
      if (withText) {
        ctx.fillStyle = "#f2f2f2";
        ctx.font = "500 34px ui-monospace, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillText("now", 18, 50);
        ctx.fillText("playing", 18, 95);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    const radioFaceOn = createRadioFace(true);
    const radioFaceOff = createRadioFace(false);
    const radioPanelMat = new THREE.MeshBasicMaterial({ map: radioFaceOff });
    const radioPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.36), radioPanelMat);
    radioPanel.position.set(-0.12, 1.35, 0.478);
    radio.add(radioPanel);

    // Speaker slits
    const matSlit = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    for (let i = 0; i < 4; i++) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.045, 0.02), matSlit);
      slit.position.set(0, 0.42 + i * 0.14, 0.472);
      radio.add(slit);
    }

    // Play button on the radio's side — pressed in while playing, popped out
    // while paused. Protrudes along local +x (the right face of the body).
    const RADIO_BTN_OUT = 0.68, RADIO_BTN_IN = 0.58;
    const radioButton = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.22, 0.22),
      new THREE.MeshLambertMaterial({ color: 0xd94f38 })
    );
    addEdges(radioButton);
    radioButton.position.set(RADIO_BTN_OUT, 1.38, 0.1);
    radio.add(radioButton);

    let radioPlaying = false;

    // ─── Spotify embed — real playback for the radio ─────────
    // Uses Spotify's iFrame Embed API: 30s previews for logged-out visitors,
    // full tracks when the visitor's browser is logged into Spotify Premium.
    // The player itself is parked off-viewport (audio only); the radio button
    // is the sole play/pause control and the banner carries attribution.
    let iframeAPI: any = null;
    let embedController: any = null;
    let embedAdvancePending = false;

    // Invisible but INSIDE the viewport: Spotify's embed lazy-initializes via
    // IntersectionObserver, so parking it off-screen prevents it from ever
    // loading. Opacity-0 keeps the geometry intersecting while showing nothing.
    const embedDiv = document.createElement("div");
    Object.assign(embedDiv.style, {
      position: "fixed", right: "18px", bottom: "18px",
      width: "340px", height: "80px",
      opacity: "0", pointerEvents: "none",
    } as CSSStyleDeclaration);
    const embedInner = document.createElement("div");
    embedDiv.appendChild(embedInner);
    document.body.appendChild(embedDiv);

    (window as any).onSpotifyIframeApiReady = (api: any) => { iframeAPI = api; };
    const embedScript = document.createElement("script");
    embedScript.src = "https://open.spotify.com/embed/iframe-api/v1";
    embedScript.async = true;
    document.body.appendChild(embedScript);

    function embedTracks(): any[] {
      return (integrations.spotify?.topTracks ?? []).filter((t: any) => t.uri);
    }

    function playEmbedTrack(idx: number) {
      const tracks = embedTracks();
      if (tracks.length === 0) return;
      trackIdx = ((idx % tracks.length) + tracks.length) % tracks.length;
      trackStart = performance.now();
      const uri = tracks[trackIdx].uri;
      if (embedController) {
        embedController.loadUri(uri);
        embedController.play();
        embedAdvancePending = false;
      } else if (iframeAPI) {
        iframeAPI.createController(embedInner, { uri, width: "100%", height: 80 }, (ctrl: any) => {
          embedController = ctrl;
          // Auto-advance to the next top track when one finishes
          ctrl.addListener("playback_update", (e: any) => {
            const d = e?.data;
            if (d && d.duration > 0 && d.position >= d.duration - 400 && !embedAdvancePending) {
              embedAdvancePending = true;
              playEmbedTrack(trackIdx + 1);
            }
          });
          ctrl.play();
        });
      }
    }

    function toggleRadio() {
      radioPlaying = !radioPlaying;
      radioPanelMat.map = radioPlaying ? radioFaceOn : radioFaceOff;
      radioPanelMat.needsUpdate = true;
      if (radioPlaying) {
        trackStart = performance.now();
        // called from the click gesture → autoplay allowed
        if (embedTracks().length > 0) playEmbedTrack(trackIdx);
      } else {
        embedController?.pause();
      }
    }

    // ─── Integrations (Calendly · Hevy · Spotify via backend) ─
    // Local fallback keeps the scene alive when the API server isn't running;
    // /api/integrations replaces it (server mocks any service missing keys).
    function fallbackCalendly() {
      const now = new Date();
      const year = now.getFullYear(), month = now.getMonth(), today = now.getDate();
      const dim = new Date(year, month + 1, 0).getDate();
      const available: number[] = [], booked: number[] = [];
      for (let d = today; d <= dim; d++) {
        const dow = new Date(year, month, d).getDay();
        if (dow === 0 || dow === 6) continue;
        (d % 4 === 2 ? booked : available).push(d);
      }
      return { year, month, today, available, booked, bookUrl: "https://calendly.com" };
    }
    let integrations: any = {
      calendly: fallbackCalendly(),
      hevy: { streakWeeks: 0, lastWorkout: null },
      spotify: { topTracks: [] },
    };
    let trackIdx = 0;
    let trackStart = 0;

    // ─── Desk calendar — Calendly availability on a tent prism ─
    const calendarG = new THREE.Group();
    calendarG.position.set(-4.35, DESK_Y, 0.4);
    calendarG.rotation.y = 0.45;
    scene.add(calendarG);

    const CAL_W = 1.7, CAL_S = 1.2, CAL_TILT = 0.34;
    const CAL_H = CAL_S * Math.cos(CAL_TILT); // apex height
    const CAL_D = CAL_S * Math.sin(CAL_TILT); // half depth at the base

    function makeCalCanvas() {
      const c = document.createElement("canvas");
      c.width = 512; c.height = 360;
      return c;
    }
    const calFrontCanvas = makeCalCanvas();
    const calBackCanvas = makeCalCanvas();
    const calFrontTex = new THREE.CanvasTexture(calFrontCanvas);
    const calBackTex = new THREE.CanvasTexture(calBackCanvas);
    calFrontTex.colorSpace = THREE.SRGBColorSpace;
    calBackTex.colorSpace = THREE.SRGBColorSpace;

    // Month grid in the Calendly-widget style: green available, orange booked
    function paintMonth(canvas: HTMLCanvasElement, cal: any, withData: boolean) {
      const ctx = canvas.getContext("2d")!;
      const cw = canvas.width, ch = canvas.height;
      const { year, month } = cal;
      ctx.fillStyle = "#faf6ec";
      ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = "#d8d2c0";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, cw - 4, ch - 4);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const monthName = new Date(year, month, 1).toLocaleString("en-US", { month: "long" });
      ctx.fillStyle = "#4a463c";
      ctx.font = "500 34px 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(`${monthName} ${year}`, cw / 2, 36);
      const gridX = 12, cellW = (cw - 24) / 7, gridY = 92, rowH = 36;
      ctx.font = "700 19px Arial";
      ctx.fillStyle = "#8a857a";
      ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach((d, i) =>
        ctx.fillText(d, gridX + cellW * (i + 0.5), 72));
      const first = new Date(year, month, 1).getDay();
      const dim = new Date(year, month + 1, 0).getDate();
      ctx.font = "500 20px Arial";
      for (let d = 1; d <= dim; d++) {
        const idx = first + d - 1;
        const x = gridX + (idx % 7) * cellW;
        const y = gridY + Math.floor(idx / 7) * rowH;
        let bg: string | null = null, fg = "#b9b4a6";
        if (withData) {
          if (cal.available?.includes(d)) { bg = "#cdea96"; fg = "#4a463c"; }
          else if (cal.booked?.includes(d)) { bg = "#f5c08a"; fg = "#4a463c"; }
        } else fg = "#8a857a";
        if (bg) { ctx.fillStyle = bg; ctx.fillRect(x + 2, y + 2, cellW - 4, rowH - 4); }
        ctx.fillStyle = fg;
        ctx.fillText(String(d), x + cellW / 2, y + rowH / 2);
        if (withData && d === cal.today) {
          ctx.strokeStyle = "#4a463c";
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x + 3, y + 3, cellW - 6, rowH - 6);
        }
      }
      if (withData) {
        ctx.fillStyle = "#1c1a16";
        ctx.fillRect(12, ch - 44, cw - 24, 34);
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 20px Arial";
        ctx.fillText("Book Now", cw / 2, ch - 27);
      }
    }

    function paintCalendar() {
      const cal = integrations.calendly;
      paintMonth(calFrontCanvas, cal, true);
      // Back slope previews next month, plain
      const nm = cal.month === 11 ? { year: cal.year + 1, month: 0 } : { year: cal.year, month: cal.month + 1 };
      paintMonth(calBackCanvas, nm, false);
      calFrontTex.needsUpdate = true;
      calBackTex.needsUpdate = true;
    }
    paintCalendar();

    const calFaceGeo = new THREE.PlaneGeometry(CAL_W, CAL_S);
    const calFront = new THREE.Mesh(calFaceGeo, new THREE.MeshLambertMaterial({ map: calFrontTex }));
    calFront.position.set(0, CAL_H / 2, CAL_D / 2);
    calFront.rotation.x = -CAL_TILT;
    calFront.castShadow = true;
    addEdges(calFront); // borders the printed face, and gives hover something to light up
    calendarG.add(calFront);
    // Back slope — identical face mirrored through the apex line
    const calBackWrap = new THREE.Group();
    calBackWrap.rotation.y = Math.PI;
    const calBack = new THREE.Mesh(calFaceGeo, new THREE.MeshLambertMaterial({ map: calBackTex }));
    calBack.position.set(0, CAL_H / 2, CAL_D / 2);
    calBack.rotation.x = -CAL_TILT;
    addEdges(calBack);
    calBackWrap.add(calBack);
    calendarG.add(calBackWrap);
    // Triangular end caps
    const capShape = new THREE.Shape();
    capShape.moveTo(CAL_D, 0);
    capShape.lineTo(-CAL_D, 0);
    capShape.lineTo(0, CAL_H);
    capShape.closePath();
    const capGeo = new THREE.ShapeGeometry(capShape);
    const capR = new THREE.Mesh(capGeo, matCream);
    capR.rotation.y = Math.PI / 2;
    capR.position.x = CAL_W / 2;
    addEdges(capR);
    const capL = new THREE.Mesh(capGeo, matCream);
    capL.rotation.y = -Math.PI / 2;
    capL.position.x = -CAL_W / 2;
    addEdges(capL);
    calendarG.add(capR, capL);
    // Base plate
    const calBase = box(CAL_W + 0.08, 0.04, CAL_D * 2 + 0.1);
    calBase.position.y = 0.02;
    calendarG.add(calBase);

    // ─── Hevy week-streak counter ────────────────────────────
    const streakG = new THREE.Group();
    streakG.position.set(-3.95, DESK_Y, 2.95);
    streakG.rotation.y = 0.35;
    scene.add(streakG);

    const streakCanvas = document.createElement("canvas");
    streakCanvas.width = 256; streakCanvas.height = 148;
    const streakTex = new THREE.CanvasTexture(streakCanvas);
    streakTex.colorSpace = THREE.SRGBColorSpace;

    function paintStreak() {
      const ctx = streakCanvas.getContext("2d")!;
      ctx.fillStyle = "#171310";
      ctx.fillRect(0, 0, 256, 148);
      ctx.strokeStyle = "#3a342a";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 144);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const last = integrations.hevy?.lastWorkout;
      const days = last?.date
        ? Math.max(0, Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000))
        : null;
      ctx.fillStyle = S_ACCENT;
      ctx.font = "700 56px ui-monospace, Menlo, monospace";
      ctx.fillText(days === null ? "—" : String(days), 128, 52);
      ctx.fillStyle = S_INK;
      ctx.font = "600 19px ui-monospace, Menlo, monospace";
      ctx.fillText(days === 1 ? "DAY SINCE" : "DAYS SINCE", 128, 95);
      ctx.fillText("LAST WORKOUT", 128, 117);
      ctx.fillStyle = S_DIM;
      ctx.font = "500 12px ui-monospace, Menlo, monospace";
      ctx.fillText("· hevy ·", 128, 137);
      streakTex.needsUpdate = true;
    }
    paintStreak();

    const streakBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.55, 0.18),
      [matCream, matCream, matCream, matCream, new THREE.MeshBasicMaterial({ map: streakTex }), matCream]
    );
    addEdges(streakBody);
    streakBody.position.y = 0.295;
    streakBody.rotation.x = -0.09; // leaned back a touch
    streakG.add(streakBody);
    // Mini dumbbell on the counter's open left side — angled so both plates
    // read from the camera (its old spot wedged it behind the counter and
    // into the keyboard, leaving a bare hammer-looking bar).
    const matIron = new THREE.MeshLambertMaterial({ color: 0x4a4a50 });
    const dbG = new THREE.Group();
    dbG.position.set(-0.82, 0, 0.32);
    dbG.rotation.y = 0.5;
    streakG.add(dbG);
    const dbBar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.055, 0.055), matIron);
    addEdges(dbBar);
    dbBar.position.y = 0.115;
    dbG.add(dbBar);
    const plateGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.09, 8);
    for (const side of [-1, 1]) {
      const plate = new THREE.Mesh(plateGeo, matIron);
      plate.rotation.z = Math.PI / 2;
      plate.position.set(side * 0.235, 0.115, 0);
      addEdges(plate);
      dbG.add(plate);
    }

    // ─── Résumé folder — kraft case file lying on the desk ──
    // Lies flat like the case files it's aping, tipped a few degrees up at the
    // far edge where it rests on a scatter of loose sheets. The sheet inside is
    // a real mesh: clicking pulls it out (it hides here, the overlay takes over).
    const FOLD_W = 2.5, FOLD_H = 3.15;
    const FOLD_LIFT = 0.06;  // rad the far edge rides up on the paper pile

    const folderG = new THREE.Group();
    folderG.position.set(4.45, DESK_Y, 1.8); // slid forward/down the frame; x keeps the tab inside a 16:10 viewport
    folderG.rotation.y = -0.14; // dropped down slightly off-square
    scene.add(folderG);
    // Laying it down lives on its own child so the yaw above stays a clean
    // turn (a world-X tilt on a yawed group rolls it sideways). At exactly
    // -π/2 the panel is flat with its top edge pointing away from camera;
    // FOLD_LIFT tips the face back toward the viewer from there.
    const folderTilt = new THREE.Group();
    folderTilt.rotation.x = -(Math.PI / 2 - FOLD_LIFT);
    folderTilt.position.y = 0.075; // sits on top of the loose sheets below
    folderG.add(folderTilt);

    // Kraft stock — flat base plus paper fibre, drawn once per face size
    function kraftCanvas(w: number, h: number, draw?: (ctx: CanvasRenderingContext2D) => void) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#9d6a41";
      ctx.fillRect(0, 0, w, h);
      const strands = Math.round((w * h) / 380);
      for (let i = 0; i < strands; i++) {
        const x = Math.random() * w, y = Math.random() * h, len = 3 + Math.random() * 14;
        ctx.strokeStyle = Math.random() > 0.5
          ? `rgba(198,152,106,${0.05 + Math.random() * 0.18})`
          : `rgba(110,70,36,${0.04 + Math.random() * 0.14})`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y + (Math.random() - 0.5) * 3);
        ctx.stroke();
      }
      draw?.(ctx);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    // Shrink a font until the string fits the given width — Arial Black is
    // not everywhere, and the fallbacks run wider.
    function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, start: number, spec: string) {
      let size = start;
      ctx.font = `${spec} ${size}px 'Arial Black', 'Helvetica Neue', Arial, sans-serif`;
      while (ctx.measureText(text).width > max && size > 12) {
        size -= 2;
        ctx.font = `${spec} ${size}px 'Arial Black', 'Helvetica Neue', Arial, sans-serif`;
      }
      return size;
    }

    const STAMP_INK = "#6d4020";
    // The desk is seen from ~22° above, so a face lying flat on it compresses
    // to well under half height on screen. The stamp is drawn pre-stretched
    // down the texture's V so perspective squashes it back to square. The
    // camera here is fixed, which is what makes that safe.
    const STAMP_STRETCH = 2.15;
    const folderFrontTex = kraftCanvas(512, 640, (ctx) => {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.translate(256, 330);
      ctx.scale(1, STAMP_STRETCH); // everything below is in on-screen proportions
      ctx.rotate(-0.02);           // stamped by hand, never quite square
      const bw = 452, bh = 142;
      ctx.strokeStyle = STAMP_INK;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 9);
      else ctx.rect(-bw / 2, -bh / 2, bw, bh);
      ctx.stroke();
      ctx.fillStyle = STAMP_INK;
      (ctx as any).letterSpacing = "9px";
      fitFont(ctx, "RESUME", bw - 48, 74, "900");
      ctx.fillText("RESUME", 4, -20);
      (ctx as any).letterSpacing = "3px";
      fitFont(ctx, "LORN HIN ADRIAN LAM", bw - 70, 21, "700");
      ctx.fillText("LORN HIN ADRIAN LAM", 2, 38);
      (ctx as any).letterSpacing = "0px";
      ctx.restore();
      // Ink distress — knock kraft-coloured speckle back over the stamp
      for (let i = 0; i < 300; i++) {
        const x = 30 + Math.random() * 452, y = 190 + Math.random() * 290;
        ctx.fillStyle = `rgba(157,106,65,${0.18 + Math.random() * 0.5})`;
        ctx.fillRect(x, y, 1 + Math.random() * 5, 1 + Math.random() * 4);
      }
      // Folded edge along the far side
      ctx.fillStyle = "rgba(92,58,28,0.45)";
      ctx.fillRect(0, 13, 512, 3);
      ctx.fillStyle = "rgba(214,172,126,0.3)";
      ctx.fillRect(0, 16, 512, 6);
    });

    // Back panel — the folder's underside, plain stock
    const folderBack = new THREE.Mesh(
      new THREE.BoxGeometry(FOLD_W, FOLD_H, 0.035),
      new THREE.MeshLambertMaterial({ map: kraftCanvas(256, 320) })
    );
    addEdges(folderBack);
    folderBack.position.set(0, FOLD_H / 2, -0.035);
    folderTilt.add(folderBack);

    // The sheet inside — sticks up past the front flap so it reads as loaded,
    // and hides while the overlay copy is on screen.
    const folderPaperTex = (() => {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 320;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fbf7ec";
      ctx.fillRect(0, 0, 256, 320);
      // Only the far strip clears the flap, so the name header lives up there,
      // stretched like the stamp to survive the flat viewing angle.
      ctx.save();
      ctx.translate(128, 26);
      ctx.scale(1, STAMP_STRETCH);
      ctx.fillStyle = "#2b2417";
      ctx.font = "600 11px 'Helvetica Neue', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Lorn Hin Adrian Lam", 0, 0);
      ctx.fillStyle = "#9a9385";
      ctx.fillRect(-58, 7, 116, 1.4);
      ctx.restore();
      ctx.fillStyle = "#c3bcac";
      for (let i = 0; i < 6; i++) ctx.fillRect(46, 62 + i * 11, 164 - Math.random() * 50, 2);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    })();
    const folderPaper = new THREE.Mesh(
      new THREE.BoxGeometry(FOLD_W - 0.2, FOLD_H - 0.12, 0.02),
      faceMats(4, new THREE.MeshLambertMaterial({ map: folderPaperTex }), new THREE.MeshLambertMaterial({ color: 0xf6f1e4 }))
    );
    addEdges(folderPaper);
    // Nudged out past the far edge and a touch right, so a white band of it
    // shows along the top of the closed folder.
    folderPaper.position.set(0.07, FOLD_H / 2 + 0.36, 0);
    folderTilt.add(folderPaper);

    // Front flap — carries the RESUME stamp
    const folderFront = new THREE.Mesh(
      new THREE.BoxGeometry(FOLD_W, FOLD_H - 0.16, 0.04),
      faceMats(4, new THREE.MeshLambertMaterial({ map: folderFrontTex }), new THREE.MeshLambertMaterial({ color: 0x9c6c43 }))
    );
    addEdges(folderFront);
    folderFront.position.set(0, (FOLD_H - 0.16) / 2, 0.035);
    folderTilt.add(folderFront);

    // Loose sheets underneath — the pile the folder rides up on, and the
    // reason its far edge sits proud of the desk.
    const looseMat = [
      new THREE.MeshLambertMaterial({ color: 0xf7f2e5 }),
      new THREE.MeshLambertMaterial({ color: 0xefe8d6 }),
      new THREE.MeshLambertMaterial({ color: 0xfbf8ef }),
    ];
    // Offset back under the folder's middle — the tilt group's panels sit
    // roughly FOLD_H/2 behind folderG's origin once they're laid flat.
    const PILE_Z = -FOLD_H / 2;
    [
      { x: -0.3, z: PILE_Z - 0.35, rot: 0.17, y: 0.015 },
      { x: 0.34, z: PILE_Z + 0.28, rot: -0.21, y: 0.04 },
      { x: -0.08, z: PILE_Z + 0.05, rot: 0.06, y: 0.065 },
    ].forEach((s, i) => {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.015, 2.8), looseMat[i]);
      addEdges(sheet);
      sheet.position.set(s.x, s.y, s.z);
      sheet.rotation.y = s.rot;
      folderG.add(sheet);
    });

    // ─── Résumé overlay — the sheet pulled out of the folder ─
    // A DOM layer rather than a mesh: the page is real selectable markup, so
    // it can be highlighted and copied. The sheet starts folded in half
    // across its middle (top half flipped face-down onto the bottom), rises
    // from below the viewport, pauses with the fold just clear of the bottom
    // edge, then swings the flap up and settles. Closing runs it backwards.
    const RESUME_AR = 1842 / 2388;      // US Letter-ish page proportions
    // Height-driven, but capped so a tall narrow window can't push the page
    // wider than the viewport.
    const SHEET_W = `min(${(88 * RESUME_AR).toFixed(2)}vh, 92vw)`;
    const SHEET_H = `min(88vh, ${(92 / RESUME_AR).toFixed(2)}vw)`;
    const RISE_MS = 620, FOLD_MS = 780;
    // Folded, only the bottom half shows. 17% leaves that half's midpoint a
    // little above the viewport's bottom edge before the flap opens.
    const PAUSE_Y = 17;

    let resumeOpen = false;
    let resumeBusy = false;             // mid-animation — ignore further clicks
    const resumeTimers: number[] = [];
    const clearResumeTimers = () => { while (resumeTimers.length) clearTimeout(resumeTimers.pop()!); };

    const resumeStyle = document.createElement("style");
    resumeStyle.textContent = RESUME_CSS;
    document.head.appendChild(resumeStyle);

    const resumeLayer = document.createElement("div");
    Object.assign(resumeLayer.style, {
      position: "fixed", inset: "0", zIndex: "40",
      display: "none", opacity: "0",
      background: "rgba(10,8,5,0.66)",
      transition: "opacity .42s ease",
      perspective: "1800px",
      cursor: "default",
    } as CSSStyleDeclaration);

    // Flex stage does the centring so the sheet can be sized with min().
    const stage = document.createElement("div");
    Object.assign(stage.style, {
      position: "absolute", inset: "0",
      display: "flex", alignItems: "center", justifyContent: "center",
      transformStyle: "preserve-3d",
    } as CSSStyleDeclaration);
    resumeLayer.appendChild(stage);

    const sheet = document.createElement("div");
    Object.assign(sheet.style, {
      position: "relative", width: SHEET_W, height: SHEET_H, flex: "0 0 auto",
      transformStyle: "preserve-3d",
      transition: `transform ${RISE_MS}ms cubic-bezier(.22,.9,.28,1)`,
      transform: "translateY(120%)",
      fontSize: `calc(${SHEET_W} * 0.0156)`, // page type scales with the sheet
    } as CSSStyleDeclaration);
    stage.appendChild(sheet);

    // The live, selectable page. Only this copy is ever interactive.
    const docLive = document.createElement("div");
    docLive.innerHTML = RESUME_HTML;
    Object.assign(docLive.style, {
      position: "absolute", inset: "0", display: "none",
      boxShadow: "0 22px 60px rgba(0,0,0,.6)",
    } as CSSStyleDeclaration);
    sheet.appendChild(docLive);

    // Fold stand-in — two clipped clones that only exist while it animates.
    // user-select:none keeps them out of any selection the visitor makes.
    const foldWrap = document.createElement("div");
    Object.assign(foldWrap.style, {
      position: "absolute", inset: "0", transformStyle: "preserve-3d",
      userSelect: "none", WebkitUserSelect: "none",
    } as CSSStyleDeclaration);
    foldWrap.setAttribute("aria-hidden", "true");
    sheet.appendChild(foldWrap);

    // `half` clips a full-height clone down to one half of the page.
    function pageHalf(which: "top" | "bottom") {
      const clip = document.createElement("div");
      Object.assign(clip.style, {
        position: "absolute", left: "0", width: "100%", height: "50%",
        top: which === "top" ? "0" : "50%",
        overflow: "hidden",
        boxShadow: "0 22px 60px rgba(0,0,0,.6)",
      } as CSSStyleDeclaration);
      const inner = document.createElement("div");
      inner.innerHTML = RESUME_HTML;
      Object.assign(inner.style, {
        position: "absolute", left: "0", width: "100%", height: "200%",
        top: which === "top" ? "0" : "-100%",
      } as CSSStyleDeclaration);
      clip.appendChild(inner);
      return clip;
    }

    // Bottom half — fixed; the spine the flap hinges on
    foldWrap.appendChild(pageHalf("bottom"));

    // Top half — the flap. rotateX(-180°) is folded shut over the front of
    // the bottom half, 0° is open.
    const flap = document.createElement("div");
    Object.assign(flap.style, {
      position: "absolute", left: "0", top: "0", width: "100%", height: "50%",
      transformStyle: "preserve-3d",
      transformOrigin: "50% 100%",
      transition: `transform ${FOLD_MS}ms cubic-bezier(.3,.86,.3,1)`,
      transform: "rotateX(-180deg)",
    } as CSSStyleDeclaration);
    foldWrap.appendChild(flap);

    const flapFront = pageHalf("top");
    Object.assign(flapFront.style, {
      top: "0", height: "100%", backfaceVisibility: "hidden",
    } as CSSStyleDeclaration);
    // Re-clip: inside the flap this box is the full flap height, and the
    // clone within it still needs to be a whole page tall.
    (flapFront.firstElementChild as HTMLElement).style.height = "200%";

    const flapBack = document.createElement("div");
    Object.assign(flapBack.style, {
      position: "absolute", inset: "0", backfaceVisibility: "hidden",
      // The extra 1px lifts the folded flap clear of the half it lands on —
      // coplanar layers in a preserve-3d context z-fight otherwise.
      transform: "rotateX(180deg) translateZ(1px)",
      // Blank reverse of the page, shaded away from the crease
      background: "linear-gradient(180deg, #fdfaf1 0%, #f7f2e6 66%, #efe7d6 100%)",
      boxShadow: "0 22px 60px rgba(0,0,0,.6)",
    } as CSSStyleDeclaration);
    flap.append(flapFront, flapBack);

    // Crease shadow along the fold line
    const crease = document.createElement("div");
    Object.assign(crease.style, {
      position: "absolute", left: "0", top: "50%", width: "100%", height: "2.4%",
      marginTop: "-1.2%", pointerEvents: "none", transform: "translateZ(2px)",
      background: "linear-gradient(180deg, rgba(120,104,74,0) 0%, rgba(120,104,74,.2) 46%, rgba(255,255,255,.45) 54%, rgba(120,104,74,0) 100%)",
      transition: "opacity .3s ease",
    } as CSSStyleDeclaration);
    sheet.appendChild(crease);

    const resumeHint = document.createElement("div");
    resumeHint.textContent = "select the text · click anywhere else to file it back ✦";
    Object.assign(resumeHint.style, {
      position: "absolute", left: "50%", bottom: "2.2vh", transform: "translateX(-50%) rotate(-1deg)",
      background: "#f2df6d", color: "#2b2417",
      padding: "7px 13px", font: "600 12px ui-monospace, Menlo, monospace",
      boxShadow: "0 4px 14px rgba(0,0,0,.5)", pointerEvents: "none",
      opacity: "0", transition: "opacity .3s ease .4s",
    } as CSSStyleDeclaration);
    resumeLayer.appendChild(resumeHint);
    document.body.appendChild(resumeLayer);

    // Swap the folding clones for the real page once it's flat, and back
    // again before it folds — selection only ever touches the live copy.
    function showLive(live: boolean) {
      docLive.style.display = live ? "block" : "none";
      foldWrap.style.display = live ? "none" : "block";
      // The crease only belongs on a sheet that's still folded — once it's
      // flat the page reads as a clean print.
      crease.style.opacity = live ? "0" : "1";
    }
    showLive(false);

    function openResume() {
      if (resumeOpen || resumeBusy) return;
      resumeOpen = true;
      resumeBusy = true;
      clearResumeTimers();
      setHovered(null, 0, 0);      // drop the folder's hover chip and amber outline
      folderPaper.visible = false; // the sheet left the folder
      showLive(false);
      resumeLayer.style.display = "block";
      sheet.style.transform = "translateY(120%)";
      flap.style.transform = "rotateX(-180deg)";
      void sheet.offsetWidth; // commit the start pose before transitioning off it
      resumeLayer.style.opacity = "1";
      sheet.style.transform = `translateY(${PAUSE_Y}%)`;
      resumeTimers.push(window.setTimeout(() => {
        flap.style.transform = "rotateX(0deg)";
        sheet.style.transform = "translateY(0%)";
        resumeHint.style.opacity = "1";
        resumeTimers.push(window.setTimeout(() => {
          showLive(true);
          resumeBusy = false;
        }, FOLD_MS));
      }, RISE_MS + 30));
    }

    function closeResume() {
      if (!resumeOpen || resumeBusy) return;
      resumeBusy = true;
      clearResumeTimers();
      resumeHint.style.opacity = "0";
      showLive(false);
      flap.style.transform = "rotateX(-180deg)";
      sheet.style.transform = `translateY(${PAUSE_Y}%)`;
      resumeTimers.push(window.setTimeout(() => {
        sheet.style.transform = "translateY(120%)";
        resumeLayer.style.opacity = "0";
        resumeTimers.push(window.setTimeout(() => {
          resumeLayer.style.display = "none";
          folderPaper.visible = true; // back in the folder
          resumeOpen = false;
          resumeBusy = false;
        }, RISE_MS));
      }, FOLD_MS));
    }

    // Clicks land here rather than on the canvas; stopPropagation keeps the
    // window-level scene handlers out of it.
    function onResumeLayerClick(e: MouseEvent) {
      e.stopPropagation();
      // A drag that selected text often ends up targeting the backdrop —
      // don't treat finishing a highlight as "put it away".
      if (!window.getSelection()?.isCollapsed) return;
      if (!sheet.contains(e.target as Node)) closeResume();
    }
    resumeLayer.addEventListener("click", onResumeLayerClick);

    // Live data swap-in
    fetch("/api/integrations")
      .then(r => r.json())
      .then(d => {
        integrations = { ...integrations, ...d };
        paintCalendar();
        paintStreak();
      })
      .catch(() => { /* backend not running — fallbacks stay */ });

    // ─── Terminal — avatar chat via the backend proxy ────────
    // Bot replies type out inside a speech bubble next to the particle face;
    // inline XML tags in the LLM output drive the face's expressions live.
    // The Groq key and persona prompt live server-side (see server/index.mjs).

    type FaceExpr = "neutral" | "smile" | "laugh" | "sad" | "confused" | "surprised";
    let faceExpr: FaceExpr = "neutral";
    let faceMotion: "none" | "nod" | "shake" = "none";
    let faceMotionStart = 0;
    let faceFlap = false;      // mouth-open frame while "talking"
    let lastFaceKey = "";      // expr|flap — retarget particles when it changes
    let bubbleTyping = false;

    let termInput = "";
    let termBusy = false;
    let termGreeted = false;
    let lastUserMsg = "";
    const termHistory: { role: "user" | "assistant"; content: string }[] = [];

    // Speech bubble typewriter state
    let bubbleClean = "";
    let bubbleEvents: { i: number; expr: string }[] = [];
    let bubbleApplied = 0;
    let bubbleStart = 0;
    const TYPE_SPEED = 42; // chars per second

    function setBubble(raw: string) {
      const re = /<\s*(smile|laugh|nod|shake|sad|confused|surprised|neutral)\s*\/?\s*>/gi;
      let clean = "";
      const events: { i: number; expr: string }[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) {
        clean += raw.slice(last, m.index);
        events.push({ i: clean.length, expr: m[1].toLowerCase() });
        last = m.index + m[0].length;
      }
      clean += raw.slice(last);
      bubbleClean = clean.replace(/[ \t]+/g, " ").trim();
      bubbleEvents = events;
      bubbleApplied = 0;
      bubbleStart = performance.now();
      faceExpr = "neutral";
      faceMotion = "none";
    }

    async function submitTerminal() {
      const q = termInput.trim();
      if (!q || termBusy) return;
      // Naming her to the terminal sends her past the window.
      if (/^nikki[\s!.?,]*$/i.test(q)) triggerWalker();
      termInput = "";
      lastUserMsg = q;
      termBusy = true;
      bubbleClean = ""; bubbleEvents = []; // thinking dots until the reply lands
      termHistory.push({ role: "user", content: q });
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: termHistory.slice(-12) }),
        });
        const data = await res.json();
        const text: string =
          data?.choices?.[0]?.message?.content ??
          `uplink error <sad/> ${data?.error?.message ?? data?.error ?? `http ${res.status}`}`;
        if (data?.choices?.[0]?.message?.content) {
          termHistory.push({ role: "assistant", content: text });
        }
        setBubble(text);
      } catch (err) {
        setBubble(`uplink error <sad/> is the backend running? (npm run server) ${String(err)}`);
      }
      termBusy = false;
    }

    // ─── Cable (verlet, friction only — no gravity) ──────────
    const CABLE_POINTS = 14;
    const FRICTION = 0.9;
    let cablePts: { p: THREE.Vector3; prev: THREE.Vector3 }[] | null = null;
    let cableMesh: THREE.Mesh | null = null;
    const cableMat = new THREE.MeshLambertMaterial({ color: CREAM });
    const anchorLocal = new THREE.Vector3(2.2, -1.7, -1.5); // monitor back, lower right
    const anchorWorld = new THREE.Vector3();
    const cableEndLocal = new THREE.Vector3(0, 0.28, -0.45); // top-front of the mouse, above the buttons
    const cableEndWorld = new THREE.Vector3();

    // ─── Interaction state ───────────────────────────────────
    const pointerVP = { x: 0.5, y: 0.5 };        // viewport fractions
    const crt = { cx: 50, cy: 40 };              // screen-space %
    const pressedCodes = new Set<string>();
    const buttons = { left: false, right: false };

    // ─── LamOS state machine — boot splash → desktop → windows ─
    let osState: "boot" | "desktop" = "boot";
    let bootStart = performance.now();
    let bootDur = 1000 + Math.random() * 1000; // random 1–2s boot
    let openPage: PageId | null = null;
    let pageScroll = 0;
    let pageMax = 0;               // max scroll, measured from painted content
    // Extras-page slideshow — index, last auto-advance time, and the arrow
    // hotspots (screen px, refreshed every painted frame so scrolled positions
    // stay clickable)
    let slideIdx = 0;
    let slideAt = 0;
    let slidePrevRect: { x: number; y: number; w: number; h: number } | null = null;
    let slideNextRect: { x: number; y: number; w: number; h: number } | null = null;
    // Caption to show in a hover tooltip over the extras photo (set each frame)
    let galleryTip: string | null = null;

    const TITLE_H = 56;
    const XB = { x: 14, y: 12, w: 34, h: 32 }; // close button, top-left
    const inRect = (px: number, py: number, r: { x: number; y: number; w: number; h: number }) =>
      px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    function iconRect(i: number) {
      return { x: 36, y: 84 + i * 112, w: 168, h: 112 };
    }

    function openWindow(id: PageId) {
      openPage = id;
      pageScroll = 0;
      pageMax = 0;
      setMode(id === "chat" ? "terminal" : "lattice");
    }
    function closeWindow() {
      openPage = null;
      setMode("lattice");
    }
    function reboot() {
      osState = "boot";
      bootStart = performance.now();
      bootDur = 1000 + Math.random() * 1000;
      closeWindow();
    }

    function handleScreenClick(px: number, py: number) {
      if (osState === "boot") return;
      if (!openPage) {
        for (let i = 0; i < DESKTOP_ICONS.length; i++) {
          if (inRect(px, py, iconRect(i))) { openWindow(DESKTOP_ICONS[i].id); return; }
        }
        return;
      }
      if (inRect(px, py, XB)) { closeWindow(); return; }
      if (openPage === "extras" && galleryImgs.length > 0) {
        const n = galleryImgs.length;
        if (slidePrevRect && inRect(px, py, slidePrevRect)) {
          slideIdx = (slideIdx + n - 1) % n;
          slideAt = performance.now(); // manual flip restarts the auto-play timer
        } else if (slideNextRect && inRect(px, py, slideNextRect)) {
          slideIdx = (slideIdx + 1) % n;
          slideAt = performance.now();
        }
      }
    }

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    // Oversized invisible plane coplanar with the screen — pointer projects
    // onto it, then clamps into screen bounds, so the cursor tracks even when
    // the ray misses the screen quad itself.
    const pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(OPEN_W * 4, OPEN_H * 4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pickPlane.position.z = 0.055;
    monitor.add(pickPlane);

    let overScreen = true;

    // Hand-modeled button replacements (from the shell auto-loader below).
    // When present they're attached to their prop group and pressed by offset
    // from the procedural button's animation, whose meshes stay as drivers.
    let extPowerBtn: THREE.Object3D | null = null;
    let extPowerBase: THREE.Vector3 | null = null;
    let extRadioBtn: THREE.Object3D | null = null;
    let extRadioBase: THREE.Vector3 | null = null;

    function isWithin(obj: THREE.Object3D, root: THREE.Object3D) {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur === root) return true;
        cur = cur.parent;
      }
      return false;
    }

    // ─── Hover highlight on the real-world clickables ────────
    // Every prop already carries dark edge lines from addEdges(). Each
    // clickable gets its own line material instead of the shared one, so
    // hovering can ease that outline from OUTLINE up to the amber accent —
    // an actual highlight around the object, not just a hand cursor. A small
    // scale pop and a label chip ride along.
    type Clickable = {
      root: THREE.Object3D;
      label: () => string;
      act: () => void;
      pop: number;                      // extra scale at full hover
      mat: THREE.LineBasicMaterial;
      t: number;                        // 0..1 eased hover amount
    };
    const HL_BASE = new THREE.Color(OUTLINE);
    const HL_HOT = new THREE.Color(S_ACCENT);

    function makeClickable(root: THREE.Object3D, label: () => string, act: () => void, pop: number): Clickable {
      const mat = new THREE.LineBasicMaterial({ color: OUTLINE });
      root.traverse((o) => {
        if ((o as THREE.LineSegments).isLineSegments) (o as THREE.LineSegments).material = mat;
      });
      return { root, label, act, pop, mat, t: 0 };
    }

    // Shared so the hand-modeled power button (when a monitor shell is loaded)
    // triggers exactly the same thing as the procedural one.
    const togglePower = () => {
      screenOn = !screenOn;
      if (screenOn) reboot(); // powering back on re-runs the LamOS splash
    };

    const clickables: Clickable[] = [
      makeClickable(powerButton, () => (screenOn ? "power off" : "power on"), togglePower, 0.16),
      makeClickable(folderG, () => "open résumé", () => openResume(), 0.03),
      makeClickable(radio, () => (radioPlaying ? "pause" : "play my top tracks"), () => toggleRadio(), 0.025),
      makeClickable(calendarG, () => "book a call", () => {
        // The prism's Book Now — opens the real Calendly page
        window.open(integrations.calendly?.bookUrl ?? "https://calendly.com", "_blank", "noopener");
      }, 0.025),
    ];

    // Clickables plus everything that can stand in front of them, so clicking
    // the desk ahead of the radio doesn't reach through it.
    const pickTargets: THREE.Object3D[] = [
      desk, mousepad, keyboard, mouse3d, monitor, radio, calendarG, streakG, folderG,
    ];

    function pickClickable(clientX: number, clientY: number): Clickable | null {
      ndc.set((clientX / window.innerWidth) * 2 - 1, -((clientY / window.innerHeight) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(pickTargets, true);
      // Skip the invisible pointer pick-plane (a huge monitor child) — it
      // otherwise swallows every hit before it can reach the props.
      const first = hits.find(h => h.object !== pickPlane && (h.object as THREE.Mesh).isMesh && h.object.visible)?.object;
      if (!first) return null;
      return clickables.find(c => isWithin(first, c.root)) ?? null;
    }

    let hovered: Clickable | null = null;

    const hoverTip = document.createElement("div");
    Object.assign(hoverTip.style, {
      position: "fixed", left: "0", top: "0", zIndex: "20", pointerEvents: "none",
      transform: "translate(16px, 18px)", whiteSpace: "nowrap",
      background: "#f2df6d", color: "#2b2417",
      padding: "5px 9px", font: "600 12px ui-monospace, Menlo, monospace",
      boxShadow: "0 3px 12px rgba(0,0,0,.45)",
      opacity: "0", transition: "opacity .12s ease",
    } as CSSStyleDeclaration);
    document.body.appendChild(hoverTip);

    function setHovered(next: Clickable | null, clientX: number, clientY: number) {
      hovered = next;
      if (next) {
        hoverTip.textContent = next.label();
        hoverTip.style.left = `${clientX}px`;
        hoverTip.style.top = `${clientY}px`;
      }
      hoverTip.style.opacity = next ? "1" : "0";
    }

    function onPointerMove(e: MouseEvent) {
      if (resumeOpen) { setHovered(null, 0, 0); return; }
      pointerVP.x = e.clientX / window.innerWidth;
      pointerVP.y = e.clientY / window.innerHeight;
      ndc.set(pointerVP.x * 2 - 1, -(pointerVP.y * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(pickPlane, false)[0];
      if (hit) {
        const local = pickPlane.worldToLocal(hit.point.clone());
        // On the screen itself → hide the OS cursor (the HUD arrow takes over).
        overScreen =
          Math.abs(local.x) <= OPEN_W / 2 &&
          Math.abs(local.y) <= OPEN_H / 2;
        crt.cx = Math.max(0, Math.min(100, (local.x / OPEN_W + 0.5) * 100));
        crt.cy = Math.max(0, Math.min(100, (0.5 - local.y / OPEN_H) * 100));
      } else {
        overScreen = false;
      }
      if (!screenOn) overScreen = false; // dark screen: nothing to point at
      // Off the screen, only an actual clickable gets the hand — everything
      // else keeps the plain arrow instead of pretending the desk is a button.
      setHovered(overScreen ? null : pickClickable(e.clientX, e.clientY), e.clientX, e.clientY);
      mount.style.cursor = overScreen ? "none" : hovered ? "pointer" : "default";
    }

    function onClick(e: MouseEvent) {
      if (resumeOpen) return; // the overlay owns the pointer while it's up
      const target = pickClickable(e.clientX, e.clientY);
      if (target) { target.act(); return; }
      if (screenOn && overScreen) {
        handleScreenClick(crt.cx / 100 * HUD_W, crt.cy / 100 * HUD_H);
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (resumeOpen) return;
      if (e.button === 0) buttons.left = true;
      if (e.button === 2) {
        buttons.right = true;
        // Right-click anywhere toggles the lean (mousedown fires exactly once
        // per press; contextmenu can double-fire in some environments)
        toggleLean();
      }
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 0) buttons.left = false;
      if (e.button === 2) buttons.right = false;
    }
    function onContextMenu(e: MouseEvent) { e.preventDefault(); }
    function onKeyDown(e: KeyboardEvent) {
      // While the résumé is up it swallows input; Escape files it back.
      if (resumeOpen) {
        if (e.key === "Escape") closeResume();
        return;
      }
      pressedCodes.add(e.code);
      // Terminal input capture — only while lets_chat.exe is open
      if (openPage === "chat" && screenOn) {
        if (e.key === "Enter") void submitTerminal();
        else if (e.key === "Backspace") termInput = termInput.slice(0, -1);
        else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (termInput.length < 200) termInput += e.key;
        }
      }
    }
    function onKeyUp(e: KeyboardEvent) { pressedCodes.delete(e.code); }

    // Scroll the open window's content (chat manages its own layout)
    function onWheel(e: WheelEvent) {
      if (!resumeOpen && screenOn && overScreen && openPage && openPage !== "chat") {
        pageScroll = Math.max(0, Math.min(pageMax, pageScroll + e.deltaY));
      }
    }

    // ── Touch input: tap = move virtual cursor + click, drag = scroll ──
    // Reuses the mouse handlers by translating touches into their event shape;
    // onPointerMove derives crt.cx/cy + overScreen synchronously and onClick
    // consumes that state, which is exactly what a real mouse does, compressed.
    let touchStartY = 0;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length > 1) return; // let the browser handle pinch (nothing to zoom)
      const t = e.touches[0];
      touchStartY = t.clientY;
      onPointerMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
    }
    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length > 0) return; // still fingers down (pinch) — not a tap
      const t = e.changedTouches[0];
      if (Math.abs(t.clientY - touchStartY) > 12) return; // it was a scroll drag
      onPointerMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
      onClick({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length > 1) return; // pinch — leave it to the browser
      const t = e.touches[0];
      onWheel({ deltaY: touchStartY - t.clientY } as WheelEvent); // drag up = scroll down
      touchStartY = t.clientY;
      e.preventDefault(); // stop rubber-banding the page
    }

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("click", onClick);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    if (isMobile) {
      window.addEventListener("touchstart", onTouchStart, { passive: true });
      window.addEventListener("touchend", onTouchEnd);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
    }

    // ─── Hover outline — glowing ink contour on interactable props ──
    // Life-is-Strange-style "you can touch this" highlight. Screen-space, so it
    // works on the boxy geometry; a gentle pulse keeps it feeling alive.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const outlinePass = new OutlinePass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera
    );
    outlinePass.edgeStrength = 3;
    outlinePass.edgeThickness = 1;
    outlinePass.edgeGlow = 0.12;
    outlinePass.pulsePeriod = 2.2;
    outlinePass.visibleEdgeColor.set("#ffffff");
    outlinePass.hiddenEdgeColor.set("#777777");
    composer.addPass(outlinePass);

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      outlinePass.setSize(window.innerWidth, window.innerHeight);
      // Reframe the locked lean after orientation change / iOS toolbar collapse.
      computeLeanCamPos();
    }
    window.addEventListener("resize", onResize);

    // ─── Dev-only: export the physical props to .glb for Blender ──
    // In `npm run dev`, open the console and call exportSceneGLB(). It
    // downloads workstation.glb — the desk, monitor, keyboard, mouse, radio,
    // calendar and dumbbell with their exact in-scene spacing — so you can
    // remodel the shells in Blender against the real layout. Code-only parts
    // that stay procedural (pickPlane etc. — invisible) are skipped; the CRT
    // screen plane and keycaps export as visible reference, delete them there.
    // See docs/blender-remodel.md for the full round-trip.
    if (import.meta.env.DEV) {
      (window as any).exportSceneGLB = async () => {
        const { GLTFExporter } = await import(
          "three/examples/jsm/exporters/GLTFExporter.js"
        );
        const props = [desk, mousepad, monitor, keyboard, mouse3d, radio, calendarG, streakG];
        new GLTFExporter().parse(
          props,
          (result) => {
            const blob = new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "workstation.glb";
            a.click();
            URL.revokeObjectURL(a.href);
            console.log("[dev] workstation.glb downloaded");
          },
          (err) => console.error("[dev] GLB export failed", err),
          { binary: true, onlyVisible: true }
        );
      };
      console.log(
        "%c[dev] call exportSceneGLB() to download workstation.glb for Blender",
        "color:#c99b2f;font-weight:600"
      );
    }

    // ─── Hand-modeled shell auto-loader ──────────────────────
    // Any .glb dropped into public/models/ under the expected names (see its
    // README) replaces its procedural shell; a missing or invalid file
    // silently leaves the procedural one in place. Sub-objects named
    // power-button / radio-button / readout are re-bound to their behavior.
    {
      const findNamed = (root: THREE.Object3D, re: RegExp): THREE.Object3D | null => {
        let found: THREE.Object3D | null = null;
        root.traverse((o) => { if (!found && re.test(o.name)) found = o; });
        return found;
      };
      // GLB materials arrive as glossy PBR — flatten to Lambert + ink edges so
      // loaded shells match the scene. 24°: only crease edges get outlined,
      // not every triangle of a beveled surface.
      const stylize = (root: THREE.Object3D) => {
        const meshes: THREE.Mesh[] = [];
        root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
        for (const m of meshes) {
          const conv = (mat: THREE.Material) => {
            const src = mat as THREE.MeshStandardMaterial;
            return new THREE.MeshLambertMaterial({
              color: src.color ? src.color.clone() : new THREE.Color(CREAM),
              map: src.map ?? null,
            });
          };
          m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
          m.castShadow = true;
          m.receiveShadow = true;
          m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry as THREE.BufferGeometry, 24), edgeMat));
        }
      };
      // Shells export in world space (Blender bakes the group transform when
      // only the mesh is selected) — re-express them in the prop group's local
      // space so the group's transform isn't applied twice, and so the shell
      // inherits raycast targeting + any future group moves.
      const mountShell = (root: THREE.Object3D, group: THREE.Object3D, hide: THREE.Object3D[]) => {
        group.updateWorldMatrix(true, false);
        root.applyMatrix4(group.matrixWorld.clone().invert());
        stylize(root);
        for (const h of hide) h.visible = false;
        group.add(root);
      };
      // desk/mousepad are plain meshes, not groups: the replacement becomes a
      // child, so blank the look (material + edge twins) instead of hiding the
      // object — a hidden parent would hide the replacement too, and the mesh
      // must stay raycastable as a click occluder.
      const blankMesh = (m: THREE.Mesh) => {
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.visible = false;
        for (const c of m.children) c.visible = false;
      };
      type ShellSwap = {
        file: string;
        group: THREE.Object3D;
        hide: () => THREE.Object3D[];
        after?: (root: THREE.Object3D) => void;
      };
      const shellSwaps: ShellSwap[] = [
        {
          file: "monitor-shell.glb", group: monitor,
          hide: () => [body, topBar, botBar, leftBar, rightBar, neck, foot],
          after: (root) => {
            const btn = findNamed(root, /power/i);
            if (btn) {
              powerButton.visible = false; // stays as the invisible animation driver
              monitor.attach(btn); // keeps world transform; local space = group space
              extPowerBtn = btn;
              extPowerBase = btn.position.clone();
              // The procedural powerButton is hidden now, so pickClickable can
              // no longer reach it — register the loaded button in its place so
              // it keeps the label chip, hover outline and click behavior.
              clickables.push(makeClickable(
                btn, () => (screenOn ? "power off" : "power on"), togglePower, 0.16
              ));
            }
          },
        },
        { file: "keyboard-base.glb", group: keyboard, hide: () => [kbBase] },
        { file: "mouse-shell.glb", group: mouse3d, hide: () => [mouseBody, btnL, btnR, wheel] },
        {
          file: "radio-shell.glb", group: radio,
          hide: () => radio.children.filter((o) => (o as THREE.Mesh).isMesh && o !== radioPanel && o !== radioButton),
          after: (root) => {
            const btn = findNamed(root, /button/i);
            if (btn) {
              radioButton.visible = false;
              radio.attach(btn);
              extRadioBtn = btn;
              extRadioBase = btn.position.clone();
            }
            const face = findNamed(root, /readout/i) as THREE.Mesh | null;
            if (face?.isMesh) { face.material = radioPanelMat; radioPanel.visible = false; }
          },
        },
        { file: "calendar-shell.glb", group: calendarG, hide: () => [capR, capL, calBase] },
        {
          file: "streak-shell.glb", group: streakG, hide: () => [streakBody],
          after: (root) => {
            // A face named "readout" becomes the live display; otherwise a
            // plane goes where the procedural front face was.
            const face = findNamed(root, /readout/i) as THREE.Mesh | null;
            if (face?.isMesh) { face.material = new THREE.MeshBasicMaterial({ map: streakTex }); return; }
            const plane = new THREE.Mesh(
              new THREE.PlaneGeometry(0.95, 0.55),
              new THREE.MeshBasicMaterial({ map: streakTex })
            );
            plane.position.copy(streakBody.position);
            plane.rotation.copy(streakBody.rotation);
            plane.translateZ(0.091);
            streakG.add(plane);
          },
        },
        { file: "dumbbell.glb", group: dbG, hide: () => [...dbG.children] },
        { file: "desk.glb", group: desk, hide: () => { blankMesh(desk); return []; } },
        { file: "mousepad.glb", group: mousepad, hide: () => { blankMesh(mousepad); return []; } },
      ];
      void (async () => {
        const loaded: string[] = [];
        let loader: any = null;
        for (const s of shellSwaps) {
          try {
            const res = await fetch(`/models/${s.file}`);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            // The SPA server answers missing files with 200 + index.html —
            // require the binary-glTF magic bytes before parsing.
            if (buf.byteLength < 12 || new DataView(buf).getUint32(0, true) !== 0x46546c67) continue;
            if (!loader) {
              const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
              loader = new GLTFLoader();
            }
            const gltf = await loader.parseAsync(buf, "/models/");
            mountShell(gltf.scene, s.group, s.hide());
            s.after?.(gltf.scene);
            // makeClickable() retargets edge lines at startup, long before this
            // shell existed — so re-point the new meshes' lines at the owning
            // clickable's material, or the loaded prop would never tint amber.
            const owner = clickables.find((c) => c.root === s.group);
            if (owner) {
              gltf.scene.traverse((o) => {
                if ((o as THREE.LineSegments).isLineSegments)
                  (o as THREE.LineSegments).material = owner.mat;
              });
            }
            loaded.push(s.file);
          } catch (err) {
            console.warn(`[models] ${s.file} failed to load — procedural shell kept`, err);
          }
        }
        if (loaded.length) console.log(`[models] swapped in: ${loaded.join(", ")}`);
        else if (import.meta.env.DEV) console.log("[models] no .glb shells in public/models/ — all procedural");
      })();
    }

    // ─── HUD painting — LamOS: boot splash → desktop → windows ─
    let vignette: CanvasGradient | null = null;
    const MONO = "ui-monospace, Menlo, monospace";
    const MARKER = "'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive";

    // Blocky LamOS wordmark — drawn tiny, upscaled nearest-neighbor so the
    // letters land as fat pixels
    const bootWordC = document.createElement("canvas");
    bootWordC.width = 160; bootWordC.height = 40;
    {
      const bctx = bootWordC.getContext("2d")!;
      bctx.fillStyle = "#ffffff";
      bctx.textAlign = "center";
      bctx.textBaseline = "middle";
      bctx.font = "700 26px 'Courier New', ui-monospace, monospace";
      bctx.fillText("LamOS", 76, 22);
      bctx.font = "700 9px 'Courier New', ui-monospace, monospace";
      bctx.fillText("TM", 136, 8);
    }

    function drawBoot(now: number) {
      hud.fillStyle = "#000000";
      hud.fillRect(0, 0, HUD_W, HUD_H);
      hud.textBaseline = "middle";
      hud.imageSmoothingEnabled = false;
      hud.drawImage(bootWordC, (HUD_W - 160 * 6) / 2, 178, 160 * 6, 240);
      hud.imageSmoothingEnabled = true;
      // Segmented win9x-style progress pill
      const progress = Math.min(1, (now - bootStart) / bootDur);
      const pw = 400, ph = 62, bx = (HUD_W - pw) / 2, by = 440, r = ph / 2;
      hud.strokeStyle = "#ffffff";
      hud.lineWidth = 3;
      hud.beginPath();
      hud.moveTo(bx + r, by);
      hud.arcTo(bx + pw, by, bx + pw, by + ph, r);
      hud.arcTo(bx + pw, by + ph, bx, by + ph, r);
      hud.arcTo(bx, by + ph, bx, by, r);
      hud.arcTo(bx, by, bx + pw, by, r);
      hud.closePath();
      hud.stroke();
      const filled = Math.max(1, Math.floor(progress * 10));
      hud.fillStyle = "#ffffff";
      for (let i = 0; i < filled; i++) {
        hud.fillRect(bx + 22 + i * 36, by + 14, 28, ph - 28);
      }
    }

    function drawIconGraphic(kind: "folder" | "exe", cx: number, ty: number) {
      if (kind === "folder") {
        hud.fillStyle = "#c99b2f";
        hud.fillRect(cx - 30, ty, 26, 12);        // tab
        hud.fillRect(cx - 32, ty + 8, 64, 44);    // back
        hud.fillStyle = S_ACCENT;
        hud.fillRect(cx - 32, ty + 20, 64, 32);   // front flap
        hud.strokeStyle = "#241a0a";
        hud.lineWidth = 2;
        hud.strokeRect(cx - 32, ty + 8, 64, 44);
      } else {
        // Mini CRT running the digit face
        hud.fillStyle = "#d8d0ba";
        hud.fillRect(cx - 32, ty, 64, 46);
        hud.fillStyle = "#12100c";
        hud.fillRect(cx - 25, ty + 6, 50, 34);
        hud.fillStyle = S_ACCENT;
        hud.fillRect(cx - 16, ty + 14, 8, 8);
        hud.fillRect(cx + 8, ty + 14, 8, 8);
        hud.fillRect(cx - 12, ty + 30, 24, 5);
        hud.strokeStyle = "#241a0a";
        hud.lineWidth = 2;
        hud.strokeRect(cx - 32, ty, 64, 46);
        hud.fillStyle = "#d8d0ba";
        hud.fillRect(cx - 10, ty + 46, 20, 7);
        hud.fillRect(cx - 18, ty + 53, 36, 4);
      }
    }

    function drawDesktop(px: number, py: number) {
      hud.fillStyle = "#050505";
      hud.fillRect(0, 0, HUD_W, HUD_H);
      hud.textBaseline = "middle";
      DESKTOP_ICONS.forEach((icon, i) => {
        const r = iconRect(i);
        const hov = overScreen && inRect(px, py, r);
        if (hov) {
          hud.fillStyle = "rgba(232,197,71,0.10)";
          hud.fillRect(r.x, r.y, r.w, r.h);
          hud.strokeStyle = "rgba(232,197,71,0.55)";
          hud.lineWidth = 1;
          hud.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        }
        const cx = r.x + r.w / 2;
        drawIconGraphic(icon.kind, cx, r.y + 12);
        hud.font = `500 17px ${MONO}`;
        hud.textAlign = "center";
        hud.fillStyle = hov ? S_ACCENT : S_INK;
        hud.fillText(icon.label, cx, r.y + 90);
      });
      hud.font = `500 15px ${MONO}`;
      hud.textAlign = "right";
      hud.fillStyle = S_DIM;
      hud.fillText("LamOS™ v0.1 — it barely works", HUD_W - 24, HUD_H - 24);
    }

    function drawTitleBar(title: string, px: number, py: number) {
      hud.fillStyle = "rgba(16,13,10,0.97)";
      hud.fillRect(0, 0, HUD_W, TITLE_H);
      hud.fillStyle = S_LINE;
      hud.fillRect(0, TITLE_H - 2, HUD_W, 2);
      // Close button — top-left, back to the desktop
      const hov = overScreen && inRect(px, py, XB);
      hud.fillStyle = hov ? "#e8654e" : "#d94f38";
      hud.fillRect(XB.x, XB.y, XB.w, XB.h);
      hud.strokeStyle = "#241a0a";
      hud.lineWidth = 2;
      hud.strokeRect(XB.x, XB.y, XB.w, XB.h);
      hud.strokeStyle = "#ffffff";
      hud.lineWidth = 3;
      hud.beginPath();
      hud.moveTo(XB.x + 10, XB.y + 9);
      hud.lineTo(XB.x + XB.w - 10, XB.y + XB.h - 9);
      hud.moveTo(XB.x + XB.w - 10, XB.y + 9);
      hud.lineTo(XB.x + 10, XB.y + XB.h - 9);
      hud.stroke();
      hud.font = `500 21px ${MONO}`;
      hud.textAlign = "left";
      hud.textBaseline = "middle";
      hud.fillStyle = S_INK;
      hud.fillText(`C:\\ ${title}`, XB.x + XB.w + 18, TITLE_H / 2 + 1);
    }

    // ── Window pages — neocities-grade filler until the real content lands ──
    function sectionHeader(text: string, y: number) {
      hud.textAlign = "left";
      hud.font = `700 22px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.fillText(text, 84, y);
      return y + 36;
    }

    // Word-wraps against the *current* hud.font — call after setting font.
    function wrapLines(text: string, maxW: number): string[] {
      const words = text.split(" ");
      const out: string[] = [];
      let line = "";
      for (const w of words) {
        const probe = line ? line + " " + w : w;
        if (hud.measureText(probe).width > maxW && line) { out.push(line); line = w; }
        else line = probe;
      }
      if (line) out.push(line);
      return out;
    }

    function paintAbout(now: number) {
      let y = 24;
      hud.textAlign = "center";
      hud.textBaseline = "middle";
      hud.font = `700 30px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.fillText("⛧°。 ⋆༺ABOUT ME༻⋆。 °⛧", HUD_W / 2, y); y += 58;
      // The greeting is a long line in a big display font — shrink it until it
      // fits rather than letting it run off both edges of the screen.
      hud.fillStyle = S_INK;
      const greeting = "Hi I'm adrian, welcome to my humble abode :^)";
      let gsize = 44;
      hud.font = `900 ${gsize}px ${MARKER}`;
      while (gsize > 22 && hud.measureText(greeting).width > HUD_W - 96) {
        gsize -= 2;
        hud.font = `900 ${gsize}px ${MARKER}`;
      }
      hud.fillText(greeting, HUD_W / 2, y); y += 56;
      hud.font = `500 20px ${MONO}`;
      hud.fillStyle = S_DIM;
      [
        "Data Scientist/AI Engineer · AMC A-lister · New York City",
      ].forEach(l => { hud.fillText(l, HUD_W / 2, y); y += 30; });
      y += 14;
      hud.fillStyle = S_LINE;
      hud.fillRect(120, y, HUD_W - 240, 2); y += 40;

      y = sectionHeader(">> fave things", y);
      hud.font = `500 19px ${MONO}`;
      ([
        ["meal", "quesabirria (and a fat nap after)"],
        ["coffee order", "hot mocha w/ oatmilk (in a heatwave)"],
        ["musician", "Daniel Caesar"],
        ["movie", "interstellar"],
        ["miniclip game", "raftwars 2"],
        ["superhero", "spiderman ofc"],
      ] as const).forEach(([k, v]) => {
        hud.fillStyle = S_ACCENT;
        hud.fillText(`· ${k}:`, 104, y);
        hud.fillStyle = S_INK;
        hud.fillText(v, 340, y);
        y += 30;
      });
      y += 24;

      // Visitor counter — mandatory on any self-respecting 90s page
      hud.fillStyle = "#000000";
      hud.fillRect(HUD_W / 2 - 150, y, 300, 54);
      hud.strokeStyle = S_DIM;
      hud.lineWidth = 2;
      hud.strokeRect(HUD_W / 2 - 150, y, 300, 54);
      hud.textAlign = "center";
      hud.font = `700 26px ${MONO}`;
      hud.fillStyle = "#5dff5d";
      hud.fillText("visitor № 001337", HUD_W / 2, y + 28);
      y += 84;

      return y + 30;
    }

    function paintHowTo() {
      let y = 24;
      hud.textAlign = "center";
      hud.textBaseline = "middle";
      hud.font = `700 30px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.fillText("✦ HOW_TO.TXT ✦", HUD_W / 2, y); y += 46;
      hud.font = `500 19px ${MONO}`;
      hud.fillStyle = S_DIM;
      hud.fillText("everything in this room does something. go poke it.", HUD_W / 2, y);
      y += 30;
      hud.fillStyle = S_LINE;
      hud.fillRect(120, y, HUD_W - 240, 2); y += 40;

      // One line per thing, wrapped against the window's width.
      function entries(rows: readonly (readonly [string, string])[]) {
        const LABEL_X = 104, TEXT_X = 366, LINE_H = 25;
        rows.forEach(([label, text]) => {
          hud.textAlign = "left";
          hud.font = `700 18px ${MONO}`;
          hud.fillStyle = S_ACCENT;
          hud.fillText(`· ${label}`, LABEL_X, y);
          hud.font = `500 19px ${MONO}`;
          hud.fillStyle = S_INK;
          const lines = wrapLines(text, HUD_W - TEXT_X - 84);
          lines.forEach((line, i) => {
            hud.fillText(line, TEXT_X, y + i * LINE_H);
          });
          y += Math.max(1, lines.length) * LINE_H + 9;
        });
        y += 18;
      }

      y = sectionHeader(">> stuff on the desk", y);
      entries([
        ["radio", "press it to play whatever I've had on repeat on Spotify lately."],
        ["résumé folder", "click it and the page slides out and unfolds — the text is real, so highlight it."],
        ["desk calendar", "click it to grab a slot on my actual Calendly."],
        ["power button", "bottom-left of the monitor's bezel, kills the screen and reboots LamOS on the way back."],
        ["gym counter", "days since I last touched a barbell, pulled live from Hevy and rarely flattering."],
      ]);

      y = sectionHeader(">> stuff on the screen", y);
      entries([
        ["about me", "the short version of who I am, plus a visitor counter I refuse to remove."],
        ["how_to", "you are here."],
        ["personal projects", "things I built because I wanted them to exist."],
        ["extras", "a photo dump with captions, hover a photo to read one."],
        ["let's chat.exe", "talk to the little guy made of particles — he answers as me."],
      ]);

      y = sectionHeader(">> good to know", y);
      entries([
        ["lean in", "right-click (or two-finger click) anywhere to pull up to the screen, then again to lean back."],
        ["your hardware", "the keyboard and mouse on the desk mirror the ones under your hands."],
        ["scrolling", "spin the wheel to move whichever window is open."],
        ["the window", "the sky out there tracks New York's actual time of day."],
        ["say her name", "type \"nikki\" to the terminal, then keep an eye on the window."],
      ]);

      return y + 10;
    }

    function paintProjects(px: number, py: number) {
      let y = 24;
      hud.textBaseline = "middle";
      hud.textAlign = "center";
      hud.font = `700 28px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.fillText("★ personal projects ★", HUD_W / 2, y); y += 50;

      // 2×2 gallery — a thumbnail (gif or image), name, blurb, tags per card
      const drawStill = (img: HTMLImageElement) =>
        (x: number, y2: number, w: number, h: number) =>
          drawThumb(hud, img.complete ? img : null, img.naturalWidth, img.naturalHeight, x, y2, w, h);
      const drawGifThumb = (anim: GifAnim) =>
        (x: number, y2: number, w: number, h: number) => {
          const cf = anim.frames[anim.idx];
          drawThumb(hud, cf?.canvas ?? null, cf?.canvas.width ?? 0, cf?.canvas.height ?? 0, x, y2, w, h);
        };
      const cards: {
        name: string;
        draw: (x: number, y: number, w: number, h: number) => void;
        blurb: string;
        tags: string;
      }[] = [
        {
          name: "chinatown hacks",
          draw: drawGifThumb(chinatownAnim),
          blurb: "co-organized a hackathon for 25+ bay area high schools, raising $50k+ for the students.",
          tags: "community · hackathon · sf",
        },
        {
          name: "toodles",
          draw: drawGifThumb(toodlesAnim),
          blurb: "a virtual mailing extension to remind you to write to your friends and tell them what they mean to you!",
          tags: "chrome extension · cosmos",
        },
        {
          name: "shorthandml",
          draw: drawStill(shorthandImg),
          blurb: "a cnn-transformer-lstm that learns to read gregg shorthand squiggles.",
          tags: "pytorch · ctc · beam search",
        },
        {
          name: "wegotcha",
          draw: drawGifThumb(captchaAnim),
          blurb: "ai-proof captcha that won us 2nd @ anthropic x menlo builder day with a lil motion blur and our natural human experience.",
          tags: "claude · computer use",
        },
        {
          name: "personal website alt",
          draw: drawGifThumb(neocitiesAnim),
          blurb: "paying homage to that old internet charm of neocities, handdrawn by me.",
          tags: "neocities · three.js · my ipad",
        },
        {
          name: "nook",
          draw: drawStill(nookImg),
          blurb: "a cozy ios app for livestreaming those focus sessions to your close friends, cause it's nice to have some company doing what you love.",
          tags: "swift · supabase",
        },
        {
          name: "matcha",
          draw: drawStill(matchaImg),
          blurb: "making studying a game, who doesn't love games? It's a win-win.",
          tags: "next.js · mcps",
        },
      ];

      const GAP = 16, CARD_W = (HUD_W - 120 - GAP) / 2, THUMB_H = 300, TEXT_H = 116;
      const CARD_H = THUMB_H + TEXT_H;
      hud.textAlign = "left";
      cards.forEach((p, i) => {
        const cx = 60 + (i % 2) * (CARD_W + GAP);
        const cy = y + Math.floor(i / 2) * (CARD_H + GAP);
        hud.strokeStyle = "#3a342a";
        hud.lineWidth = 2;
        hud.strokeRect(cx, cy, CARD_W, CARD_H);
        p.draw(cx, cy, CARD_W, THUMB_H);
        hud.font = `700 19px ${MONO}`;
        hud.fillStyle = S_ACCENT;
        hud.fillText(p.name, cx + 14, cy + THUMB_H + 24);
        hud.font = `500 15px ${MONO}`;
        hud.fillStyle = S_INK;
        wrapLines(p.blurb, CARD_W - 28).slice(0, 3).forEach((line, li) =>
          hud.fillText(line, cx + 14, cy + THUMB_H + 48 + li * 20));
        hud.font = `500 13px ${MONO}`;
        hud.fillStyle = S_DIM;
        hud.fillText(p.tags, cx + 14, cy + CARD_H - 12);
      });
      const rows = Math.ceil(cards.length / 2);
      y += rows * CARD_H + (rows - 1) * GAP + 24;
      return y + 10;
    }

    function paintExtras(now: number, px: number, py: number) {
      let y = 22;
      hud.textBaseline = "middle";
      // Marquee — obligatory
      hud.font = `700 21px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.textAlign = "left";
      const mtext = "Bits from my photo library ✦ college moments + hackathon shenanigans + solo travel throwbacks ✦ ";
      const mw = hud.measureText(mtext).width;
      const off = (now / 20) % mw;
      hud.fillText(mtext, -off, y);
      hud.fillText(mtext, -off + mw, y);
      hud.fillText(mtext, -off + mw * 2, y);
      y += 54;

      const n = galleryImgs.length;
      // Auto-play: advance every few seconds while the page is open
      if (n > 0) {
        if (slideAt === 0) slideAt = now;
        if (now - slideAt > 4000) { slideIdx = (slideIdx + 1) % n; slideAt = now; }
      }

      // The slide — contain-fit inside one big frame
      const FX = 72, FW = HUD_W - 144, FH = 470;
      hud.fillStyle = "#12100c";
      hud.fillRect(FX, y, FW, FH);
      hud.textAlign = "center";
      if (n > 0) {
        const img = galleryImgs[slideIdx % n];
        if (img.complete && img.naturalWidth > 0) {
          const s = Math.min(FW / img.naturalWidth, FH / img.naturalHeight);
          const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
          hud.drawImage(img, FX + (FW - iw) / 2, y + (FH - ih) / 2, iw, ih);
        } else {
          hud.font = `500 18px ${MONO}`;
          hud.fillStyle = S_DIM;
          hud.fillText("developing…", HUD_W / 2, y + FH / 2);
        }
      } else {
        hud.font = `500 18px ${MONO}`;
        hud.fillStyle = S_DIM;
        hud.fillText("no photos yet - oops", HUD_W / 2, y + FH / 2);
      }
      hud.strokeStyle = "#3a342a";
      hud.lineWidth = 2;
      hud.strokeRect(FX, y, FW, FH);

      // Hover anywhere on the photo → surface its caption as a tooltip (drawn
      // unclipped, on top, back in drawPage). Screen rect accounts for scroll.
      const frameScreen = { x: FX, y: y + TITLE_H + 24 - pageScroll, w: FW, h: FH };
      if (n > 0 && overScreen && inRect(px, py, frameScreen)) {
        galleryTip = galleryCaption(slideIdx % n);
      }
      y += FH + 26;

      // Controls: << prev · counter · next >>
      const BW = 74, BH = 44;
      const drawArrow = (bx: number, label: string) => {
        const r = { x: bx, y: y + TITLE_H + 24 - pageScroll, w: BW, h: BH };
        const hov = overScreen && inRect(px, py, r);
        hud.fillStyle = hov ? "rgba(232,197,71,0.18)" : "rgba(232,197,71,0.07)";
        hud.fillRect(bx, y, BW, BH);
        hud.strokeStyle = S_ACCENT;
        hud.lineWidth = 2;
        hud.strokeRect(bx, y, BW, BH);
        hud.font = `700 20px ${MONO}`;
        hud.fillStyle = S_INK;
        hud.textAlign = "center";
        hud.fillText(label, bx + BW / 2, y + BH / 2 + 1);
        return r;
      };
      slidePrevRect = drawArrow(FX, "<<");
      slideNextRect = drawArrow(FX + FW - BW, ">>");
      hud.font = `500 20px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.textAlign = "center";
      hud.fillText(n > 0 ? `${slideIdx + 1} / ${n}` : "0 / 0", HUD_W / 2, y + BH / 2 + 1);
      y += BH + 30;

      hud.font = `500 15px ${MONO}`;
      hud.fillStyle = S_DIM;
      hud.fillText("auto-plays · click the arrows to flip", HUD_W / 2, y);
      return y + 24;
    }

    function drawPage(id: Exclude<PageId, "chat">, now: number, px: number, py: number) {
      hud.fillStyle = "#0a0806";
      hud.fillRect(0, 0, HUD_W, HUD_H);
      slidePrevRect = slideNextRect = null;
      galleryTip = null;
      hud.save();
      hud.beginPath();
      hud.rect(0, TITLE_H, HUD_W, HUD_H - TITLE_H);
      hud.clip();
      hud.translate(0, TITLE_H + 24 - pageScroll);
      let bottom = 0;
      if (id === "about") bottom = paintAbout(now);
      else if (id === "howto") bottom = paintHowTo();
      else if (id === "projects") bottom = paintProjects(px, py);
      else bottom = paintExtras(now, px, py);
      hud.restore();
      pageMax = Math.max(0, bottom - (HUD_H - TITLE_H - 48));
      if (pageScroll > pageMax) pageScroll = pageMax;
      // Chunky retro scrollbar
      if (pageMax > 0) {
        const trackY = TITLE_H + 8, trackH = HUD_H - TITLE_H - 16;
        hud.fillStyle = "rgba(232,197,71,0.08)";
        hud.fillRect(HUD_W - 18, trackY, 10, trackH);
        const thumbH = Math.max(40, trackH * (trackH / (trackH + pageMax)));
        const thumbY = trackY + (trackH - thumbH) * (pageScroll / pageMax);
        hud.fillStyle = S_DIM;
        hud.fillRect(HUD_W - 18, thumbY, 10, thumbH);
      }

      // Hover tooltip (extras photo caption) — drawn last so it sits on top and
      // isn't clipped by the page area. Positioned just below-right of the
      // cursor, clamped to stay fully on-screen.
      if (galleryTip) {
        hud.font = `500 16px ${MONO}`;
        hud.textAlign = "left";
        hud.textBaseline = "middle";
        const padX = 12, padY = 9, tw = hud.measureText(galleryTip).width;
        const bw = tw + padX * 2, bh = 34;
        let bx = px + 16, by = py + 18;
        if (bx + bw > HUD_W - 8) bx = px - 16 - bw;
        if (by + bh > HUD_H - 8) by = py - 18 - bh;
        bx = Math.max(8, bx); by = Math.max(8, by);
        hud.fillStyle = "rgba(12,10,8,0.96)";
        hud.fillRect(bx, by, bw, bh);
        hud.strokeStyle = S_ACCENT;
        hud.lineWidth = 2;
        hud.strokeRect(bx, by, bw, bh);
        hud.fillStyle = S_INK;
        hud.fillText(galleryTip, bx + padX, by + bh / 2 + 1);
      }
    }

    // Chat — avatar pane; the face itself is particles rendered by the
    // ascii-digit pipeline behind this HUD (see computeTargets).
    function drawChat() {
        const now = performance.now();
        if (!termGreeted) {
          termGreeted = true;
          setBubble("Hey, I'm adrian — well, the digit version of him <smile/> ask me about my work, projects, or anything else <nod/>");
        }

        // Typewriter reveal + expression events
        const revealed = Math.min(bubbleClean.length, Math.floor(((now - bubbleStart) / 1000) * TYPE_SPEED));
        while (bubbleApplied < bubbleEvents.length && bubbleEvents[bubbleApplied].i <= revealed) {
          const ev = bubbleEvents[bubbleApplied++].expr;
          if (ev === "nod" || ev === "shake") { faceMotion = ev; faceMotionStart = now; }
          else faceExpr = ev as FaceExpr;
        }
        const typing = revealed < bubbleClean.length;
        // Once the whole reply has been read out, settle into a neutral smile
        if (bubbleTyping && !typing && bubbleClean) {
          faceExpr = "smile";
          faceMotion = "none";
        }
        bubbleTyping = typing;

        // ── Speech bubbles ──
        hud.textAlign = "left";
        hud.font = "500 21px ui-monospace, Menlo, monospace";
        const LINE_H = 32; // bubble line spacing — loose enough to read on the CRT
        const wrap = (text: string, maxW: number) => {
          const out: string[] = [];
          for (const para of text.split("\n")) {
            let line = "";
            for (const word of para.split(" ")) {
              const probe = line ? line + " " + word : word;
              if (hud.measureText(probe).width > maxW && line) { out.push(line); line = word; }
              else line = probe;
            }
            out.push(line);
          }
          return out;
        };

        // User's message — small bubble, top right (below the title bar)
        if (lastUserMsg) {
          const uLines = wrap(lastUserMsg, 480);
          const uw = Math.min(480, Math.max(...uLines.map(l => hud.measureText(l).width))) + 32;
          const ux = HUD_W - 24 - uw;
          const uh = uLines.length * LINE_H + 22;
          hud.fillStyle = "rgba(232,197,71,0.07)";
          hud.fillRect(ux, TITLE_H + 14, uw, uh);
          hud.strokeStyle = S_DIM;
          hud.lineWidth = 2;
          hud.strokeRect(ux, TITLE_H + 14, uw, uh);
          hud.fillStyle = S_INK;
          uLines.forEach((l, i) => hud.fillText(l, ux + 16, TITLE_H + 32 + i * LINE_H));
        }

        // Bot speech bubble — tail pointing at the particle face (screen-left)
        const FY = 355; // face center in HUD pixels
        const BX = 410, BW = HUD_W - BX - 28;
        const shown = bubbleClean.slice(0, revealed);
        const bLines = bubbleClean
          ? wrap(shown + (typing ? "▋" : ""), BW - 36)
          : [termBusy ? "•".repeat(1 + (Math.floor(now / 300) % 3)) : ""];
        if (bLines[0] !== "") {
          const bh = bLines.length * LINE_H + 26;
          const by = Math.max(TITLE_H + 40, Math.min(FY - bh / 2, HUD_H - 200 - bh));
          hud.fillStyle = "rgba(23,19,14,0.96)";
          hud.fillRect(BX, by, BW, bh);
          hud.strokeStyle = S_ACCENT;
          hud.lineWidth = 2;
          hud.strokeRect(BX, by, BW, bh);
          // Tail
          const ty = Math.min(Math.max(FY, by + 18), by + bh - 18);
          hud.fillStyle = "rgba(23,19,14,0.96)";
          hud.beginPath();
          hud.moveTo(BX + 1, ty - 12); hud.lineTo(BX - 22, ty); hud.lineTo(BX + 1, ty + 12);
          hud.closePath();
          hud.fill();
          hud.strokeStyle = S_ACCENT;
          hud.beginPath();
          hud.moveTo(BX + 1, ty - 12); hud.lineTo(BX - 22, ty); hud.lineTo(BX + 1, ty + 12);
          hud.stroke();
          hud.fillStyle = S_INK;
          bLines.forEach((l, i) => hud.fillText(l, BX + 18, by + 22 + i * LINE_H));
        }

        // ── Chatbox — bottom aligned ──
        const iy = HUD_H - 84;
        hud.fillStyle = "rgba(23,19,14,0.96)";
        hud.fillRect(20, iy, HUD_W - 40, 56);
        hud.strokeStyle = S_LINE;
        hud.lineWidth = 2;
        hud.strokeRect(20, iy, HUD_W - 40, 56);
        hud.font = "500 22px ui-monospace, Menlo, monospace";
        if (termInput) {
          hud.fillStyle = S_ACCENT;
          hud.fillText("> " + termInput, 38, iy + 29);
        } else {
          hud.fillStyle = S_ACCENT;
          hud.fillText(">", 38, iy + 29);
          hud.fillStyle = S_DIM;
          hud.fillText(" type a message and press enter…", 52, iy + 29);
        }
        if (Math.floor(now / 500) % 2 === 0) {
          const cw = hud.measureText("> " + termInput).width;
          hud.fillStyle = S_ACCENT;
          hud.fillRect(38 + cw + 5, iy + 17, 12, 24);
        }
    }

    function drawHUD() {
      hud.clearRect(0, 0, HUD_W, HUD_H);
      const now = performance.now();
      const px = crt.cx / 100 * HUD_W;
      const py = crt.cy / 100 * HUD_H;

      if (osState === "boot" && now - bootStart >= bootDur) osState = "desktop";
      if (osState === "boot") {
        drawBoot(now);
      } else if (!openPage) {
        drawDesktop(px, py);
      } else if (openPage === "chat") {
        drawChat();
        drawTitleBar(WINDOW_TITLES.chat, px, py);
      } else {
        drawPage(openPage, now, px, py);
        drawTitleBar(WINDOW_TITLES[openPage], px, py);
      }

      // Scanlines — kept light so the screen stays readable
      hud.fillStyle = "rgba(0,0,0,0.09)";
      for (let y = 0; y < HUD_H; y += 4) hud.fillRect(0, y, HUD_W, 1);

      // Vignette
      if (!vignette) {
        vignette = hud.createRadialGradient(HUD_W / 2, HUD_H / 2, HUD_H * 0.42, HUD_W / 2, HUD_H / 2, HUD_H * 0.85);
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,0.32)");
      }
      hud.fillStyle = vignette;
      hud.fillRect(0, 0, HUD_W, HUD_H);

      // Now-playing message — bottom left while the radio plays (top-left now
      // belongs to the window close button).
      // Queue = your recent Spotify top tracks; no banner without real tracks.
      const tracks = integrations.spotify?.topTracks ?? [];
      if (radioPlaying && tracks.length > 0 && osState !== "boot") {
        hud.font = "500 24px ui-monospace, Menlo, monospace";
        hud.textAlign = "left";
        hud.textBaseline = "middle";
        const tr = tracks[trackIdx % tracks.length];
        const msg = `🎵 Now Playing - ${tr.name} — ${tr.artist}`;
        const tw = hud.measureText(msg).width;
        hud.fillStyle = "rgba(18,16,12,0.82)";
        hud.fillRect(HUD_W - tw - 46, 14, tw + 30, 42);
        hud.fillStyle = S_ACCENT;
        hud.fillText(msg, HUD_W - tw - 30, 36);
      }

      // Cursor arrow — only while the pointer is actually on the screen;
      // off-screen the visible OS hand cursor takes over. Skipped on touch:
      // a parked fake cursor with no hover just looks like a dead pixel.
      if (overScreen && !isMobile) {
        const px = crt.cx / 100 * HUD_W;
        const py = crt.cy / 100 * HUD_H;
        hud.save();
        hud.translate(px, py);
        hud.scale(1.6, 1.6);
        hud.beginPath();
        hud.moveTo(0.5, 0.5); hud.lineTo(0.5, 15); hud.lineTo(4, 11.8);
        hud.lineTo(6.8, 18); hud.lineTo(9.2, 17); hud.lineTo(6.6, 11); hud.lineTo(11.5, 11);
        hud.closePath();
        hud.fillStyle = "#ffffff";
        hud.strokeStyle = "#000000";
        hud.lineWidth = 1;
        hud.fill();
        hud.stroke();
        hud.restore();
      }

      hudTexture.needsUpdate = true;
    }

    // ─── Animate ─────────────────────────────────────────────
    const sphereMouse = new THREE.Vector3(0, 0, 1);
    const sphereMouseTarget = new THREE.Vector3(0, 0, 1);
    const ORBIT = { r: 0.85, tilt: 0.4, w: 0.5 };
    const ballPos = new THREE.Vector3();
    const t0 = performance.now();
    let lastFrameT = t0;
    let raf = 0;

    function animate() {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - lastFrameT) / 1000);
      lastFrameT = now;

      // ── Chinatown Hacks gif — hand-timed frame playback ──
      for (const g of gifAnims) {
        if (g.frames.length === 0) continue;
        g.elapsed += dt * 1000;
        const cur = g.frames[g.idx];
        if (g.elapsed > cur.delay) {
          g.elapsed -= cur.delay;
          g.idx = (g.idx + 1) % g.frames.length;
        }
      }

      // ── Window walker — triggered by greeting the terminal ──
      if (walkerActive) {
        const age = now - walkerStart;
        paintSky(skyCtx, 512, 384);
        if (age > WALKER_DURATION) walkerActive = false;
        else drawWalker(skyCtx, 512, 384, age / WALKER_DURATION, walkerDir);
        skyTexture.needsUpdate = true;
      }

      // ── Lean-in camera blend ──
      if (leanOn) leanT = Math.min(1, leanT + dt / LEAN_IN_DUR);
      else leanT = Math.max(0, leanT - dt / LEAN_OUT_DUR);
      const leanBlend = leanBlendOf();
      camera.position.lerpVectors(CAM_BASE_POS, leanCamPos, leanBlend);
      camLook.lerpVectors(CAM_BASE_LOOK, leanLookAt, leanBlend);
      camera.lookAt(camLook);

      // ── Sphere physics ──
      sphereMouseTarget.set((crt.cx / 50 - 1) * 3, (1 - crt.cy / 50) * 2, 1);
      sphereMouse.lerp(sphereMouseTarget, 0.08);

      const nowS = now / 1000;
      // The face runs a stiffer, heavier-damped spring than the idle lattice
      // orb so expression swaps land snappily instead of bouncing.
      let attract = mode === "terminal" ? 0.055 : 0.03;
      let damp = mode === "terminal" ? 0.8 : 0.88;
      let teleport = false;
      if (phase === 2) {
        attract = 0.1;
        damp = 0.7;
        teleport = true;
        if (nowS - phaseStart > 0.35) phase = 0;
      }

      for (let i = 0; i < COUNT; i++) {
        const tx = targets[i * 3], ty = targets[i * 3 + 1], tz = targets[i * 3 + 2];
        const dx = positions[i * 3] - sphereMouse.x;
        const dy = positions[i * 3 + 1] - sphereMouse.y;
        const dz = positions[i * 3 + 2] - sphereMouse.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const infl = 0.5 / (d2 + 0.4);
        const ttx = tx + dx * infl;
        const tty = ty + dy * infl;
        const ttz = tz + dz * infl * 0.3;

        if (teleport && Math.random() < 0.12) {
          positions[i * 3] = ttx; positions[i * 3 + 1] = tty; positions[i * 3 + 2] = ttz;
          velocities[i * 3] = 0; velocities[i * 3 + 1] = 0; velocities[i * 3 + 2] = 0;
          continue;
        }
        velocities[i * 3] += (ttx - positions[i * 3]) * attract;
        velocities[i * 3 + 1] += (tty - positions[i * 3 + 1]) * attract;
        velocities[i * 3 + 2] += (ttz - positions[i * 3 + 2]) * attract;
        velocities[i * 3] *= damp;
        velocities[i * 3 + 1] *= damp;
        velocities[i * 3 + 2] *= damp;
        positions[i * 3] += velocities[i * 3];
        positions[i * 3 + 1] += velocities[i * 3 + 1];
        positions[i * 3 + 2] += velocities[i * 3 + 2];
      }
      sphereGeometry.attributes.position.needsUpdate = true;

      if (mode === "lattice") {
        const th = t * ORBIT.w;
        ballPos.set(Math.cos(th) * ORBIT.r, Math.sin(th) * ORBIT.r * ORBIT.tilt, Math.sin(th) * ORBIT.r);
        points.position.copy(ballPos);
        points.scale.setScalar(1 / 6);
        points.rotation.y += 0.005;
        points.rotation.x = Math.sin(t * 0.18) * 0.16;

        // Twin orb: exact opposite phase, smaller body, tighter orbit
        const th2 = th + Math.PI;
        const r2 = ORBIT.r * 0.55;
        points2.visible = true;
        points2.position.set(Math.cos(th2) * r2, Math.sin(th2) * r2 * ORBIT.tilt, Math.sin(th2) * r2);
        points2.scale.setScalar(1 / 10);
        points2.rotation.y -= 0.007;
        points2.rotation.x = Math.sin(t * 0.22 + 1.7) * 0.16;
      } else {
        points2.visible = false;
        // Talking mouth flap re-targets the particle face
        const flap = bubbleTyping && faceExpr === "neutral" && Math.floor(now / 150) % 2 === 0;
        const key = `${faceExpr}|${flap ? 1 : 0}`;
        if (key !== lastFaceKey) {
          const exprChanged = lastFaceKey !== "" && !lastFaceKey.startsWith(faceExpr + "|");
          lastFaceKey = key;
          faceFlap = flap;
          computeTargets();
          // Small, quick re-piece between expressions — no explosive scatter
          if (exprChanged) {
            phase = 2;
            phaseStart = nowS;
          }
        }
        // Head motion: nod bobs vertically, shake sways horizontally —
        // fast sway that dies out quickly
        let ox = 0, oy = 0;
        if (faceMotion !== "none") {
          const age = (now - faceMotionStart) / 1000;
          if (age > 0.55) faceMotion = "none";
          else {
            const ease = 1 - age / 0.55;
            if (faceMotion === "nod") oy = Math.sin(age * 22) * 0.08 * ease;
            else ox = Math.sin(age * 26) * 0.1 * ease;
          }
        }
        if (faceExpr === "laugh") oy += Math.sin(now / 65) * 0.02; // giggle bounce
        points.position.x += (ox - points.position.x) * 0.3;
        points.position.y += (oy - points.position.y) * 0.3;
        points.position.z *= 0.88;
        points.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
        points.rotation.y *= 0.92;
        points.rotation.x *= 0.92;
      }

      // ── Ceiling fan spin — its shadow sweeps the desk ──
      fan.rotation.y += 0.045;

      // ── Keyboard keys ──
      for (const [code, k] of keyMeshes) {
        const target = pressedCodes.has(code) ? k.baseY - 0.06 : k.baseY;
        k.mesh.position.y += (target - k.mesh.position.y) * 0.5;
        const mat = pressedCodes.has(code) ? matCreamDark : matCream;
        if (k.mesh.material !== mat) k.mesh.material = mat;
      }

      // ── Mouse on its desk pad (right-handed wrist arc) ──
      const mx = 2.1 + pointerVP.x * (3.9 - 2.1);
      const mz = 1.9 + pointerVP.y * (3.7 - 1.9);
      mouse3d.position.set(mx, DESK_Y, mz);
      mouse3d.rotation.y = -((pointerVP.x - 0.5) * 0.24 - (pointerVP.y - 0.5) * 0.09);
      // ── Hover highlight: outlines ease to amber, the prop pops a hair ──
      for (const c of clickables) {
        const target = c === hovered ? 1 : 0;
        if (Math.abs(c.t - target) < 0.002) c.t = target;
        else c.t += (target - c.t) * 0.22;
        if (c.t > 0) {
          // Amber pulses a touch while held, so a hovered prop reads as live
          const pulse = 0.86 + 0.14 * Math.sin(now / 190);
          c.mat.color.copy(HL_BASE).lerp(HL_HOT, c.t * pulse);
        } else {
          c.mat.color.copy(HL_BASE);
        }
        c.root.scale.setScalar(1 + c.pop * c.t);
      }

      // Radio button: sinks into the side while playing, pops back out when paused
      const btnTargetX = radioPlaying ? RADIO_BTN_IN : RADIO_BTN_OUT;
      radioButton.position.x += (btnTargetX - radioButton.position.x) * 0.25;
      if (extRadioBtn && extRadioBase)
        extRadioBtn.position.x = extRadioBase.x + (radioButton.position.x - RADIO_BTN_OUT);

      // Monitor power button: pressed in while the screen is off
      const pwrTargetZ = screenOn ? POWER_OUT : POWER_IN;
      powerButton.position.z += (pwrTargetZ - powerButton.position.z) * 0.25;
      if (extPowerBtn && extPowerBase)
        extPowerBtn.position.z = extPowerBase.z + (powerButton.position.z - POWER_OUT);
      screenPlane.visible = screenOn;
      hudPlane.visible = screenOn;
      crtGlow.intensity += ((screenOn ? 0.55 : 0) - crtGlow.intensity) * 0.15;

      (btnL.material as THREE.Material) = buttons.left ? matCreamDark : matCream;
      (btnR.material as THREE.Material) = buttons.right ? matCreamDark : matCream;

      // ── Cable verlet ──
      monitor.updateMatrixWorld();
      mouse3d.updateMatrixWorld();
      anchorWorld.copy(anchorLocal).applyMatrix4(monitor.matrixWorld);
      cableEndWorld.copy(cableEndLocal).applyMatrix4(mouse3d.matrixWorld);

      if (!cablePts) {
        cablePts = Array.from({ length: CABLE_POINTS }, (_, i) => {
          const f = i / (CABLE_POINTS - 1);
          const p = anchorWorld.clone().lerp(cableEndWorld, f);
          return { p, prev: p.clone() };
        });
      }
      for (let i = 1; i < CABLE_POINTS - 1; i++) {
        const c = cablePts[i];
        const vx = (c.p.x - c.prev.x) * FRICTION;
        const vy = (c.p.y - c.prev.y) * FRICTION;
        const vz = (c.p.z - c.prev.z) * FRICTION;
        c.prev.copy(c.p);
        c.p.x += vx; c.p.y += vy; c.p.z += vz;
      }
      const dist = anchorWorld.distanceTo(cableEndWorld);
      const restLength = Math.max(dist * 1.05, 2.2);
      const segLen = restLength / (CABLE_POINTS - 1);
      for (let iter = 0; iter < 6; iter++) {
        for (let i = 0; i < CABLE_POINTS - 1; i++) {
          const a = cablePts[i].p, b = cablePts[i + 1].p;
          const d = a.distanceTo(b) || 0.0001;
          const diff = (d - segLen) / d;
          if (i === 0) b.sub(a.clone().sub(b).multiplyScalar(-diff));
          else if (i === CABLE_POINTS - 2) a.add(b.clone().sub(a).multiplyScalar(diff));
          else {
            const corr = b.clone().sub(a).multiplyScalar(diff * 0.5);
            a.add(corr); b.sub(corr);
          }
        }
        cablePts[0].p.copy(anchorWorld);
        cablePts[CABLE_POINTS - 1].p.copy(cableEndWorld);
      }
      if (cableMesh) {
        cableMesh.geometry.dispose();
        scene.remove(cableMesh);
      }
      const curve = new THREE.CatmullRomCurve3(cablePts.map(c => c.p));
      cableMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.035, 6), cableMat);
      cableMesh.castShadow = true;
      scene.add(cableMesh);

      // ── Render ──
      if (screenOn) {
        drawHUD();
        renderer.setRenderTarget(particleRT);
        renderer.clear();
        renderer.render(sphereScene, sphereCamera);
        renderer.setRenderTarget(screenRT);
        renderer.render(asciiScene, asciiCamera);
        renderer.setRenderTarget(null);
      }
      // One hover source of truth: the clickables registry drives both the
      // amber edge highlight below and this screen-space contour.
      outlinePass.selectedObjects = hovered ? [hovered.root] : [];
      composer.render();
    }
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearInterval(skyInterval);
      clearResumeTimers();
      resumeLayer.removeEventListener("click", onResumeLayerClick);
      resumeLayer.remove();
      resumeStyle.remove();
      hoverTip.remove();
      embedController?.destroy?.();
      embedDiv.remove();
      embedScript.remove();
      delete (window as any).onSpotifyIframeApiReady;
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchmove", onTouchMove);
      composer.dispose();
      renderer.dispose();
      particleRT.dispose();
      screenRT.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <>
      <div
        ref={mountRef}
        className="fixed inset-0 overflow-hidden"
        style={{
          cursor: mobileNote ? "auto" : "none",
          userSelect: "none",
          // Kills iOS double-tap zoom / 300 ms delay without blocking our handlers.
          touchAction: "manipulation",
        }}
      />
      {mobileNote && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: "max(18px, env(safe-area-inset-bottom))",
            transform: "translateX(-50%) rotate(-1deg)",
            background: "#f2df6d",
            color: "#2b2417",
            padding: "10px 16px",
            font: "600 13px ui-monospace, Menlo, monospace",
            boxShadow: "0 4px 14px rgba(0,0,0,.45)",
            maxWidth: "88vw",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          you&apos;re peeking through the window — open on a laptop for the full room ✦
        </div>
      )}
    </>
  );
}
