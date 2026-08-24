# Roomcast

[한국어](README.md) | **English**

A browser-based 3D interior planner: draw or trace a floor plan, furnish it,
and inspect the result in a first-person walkthrough or a dollhouse bird's-eye
view.

The core design decision is a single plan model (SSOT) from which the 2D
editor, both 3D views and the cost estimate are all derived. Any change made in
any view — moving furniture, opening a door, switching a lamp, changing a floor
finish — mutates the same model, with command-level undo and debounced
localStorage persistence. The project implements an 8-screen design handoff
spec.

## Tech stack

| Area | Stack |
|---|---|
| Framework | React 18 + TypeScript (strict) |
| Build | Vite |
| 2D editor | Hand-rolled SVG rendering (no canvas library) |
| 3D | Three.js 0.170 · React Three Fiber 8 · Drei 9 |
| State | Zustand 5 (single store, command-level undo) |
| Tests | Vitest — 162 pure-logic tests (as of 2026-08-24) |
| Persistence | localStorage + JSON export/import |

## Features

| Screen | Summary |
|---|---|
| 2D floor plan editor | Wall/door/window drawing, furniture placement with grid and wall-face snapping, 15° rotation, multi-select, collision and door-clearance warnings, persistent dimension notes, per-room floor and wall finishes |
| 3D walkthrough | First-person WASD movement (capsule collision with sliding response), gaze interaction — toggle lamps and the TV, open and close hinged/sliding doors, edit materials |
| Bird's-eye view | Dollhouse / section / orthographic cameras, lighting simulation (time-of-day presets, window orientation), enter the walkthrough from any viewpoint |
| Upload tracing | Upload a floor plan image, set the scale with a reference line, trace walls into an editable plan |
| Apartment templates | Studio (23㎡), 59㎡ and 84㎡ Korean apartment layouts — net (inner-face) areas, furnished |
| Dashboard | Plan list, per-room cost estimate, JSON backup |

The furniture catalog has 49 items (as of 2026-08-24) across six categories;
picture frames, wall clocks and wall mirrors mount on walls via a wall-segment
coordinate system (wall id + position + height).

## Running

```bash
npm install
npm run dev      # dev server
npm run build    # tsc + vite build
npm test         # vitest (pure-logic tests)
```

Designed for desktop at 1440×900; responsive layout is out of scope. There is
no backend — plans persist in browser localStorage. The 3D views require WebGL.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the SSOT plan model, how 2D
  and 3D derive from it, state shape, input routing rules (Korean)
- [docs/STATUS.md](docs/STATUS.md) — implementation ledger kept during
  multi-session development (Korean)

## License

Source-available (all rights reserved) — published for reading and educational
reference. See [LICENSE](LICENSE) for details.
