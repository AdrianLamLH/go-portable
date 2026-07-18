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

Rules of thumb:
- Export from Blender at the **same scale you imported** (1 unit = 1 m). Don't rescale.
- Keep the monitor's screen opening at **4.2 × 3.15** so the CRT render + clicks align.
- One `.glb` per shell, textures embedded.

Nothing is wired to load these yet — send one over and it gets hooked up.
