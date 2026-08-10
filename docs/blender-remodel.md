# Remodeling the workstation props in Blender

The 3D room in `src/app/components/Scene3D.tsx` is built **procedurally** — every
prop is `BoxGeometry` positioned by hand in code. This guide is the round-trip
for replacing the blocky *shells* with hand-modeled Blender meshes while keeping
all the interactive/animated/live-data parts in code.

**The hybrid rule:** remodel the *static shells*; keep in code anything that
**moves, recolors, or shows live data**. A model swap doesn't delete behavior —
the code still drives it — but the code reaches into meshes by name, so a part
that animates must exist as its own object for the code to grab.

---

## Stage 1 — Export the current shapes

1. `npm run dev`
2. Open the browser console and run:
   ```js
   exportSceneGLB()
   ```
   → downloads **`workstation.glb`**: desk, monitor, keyboard, mouse, radio,
   calendar, and dumbbell at their exact in-scene spacing. (Dev-only; stripped
   from production builds.)
3. Open it in Blender: `File ▸ Import ▸ glTF 2.0`.

Invisible helpers (the raycast `pickPlane`) are skipped. Some **code-only parts
export as visible reference** — the CRT screen plane, keycaps, the radio readout.
Use them to model against, then delete them before exporting your shell.

### Units & scale — the one thing you must not break
- **1 Three.js unit = 1 Blender meter.** The monitor is ~5.3 units wide, so it's
  ~5.3 m in Blender. That's "wrong" for a real CRT but correct for this scene —
  **do not rescale on import or export.** Whatever you import at, export at.
- Reference dimensions: monitor outer `5.3 × 4.05`, **screen opening `4.2 × 3.15`**
  (this must not drift — see Monitor below); desk top at world `y = -1.45`.

---

## Stage 2 — Model & texture

- **Model:** Edit Mode — bevel the hard edges (`Ctrl+B`), add vents, chamfers,
  taper. This is the whole point: silhouettes stop being boxes.
- **UV unwrap:** mark seams → `U ▸ Unwrap` (or `Smart UV Project`). Required for
  decals to land where you want.
- **Decals/textures:** either the **Texture Paint** workspace (paint/stencil on
  the model, save the image) or export the UV layout and paint it in your usual
  editor. Either way you end up with a texture image.
- **Export:** `File ▸ Export ▸ glTF 2.0 (.glb)`, *Apply Modifiers* on, textures
  embedded. One `.glb` per shell (see naming below).

---

## Stage 3 — Keep-separate checklist

Model each shell as **one object is fine** unless a part is listed under "keep
separate / stays code." Those either remain procedural or must be their own
named object so the code can move/recolor them.

| Prop | Remodel freely (the shell) | Keep separate / stays code | Why |
| --- | --- | --- | --- |
| **Monitor** | case body, bezel frame, neck, foot | **CRT screen plane**, **power button**, invisible pickPlane, post-it | Screen = the whole LamOS render + click surface; power button pushes in & toggles the OS |
| **Keyboard** | base / chassis | **keycaps** (leave procedural) | Each keycap drops `0.06` and darkens to `matCreamDark` on the matching keypress |
| **Mouse** | entire shell (buttons + wheel can be merged) | — | Decorative; no per-part animation |
| **Radio** | body / case | **readout panel**, any play indicator | Panel texture swaps `off → on` when the radio plays |
| **Dumbbell** | everything | — | Pure decor — easiest object to remodel |
| **Calendar** | stand, base, backing | **month-grid face** | Face is a live canvas (dates/highlights); whole prop is a Calendly click target |
| **Streak counter** | plastic housing | **"DAYS SINCE" readout face** | Live number from the Hevy integration |

### The monitor is the strict one
The lean-in camera and the clickable CRT are both computed from the monitor's
transform, and the OS renders onto a `4.2 × 3.15` plane sitting just in front of
the bezel opening. So: model the bezel **around** a `4.2 × 3.15` hole at that
location. If your opening is a different size/position, the screen render and the
cursor hit-testing won't line up. Everything else is forgiving.

---

## Stage 4 — Bring it back (automatic)

Drop each exported shell into **`public/models/`** using these names and
**reload the page** — an auto-loader finds them, hides the matching procedural
shell, flattens the GLB's PBR materials to the scene's matte style, re-inks
edge outlines, and re-binds click targets. A missing/broken file just leaves
the procedural shell in place; the console logs `[models] swapped in: …`.

Name sub-objects `power-button` (monitor), `radio-button` / `readout` (radio),
and `readout` (streak counter) to have their behavior re-bound automatically —
see `public/models/README.md`.

| File | Replaces |
| --- | --- |
| `monitor-shell.glb` | monitor body + bezel + neck + foot |
| `keyboard-base.glb` | keyboard chassis (not keycaps) |
| `mouse-shell.glb` | mouse body |
| `radio-shell.glb` | radio body (not readout) |
| `dumbbell.glb` | dumbbell |
| `calendar-shell.glb` | calendar stand/base |
| `streak-shell.glb` | streak-counter housing |

