# Table music

Background tracks for the in-game music picker (`src/features/sound/library.ts`
→ `MUSIC_TRACKS`). Players select a track, control volume, or paste their own URL.

## ⚠️ Licensing — read before charging members

`fever.mp3` and `rather-be.mp3` are **commercial recordings** (flagged `unlicensed`
in `library.ts`, shown with a red "demo" badge in the picker). They are fine for
local testing but are **NOT cleared for a paid product** — using them in a service
you charge for is a copyright/DMCA liability.

Before going live:

- Replace them with **licensed or royalty-free** tracks (e.g. from a library you
  have a commercial license for), or
- Ship with only original/cleared audio and let members add their own track URLs
  (the picker's "Paste a track URL" field already supports this).

Drop `<id>.mp3` here and add a matching entry to `MUSIC_TRACKS`.
