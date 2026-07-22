"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import {
  DEMO_CATALOG,
  DEMO_EQUIPPED,
  DEMO_INVENTORY,
  DEMO_LOADOUTS,
} from "./demo";
import { GEN_FEE_CENTS } from "./presets";
import type { Cosmetic, EquippedMap, GenerationJob, Loadout } from "./types";

const POLL_MS = 4000;

interface StudioState {
  /** null = probing, true = live backend, false = offline demo fallback. */
  online: boolean | null;
  inventory: Cosmetic[];
  equipped: EquippedMap;
  catalog: Cosmetic[];
  loadouts: Loadout[];
  jobs: GenerationJob[];
  error: string | null;
  notice: string | null;
}

export interface StudioApi extends StudioState {
  refresh: () => Promise<void>;
  generate: (prompt: string) => Promise<void>;
  equip: (cosmeticId: string) => Promise<void>;
  dye: (cosmeticId: string, params: Record<string, string>) => Promise<void>;
  saveLoadout: (name: string, slots: EquippedMap) => Promise<void>;
  equipLoadout: (loadoutId: string) => Promise<void>;
  dismissJob: (jobId: string) => void;
  clearMessages: () => void;
  feeCents: number;
}

function isDemoId(id: string): boolean {
  return id.startsWith("cos-demo") || id.startsWith("cat-demo") || id.startsWith("lo-demo");
}

