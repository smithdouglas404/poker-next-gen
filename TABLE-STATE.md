# Table state — where everything is, as of 2026-08-02

Written after a day in which the table on `main` was changed three times
without being asked for. This records what is where, so nobody has to
reconstruct it from git archaeology again.

## The correct table

**`origin/claude/hrc-table-plate` @ `6b84aad`** — confirmed correct by the owner
on 2026-08-02. Verified rendering: 6 clickable "SIT HERE" boxes on an empty
table, 8 avatars seated on a populated one.

It is the pre-Aug-1 table plus these six commits:

| Commit | What it fixed |
|---|---|
| `11892ef` | Felt backdrop behind the pre-seat screen (was floating panels on black) |
| `eec54d6` | Seat ring shifted clear of the Room Control drawer (seats 2/3 were hidden under it) |
| `3c9a1c0` | "More options →" link to the full table builder |
| `94c0c97` | Create Room disabled for callers with no sponsor club (was: click, then server error) |
| `39f7c98` | Click-avatar → player detail popup |
| `19060a6` | Real emote reactions |

Plus, inside `11892ef`/`eec54d6`, removal of the dead decorative "Vacant" box in
`ImageTable.tsx` that double-rendered on top of `SeatHud`'s real clickable seat
cards. That is the "avatars aren't in the boxes you select to sit down" problem.

## What `main` has (`e4254c2`)

- **The OLD table** — `57c36d0`, i.e. *without* the six commits above. This does
  not match the approved table.
- The 14 backend money/engine fixes (PR #85): 7 critical + 7 high.
- No Phase 1–3 design work.

## Two commits that are easy to confuse

- **`57c36d0`** — pre-Aug-1 table. Missing the six fixes. **Not the right one.**
- **`6b84aad`** — `57c36d0` + the six fixes. **This is the right one.**

A branch built from `57c36d0`'s table files will report "table is byte-identical
to `57c36d0`" and be *wrong*, because identical-to-`57c36d0` is the defect, not
the goal.

## Your Phase 1–3 design push (`2bdafd4`)

Not on `main`. It does **not compile** as pushed — 37 TypeScript errors,
unrelated to the table:

- `admin/primitives.tsx` was rewritten to export `AdminCard` / `SectionHeader` /
  `KpiBar`, but the 15 files in `admin/sections/` still import
  `Card` / `GoldHeading` / `StatTile` and pass `eyebrow` / `actions` props that
  no longer exist on the new component.
- `LandingClient.tsx` renders `SupportDialog` / `RecoveryDialog` without their
  required `open` prop.
- `LobbyTableCard.tsx` reads `small_blind` / `big_blind` off `TableListItem`,
  which doesn't declare them.

A working fix exists (local branch `claude/table-plus-design`): additive
compatibility shims in `primitives.tsx` — a `Card` mapping the v1 props onto
`AdminCard`, `GoldHeading`/`StatTile` reimplemented in the v2 style, `className`
on `Badge`, `open` on the two dialogs, two optional fields on `TableListItem`.
No admin section file edited, no design changed. Result: 0 errors.

## Known open defect: seat ring vs felt

The sit-down boxes and the table image use two independent coordinate systems:

- the felt by static CSS — `FELT_BOUNDS` (`left:50%`, `top:calc(50% + 45px)`,
  `width:72.9%`, `aspect-ratio:1408/768`);
- the seat ellipse by `computeTableLayout` from the raw viewport
  (`cy = height/2`, `ry = rx * 0.56`, an 8% margin).

Different centres (45px apart), different aspect ratios (1.833 vs 1.786), and
only the ring honours the Room-drawer inset — so opening the drawer slides the
seats right while the table stays put. They line up only at one window size.

A fix exists on local branch `claude/table-plus-design` (`099b1dc`): `SeatHud`
measures the felt's real rect and inscribes the ring in it. Measured distance
from felt centre across 6 seats — before: 0.71–1.25, varying with window size;
after: 0.93/0.97, identical at 1280x800, 1600x1000 and 1920x1080, drawer open
and closed.

## Branches

| Ref | Contains | Pushed? |
|---|---|---|
| `origin/main` @ `e4254c2` | old table + 14 backend fixes | yes (deployed) |
| `origin/claude/hrc-table-plate` @ `6b84aad` | **the correct table** | yes |
| `2bdafd4` | Phase 1–3 design + 7 new screens (37 type errors) | yes, not on main |
| `origin/claude/backend-high-fixes` | the 7 high fixes | merged as PR #85 |
| `origin/claude/restore-table` | obsolete, inert — safe to delete | yes |
| `claude/table-plus-design` @ `099b1dc` | design + type fixes + alignment fix | **local only** |

## Ground rule going forward

Nothing goes on `main` without being asked for, explicitly, for that specific
change. "Merge and push" for one thing is not permission for what rides along
with it — check the full diff and say what's in it before pushing.