Then I:
1. Add `GLTFLoader`, load each shell, and parent it where the procedural shell
   was — deleting only the shell meshes, keeping the code-driven children.
2. Re-register loaded meshes as the existing **click targets** (`monitor`,
   `radio`, `calendarG`, …) and re-point the **power button** hit-test.
3. **Look-matching pass:** GLB imports as glossy PBR; I convert its materials
   back to flat `MeshLambertMaterial` and re-apply the dark edge outlines so it
   matches the scene's style instead of looking too smooth/shiny.

You don't need all seven at once — send me one (the **monitor** is the natural
first, since it's the template for the tricky screen-anchoring) and I'll wire it
end to end, then the rest follow the same recipe.

---

## Appendix — exact sub-mesh reference

Every sub-mesh of each prop, with its dimensions (in scene units) and whether it
is yours to remodel or must stay code. 🟢 remodel freely · 🟡 keep separate
(animates/live) · ⚪ code-only (don't export/replace).

### Monitor — group at `(0, 1.42, 1.1)`, yaw `-0.12`
| Mesh | Size | Notes |
| --- | --- | --- |
| 🟢 `body` | `5.3 × 4.05 × 1.7` @ z −0.85 | rear case |
| 🟢 bezel bars ×4 | frame, depth `0.34`, front @ z ≈ 0.17 | merge into one bezel — **keep the `4.2 × 3.15` opening** |
| 🟢 `neck` | `0.9 × 0.6 × 0.8` | stand neck |
| 🟢 `foot` | `2.3 × 0.18 × 1.5` | stand foot |
| 🟡 `powerButton` | @ `(-2.15, bottom-bezel, z 0.41)` | pushes to z `0.36` + toggles OS; own object or leave procedural |
| ⚪ screen plane | `4.2 × 3.15` | the LamOS render — code only |
| ⚪ `pickPlane` | huge, invisible | cursor raycast — code only |
| ⚪ `postItG` | — | code note (hidden on mobile) |

### Keyboard — group at `(-0.7, -1.36, 3.2)`, yaw `0.04`
| Mesh | Size | Notes |
| --- | --- | --- |
| 🟢 `kbBase` | `4.6 × 0.18 × 1.85` | chassis; top face is `keyboard-top.png` |
| ⚪ keycaps (~60, `keyMeshes`) | each `~w × 0.16 × 0.3` @ baseY `0.17` | each drops `0.06` + darkens on its keypress — **leave procedural** |

### Mouse — group (decorative, no animation → all 🟢)
| Mesh | Size |
| --- | --- |
| 🟢 `mouseBody` | `0.72 × 0.26 × 1.08` (top = `mouse-top.png`) |
| 🟢 `btnL` / `btnR` | `0.32 × 0.07 × 0.44` |
| 🟢 `wheel` | `0.1 × 0.09 × 0.24` |

Merge or keep-separate as you like — nothing here is wired to behavior.

### Radio — group at `(4.6, -1.45, -1.1)`, yaw `-0.5`
| Mesh | Size | Notes |
| --- | --- | --- |
| 🟢 `radioBody` | `1.25 × 1.85 × 0.95` | front = `radio-front.png`; sculpt real speaker slits if you want |
| 🟢 speaker slits ×4 | `0.78 × 0.045 × 0.02` | decor — remodel or drop |
| 🟡 `radioButton` | `0.16 × 0.22 × 0.22` @ side x `0.68` | red; pressed to `0.58` while playing |
| ⚪ `radioPanel` | plane `0.72 × 0.36` @ `(-0.12, 1.35, 0.478)` | "now playing" texture swap — code only |

### Calendar — group at `(-4.35, -1.45, 0.4)`, yaw `0.45`
| Mesh | Size | Notes |
| --- | --- | --- |
| 🟢 `capR` / `capL` | triangular ends @ x ±`0.85` | the easel wedge |
| 🟢 `calBase` | `1.78 × 0.04 × ~0.9` | base plate |
| ⚪ `calFront` / `calBack` | plane `1.7 × 1.2` | live month grid (Calendly) — code only |

Whole group is the Calendly click target — I re-tag it after the swap.

### Streak counter — group at `(-3.95, -1.45, 2.95)`, yaw `0.35`
| Mesh | Size | Notes |
| --- | --- | --- |
| 🟢 `streakBody` housing | `0.95 × 0.55 × 0.18` | model a **recessed front**; the +z face is live data |
| 🟢 dumbbell (`dbBar` + 2 plates) | bar `0.62`, plates r `0.115` | pure decor — fully free |
| ⚪ readout face | `streakBody` +z face | live "DAYS SINCE" from Hevy — code plane |

**Pattern to notice:** 🟡/⚪ parts are exactly the ones that move, recolor, or
show live data. Model 🟢 shells; for 🟡 either give them their own clean object
or leave them procedural; never merge a ⚪/🟡 part into a 🟢 blob.
