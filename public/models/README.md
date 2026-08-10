# Hand-modeled prop shells (Blender → site)

Drop exported `.glb` shells here to replace the procedural box geometry in
`src/app/components/Scene3D.tsx`. See **`docs/blender-remodel.md`** for the full
round-trip and the keep-separate checklist.

Expected filenames (the loader picks these up by name):

| File | Replaces |
| --- | --- |
| `monitor-shell.glb` | monitor body + bezel + neck + foot |
| `keyboard-base.glb` | keyboard chassis (not keycaps) |
| `mouse-shell.glb` | mouse body |
| `radio-shell.glb` | radio body (not readout panel) |
| `dumbbell.glb` | dumbbell |
| `calendar-shell.glb` | calendar stand/base |
| `streak-shell.glb` | streak-counter housing |
| `desk.glb` | desk top |
| `mousepad.glb` | mousepad |

**These load automatically.** Drop a file here and reload the page — the
procedural shell it replaces is hidden and yours takes its place. A missing or
broken file just leaves the procedural version alone. The browser console logs
`[models] swapped in: …` so you can confirm the pickup.

Named sub-objects the loader re-binds (name them exactly like this in Blender):

| Object name contains | In file | Becomes |
| --- | --- | --- |
| `power` (e.g. `power-button`) | `monitor-shell.glb` | the clickable power button, pressed in/out with the screen |
| `button` (e.g. `radio-button`) | `radio-shell.glb` | the play button, pressed in while music plays |
| `readout` | `radio-shell.glb` | the "now playing" display face |
| `readout` | `streak-shell.glb` | the live "DAYS SINCE" display face |

Rules of thumb:
- Export from Blender at the **same scale you imported** (1 unit = 1 m). Don't rescale.
- Export with **Include ▸ Limit to ▸ Selected Objects** so helpers don't sneak in.
- Keep the monitor's screen opening at **4.2 × 3.15** so the CRT render + clicks align.
- One `.glb` per shell, textures embedded. Materials are auto-flattened to the
  scene's matte style and re-inked with edge outlines on load.
