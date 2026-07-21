# Seat avatars

Premium character portraits for table seats (neon / cyberpunk poker-boss style),
named by avatar id and rendered inside a glowing character-colored ring.

The 24 shipped characters (240×240 WebP, ~5–15 KB each) are defined in
`frontend-table/src/features/table/avatars.ts` (`AVATARS`), e.g.:

  neon-viper  chrome-siren  gold-phantom  shadow-king  void-witch
  cyber-samurai  red-wolf  ice-queen  tech-monk  cyber-punk  oracle-seer
  punk-duchess  mech-pilot  ghost-sniper  steel-ghost  neon-fox  dark-ace
  bolt-runner  street-racer  dj-chrome  iron-bull  data-thief  neon-medic
  merchant-boss

To add or replace a character: drop `<id>.webp` here and add a matching entry to
`AVATARS` (id, name, tier, border, glow). Square images (240×240+), face centered,
work best. Any missing file falls back to a generated monogram gradient, so you can
add art incrementally. Assignment is deterministic per player id.
