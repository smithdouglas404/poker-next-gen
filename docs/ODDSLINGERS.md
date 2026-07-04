# OddSlingers in Poker Next-Gen

[OddSlingers](https://github.com/Monadical-SAS/oddslingers.poker) runs **live** in docker compose at **http://localhost:8888** alongside the Nakama + rs_poker stack. The submodule at `./oddslingers/` is the upstream Django/React codebase.

## Submodule

```bash
git submodule update --init --depth 1 oddslingers
```

Run the upstream stack standalone (optional):

```bash
cd oddslingers
docker compose up
# → http://localhost (when not using poker-next-gen compose)
```

## Architecture mapping

| OddSlingers (reference) | Poker Next-Gen (runtime) |
| ----------------------- | ------------------------ |
| `core/poker/controllers.py` — HoldemController | `backend-core/poker/table.go` + `match/holdem/handler.go` |
| `core/sockets/` — Django Channels WebSocket | Nakama match WebSocket opcodes |
| `core/js/poker/process.js` — animation queue | `frontend-table/src/features/table/dealAnimation.ts` |
| `core/js/poker/animations.js` — SNAPTO / PROGRESS | `TableHud` action timer + Pixi deal stagger |
| `core/js/pages/tables.js` — lobby thumbnails | `frontend-table/src/app/lobby/` + `TableCard.tsx` |
| Python hand evaluation | **rs_poker** via `engine-math/` HTTP sidecar |

## What we ported (2026 hybrid)

- **Deal animation** — OddSlingers staggered deal → Pixi `runDealAnimation` on hand start
- **Action timer** — OddSlingers `PROGRESS` bar → `ActionTimer.tsx` on hero turn
- **Lobby table cards** — thumbnail grid with seated count and stakes
- **Keyboard shortcuts** — `F` fold, `C` check/call, `R` raise (OddSlingers debug keys pattern)
- **Showdown + equity** — rs_poker `/showdown`, `/equity`, `/batch_rank` (deeper than OddSlingers Python eval path)

## License note

OddSlingers is [LGPL-2.1](https://github.com/Monadical-SAS/oddslingers.poker/blob/main/LICENSE). The submodule is kept isolated; ported patterns in `frontend-table/` and `backend-core/` are reimplemented for Nakama/rs_poker and do not link LGPL code at runtime.
