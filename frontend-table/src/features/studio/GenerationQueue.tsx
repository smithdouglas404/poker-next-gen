"use client";

import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import type { GenerationJob } from "./types";

// Right rail, top — analogous to the master's "Waiting List": a live queue of
// in-flight mint jobs with progress and a terminal action, newest first.
export function GenerationQueue({
  jobs,
  onEquip,
  onDismiss,
}: {
  jobs: GenerationJob[];
  onEquip: (id: string) => void;
  onDismiss: (jobId: string) => void;
}) {
  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <p className={cn(HEADING_SM, "text-center text-gold/80")}>Generation Queue</p>

      {jobs.length === 0 ? (
        <p className="mt-4 text-center text-xs text-neutral-500">
          No active jobs. Submit a prompt to start a mint.
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {jobs.map((job) => {
            const done = job.status === "success";
            const failed = job.status === "failed";
            return (
              <div
                key={job.id}
                className="rounded-xl border border-white/[0.08] bg-black/30 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs text-neutral-200">{job.prompt}</p>
                  {job.demo && (
                    <span className="shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                      Demo
                    </span>
                  )}
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      failed ? "bg-red-500" : done ? "bg-cyan" : "bg-gold",
                    )}
                    style={{ width: `${failed ? 100 : job.progress}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider",
                      failed ? "text-red-300" : done ? "text-cyan" : "text-neutral-400",
                    )}
                  >
                    {failed
                      ? "Failed — fee refunded"
                      : done
                        ? "Minted"
                        : `Generating ${job.progress}%`}
                  </span>
                  {done && job.cosmeticId ? (
                    <Button size="sm" onClick={() => onEquip(job.cosmeticId!)}>
                      Equip
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => onDismiss(job.id)}>
                      {failed ? "Dismiss" : "Hide"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
