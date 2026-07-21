"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button, Field, Input, Panel, SectionHeader } from "@/features/ui";

interface Cosmetic {
  id: string;
  kind: string;
  name: string;
  rarity: string;
  asset_ref: string;
  preview_ref: string;
}

export default function StudioPage() {
  const [prompt, setPrompt] = useState("");
  const [inventory, setInventory] = useState<Cosmetic[]>([]);
  const [equipped, setEquipped] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      const inv = (await callSessionRpc("inventory_list", {})) as {
        inventory?: Cosmetic[];
        equipped?: Record<string, string>;
      };
      setInventory(inv.inventory ?? []);
      setEquipped(inv.equipped ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory");
    }
  }, []);

  useEffect(() => {
    void loadInventory();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadInventory]);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus("Starting…");
    try {
      const res = (await callSessionRpc("character_generate", { prompt: prompt.trim() })) as {
        configured?: boolean;
        generation_id?: string;
        message?: string;
      };
      if (!res.configured) {
        setStatus(null);
        setError(res.message ?? "Character generation isn't configured yet.");
        setBusy(false);
        return;
      }
      const genId = res.generation_id!;
      setStatus("Generating your character… this can take a minute.");
      pollRef.current = setInterval(async () => {
        try {
          const s = (await callSessionRpc("character_generation_status", {
            generation_id: genId,
          })) as { status: string; progress?: number; cosmetic_id?: string };
          if (s.status === "success") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus("Done! Your character is in your inventory.");
            setBusy(false);
            setPrompt("");
            await loadInventory();
          } else if (s.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus(null);
            setError("Generation failed — your fee was refunded.");
            setBusy(false);
          } else {
            setStatus(`Generating… ${s.progress ?? 0}%`);
          }
        } catch {
          /* keep polling */
        }
      }, 4000);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Generation failed");
      setBusy(false);
    }
  }, [prompt, loadInventory]);

  const equip = useCallback(
    async (id: string) => {
      try {
        await callSessionRpc("cosmetic_equip", { cosmetic_id: id });
        await loadInventory();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Equip failed");
      }
    },
    [loadInventory],
  );

  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <SectionHeader>Character Studio</SectionHeader>
            <h1 className="font-display mt-1 text-3xl font-bold">Generate your character</h1>
          </div>
          <Link href="/" className="text-sm text-cyan hover:underline">
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[1fr_1.4fr]">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-red-200 lg:col-span-2">
            {error}
          </div>
        )}

        <Panel className="h-fit p-6">
          <h2 className="font-display text-lg font-bold">Describe it</h2>
          <p className="mt-1 text-xs text-neutral-400">
            AI-generate a one-of-a-kind 3D character (powered by Tripo3D). A one-time fee
            applies; your character lands in your inventory and can be equipped at the table —
            or listed on the marketplace.
          </p>
          <Field label="Prompt" className="mt-4">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="a neon cyberpunk poker boss in a gold suit"
            />
          </Field>
          <Button disabled={busy || prompt.trim().length < 3} onClick={generate} className="mt-3 w-full">
            {busy ? "Generating…" : "Generate character"}
          </Button>
          {status && <p className="mt-3 text-xs text-amber-200">{status}</p>}
        </Panel>

        <div>
          <h2 className="font-display mb-3 text-lg font-bold">Your collection</h2>
          {inventory.length === 0 ? (
            <Panel className="p-8 text-center text-sm text-neutral-500">
              No items yet — generate your first character.
            </Panel>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {inventory.map((c) => {
                const isEquipped = equipped[c.kind] === c.id;
                return (
                  <Panel key={c.id} className="overflow-hidden">
                    <div className="aspect-square w-full bg-black/40">
                      {c.preview_ref ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.preview_ref} alt={c.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-4xl">🎭</div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold">{c.name}</p>
                      <p className="text-[10px] uppercase tracking-wider text-amber-300/70">
                        {c.kind} · {c.rarity}
                      </p>
                      <Button
                        size="sm"
                        variant={isEquipped ? "outline" : "gold"}
                        disabled={isEquipped}
                        onClick={() => void equip(c.id)}
                        className="mt-2 w-full"
                      >
                        {isEquipped ? "Equipped" : "Equip"}
                      </Button>
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