export function useStudio(): StudioApi {
  const [state, setState] = useState<StudioState>({
    online: null,
    inventory: [],
    equipped: {},
    catalog: [],
    loadouts: [],
    jobs: [],
    error: null,
    notice: null,
  });

  // Active poll timers keyed by generation id, cleaned up on unmount.
  const pollsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const demoTimersRef = useRef<Set<ReturnType<typeof setInterval>>>(new Set());

  const patch = useCallback((p: Partial<StudioState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  const clearMessages = useCallback(() => patch({ error: null, notice: null }), [patch]);

  const loadDemo = useCallback(() => {
    setState((s) => ({
      ...s,
      online: false,
      inventory: DEMO_INVENTORY,
      equipped: DEMO_EQUIPPED,
      catalog: DEMO_CATALOG,
      loadouts: DEMO_LOADOUTS,
    }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [inv, cat, lo] = await Promise.all([
        callSessionRpc("inventory_list", {}) as Promise<{
          inventory?: Cosmetic[];
          equipped?: EquippedMap;
        }>,
        callSessionRpc("cosmetic_list", {}) as Promise<{ cosmetics?: Cosmetic[] }>,
        callSessionRpc("loadout_list", {}) as Promise<{ loadouts?: Loadout[] }>,
      ]);
      setState((s) => ({
        ...s,
        online: true,
        inventory: inv.inventory ?? [],
        equipped: inv.equipped ?? {},
        catalog: cat.cosmetics ?? [],
        loadouts: lo.loadouts ?? [],
      }));
    } catch {
      // Backend unreachable (guest / offline) — fall back to labeled demo data.
      loadDemo();
    }
  }, [loadDemo]);

  useEffect(() => {
    void refresh();
    const polls = pollsRef.current;
    const timers = demoTimersRef.current;
    return () => {
      polls.forEach((t) => clearInterval(t));
      polls.clear();
      timers.forEach((t) => clearInterval(t));
      timers.clear();
    };
  }, [refresh]);

  const updateJob = useCallback((id: string, p: Partial<GenerationJob>) => {
    setState((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...p } : j)),
    }));
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    const t = pollsRef.current.get(jobId);
    if (t) {
      clearInterval(t);
      pollsRef.current.delete(jobId);
    }
    setState((s) => ({ ...s, jobs: s.jobs.filter((j) => j.id !== jobId) }));
  }, []);

  // Offline: simulate a Tripo job and mint a labeled demo character.
  const runDemoGeneration = useCallback(
    (prompt: string) => {
      const id = `gen-demo-${Date.now()}`;
      const job: GenerationJob = {
        id,
        prompt,
        status: "running",
        progress: 5,
        demo: true,
        startedAt: Date.now(),
      };
      setState((s) => ({ ...s, jobs: [job, ...s.jobs] }));
      const timer = setInterval(() => {
        setState((s) => {
          const j = s.jobs.find((x) => x.id === id);
          if (!j) return s;
          const next = Math.min(100, j.progress + 18);
          if (next >= 100) {
            clearInterval(timer);
            demoTimersRef.current.delete(timer);
            const cosId = `cos-demo-gen-${Date.now()}`;
            const minted: Cosmetic = {
              id: cosId,
              kind: "model",
              name: prompt.slice(0, 40) || "Custom Character",
              rarity: "legendary",
              asset_ref: "",
              preview_ref: "",
              demo: true,
            };
            return {
              ...s,
              inventory: [minted, ...s.inventory],
              jobs: s.jobs.map((x) =>
                x.id === id ? { ...x, progress: 100, status: "success", cosmeticId: cosId } : x,
              ),
              notice: "Demo character minted locally (offline preview — no backend).",
            };
          }
          return { ...s, jobs: s.jobs.map((x) => (x.id === id ? { ...x, progress: next } : x)) };
        });
      }, 900);
      demoTimersRef.current.add(timer);
    },
    [],
  );

  const generate = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (trimmed.length < 3) {
        patch({ error: "Describe the character you want (at least a few words)." });
        return;
      }
      patch({ error: null, notice: null });

      if (state.online === false) {
        runDemoGeneration(trimmed);
        return;
      }

      try {
        const res = (await callSessionRpc("character_generate", { prompt: trimmed })) as {
          configured?: boolean;
          generation_id?: string;
          message?: string;
        };
        if (!res.configured) {
          patch({ error: res.message ?? "Character generation isn't configured yet." });
          return;
        }
        const genId = res.generation_id!;
        const job: GenerationJob = {
          id: genId,
          prompt: trimmed,
          status: "running",
          progress: 5,
          startedAt: Date.now(),
        };
        setState((s) => ({ ...s, jobs: [job, ...s.jobs] }));

        const timer = setInterval(async () => {
          try {
            const st = (await callSessionRpc("character_generation_status", {
              generation_id: genId,
            })) as { status: string; progress?: number; cosmetic_id?: string };
            if (st.status === "success") {
              clearInterval(timer);
              pollsRef.current.delete(genId);
              updateJob(genId, { status: "success", progress: 100, cosmeticId: st.cosmetic_id });
              patch({ notice: "Your character was minted into your gallery." });
              await refresh();
            } else if (st.status === "failed") {
              clearInterval(timer);
              pollsRef.current.delete(genId);
              updateJob(genId, { status: "failed" });
              patch({ error: "Generation failed — your fee was refunded." });
            } else {
              updateJob(genId, { progress: st.progress ?? 0 });
            }
          } catch {
            /* transient — keep polling */
          }
        }, POLL_MS);
        pollsRef.current.set(genId, timer);
      } catch (e) {
        patch({ error: e instanceof Error ? e.message : "Generation failed" });
      }
    },
    [state.online, patch, refresh, runDemoGeneration, updateJob],
  );

  const equip = useCallback(
    async (cosmeticId: string) => {
      patch({ error: null, notice: null });
      if (state.online === false || isDemoId(cosmeticId)) {
        setState((s) => {
          const item = s.inventory.find((c) => c.id === cosmeticId);
          if (!item) return s;
          return {
            ...s,
            equipped: { ...s.equipped, [item.kind]: cosmeticId },
            notice: `Equipped ${item.name} (demo).`,
          };
        });
        return;
      }
      try {
        await callSessionRpc("cosmetic_equip", { cosmetic_id: cosmeticId });
        patch({ notice: "Equipped." });
        await refresh();
      } catch (e) {
        patch({ error: e instanceof Error ? e.message : "Equip failed" });
      }
    },
    [state.online, patch, refresh],
  );

  const dye = useCallback(
    async (cosmeticId: string, params: Record<string, string>) => {
      patch({ error: null, notice: null });
      if (state.online === false || isDemoId(cosmeticId)) {
        patch({ notice: "Dye applied (demo)." });
        return;
      }
      try {
        await callSessionRpc("cosmetic_dye_set", { cosmetic_id: cosmeticId, params });
        patch({ notice: "Dye applied." });
      } catch (e) {
        patch({ error: e instanceof Error ? e.message : "Dye failed" });
      }
    },
    [state.online, patch],
  );

  const saveLoadout = useCallback(
    async (name: string, slots: EquippedMap) => {
      patch({ error: null, notice: null });
      const clean = name.trim();
      if (!clean) {
        patch({ error: "Name your loadout first." });
        return;
      }
      if (state.online === false) {
        const lo: Loadout = {
          id: `lo-demo-${Date.now()}`,
          name: clean,
          slots_json: JSON.stringify(slots),
          created_at: new Date().toISOString(),
          demo: true,
        };
        setState((s) => ({ ...s, loadouts: [lo, ...s.loadouts], notice: `Saved "${clean}" (demo).` }));
        return;
      }
      try {
        await callSessionRpc("loadout_save", { name: clean, slots });
        patch({ notice: `Saved loadout "${clean}".` });
        await refresh();
      } catch (e) {
        patch({ error: e instanceof Error ? e.message : "Save failed" });
      }
    },
    [state.online, patch, refresh],
  );

  const equipLoadout = useCallback(
    async (loadoutId: string) => {
      patch({ error: null, notice: null });
      if (state.online === false || isDemoId(loadoutId)) {
        setState((s) => {
          const lo = s.loadouts.find((l) => l.id === loadoutId);
          if (!lo) return s;
          let slots: EquippedMap = {};
          try {
            slots = JSON.parse(lo.slots_json) as EquippedMap;
          } catch {
            /* ignore */
          }
          return { ...s, equipped: { ...s.equipped, ...slots }, notice: `Equipped "${lo.name}" (demo).` };
        });
        return;
      }
      try {
        const res = (await callSessionRpc("loadout_equip", { loadout_id: loadoutId })) as {
          equipped?: string[];
          skipped?: string[];
        };
        const skipped = res.skipped?.length ?? 0;
        patch({
          notice: skipped
            ? `Loadout equipped — ${skipped} unowned item(s) skipped.`
            : "Loadout equipped.",
        });
        await refresh();
      } catch (e) {
        patch({ error: e instanceof Error ? e.message : "Equip loadout failed" });
      }
    },
    [state.online, patch, refresh],
  );

  return {
    ...state,
    refresh,
    generate,
    equip,
    dye,
    saveLoadout,
    equipLoadout,
    dismissJob,
    clearMessages,
    feeCents: GEN_FEE_CENTS,
  };
}
