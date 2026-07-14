import { useState, useEffect, useRef } from "react";

type Page = "boot" | "about" | "work" | "projects";

// Maps raw viewport % coords to CRT-space % coords (0–100)
// Tweak MAP to match where the monitor sits in the layout
const MAP = { x1: 20, x2: 80, y1: 0, y2: 70 };

function toCRT(vx: number, vy: number) {
  const cx = ((vx - MAP.x1) / (MAP.x2 - MAP.x1)) * 100;
  const cy = (vy / MAP.y2) * 100;
  return { cx: Math.max(0, Math.min(100, cx)), cy: Math.max(0, Math.min(100, cy)) };
}

// Nav hover zones expressed in CRT-space %
const NAV_ZONES: Record<Exclude<Page, "boot">, readonly [number, number, number, number]> = {
  about:    [2,  33, 85, 100],
  work:     [34, 66, 85, 100],
  projects: [67, 98, 85, 100],
} as const;

function inZone(cx: number, cy: number, [x1, x2, y1, y2]: readonly [number, number, number, number]) {
  return cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
}

const P  = "#4dff6e";  // phosphor green
const PD = "#1a6630";  // dim green
const PB = "#88ffaa";  // bright green

const OUTLINE    = "#241a0a"; // dark outline for hardware shells (monitor, keyboard, mouse)
const CREAM      = "#f4eede"; // base fill for hardware shells (cream white)
const CREAM_DARK = "#c9c0a6"; // darker fill for pressed-key / clicked-button feedback

type KeySpec = { label: string; code: string; w?: number };

// Rows expressed with real KeyboardEvent.code values so physical typing lights up the sprite
const KEY_ROWS: KeySpec[][] = [
  [
    { label: "`", code: "Backquote" }, { label: "1", code: "Digit1" }, { label: "2", code: "Digit2" },
    { label: "3", code: "Digit3" }, { label: "4", code: "Digit4" }, { label: "5", code: "Digit5" },
    { label: "6", code: "Digit6" }, { label: "7", code: "Digit7" }, { label: "8", code: "Digit8" },
    { label: "9", code: "Digit9" }, { label: "0", code: "Digit0" }, { label: "-", code: "Minus" },
    { label: "=", code: "Equal" }, { label: "⌫", code: "Backspace", w: 1.8 },
  ],
  [
    { label: "Tab", code: "Tab", w: 1.5 }, { label: "Q", code: "KeyQ" }, { label: "W", code: "KeyW" },
    { label: "E", code: "KeyE" }, { label: "R", code: "KeyR" }, { label: "T", code: "KeyT" },
    { label: "Y", code: "KeyY" }, { label: "U", code: "KeyU" }, { label: "I", code: "KeyI" },
    { label: "O", code: "KeyO" }, { label: "P", code: "KeyP" }, { label: "[", code: "BracketLeft" },
    { label: "]", code: "BracketRight" }, { label: "\\", code: "Backslash", w: 1.3 },
  ],
  [
    { label: "Caps", code: "CapsLock", w: 1.8 }, { label: "A", code: "KeyA" }, { label: "S", code: "KeyS" },
    { label: "D", code: "KeyD" }, { label: "F", code: "KeyF" }, { label: "G", code: "KeyG" },
    { label: "H", code: "KeyH" }, { label: "J", code: "KeyJ" }, { label: "K", code: "KeyK" },
    { label: "L", code: "KeyL" }, { label: ";", code: "Semicolon" }, { label: "'", code: "Quote" },
    { label: "Enter", code: "Enter", w: 2 },
  ],
  [
    { label: "Shift", code: "ShiftLeft", w: 2.2 }, { label: "Z", code: "KeyZ" }, { label: "X", code: "KeyX" },
    { label: "C", code: "KeyC" }, { label: "V", code: "KeyV" }, { label: "B", code: "KeyB" },
    { label: "N", code: "KeyN" }, { label: "M", code: "KeyM" }, { label: ",", code: "Comma" },
    { label: ".", code: "Period" }, { label: "/", code: "Slash" }, { label: "Shift", code: "ShiftRight", w: 2.2 },
  ],
  [
    { label: "Ctrl", code: "ControlLeft", w: 1.4 }, { label: "Alt", code: "AltLeft", w: 1.3 },
    { label: "Space", code: "Space", w: 6.5 },
    { label: "Alt", code: "AltRight", w: 1.3 }, { label: "Ctrl", code: "ControlRight", w: 1.4 },
  ],
];

