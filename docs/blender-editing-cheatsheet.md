# Blender editing cheatsheet

Quick keys for cleaning up and reshaping the imported props. Pairs with
`blender-remodel.md` (the round-trip + what to keep vs. delete).

## Getting around
| Action | How |
| --- | --- |
| Orbit / pan / zoom | middle-drag / shift+middle-drag / scroll |
| Enter/leave Edit Mode | **Tab** (with object selected) |
| Vertex / Edge / Face select | **1 / 2 / 3** |
| Select / add to selection | click / **shift-click** |
| Select all | **A** |
| Isolate selected (hide rest) | **/** (toggle) |
| Hide selected / unhide all | **H** / **Alt+H** |
| Select an edge loop | **Alt+click** an edge |

## Cleanup (do this per imported mesh first)
| Goal | How |
| --- | --- |
| Weld doubled corners | select all → **M ▸ By Distance** |
| Remove triangle diagonals | select all → **Alt+J** (Tris to Quads) |
| Remove an edge but keep the surface | select edge → **X ▸ Dissolve Edges** (not "Delete") |
| Delete edge **and** its faces (leaves a hole) | **X ▸ Delete ▸ Edges** — usually *not* what you want |
| Ditch the wireframe twins (from `addEdges`) | delete in the **Outliner**, or just export "Selected Objects" only |

## Joining pieces
| Goal | How |
| --- | --- |
| Edge between 2 verts / face from 3–4 verts | select them → **F** |
| Span a gap between two openings | select both edge loops → **Edge ▸ Bridge Edge Loops** |
| Cut an edge across a flat face | select 2 verts on that face → **J** |
| Merge separate **objects** into one | Object Mode → select all → **Ctrl+J** (then **M ▸ By Distance** to weld seams) |

## Adding a vertex on an edge
| Goal | How |
| --- | --- |
| At the midpoint / evenly spaced | select edge → **right-click ▸ Subdivide** (set "Number of Cuts" in the bottom-left panel) |
| At an exact spot | **K** (Knife) → click the edge → **Enter** |

## Reshaping
| Goal | How |
| --- | --- |
| Move / rotate / scale selection | **G** / **R** / **S** (then optionally **X/Y/Z** to lock an axis) |
| Round a hard edge | select edge(s) → **Ctrl+B** (Bevel), drag, scroll to add segments |
| Extrude new geometry | **E** |

## Don'ts (keeps it dropping back into the site aligned)
- **Don't rescale objects** — leave object Scale at `1.000`; resize by editing geometry.
- **Don't move a whole prop's position/origin** — reshape *within* it.
- **Keep the monitor's screen opening at 4.2 × 3.15** so the CRT render + clicks line up.
- **Export "Selected Objects" only** so wireframe twins / reference planes don't sneak back.
