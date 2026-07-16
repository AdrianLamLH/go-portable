import { useEffect, useRef } from "react";
import * as THREE from "three";

// Full 3D-polygon rendition of the workstation: CRT monitor, keyboard and
// mouse are low-poly meshes with flat lambert shading and dark edge outlines.
// The agent-sphere POC renders into a texture mapped onto the monitor's
// screen face; tabs + cursor + scanlines composite on a HUD canvas texture.

type SphereMode = "lattice" | "terminal";
type PageId = "about" | "work" | "projects" | "extras" | "chat";

// LamOS desktop — icons boot in after the splash screen
const DESKTOP_ICONS: { id: PageId; label: string; kind: "folder" | "exe" }[] = [
  { id: "about", label: "about me", kind: "folder" },
  { id: "work", label: "work experience", kind: "folder" },
  { id: "projects", label: "personal projects", kind: "folder" },
  { id: "extras", label: "extras", kind: "folder" },
  { id: "chat", label: "let's chat.exe", kind: "exe" },
];

const WINDOW_TITLES: Record<PageId, string> = {
  about: "about_me",
  work: "work_experience.doc",
  projects: "personal_projects",
  extras: "extras",
  chat: "lets_chat.exe",
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

export default function Scene3D() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ─── Renderer / camera / lights ──────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    crtGlow.position.set(0, 1.2, 1.6);
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
      new THREE.MeshLambertMaterial({ color: 0xe9e0c8 })
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
      // Paper + dark print
      ctx.fillStyle = "#f2ecdc";
      ctx.fillRect(0, 0, 512, 768);
      ctx.fillStyle = "#12100c";
      ctx.fillRect(22, 22, 468, 724);
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
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(5.7, 8.55), // 3x the original print
      new THREE.MeshLambertMaterial({ map: createPosterTexture() })
    );
    poster.position.set(-6.2, 3.4, -4.24);
    poster.rotation.z = 0.015; // hung ever-so-slightly crooked
    poster.receiveShadow = true; // fan shadow sweeps across the print, not behind it
    scene.add(poster);

    // ─── Ceiling fan — hangs out of frame, its shadow sweeps the desk ─
    const fan = new THREE.Group();
    fan.position.set(1.2, 7.6, 2.6); // nudged toward the key light
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
    monitor.position.set(0, 1.42, 0);
    monitor.rotation.y = -0.12;
    scene.add(monitor);

    const OUTER_W = 5.3, OUTER_H = 4.05, OPEN_W = 4.2, OPEN_H = 3.15, FRAME_D = 0.34;
    // Rear body
    const body = box(OUTER_W, OUTER_H, 1.7);
    body.position.z = -0.85;
    monitor.add(body);
    // Bezel frame around the screen opening
    const barH = (OUTER_H - OPEN_H) / 2;
    const topBar = box(OUTER_W, barH, FRAME_D);
    topBar.position.set(0, OPEN_H / 2 + barH / 2, FRAME_D / 2);
    const botBar = box(OUTER_W, barH, FRAME_D);
    botBar.position.set(0, -(OPEN_H / 2 + barH / 2), FRAME_D / 2);
    const barW = (OUTER_W - OPEN_W) / 2;
    const leftBar = box(barW, OPEN_H, FRAME_D);
    leftBar.position.set(-(OPEN_W / 2 + barW / 2), 0, FRAME_D / 2);
    const rightBar = box(barW, OPEN_H, FRAME_D);
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

    // ─── Sphere pipeline (ported from the agent-sphere POC) ──
    const RT_W = 1280, RT_H = 960;

    const sphereScene = new THREE.Scene();
    const sphereCamera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 100);
    sphereCamera.position.z = 4.5;

    const COUNT = 5500;
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
    const screenPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(OPEN_W, OPEN_H),
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: screenRT.texture } },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          varying vec2 vUv;
          void main() {
            gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0);
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
    hudTexture.colorSpace = THREE.SRGBColorSpace;
    const hudPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(OPEN_W, OPEN_H),
      new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true })
    );
    hudPlane.position.z = 0.055;
    monitor.add(hudPlane);

    // Digit-face shapes for the terminal avatar — drawn as canvas strokes,
    // sampled into particle targets so the face gets the same 3D ascii-digit
    // treatment as the word morphs. Box head, not circular.
    const faceCache: Record<string, [number, number][]> = {};
    function sampleFace(expr: string, open: boolean) {
      const key = `${expr}|${open ? 1 : 0}`;
      if (faceCache[key]) return faceCache[key];
      const S = 320;
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#fff";
      // Box head
      ctx.lineWidth = 13;
      ctx.strokeRect(34, 34, 252, 252);
      // Eyes
      if (expr === "laugh") {
        ctx.lineWidth = 11;
        ctx.beginPath(); ctx.arc(110, 140, 22, Math.PI, 2 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(210, 140, 22, Math.PI, 2 * Math.PI); ctx.stroke();
      } else if (expr === "surprised") {
        ctx.beginPath(); ctx.arc(110, 128, 24, 0, 2 * Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(210, 128, 24, 0, 2 * Math.PI); ctx.fill();
      } else if (expr === "confused") {
        ctx.lineWidth = 11;
        ctx.beginPath(); ctx.arc(110, 128, 26, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillRect(198, 116, 26, 30);
      } else if (expr === "sad") {
        ctx.fillRect(92, 122, 36, 40);
        ctx.fillRect(192, 122, 36, 40);
      } else {
        ctx.fillRect(92, 110, 36, 42);
        ctx.fillRect(192, 110, 36, 42);
      }
      // Mouth
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
      const img = ctx.getImageData(0, 0, S, S).data;
      const pts: [number, number][] = [];
      for (let y = 0; y < S; y += 2)
        for (let x = 0; x < S; x += 2)
          if (img[(y * S + x) * 4 + 3] > 128)
            pts.push([(x / S - 0.5) * 1.7, (0.5 - y / S) * 1.7]);
      faceCache[key] = pts;
      return pts;
    }

    let mode: SphereMode = "lattice";
    function computeTargets() {
      for (let i = 0; i < COUNT; i++) {
        const ox = originals[i * 3], oy = originals[i * 3 + 1], oz = originals[i * 3 + 2];
        let tx: number, ty: number, tz: number;
        if (mode === "lattice") {
          const s = 0.28;
          tx = Math.round(ox * 1.3 / s) * s;
          ty = Math.round(oy * 1.3 / s) * s;
          tz = Math.round(oz * 1.3 / s) * s;
        } else {
          const pts = sampleFace(faceExpr, faceFlap);
          const p = pts[i % pts.length];
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
        // Gentle snap into the face — no explosion, just the quick re-piece
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
    const kbBase = box(KB_W, 0.18, KB_D);
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
    const mouseBody = box(0.72, 0.26, 1.08);
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
    radio.position.set(4.6, DESK_Y, -1.1); // right side, behind the computer and mouse
    radio.rotation.y = -0.5;               // angled toward the viewer
    scene.add(radio);

    const matRadio = new THREE.MeshLambertMaterial({ color: 0xb2b4b4 });
    const radioBody = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.85, 0.95), matRadio);
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
    calendarG.add(calFront);
    // Back slope — identical face mirrored through the apex line
    const calBackWrap = new THREE.Group();
    calBackWrap.rotation.y = Math.PI;
    const calBack = new THREE.Mesh(calFaceGeo, new THREE.MeshLambertMaterial({ map: calBackTex }));
    calBack.position.set(0, CAL_H / 2, CAL_D / 2);
    calBack.rotation.x = -CAL_TILT;
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
      ctx.fillStyle = S_ACCENT;
      ctx.font = "700 64px ui-monospace, Menlo, monospace";
      ctx.fillText(String(integrations.hevy?.streakWeeks ?? 0), 128, 62);
      ctx.fillStyle = S_INK;
      ctx.font = "600 22px ui-monospace, Menlo, monospace";
      ctx.fillText("WK STREAK", 128, 112);
      ctx.fillStyle = S_DIM;
      ctx.font = "500 13px ui-monospace, Menlo, monospace";
      ctx.fillText("· hevy ·", 128, 134);
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
    // Mini dumbbell beside the counter
    const matIron = new THREE.MeshLambertMaterial({ color: 0x4a4a50 });
    const dbBar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.05), matIron);
    addEdges(dbBar);
    dbBar.position.set(0.78, 0.09, 0.12);
    const dbL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.19, 0.19), matIron);
    addEdges(dbL);
    dbL.position.set(0.57, 0.1, 0.12);
    const dbR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.19, 0.19), matIron);
    addEdges(dbR);
    dbR.position.set(0.99, 0.1, 0.12);
    streakG.add(dbBar, dbL, dbR);

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
    let windowOpenedAt = 0;        // drives the skill-bar fill animation
    let uselessClicks = 0;
    // On-screen (HUD px) rect of the projects page's useless button, refreshed
    // every painted frame so scrolled positions stay clickable
    let uselessBtnRect: { x: number; y: number; w: number; h: number } | null = null;

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
      uselessBtnRect = null;
      windowOpenedAt = performance.now();
      setMode(id === "chat" ? "terminal" : "lattice");
    }
    function closeWindow() {
      openPage = null;
      uselessBtnRect = null;
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
      if (openPage === "projects" && uselessBtnRect && inRect(px, py, uselessBtnRect)) {
        uselessClicks++;
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

    function onPointerMove(e: MouseEvent) {
      pointerVP.x = e.clientX / window.innerWidth;
      pointerVP.y = e.clientY / window.innerHeight;
      ndc.set(pointerVP.x * 2 - 1, -(pointerVP.y * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(pickPlane, false)[0];
      if (hit) {
        const local = pickPlane.worldToLocal(hit.point.clone());
        // On the screen itself → hide the OS cursor (the HUD arrow takes over).
        // Off the screen → hand cursor, so clicks on "real-life" objects
        // (radio, hardware) stay visible.
        overScreen =
          Math.abs(local.x) <= OPEN_W / 2 &&
          Math.abs(local.y) <= OPEN_H / 2;
        crt.cx = Math.max(0, Math.min(100, (local.x / OPEN_W + 0.5) * 100));
        crt.cy = Math.max(0, Math.min(100, (0.5 - local.y / OPEN_H) * 100));
      } else {
        overScreen = false;
      }
      if (!screenOn) overScreen = false; // dark screen: nothing to point at
      mount.style.cursor = overScreen ? "none" : "pointer";
    }

    function isWithin(obj: THREE.Object3D, root: THREE.Object3D) {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur === root) return true;
        cur = cur.parent;
      }
      return false;
    }

    function onClick(e: MouseEvent) {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      // First-hit test against the clickable objects AND their occluders, so
      // clicking the desk in front of the radio doesn't reach through it.
      const hits = raycaster.intersectObjects([desk, mousepad, keyboard, mouse3d, monitor, radio, calendarG, streakG], true);
      // Skip the invisible pointer pick-plane (a huge monitor child) — it
      // otherwise swallows every click before it can reach the radio.
      const first = hits.find(h => h.object !== pickPlane && (h.object as THREE.Mesh).isMesh && h.object.visible)?.object;
      if (first) {
        if (isWithin(first, powerButton)) {
          screenOn = !screenOn;
          if (screenOn) reboot(); // powering back on re-runs the LamOS splash
          return;
        }
        if (isWithin(first, radio)) { toggleRadio(); return; }
        if (isWithin(first, calendarG)) {
          // The prism's Book Now — opens the real Calendly page
          window.open(integrations.calendly?.bookUrl ?? "https://calendly.com", "_blank", "noopener");
          return;
        }
      }
      if (screenOn && overScreen) {
        handleScreenClick(crt.cx / 100 * HUD_W, crt.cy / 100 * HUD_H);
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (e.button === 0) buttons.left = true;
      if (e.button === 2) buttons.right = true;
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button === 0) buttons.left = false;
      if (e.button === 2) buttons.right = false;
    }
    function onContextMenu(e: MouseEvent) { e.preventDefault(); }
    function onKeyDown(e: KeyboardEvent) {
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
      if (screenOn && overScreen && openPage && openPage !== "chat") {
        pageScroll = Math.max(0, Math.min(pageMax, pageScroll + e.deltaY));
      }
    }

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("click", onClick);
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", onResize);

    // ─── HUD painting — LamOS: boot splash → desktop → windows ─
    let vignette: CanvasGradient | null = null;
    const MONO = "ui-monospace, Menlo, monospace";
    const MARKER = "'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive";

    function drawBoot(now: number) {
      hud.fillStyle = "#000000";
      hud.fillRect(0, 0, HUD_W, HUD_H);
      hud.textBaseline = "middle";
      // Hand-drawn LamOS wordmark — white outline only, like the sketch
      hud.textAlign = "center";
      hud.strokeStyle = "#ffffff";
      hud.lineWidth = 3.5;
      hud.font = `italic 900 130px ${MARKER}`;
      hud.strokeText("LamOS", HUD_W / 2 - 20, 300);
      hud.lineWidth = 2;
      hud.font = `700 30px ${MARKER}`;
      hud.strokeText("TM", HUD_W / 2 + 250, 224);
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

    function paintAbout(now: number) {
      let y = 24;
      hud.textAlign = "center";
      hud.textBaseline = "middle";
      hud.font = `700 30px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.fillText("~*~ ABOUT ME ~*~", HUD_W / 2, y); y += 58;
      hud.font = `900 44px ${MARKER}`;
      hud.fillStyle = S_INK;
      hud.fillText("hi, i'm adrian!", HUD_W / 2, y); y += 56;
      hud.font = `500 20px ${MONO}`;
      hud.fillStyle = S_DIM;
      [
        "[ filler bio — the real one is coming, promise ]",
        "software engineer · new york city",
        "i like building weird little computers inside computers,",
        "lifting heavy things, and mission control radio.",
        "this entire site runs on a CRT that doesn't exist.",
      ].forEach(l => { hud.fillText(l, HUD_W / 2, y); y += 30; });
      y += 14;
      hud.fillStyle = S_LINE;
      hud.fillRect(120, y, HUD_W - 240, 2); y += 40;

      y = sectionHeader(">> fave things", y);
      hud.font = `500 19px ${MONO}`;
      ([
        ["editor", "the one that starts flame wars"],
        ["coffee order", "yes"],
        ["operating system", "LamOS (obviously)"],
        ["gym lift", "deadlift, ask me about my back"],
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

      // Blinking UNDER CONSTRUCTION tape
      if (Math.floor(now / 600) % 2 === 0) {
        const bw = 460, bx = HUD_W / 2 - bw / 2, bh = 48;
        hud.save();
        hud.beginPath();
        hud.rect(bx, y, bw, bh);
        hud.clip();
        hud.fillStyle = "#e8c547";
        hud.fillRect(bx, y, bw, bh);
        hud.fillStyle = "#141414";
        for (let sx = -48; sx < bw + 48; sx += 48) {
          hud.beginPath();
          hud.moveTo(bx + sx, y + bh);
          hud.lineTo(bx + sx + 24, y + bh);
          hud.lineTo(bx + sx + 44, y);
          hud.lineTo(bx + sx + 20, y);
          hud.closePath();
          hud.fill();
        }
        hud.fillStyle = "#e8c547";
        hud.fillRect(bx + 70, y + 8, bw - 140, bh - 16);
        hud.fillStyle = "#141414";
        hud.font = `900 21px ${MONO}`;
        hud.fillText("UNDER CONSTRUCTION", HUD_W / 2, y + bh / 2 + 1);
        hud.restore();
      }
      y += 78;

      hud.font = `500 15px ${MONO}`;
      hud.fillStyle = S_DIM;
      hud.fillText("best viewed at 1024×768 · guestbook lives in extras", HUD_W / 2, y);
      return y + 30;
    }

    function paintWork(now: number) {
      let y = 16;
      hud.textBaseline = "middle";
      hud.textAlign = "left";
      hud.font = `500 17px ${MONO}`;
      hud.fillStyle = S_DIM;
      hud.fillText("C:\\adrian\\resume.doc — [ filler resume, swap in the real one ]", 84, y); y += 42;

      const jobs = [
        {
          role: "Software Engineer", co: "[Company Name]", when: "2024 — now",
          pts: [
            "shipped [big feature] used by [impressive number] of people",
            "wrangled [distributed system] until it stopped catching fire",
            "wrote docs nobody read, then rewrote them as memes",
          ],
        },
        {
          role: "Software Engineer", co: "[Previous Co]", when: "2022 — 2024",
          pts: [
            "built [internal tool] that saved the team [n] hours a week",
            "survived [framework migration] with most of my sanity",
          ],
        },
        {
          role: "SWE Intern", co: "[Scrappy Startup]", when: "summer 2021",
          pts: [
            "touched prod on day two (it was fine) (it was mostly fine)",
            "learned more from the outage than from the onboarding",
          ],
        },
      ];
      for (const job of jobs) {
        const h = 52 + job.pts.length * 27 + 12;
        hud.strokeStyle = "#3a342a";
        hud.lineWidth = 2;
        hud.strokeRect(60, y, HUD_W - 120, h);
        hud.font = `700 23px ${MONO}`;
        hud.fillStyle = S_ACCENT;
        hud.fillText(job.role, 84, y + 30);
        const rw = hud.measureText(job.role).width;
        hud.font = `500 20px ${MONO}`;
        hud.fillStyle = S_INK;
        hud.fillText(`@ ${job.co}`, 84 + rw + 14, y + 30);
        hud.textAlign = "right";
        hud.font = `500 17px ${MONO}`;
        hud.fillStyle = S_DIM;
        hud.fillText(job.when, HUD_W - 84, y + 30);
        hud.textAlign = "left";
        hud.font = `500 19px ${MONO}`;
        hud.fillStyle = S_INK;
        job.pts.forEach((p, i) => hud.fillText(`▸ ${p}`, 100, y + 62 + i * 27));
        y += h + 18;
      }
      y += 12;

      y = sectionHeader(">> education", y);
      hud.font = `500 19px ${MONO}`;
      hud.fillStyle = S_INK;
      hud.fillText("[University Name] — B.S. Computer Science, class of [year]", 104, y);
      y += 48;

      // Skill bars fill up when the window opens — RPG stat-screen rules
      y = sectionHeader(">> skill points", y);
      const anim = Math.min(1, (now - windowOpenedAt) / 900);
      ([
        ["typescript", 92],
        ["three.js", 78],
        ["css wizardry", 66],
        ["talking to CRTs", 99],
      ] as const).forEach(([name, v]) => {
        hud.font = `500 19px ${MONO}`;
        hud.fillStyle = S_INK;
        hud.fillText(name, 104, y);
        hud.strokeStyle = "#3a342a";
        hud.lineWidth = 2;
        hud.strokeRect(330, y - 10, 420, 20);
        hud.fillStyle = S_ACCENT;
        hud.fillRect(333, y - 7, 414 * (v / 100) * anim, 14);
        hud.font = `500 16px ${MONO}`;
        hud.fillStyle = S_DIM;
        hud.fillText(String(Math.round(v * anim)), 766, y);
        y += 36;
      });
      return y + 20;
    }

    function paintProjects(px: number, py: number) {
      let y = 24;
      hud.textBaseline = "middle";
      hud.textAlign = "center";
      hud.font = `700 28px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.fillText("★ personal projects ★", HUD_W / 2, y); y += 40;
      hud.font = `500 17px ${MONO}`;
      hud.fillStyle = S_DIM;
      hud.fillText("[ filler cards — real projects incoming ]", HUD_W / 2, y); y += 42;

      const projects = [
        { name: "this website", desc: "a fake OS on a fake CRT on a (real?) desk. you are here.", tags: "three.js · shaders · canvas", stars: 5 },
        { name: "digit-face terminal", desc: "the lil guy in let's chat.exe — 5,500 particles doing an impression of me.", tags: "webgl · llm · particles", stars: 5 },
        { name: "[project three]", desc: "[one-liner about a cool thing you built goes here]", tags: "[tags]", stars: 4 },
        { name: "[project four]", desc: "[another cool thing — flash-game energy encouraged]", tags: "[tags]", stars: 3 },
      ];
      hud.textAlign = "left";
      for (const p of projects) {
        const h = 104;
        hud.strokeStyle = "#3a342a";
        hud.lineWidth = 2;
        hud.strokeRect(60, y, HUD_W - 120, h);
        hud.font = `700 22px ${MONO}`;
        hud.fillStyle = S_ACCENT;
        hud.fillText(p.name, 84, y + 28);
        hud.textAlign = "right";
        hud.fillText("★".repeat(p.stars) + "☆".repeat(5 - p.stars), HUD_W - 84, y + 28);
        hud.textAlign = "left";
        hud.font = `500 19px ${MONO}`;
        hud.fillStyle = S_INK;
        hud.fillText(p.desc, 84, y + 58);
        hud.font = `500 16px ${MONO}`;
        hud.fillStyle = S_DIM;
        hud.fillText(p.tags, 84, y + 84);
        y += h + 16;
      }
      y += 14;

      // The useless button — peak flash-game interactivity
      const bw = 320, bh = 52, bx = HUD_W / 2 - bw / 2;
      uselessBtnRect = { x: bx, y: y + TITLE_H + 24 - pageScroll, w: bw, h: bh };
      const hov = overScreen && inRect(px, py, uselessBtnRect);
      hud.fillStyle = hov ? "rgba(232,197,71,0.18)" : "rgba(232,197,71,0.07)";
      hud.fillRect(bx, y, bw, bh);
      hud.strokeStyle = S_ACCENT;
      hud.lineWidth = 2;
      hud.strokeRect(bx, y, bw, bh);
      hud.textAlign = "center";
      hud.font = `500 20px ${MONO}`;
      hud.fillStyle = S_INK;
      hud.fillText(
        uselessClicks === 0
          ? "do not click this button"
          : `clicked ${uselessClicks} time${uselessClicks === 1 ? "" : "s"}`,
        HUD_W / 2, y + bh / 2 + 1
      );
      y += bh + 30;
      if (uselessClicks >= 10) {
        hud.font = `500 16px ${MONO}`;
        hud.fillStyle = S_DIM;
        hud.fillText("ok you can stop now", HUD_W / 2, y);
        y += 26;
      }
      return y + 10;
    }

    function paintExtras(now: number) {
      let y = 22;
      hud.textBaseline = "middle";
      // Marquee — obligatory
      hud.font = `700 21px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.textAlign = "left";
      const mtext = "✦ welcome to the extras zone ✦ thanks for scrolling ✦ sign the guestbook ✦ ";
      const mw = hud.measureText(mtext).width;
      const off = (now / 20) % mw;
      hud.fillText(mtext, -off, y);
      hud.fillText(mtext, -off + mw, y);
      hud.fillText(mtext, -off + mw * 2, y);
      y += 54;

      y = sectionHeader(">> hobbies", y);
      hud.font = `500 19px ${MONO}`;
      hud.fillStyle = S_INK;
      [
        "· gym — the dumbbell on my desk is load-bearing",
        "· radio — press play on the grey box next to the monitor",
        "· skies — the window out there runs on real new york time",
      ].forEach(l => { hud.fillText(l, 104, y); y += 30; });
      y += 24;

      y = sectionHeader(">> webring", y);
      hud.textAlign = "center";
      hud.font = `500 20px ${MONO}`;
      hud.fillStyle = S_ACCENT;
      hud.fillText("<< prev · random · next >>", HUD_W / 2, y); y += 28;
      hud.font = `500 15px ${MONO}`;
      hud.fillStyle = S_DIM;
      hud.fillText("(links coming soon — the ring is currently just me)", HUD_W / 2, y); y += 48;

      hud.textAlign = "left";
      y = sectionHeader(">> guestbook", y);
      ([
        ["xX_websurfer_Xx", "cool site!! how do i get out of the CRT"],
        ["mom", "very nice honey"],
        ["[your name here]", "sign it by yelling at let's chat.exe"],
      ] as const).forEach(([who, msg]) => {
        hud.strokeStyle = "#3a342a";
        hud.lineWidth = 2;
        hud.strokeRect(60, y, HUD_W - 120, 54);
        hud.font = `700 18px ${MONO}`;
        hud.fillStyle = S_ACCENT;
        hud.fillText(who, 84, y + 28);
        hud.font = `500 18px ${MONO}`;
        hud.fillStyle = S_INK;
        hud.fillText(msg, 330, y + 28);
        y += 68;
      });
      y += 12;

      y = sectionHeader(">> site stats", y);
      hud.font = `500 18px ${MONO}`;
      hud.fillStyle = S_DIM;
      hud.fillText("powered by: 1 imaginary CRT · 5,500 digits · zero divs", 104, y);
      return y + 30;
    }

    function drawPage(id: Exclude<PageId, "chat">, now: number, px: number, py: number) {
      hud.fillStyle = "#0a0806";
      hud.fillRect(0, 0, HUD_W, HUD_H);
      uselessBtnRect = null;
      hud.save();
      hud.beginPath();
      hud.rect(0, TITLE_H, HUD_W, HUD_H - TITLE_H);
      hud.clip();
      hud.translate(0, TITLE_H + 24 - pageScroll);
      let bottom = 0;
      if (id === "about") bottom = paintAbout(now);
      else if (id === "work") bottom = paintWork(now);
      else if (id === "projects") bottom = paintProjects(px, py);
      else bottom = paintExtras(now);
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
    }

    // Chat — avatar pane; the face itself is particles rendered by the
    // ascii-digit pipeline behind this HUD (see computeTargets).
    function drawChat() {
        const now = performance.now();
        if (!termGreeted) {
          termGreeted = true;
          setBubble("hey, i'm adrian — well, the digit version of him <smile/> ask me about my work, projects, or anything else <nod/>");
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
          const uh = uLines.length * 27 + 22;
          hud.fillStyle = "rgba(232,197,71,0.07)";
          hud.fillRect(ux, TITLE_H + 14, uw, uh);
          hud.strokeStyle = S_DIM;
          hud.lineWidth = 2;
          hud.strokeRect(ux, TITLE_H + 14, uw, uh);
          hud.fillStyle = S_INK;
          uLines.forEach((l, i) => hud.fillText(l, ux + 16, TITLE_H + 32 + i * 27));
        }

        // Bot speech bubble — tail pointing at the particle face (screen-left)
        const FY = 355; // face center in HUD pixels
        const BX = 410, BW = HUD_W - BX - 28;
        const shown = bubbleClean.slice(0, revealed);
        const bLines = bubbleClean
          ? wrap(shown + (typing ? "▋" : ""), BW - 36)
          : [termBusy ? "•".repeat(1 + (Math.floor(now / 300) % 3)) : ""];
        if (bLines[0] !== "") {
          const bh = bLines.length * 27 + 26;
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
          bLines.forEach((l, i) => hud.fillText(l, BX + 18, by + 22 + i * 27));
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

      // Scanlines
      hud.fillStyle = "rgba(0,0,0,0.16)";
      for (let y = 0; y < HUD_H; y += 4) hud.fillRect(0, y, HUD_W, 1);

      // Vignette
      if (!vignette) {
        vignette = hud.createRadialGradient(HUD_W / 2, HUD_H / 2, HUD_H * 0.42, HUD_W / 2, HUD_H / 2, HUD_H * 0.85);
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,0.55)");
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
        hud.fillRect(16, HUD_H - 60, tw + 30, 42);
        hud.fillStyle = S_ACCENT;
        hud.fillText(msg, 32, HUD_H - 38);
      }

      // Cursor arrow — only while the pointer is actually on the screen;
      // off-screen the visible OS hand cursor takes over.
      if (overScreen) {
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
    let raf = 0;

    function animate() {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const t = (now - t0) / 1000;

      // ── Sphere physics ──
      sphereMouseTarget.set((crt.cx / 50 - 1) * 3, (1 - crt.cy / 50) * 2, 1);
      sphereMouse.lerp(sphereMouseTarget, 0.08);

      const nowS = now / 1000;
      let attract = 0.03, damp = 0.88, teleport = false;
      if (phase === 2) {
        attract = 0.06;
        damp = 0.78;
        teleport = true;
        if (nowS - phaseStart > 0.5) phase = 0;
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

        if (teleport && Math.random() < 0.07) {
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
      // Radio button: sinks into the side while playing, pops back out when paused
      const btnTargetX = radioPlaying ? RADIO_BTN_IN : RADIO_BTN_OUT;
      radioButton.position.x += (btnTargetX - radioButton.position.x) * 0.25;

      // Monitor power button: pressed in while the screen is off
      const pwrTargetZ = screenOn ? POWER_OUT : POWER_IN;
      powerButton.position.z += (pwrTargetZ - powerButton.position.z) * 0.25;
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
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(skyInterval);
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
      renderer.dispose();
      particleRT.dispose();
      screenRT.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="fixed inset-0 overflow-hidden" style={{ cursor: "none", userSelect: "none" }} />;
}
