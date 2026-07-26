"use client";

// The "add your avatar" destination.
//
// Clicking an empty seat at the table now opens a buy-in; clicking your face is
// what brings you here. Selection persists through the REAL `cosmetic_equip` RPC
// (via useStudio), not localStorage — there is no `avatar_set` RPC, so equip is
// what actually makes the choice stick and show up at the felt for other players.
//
// Portraits that a player does not own are shown locked rather than hidden, so
// the ladder is visible and the Shop has somewhere to sell into.

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Lock } from "lucide-react";

import { AVATARS, avatarSrc, type AvatarDef } from "@/features/table/avatars";
import { useStudio } from "@/features/studio/useStudio";
import { GLASS_PANEL, HEADING_SM, RARITY, cn } from "@/features/ui/tokens";
import { LIFT, SPRINGS, STAGGER, STAGGER_ITEM } from "@/features/ui/motion";

interface Props {
  notify: (msg: string, kind?: "ok" | "err") => void;
}

const TIER_LABEL: Record<AvatarDef["tier"], keyof typeof RARITY> = {
  legendary: "legendary",
  epic: "epic",
  rare: "rare",
  common: "common",
};

export function AvatarPanel({ notify }: Props) {
  const studio = useStudio();
  const [busy, setBusy] = useState<string | null>(null);

  // An avatar is owned when a matching cosmetic sits in the player's inventory.
  // The catalog ids and the portrait ids line up one-for-one.
  const owned = useMemo(
    () => new Set(studio.inventory.map((c) => c.id)),
    [studio.inventory],
  );
  const equippedId = studio.equipped["avatar"] ?? studio.equipped["portrait"] ?? null;

  const select = (a: AvatarDef) => {
    if (!owned.has(a.id)) {
      notify(`${a.name} isn't in your collection yet — find it in the Shop.`, "err");
      return;
    }
    setBusy(a.id);
    void (async () => {
      try {
        await studio.equip(a.id);
        notify(`${a.name} equipped — it's what other players see at the table.`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not equip that avatar", "err");
      } finally {
        setBusy(null);
      }
    })();
  };

  return (
    <div className="space-y-6">
      <section className={cn(GLASS_PANEL, "flex flex-wrap items-center justify-between gap-4 p-5")}>
        <div className="min-w-0">
          <p className={cn(HEADING_SM, "text-muted")}>Your Table Face</p>
          <p className="mt-1 text-[13px] text-neutral-400">
            The portrait every other player sees in your seat. Want one nobody else has?{" "}
            <Link href="/studio" className="text-gold underline-offset-2 hover:underline">
              Generate a custom character in the Studio →
            </Link>
          </p>
        </div>
      </section>

      <motion.section
        variants={STAGGER}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      >
        {AVATARS.map((a) => {
          const isOwned = owned.has(a.id);
          const isEquipped = equippedId === a.id;
          const rarity = RARITY[TIER_LABEL[a.tier]];
          return (
            <motion.button
              key={a.id}
              type="button"
              variants={STAGGER_ITEM}
              {...LIFT}
              transition={SPRINGS.snappy}
              onClick={() => select(a)}
              disabled={busy === a.id}
              aria-pressed={isEquipped}
              className={cn(
                GLASS_PANEL,
                "group relative flex flex-col items-center p-4 text-center",
                rarity.border,
                isEquipped && "ring-2 ring-gold",
              )}
              style={isEquipped ? { boxShadow: `0 0 26px ${a.glow}` } : undefined}
            >
              <span
                className="relative h-20 w-20 overflow-hidden rounded-full border-2"
                style={{ borderColor: a.border, boxShadow: `0 0 14px ${a.glow}` }}
              >
                <Image
                  src={avatarSrc(a.id)}
                  alt={a.name}
                  fill
                  sizes="80px"
                  className={cn("object-cover", !isOwned && "opacity-40 grayscale")}
                />
                {!isOwned && (
                  <span className="absolute inset-0 grid place-items-center bg-black/40">
                    <Lock className="h-5 w-5 text-neutral-300" />
                  </span>
                )}
              </span>

              <span className="mt-3 truncate text-[13px] font-semibold text-neutral-100">
                {a.name}
              </span>
              <span className={cn("mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em]", rarity.text)}>
                {a.tier}
              </span>

              {isEquipped && (
                <span className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-gold">
                  <Check className="h-3 w-3" /> Equipped
                </span>
              )}
              {busy === a.id && (
                <span className="mt-2 text-[11px] text-neutral-400">Equipping…</span>
              )}
            </motion.button>
          );
        })}
      </motion.section>
    </div>
  );
}
