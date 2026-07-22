"use client";

import Link from "next/link";

import { SectionHeader } from "@/features/ui";
import { cn } from "@/features/ui/tokens";
import { ComposePanel } from "@/features/studio/ComposePanel";
import { StudioSummary } from "@/features/studio/StudioSummary";
import { CharacterGallery } from "@/features/studio/CharacterGallery";
import { GenerationQueue } from "@/features/studio/GenerationQueue";
import { WardrobePanel } from "@/features/studio/WardrobePanel";
import { LoadoutPanel } from "@/features/studio/LoadoutPanel";
import { useStudio } from "@/features/studio/useStudio";

export default function StudioPage() {
  const studio = useStudio();
  const busy = studio.jobs.some((j) => j.status === "running");

  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-white/10 px-6 py-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div>
            <SectionHeader>Avatar Creator</SectionHeader>
            <h1 className="font-display mt-1 text-3xl font-bold">Character Studio</h1>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill online={studio.online} />
            <Link href="/hub" className="text-sm text-muted transition-colors hover:text-foreground">
              ← Command Center
            </Link>
          </div>
        </div>
      </header>

      {(studio.error || studio.notice) && (
        <div className="mx-auto max-w-[1500px] px-6 pt-4">
          {studio.error && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-2.5 text-sm text-red-200">
              <span>{studio.error}</span>
              <button
                type="button"
                onClick={studio.clearMessages}
                className="text-xs uppercase tracking-wider text-red-300/70 hover:text-red-200"
              >
                Dismiss
              </button>
            </div>
          )}
          {studio.notice && !studio.error && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-green/25 bg-green/5 px-4 py-2.5 text-sm text-green">
              <span>{studio.notice}</span>
              <button
                type="button"
                onClick={studio.clearMessages}
                className="text-xs uppercase tracking-wider text-green/70 hover:text-green"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      <main className="mx-auto grid max-w-[1500px] items-start gap-5 px-6 py-6 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* Left rail — compose + summary */}
        <div className="space-y-5">
          <ComposePanel
            feeCents={studio.feeCents}
            online={studio.online}
            busy={busy}
            onGenerate={studio.generate}
          />
          <StudioSummary inventory={studio.inventory} equipped={studio.equipped} />
        </div>

        {/* Center — character gallery */}
        <div className="lg:h-[calc(100vh-160px)]">
          <CharacterGallery
            inventory={studio.inventory}
            equipped={studio.equipped}
            online={studio.online}
            onEquip={studio.equip}
            onDye={studio.dye}
          />
        </div>

        {/* Right rail — queue + wardrobe + loadouts */}
        <div className="space-y-5">
          <GenerationQueue
            jobs={studio.jobs}
            onEquip={studio.equip}
            onDismiss={studio.dismissJob}
          />
          <WardrobePanel
            inventory={studio.inventory}
            catalog={studio.catalog}
            equipped={studio.equipped}
            online={studio.online}
            onEquip={studio.equip}
            onDye={studio.dye}
          />
          <LoadoutPanel
            loadouts={studio.loadouts}
            equipped={studio.equipped}
            onSave={studio.saveLoadout}
            onEquip={studio.equipLoadout}
          />
        </div>
      </main>
    </div>
  );
}

function StatusPill({ online }: { online: boolean | null }) {
  if (online === null) {
    return (
      <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wider text-neutral-400">
        Connecting…
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
        online
          ? "border-green/40 bg-green/10 text-green"
          : "border-gold/40 bg-gold/10 text-gold",
      )}
    >
      {online ? "Live" : "Demo · offline"}
    </span>
  );
}