const BOOT_LINES = [
  "APOLLO TERMINAL OS  v7.4.2",
  "NASA / GSFC MISSION CONTROL SYSTEMS",
  "═══════════════════════════════════════════",
  "CPU : INTEL 8086 @ 4.77MHz     MEM : 640K",
  "DISP: EGA 640×480 @ 60Hz       VER : B",
  "───────────────────────────────────────────",
  "INITIALIZING SUBSYSTEMS",
  "  [OK] TELEMETRY BUS",
  "  [OK] VOICE AI MODULE",
  "  [OK] NEURAL AGENT FRAMEWORK",
  "  [OK] DATA PIPELINE ENGINE",
  "  [OK] ANOMALY DETECTION SYS",
  "  [OK] MISSION COMMS INTERFACE",
  "───────────────────────────────────────────",
  `DATE  : ${new Date().toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" }).toUpperCase()}`,
  "OPID  : ████████████  CLEARANCE : LEVEL-5",
  "═══════════════════════════════════════════",
  " ",
  "ALL SYSTEMS NOMINAL.",
  "MOVE CURSOR TO NAV BAR → SELECT PROGRAM_",
];

export default function App() {
  const [page, setPage]       = useState<Page>("boot");
  const [crt, setCrt]         = useState({ cx: 50, cy: 30 });
  const [hovNav, setHovNav]   = useState<Exclude<Page, "boot"> | null>(null);
  const [bootLine, setBootLine] = useState(0);
  const [booted, setBooted]   = useState(false);
  const [powered, setPowered] = useState(false);
  const [blink, setBlink]     = useState(true);
  const [clock, setClock]     = useState("--:--:--");
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [mouseButtons, setMouseButtons] = useState({ left: false, right: false });

  const pointerPos      = useRef({ x: 0, y: 0 });
  const mouseSpriteRef  = useRef<HTMLDivElement>(null);
  const cableAnchorRef  = useRef<HTMLDivElement>(null);
  const cableCanvasRef  = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      setPressedKeys(prev => (prev.has(e.code) ? prev : new Set(prev).add(e.code)));
    };
    const up = (e: KeyboardEvent) => {
      setPressedKeys(prev => {
        if (!prev.has(e.code)) return prev;
        const next = new Set(prev);
        next.delete(e.code);
        return next;
      });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Left/right click feedback on the desk-mouse sprite
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (e.button === 0) setMouseButtons(b => ({ ...b, left: true }));
      if (e.button === 2) setMouseButtons(b => ({ ...b, right: true }));
    };
    const up = (e: MouseEvent) => {
      if (e.button === 0) setMouseButtons(b => ({ ...b, left: false }));
      if (e.button === 2) setMouseButtons(b => ({ ...b, right: false }));
    };
    const blockMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    window.addEventListener("contextmenu", blockMenu);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("contextmenu", blockMenu);
    };
  }, []);

  useEffect(() => { const t = setTimeout(() => setPowered(true), 200); return () => clearTimeout(t); }, []);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-US", { hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 530);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!powered) return;
    if (bootLine >= BOOT_LINES.length) { setTimeout(() => setBooted(true), 700); return; }
    const delay = bootLine < 6 ? 70 : bootLine < 13 ? 100 : 220;
    const t = setTimeout(() => setBootLine(n => n + 1), delay);
    return () => clearTimeout(t);
  }, [bootLine, powered]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      pointerPos.current = { x: e.clientX, y: e.clientY };
      const vx = (e.clientX / window.innerWidth)  * 100;
      const vy = (e.clientY / window.innerHeight) * 100;
      const { cx, cy } = toCRT(vx, vy);
      setCrt({ cx, cy });
      if (booted) {
        const found = (Object.entries(NAV_ZONES) as [Exclude<Page, "boot">, readonly [number,number,number,number]][])
          .find(([, z]) => inZone(cx, cy, z));
        setHovNav(found ? found[0] : null);
      }
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [booted]);

  // Physical desk-mouse sprite moves relative to the cursor's position across
  // the whole browser window — full-window movement is scaled proportionally
  // into a pad in the bottom-right corner (like a touchpad), rather than
  // tracking the cursor's literal screen position. A verlet-simulated cable
  // (friction only, no gravity) trails between it and the monitor's anchor.
  useEffect(() => {
    const mapToPad = (x: number, y: number) => {
      const xMin = window.innerWidth  * 0.80, xMax = window.innerWidth  * 0.97;
      const yMin = window.innerHeight * 0.55, yMax = window.innerHeight * 0.93;
      const fx = x / window.innerWidth;
      const fy = y / window.innerHeight;
      return {
        x: xMin + fx * (xMax - xMin),
        y: yMin + fy * (yMax - yMin),
      };
    };

    pointerPos.current = mapToPad(window.innerWidth / 2, window.innerHeight / 2);
    const canvas = cableCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const NUM_POINTS = 16;
    const FRICTION = 0.9;
    let points: { x: number; y: number; px: number; py: number }[] | null = null;
    let raf = 0;

    const step = () => {
      const anchorRect = cableAnchorRef.current?.getBoundingClientRect();
      const anchor = anchorRect
        ? { x: anchorRect.left + anchorRect.width / 2, y: anchorRect.top + anchorRect.height / 2 }
        : { x: window.innerWidth / 2, y: 0 };
      const target = mapToPad(pointerPos.current.x, pointerPos.current.y);

      if (!points) {
        points = Array.from({ length: NUM_POINTS }, (_, i) => {
          const t = i / (NUM_POINTS - 1);
          const x = anchor.x + (target.x - anchor.x) * t;
          const y = anchor.y + (target.y - anchor.y) * t;
          return { x, y, px: x, py: y };
        });
      }

      // Verlet integration with friction only — no gravity, so the cable
      // has inertia and trails the mouse but doesn't sag downward at rest.
      for (let i = 1; i < points.length - 1; i++) {
        const p = points[i];
        const vx = (p.x - p.px) * FRICTION;
        const vy = (p.y - p.py) * FRICTION;
        p.px = p.x; p.py = p.y;
        p.x += vx;
        p.y += vy;
      }

      const restLength = Math.max(Math.hypot(target.x - anchor.x, target.y - anchor.y) * 1.05, 120);
      const segLen = restLength / (points.length - 1);

      for (let iter = 0; iter < 8; iter++) {
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.0001;
          const diff = (dist - segLen) / dist;
          if (i === 0)                     { b.x -= dx * diff; b.y -= dy * diff; }
          else if (i === points.length - 2) { a.x += dx * diff; a.y += dy * diff; }
          else {
            a.x += dx * diff * 0.5; a.y += dy * diff * 0.5;
            b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5;
          }
        }
        points[0].x = anchor.x; points[0].y = anchor.y;
        points[points.length - 1].x = target.x; points[points.length - 1].y = target.y;
      }

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.strokeStyle = CREAM;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 4;
      ctx.stroke();

      if (mouseSpriteRef.current) {
        // Slight rotation like a right-handed grip pivoting from the wrist at
        // the bottom-right: sweeping left angles the mouse counter-clockwise,
        // sweeping right angles it clockwise.
        const fx = Math.min(Math.max(pointerPos.current.x / window.innerWidth, 0), 1);
        const fy = Math.min(Math.max(pointerPos.current.y / window.innerHeight, 0), 1);
        const angle = (fx - 0.5) * 14 - (fy - 0.5) * 5;
        mouseSpriteRef.current.style.transform =
          `translate(${target.x}px, ${target.y}px) translate(-50%, -6%) rotate(${angle}deg)`;
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const click = () => { if (hovNav && booted) setPage(hovNav); };
    window.addEventListener("click", click);
    return () => window.removeEventListener("click", click);
  }, [hovNav, booted]);

  const NAV_LABELS = { about: "F1: ABOUT.SYS", work: "F2: WORK.LOG", projects: "F3: PROJ.DIR" } as const;

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ cursor: "none", userSelect: "none" }}>
      <style>{`
        @keyframes crt-power-on {
          0%   { opacity: 0; transform: scaleY(0.004) scaleX(0.6); filter: brightness(5); }
          6%   { opacity: 1; transform: scaleY(1)     scaleX(1);   filter: brightness(2.5); }
          18%  { filter: brightness(1.4); }
          100% { filter: brightness(1); }
        }
        @keyframes phosphor-flicker {
          0%, 94%, 100% { opacity: 1; }
          95%  { opacity: 0.91; }
          96%  { opacity: 1; }
          97%  { opacity: 0.95; }
          98%  { opacity: 1; }
        }
        .crt-on    { animation: crt-power-on 0.7s ease-out forwards; }
        .crt-inner { animation: phosphor-flicker 12s infinite 3s; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Room ambience ── */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 90% 65% at 50% 10%, #0b160b 0%, #070707 50%, #040404 100%)"
      }} />

      {/* ── Monitor assembly ── */}
      <div className="absolute" style={{
        left: "50%",
        top: "1.5vh",
        transform: "translateX(-50%)",
        width: "clamp(300px, 46vw, 660px)",
      }}>
        {/* Housing shell — flat beige vector sprite */}
        <div style={{
          background: CREAM,
          borderRadius: 0,
          padding: "14px 18px 0",
          border: `3px solid ${OUTLINE}`,
          boxShadow: "0 20px 70px rgba(0,0,0,0.92)",
        }}>

          {/* ── CRT screen ── */}
          <div style={{
            position: "relative",
            borderRadius: 0,
            aspectRatio: "4 / 3",
            overflow: "hidden",
            background: "#030a03",
            border: `3px solid ${OUTLINE}`,
            boxShadow: [
              "inset 0 0 120px rgba(0,0,0,0.97)",
              "inset 0 0 50px rgba(77,255,110,0.025)",
              "0 0 60px rgba(77,255,110,0.18)",
              "0 0 120px rgba(77,255,110,0.08)",
            ].join(", "),
          }}>

            {/* Animated screen contents */}
            <div
              className={`absolute inset-0 ${powered ? "crt-on" : "opacity-0"} crt-inner`}
              style={{ transformOrigin: "center center" }}
            >
              {/* Phosphor field glow */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: "radial-gradient(ellipse at 50% 40%, rgba(77,255,110,0.045) 0%, transparent 62%)",
              }} />

              {/* ─ Status bar ─ */}
              {booted && (
                <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center" style={{
                  padding: "0.8% 3%",
                  borderBottom: `1px solid ${PD}`,
                  background: "rgba(3,10,3,0.88)",
                  fontFamily: "VT323, monospace",
                  fontSize: "clamp(8px, 1.15vw, 16px)",
                  color: PD,
                }}>
                  <span style={{ color: P, textShadow: `0 0 7px ${P}` }}>APOLLO OS</span>
                  <span>● SYS:OK  TEMP:72°F  ALT:NOMINAL</span>
                  <span style={{ color: P, textShadow: `0 0 7px ${P}` }}>{clock} UTC</span>
                </div>
              )}

              {/* ─ Page content ─ */}
              <div className="absolute inset-0 overflow-hidden" style={{
                paddingTop:    booted ? "8.5%" : "3%",
                paddingBottom: "14%",
                paddingLeft:   "3%",
                paddingRight:  "3%",
                fontFamily: "VT323, monospace",
                color: P,
                textShadow: `0 0 8px ${P}55`,
                fontSize: "clamp(9px, 1.2vw, 16px)",
                lineHeight: 1.45,
              }}>
                {page === "boot"     && <BootContent lines={BOOT_LINES.slice(0, bootLine)} blink={blink} booted={booted} />}
                {page === "about"    && <AboutContent />}
                {page === "work"     && <WorkContent />}
                {page === "projects" && <ProjectsContent />}
              </div>

              {/* ─ Nav bar ─ */}
              {booted && (
                <div className="absolute bottom-0 left-0 right-0 z-20 flex" style={{
                  borderTop: `1px solid ${PD}`,
                  background: "rgba(2,8,2,0.92)",
                }}>
                  {(["about", "work", "projects"] as const).map((id, i) => {
                    const hov    = hovNav === id;
                    const active = page   === id;
                    return (
                      <div key={id} className="flex-1 text-center" style={{
                        padding: "2.5% 0",
                        fontFamily: "VT323, monospace",
                        fontSize: "clamp(8px, 1.25vw, 17px)",
                        borderLeft: i > 0 ? `1px solid ${PD}` : "none",
                        background:  hov ? P : active ? "rgba(77,255,110,0.07)" : "transparent",
                        color:       hov ? "#030a03" : active ? P : PD,
                        textShadow:  hov ? "none" : `0 0 8px ${P}55`,
                        transition: "background 0.06s, color 0.06s",
                        letterSpacing: "1px",
                      }}>
                        {hov ? `► ${NAV_LABELS[id]} ◄` : `[ ${NAV_LABELS[id]} ]`}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ─ Normal white cursor ─ */}
              <div className="absolute z-30 pointer-events-none" style={{
                left: `${crt.cx}%`,
                top:  `${crt.cy}%`,
              }}>
                <svg width="16" height="20" viewBox="0 0 16 20" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}>
                  <path d="M0.5 0.5 L0.5 15 L4 11.8 L6.8 18 L9.2 17 L6.6 11 L11.5 11 Z"
                    fill="#ffffff" stroke="#000000" strokeWidth="1" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Scanlines — always on top */}
            <div className="absolute inset-0 z-10 pointer-events-none" style={{
              background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px)",
            }} />

            {/* Screen curvature vignette */}
            <div className="absolute inset-0 z-10 pointer-events-none" style={{
              background: "radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(0,0,0,0.72) 100%)",
            }} />

            {/* Corner glare highlight */}
            <div className="absolute z-10 pointer-events-none" style={{
              top: "3%", left: "4%", width: "22%", height: "14%",
              background: "radial-gradient(ellipse at 0% 0%, rgba(255,255,255,0.035) 0%, transparent 100%)",
            }} />
          </div>

          {/* ─ Bottom bezel ─ */}
          <div style={{
            background: CREAM,
            borderTop: `2px solid ${OUTLINE}`,
            padding: "10px 22px",
            display: "flex", alignItems: "center",
            borderRadius: 0,
            marginTop: "1px",
          }}>
            {/* Cable anchor — invisible marker the mouse's cable simulation pins to */}
            <div ref={cableAnchorRef} style={{ marginLeft: "auto", width: "1px", height: "1px" }} />
          </div>
        </div>

        {/* ─ Stand ─ */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{
            width: "20%", height: "2vh",
            background: CREAM,
            borderLeft: `3px solid ${OUTLINE}`, borderRight: `3px solid ${OUTLINE}`,
          }} />
          <div style={{
            width: "38%", height: "1.1vh",
            background: CREAM,
            border: `3px solid ${OUTLINE}`,
            borderTop: "none",
            borderRadius: 0,
          }} />
        </div>
      </div>

      {/* ─ Keyboard ─ */}
      <div className="absolute" style={{
        left: "50%", top: "76vh",
        transform: "translateX(-50%)",
        width: "clamp(220px, 34vw, 480px)",
      }}>
        <div style={{
          background: CREAM,
          borderRadius: 0,
          padding: "9px 9px 5px",
          border: `3px solid ${OUTLINE}`,
          boxShadow: "0 7px 24px rgba(0,0,0,0.75)",
        }}>
          {KEY_ROWS.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
              {row.map((k) => {
                const pressed = pressedKeys.has(k.code);
                return (
                  <div key={k.code} style={{
                    // Proportional flex-grow so every row stretches edge to edge
                    flex: `${k.w ?? 1} 1 0`,
                    height: "26px",
                    background: pressed ? CREAM_DARK : CREAM,
                    border: `2px solid ${OUTLINE}`,
                    borderRadius: 0,
                    transition: "background 0.03s, transform 0.03s",
                    transform: pressed ? "translateY(1px)" : "none",
                  }} />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ─ Cable — verlet-physics simulated wire from the monitor to the free-floating mouse ─ */}
      <canvas ref={cableCanvasRef} className="fixed inset-0 z-30 pointer-events-none" />

      {/* ─ Mouse — its own item, follows the real cursor; each button darkens on click ─ */}
      <div ref={mouseSpriteRef} className="fixed z-40 pointer-events-none" style={{ left: 0, top: 0, willChange: "transform" }}>
        <div style={{
          width: "74px", height: "112px",
          borderRadius: 0,
          border: `3px solid ${OUTLINE}`,
          background: CREAM,
          position: "relative", overflow: "hidden",
        }}>
          {/* Left button — only the top half darkens on click */}
          <div style={{
            position: "absolute", top: 0, left: 0, width: "50%", height: "42%",
            background: mouseButtons.left ? CREAM_DARK : "transparent",
            transition: "background 0.05s",
          }} />
          {/* Right button — only the top half darkens on click */}
          <div style={{
            position: "absolute", top: 0, right: 0, width: "50%", height: "42%",
            background: mouseButtons.right ? CREAM_DARK : "transparent",
            transition: "background 0.05s",
          }} />
          {/* Left/right click divider */}
          <div style={{
            position: "absolute", top: 0, left: "50%",
            width: "3px", height: "47px", background: OUTLINE, opacity: 0.6,
          }} />
          {/* Scroll wheel */}
          <div style={{
            position: "absolute", top: "19px", left: "50%", transform: "translateX(-50%)",
            width: "13px", height: "26px",
            background: CREAM_DARK,
            borderRadius: 0, border: `2px solid ${OUTLINE}`,
          }} />
        </div>
      </div>

      {/* Ambient CRT halo below monitor */}
      <div className="absolute pointer-events-none" style={{
        left: "50%", transform: "translateX(-50%)",
        top: "48vh", width: "55vw", height: "22vh",
        background: "radial-gradient(ellipse at 50% 0%, rgba(77,255,110,0.07) 0%, transparent 72%)",
      }} />

      {/* Hint text (fades once booted) */}
      {!booted && (
        <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none" style={{
          fontFamily: "Share Tech Mono, monospace",
          fontSize: "clamp(8px, 0.85vw, 12px)",
          color: "rgba(77,255,110,0.2)",
          letterSpacing: "2px",
          textTransform: "uppercase",
        }}>
          BOOTING…
        </div>
      )}
    </div>
  );
}

// ─── Page components ──────────────────────────────────────────

function BootContent({ lines, blink, booted }: { lines: string[]; blink: boolean; booted: boolean }) {
  return (
    <div style={{ whiteSpace: "pre" }}>
      {lines.map((l, i) => <div key={i}>{l || " "}</div>)}
      {!booted && lines.length > 0 && (
        <span style={{ opacity: blink ? 1 : 0 }}>▋</span>
      )}
    </div>
  );
}

function AboutContent() {
  return (
    <div>
      <div style={{ color: PB }}>╔══ OPERATOR PROFILE ════════════════════╗</div>
      <div>║ NAME   : <span style={{ color: PB }}>YOUR NAME</span>                     ║</div>
      <div>║ ROLE   : DATA SCIENTIST / AI ENGINEER  ║</div>
      <div>║ STATUS : <span style={{ color: P }}>ACTIVE ●</span> MISSION CONTROL      ║</div>
      <div style={{ color: PD }}>╠════════════════════════════════════════╣</div>
      <div style={{ color: PB }}>║ SPECIALIZATIONS                        ║</div>
      <div>║  ▶ VOICE AI &amp; SPEECH SYSTEMS           ║</div>
      <div>║  ▶ INTELLIGENT AGENTIC SYSTEMS         ║</div>
      <div>║  ▶ LARGE LANGUAGE MODELS               ║</div>
      <div>║  ▶ MISSION TELEMETRY &amp; DATA ANALYSIS   ║</div>
      <div>║  ▶ REAL-TIME ML INFERENCE SYSTEMS      ║</div>
      <div style={{ color: PD }}>╠════════════════════════════════════════╣</div>
      <div style={{ color: PB }}>║ SKILL MATRIX                           ║</div>
      {([
        ["PYTHON   ", "████████████░░", "88"],
        ["VOICE AI ", "█████████████░", "94"],
        ["ML / DL  ", "███████████░░░", "82"],
        ["AGENTS   ", "██████████████", "99"],
        ["DATA ENG ", "██████████░░░░", "76"],
      ] as [string, string, string][]).map(([skill, bar, pct]) => (
        <div key={skill}>
          {"║  "}{skill}{" "}<span style={{ color: P }}>{bar}</span>{" "}<span style={{ color: PD }}>{pct}%</span>{"  ║"}
        </div>
      ))}
      <div style={{ color: PD }}>╚════════════════════════════════════════╝</div>
    </div>
  );
}

function WorkContent() {
  const entries = [
    { p: "2023–NOW", r: "SENIOR AI ENGINEER",  o: "VOICE SYSTEMS INC.",      d: "Production voice AI & agentic systems at scale" },
    { p: "2021–23 ", r: "ML ENGINEER",          o: "DATA INTELLIGENCE CORP.", d: "Large-scale ML pipelines & model deployment" },
    { p: "2019–21 ", r: "DATA SCIENTIST",       o: "AEROSPACE ANALYTICS LLC", d: "Telemetry analysis & mission data processing" },
    { p: "2017–19 ", r: "SYSTEMS ANALYST",      o: "MISSION CONTROL DIV.",    d: "Real-time monitoring & control interfaces" },
  ];
  return (
    <div>
      <div style={{ color: PB, marginBottom: "0.4em" }}>
        ═══ MISSION LOG / WORK HISTORY ════════════
      </div>
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: "0.65em", paddingLeft: "0.5em", borderLeft: `2px solid ${PD}` }}>
          <div>
            <span style={{ color: PB }}>{e.p}</span>
            {" │ "}
            <span style={{ color: P }}>{e.r}</span>
          </div>
          <div style={{ paddingLeft: "10ch", color: "#33aa55" }}>ORG: {e.o}</div>
          <div style={{ paddingLeft: "10ch", color: PD }}>→   {e.d}</div>
        </div>
      ))}
    </div>
  );
}

function ProjectsContent() {
  const projs = [
    { id: "PRJ-001", n: "VOICE COMMAND AGENT",  t: "WHISPER + GPT-4 + TOOLS", d: "Real-time voice-driven agentic system with tool orchestration" },
    { id: "PRJ-002", n: "TELEMETRY ANALYZER",   t: "PYTORCH + STREAMING",     d: "Anomaly detection in high-frequency sensor data streams" },
    { id: "PRJ-003", n: "MISSION PLANNER AI",   t: "LLM + CONSTRAINT OPT.",   d: "Automated mission planning with constraint satisfaction" },
    { id: "PRJ-004", n: "NEURAL COMMS SYS",     t: "TRANSFORMER + AUDIO",     d: "Audio understanding for mission-critical communications" },
  ];
  return (
    <div>
      <div style={{ color: PB, marginBottom: "0.35em" }}>
        ═══ PROJECT DIRECTORY ══════════════════════
      </div>
      {projs.map((p, i) => (
        <div key={i} style={{
          marginBottom: "0.5em",
          padding: "0.3em 0.5em",
          border: `1px solid ${PD}`,
          borderRadius: "2px",
          background: "rgba(77,255,110,0.018)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1em", flexWrap: "wrap" }}>
            <span style={{ color: PB }}>{p.id} // {p.n}</span>
            <span style={{ color: PD, fontSize: "0.88em" }}>[{p.t}]</span>
          </div>
          <div style={{ color: P, paddingLeft: "1em" }}>└─ {p.d}</div>
        </div>
      ))}
    </div>
  );
}
