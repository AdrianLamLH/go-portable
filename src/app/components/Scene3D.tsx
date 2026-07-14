import { useEffect, useRef } from "react";
import * as THREE from "three";

// Full 3D-polygon rendition of the workstation: CRT monitor, keyboard and
// mouse are low-poly meshes with flat lambert shading and dark edge outlines.
// The agent-sphere POC renders into a texture mapped onto the monitor's
// screen face; tabs + cursor + scanlines composite on a HUD canvas texture.

type SphereMode = "lattice" | "about" | "work" | "projects";
type NavId = "about" | "work" | "projects";

const WORD_TEXT: Record<NavId, string> = {
  work: "WORK",
  projects: "PROJECTS",
  about: "ABOUT ME",
};

const NAV_TABS: { id: NavId; label: string }[] = [
  { id: "about", label: "About me" },
  { id: "work", label: "Work Experiences" },
  { id: "projects", label: "Personal Projects" },
];

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
const DESK = 0x17110a;

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

    scene.add(new THREE.HemisphereLight(0xfff6e0, 0x2c2318, 1.15));
    const dir = new THREE.DirectionalLight(0xfff2d8, 0.85);
    dir.position.set(4, 7, 6);
    scene.add(dir);

    // ─── Shared materials / helpers ──────────────────────────
    const matCream = new THREE.MeshLambertMaterial({ color: CREAM });
    const matCreamDark = new THREE.MeshLambertMaterial({ color: CREAM_DARK });
    const matDesk = new THREE.MeshLambertMaterial({ color: DESK });
    const edgeMat = new THREE.LineBasicMaterial({ color: OUTLINE });

    function addEdges(mesh: THREE.Mesh) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry), edgeMat);
      mesh.add(edges);
    }
    function box(w: number, h: number, d: number, mat: THREE.Material = matCream) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      addEdges(m);
      return m;
    }

    // ─── Desk ────────────────────────────────────────────────
    const DESK_Y = -1.45; // desk top
    const desk = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, 20), matDesk);
    desk.position.set(0, DESK_Y - 0.15, 2);
    scene.add(desk);

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
    const explodeDir = new Float32Array(COUNT * 3);
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

    // ─── Word shapes / targets / transitions ─────────────────
    const wordCache: Record<string, [number, number][]> = {};
    function sampleWord(text: string) {
      if (wordCache[text]) return wordCache[text];
      const W = 640, H = 160;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let fs = 110;
      ctx.font = `900 ${fs}px 'Helvetica Neue', Arial, sans-serif`;
      const w = ctx.measureText(text).width;
      if (w > W - 40) {
        fs = Math.floor(fs * (W - 40) / w);
        ctx.font = `900 ${fs}px 'Helvetica Neue', Arial, sans-serif`;
      }
      ctx.fillText(text, W / 2, H / 2 + 4);
      const img = ctx.getImageData(0, 0, W, H).data;
      const pts: [number, number][] = [];
      for (let y = 0; y < H; y += 2)
        for (let x = 0; x < W; x += 2)
          if (img[(y * W + x) * 4 + 3] > 128)
            pts.push([(x / W - 0.5) * 3.8, (0.5 - y / H) * 0.95]);
      wordCache[text] = pts;
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
          const pts = sampleWord(WORD_TEXT[mode]);
          const p = pts[i % pts.length];
          tx = p[0] + (randoms[i] - 0.5) * 0.02;
          ty = p[1] + ((randoms[i] * 7.31) % 1 - 0.5) * 0.02;
          tz = (((randoms[i] * 13.7) % 1) - 0.5) * 0.35;
        }
        targets[i * 3] = tx; targets[i * 3 + 1] = ty; targets[i * 3 + 2] = tz;
      }
    }
    computeTargets();

    function startExplode() {
      for (let i = 0; i < COUNT; i++) {
        const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
        let nx = px, ny = py, nz = pz;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx = nx / len + (randoms[i] - 0.5) * 0.9;
        ny = ny / len + ((randoms[i] * 3.1) % 1 - 0.5) * 0.9;
        nz = nz / len + ((randoms[i] * 7.7) % 1 - 0.5) * 0.9;
        const l2 = Math.hypot(nx, ny, nz) || 1;
        const speed = 0.032 + randoms[i] * 0.025;
        explodeDir[i * 3] = nx / l2 * speed;
        explodeDir[i * 3 + 1] = ny / l2 * speed;
        explodeDir[i * 3 + 2] = nz / l2 * speed;
      }
      phase = 1;
      phaseStart = performance.now() / 1000;
    }

    function setMode(m: SphereMode) {
      if (m === mode) return;
      mode = m;
      computeTargets();
      if (m !== "lattice") startExplode();
      else phase = 0;
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
    let hovNav: NavId | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const pressedCodes = new Set<string>();
    const buttons = { left: false, right: false };

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

    function zoneAt(cx: number, cy: number): NavId | null {
      if (cy < 87) return null;
      if (cx < 33.4) return "about";
      if (cx < 66.7) return "work";
      return "projects";
    }

    function onPointerMove(e: MouseEvent) {
      pointerVP.x = e.clientX / window.innerWidth;
      pointerVP.y = e.clientY / window.innerHeight;
      ndc.set(pointerVP.x * 2 - 1, -(pointerVP.y * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(pickPlane, false)[0];
      if (hit) {
        const local = pickPlane.worldToLocal(hit.point.clone());
        crt.cx = Math.max(0, Math.min(100, (local.x / OPEN_W + 0.5) * 100));
        crt.cy = Math.max(0, Math.min(100, (0.5 - local.y / OPEN_H) * 100));
      }
      const z = zoneAt(crt.cx, crt.cy);
      if (z !== hovNav) {
        hovNav = z;
        if (idleTimer) clearTimeout(idleTimer);
        if (hovNav) setMode(hovNav);
        else idleTimer = setTimeout(() => setMode("lattice"), 5000);
      }
    }

    function onClick() {
      if (hovNav) setMode(hovNav);
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
    function onKeyDown(e: KeyboardEvent) { pressedCodes.add(e.code); }
    function onKeyUp(e: KeyboardEvent) { pressedCodes.delete(e.code); }

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("click", onClick);
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

    // ─── HUD painting ────────────────────────────────────────
    const TAB_H = Math.round(HUD_H * 0.13);
    let vignette: CanvasGradient | null = null;

    function drawHUD() {
      hud.clearRect(0, 0, HUD_W, HUD_H);

      // Tabs
      const y0 = HUD_H - TAB_H;
      hud.fillStyle = "rgba(18,16,12,0.95)";
      hud.fillRect(0, y0, HUD_W, TAB_H);
      hud.fillStyle = S_LINE;
      hud.fillRect(0, y0, HUD_W, 2);
      const cellW = HUD_W / 3;
      hud.font = "500 26px ui-monospace, Menlo, monospace";
      hud.textAlign = "center";
      hud.textBaseline = "middle";
      NAV_TABS.forEach((tab, i) => {
        const x0 = i * cellW;
        const hov = hovNav === tab.id;
        const active = mode === tab.id;
        if (hov || active) {
          hud.fillStyle = hov ? "rgba(232,197,71,0.09)" : "rgba(232,197,71,0.05)";
          hud.fillRect(x0, y0, cellW, TAB_H);
        }
        if (active) {
          hud.fillStyle = S_ACCENT;
          hud.fillRect(x0, y0, cellW, 4);
        }
        if (i > 0) {
          hud.fillStyle = S_LINE;
          hud.fillRect(x0, y0, 1, TAB_H);
        }
        hud.fillStyle = hov || active ? S_INK : S_DIM;
        hud.fillText(tab.label, x0 + cellW / 2, y0 + TAB_H / 2 + 1);
      });

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

      // Cursor arrow
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
      let attract = 0.03, damp = 0.88, kick = 0, teleport = false;
      if (phase === 1) {
        const age = nowS - phaseStart;
        if (age < 0.12) {
          attract = 0.0;
          damp = 0.94;
          kick = Math.exp(-age * 22.0) * 0.18;
        } else {
          phase = 2;
        }
      }
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

        if (kick > 0) {
          velocities[i * 3] += explodeDir[i * 3] * kick;
          velocities[i * 3 + 1] += explodeDir[i * 3 + 1] * kick;
          velocities[i * 3 + 2] += explodeDir[i * 3 + 2] * kick;
        }
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
        points.position.multiplyScalar(0.88);
        points.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
        points.rotation.y += (Math.sin(t * 0.4) * 0.12 - points.rotation.y) * 0.04;
        points.rotation.x += (Math.sin(t * 0.3) * 0.05 - points.rotation.x) * 0.04;
      }

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
      scene.add(cableMesh);

      // ── Render ──
      drawHUD();

      renderer.setRenderTarget(particleRT);
      renderer.clear();
      renderer.render(sphereScene, sphereCamera);
      renderer.setRenderTarget(screenRT);
      renderer.render(asciiScene, asciiCamera);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("click", onClick);
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
