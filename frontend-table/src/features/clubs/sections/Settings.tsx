"use client";

import { useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { clubApi } from "../clubRpc";
import { CardHeader } from "../components";
import type { Club, ClubMember } from "../types";

export function Settings({
  club,
  members,
  isConfigurer,
  isOwner,
  toast,
  onChanged,
  onDeleted,
}: {
  club: Club;
  members: ClubMember[];
  isConfigurer: boolean;
  isOwner: boolean;
  toast: (msg: string, kind?: "ok" | "err") => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(club.name);
  const [description, setDescription] = useState(club.description ?? "");
  const [tag, setTag] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [requireApproval, setRequireApproval] = useState(true);
  const [transferTo, setTransferTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () =>
    void (async () => {
      setBusy("save");
      try {
        await clubApi.update(club.id, {
          name: name.trim(),
          description: description.trim(),
          tag: tag.trim(),
          is_public: isPublic,
          require_approval: requireApproval,
        });
        toast("Club settings saved.");
        onChanged();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Save failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const transfer = () =>
    void (async () => {
      if (transferTo === "") return;
      setBusy("transfer");
      try {
        await clubApi.transferOwnership(club.id, transferTo);
        toast("Ownership transferred.");
        onChanged();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Transfer failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const remove = () =>
    void (async () => {
      setBusy("delete");
      try {
        await clubApi.remove(club.id);
        toast("Club deleted.");
        onDeleted();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Delete failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  if (!isConfigurer) {
    return (
      <div className={cn(GLASS_PANEL, "p-6 text-sm text-neutral-500")}>
        Only club owners and managers can edit settings.
      </div>
    );
  }

  const otherMembers = members.filter((m) => m.role !== "owner");

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className={cn(GLASS_PANEL, "p-5")}>
        <CardHeader>General</CardHeader>
        <div className="space-y-3">
          <Field label="Club name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What your club is about"
            />
          </Field>
          <Field label="Tag / abbreviation" hint="Short club tag, e.g. ACES">
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="ACES" />
          </Field>
          <div className="flex gap-3">
            <Field label="Visibility" className="flex-1">
              <Select value={isPublic ? "public" : "private"} onChange={(e) => setIsPublic(e.target.value === "public")}>
                <option value="public">Public — discoverable</option>
                <option value="private">Private — invite only</option>
              </Select>
            </Field>
            <Field label="Joining" className="flex-1">
              <Select
                value={requireApproval ? "approve" : "open"}
                onChange={(e) => setRequireApproval(e.target.value === "approve")}
              >
                <option value="approve">Require approval</option>
                <option value="open">Open join</option>
              </Select>
            </Field>
          </div>
          <Button onClick={save} disabled={busy !== null} className="w-full">
            {busy === "save" ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        <div className={cn(GLASS_PANEL, "p-5")}>
          <CardHeader>Transfer Ownership</CardHeader>
          {!isOwner ? (
            <p className="text-sm text-neutral-500">Only the primary owner can transfer the club.</p>
          ) : otherMembers.length === 0 ? (
            <p className="text-sm text-neutral-500">Add another member first to transfer ownership.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-[12px] text-white/55">
                Hand the club to another member. You become a manager. This cannot be undone by you alone.
              </p>
              <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                <option value="">Select new owner…</option>
                {otherMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.username || m.user_id.slice(0, 8)} ({m.role})
                  </option>
                ))}
              </Select>
              <Button
                variant="outline"
                onClick={transfer}
                disabled={busy !== null || transferTo === ""}
                className="w-full"
              >
                {busy === "transfer" ? "Transferring…" : "Transfer Ownership"}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-red-500/25 bg-red-950/10 p-5">
          <CardHeader>Danger Zone</CardHeader>
          {!isOwner ? (
            <p className="text-sm text-neutral-500">Only the primary owner can delete the club.</p>
          ) : !confirmDelete ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)} className="w-full">
              Delete Club
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-[12px] text-red-200/80">
                Deactivate <span className="font-semibold">{club.name}</span>? Members lose access.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setConfirmDelete(false)} className="flex-1">
                  Cancel
                </Button>
                <Button variant="danger" onClick={remove} disabled={busy === "delete"} className="flex-1">
                  {busy === "delete" ? "Deleting…" : "Confirm Delete"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
