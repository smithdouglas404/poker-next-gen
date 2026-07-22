"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { clubApi, money, relTime } from "../clubRpc";
import { CardHeader, EmptyState, MemberAvatar, StatusDot, roleColor } from "../components";
import type { ChatMessage, ClubMember, RosterRow } from "../types";

export function Members({
  clubId,
  isConfigurer,
  fallbackMembers,
  toast,
}: {
  clubId: string;
  isConfigurer: boolean;
  fallbackMembers: ClubMember[];
  toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inviteId, setInviteId] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [chatText, setChatText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await clubApi.roster(clubId);
      setRoster(r.roster ?? []);
    } catch {
      // Roster RPC may 403 for non-members — fall back to the basic member list.
      setRoster(
        fallbackMembers.map((m) => ({
          user_id: m.user_id,
          username: m.username,
          role: m.role,
          status: m.status ?? "active",
          joined_at: "",
          balance: 0,
          locked_amount: 0,
          can_configure: false,
          activity_count: 0,
        })),
      );
    }
  }, [clubId, fallbackMembers]);

  const loadChat = useCallback(async () => {
    try {
      const c = await clubApi.chatList(clubId);
      setMessages(c.messages ?? []);
    } catch {
      setMessages([]);
    }
  }, [clubId]);

  useEffect(() => {
    void load();
    void loadChat();
  }, [load, loadChat]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages]);

  const invite = () =>
    void (async () => {
      if (inviteId.trim() === "") return;
      setBusy("invite");
      try {
        await clubApi.invite(clubId, inviteId.trim(), inviteRole, "");
        toast("Invitation sent.");
        setInviteId("");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Invite failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const send = () =>
    void (async () => {
      if (chatText.trim() === "") return;
      setBusy("chat");
      const text = chatText.trim();
      setChatText("");
      try {
        await clubApi.chatSend(clubId, text);
        await loadChat();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Message failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      {/* Roster */}
      <div className="space-y-4">
        {isConfigurer && (
          <div className={cn(GLASS_PANEL, "p-4")}>
            <CardHeader>Invite a Member</CardHeader>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="User ID" className="min-w-[200px] flex-1">
                <Input
                  value={inviteId}
                  onChange={(e) => setInviteId(e.target.value)}
                  placeholder="nakama user id"
                />
              </Field>
              <Field label="Role" className="w-32">
                <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </Select>
              </Field>
              <Button onClick={invite} disabled={busy === "invite" || inviteId.trim() === ""}>
                {busy === "invite" ? "Sending…" : "Invite"}
              </Button>
            </div>
          </div>
        )}

        <div className={cn(GLASS_PANEL, "p-5")}>
          <div className="mb-2 grid grid-cols-[1fr_90px_100px] px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
            <span>Name / Role</span>
            <span>Status</span>
            <span className="text-right">Balance</span>
          </div>
          {roster.length === 0 ? (
            <EmptyState>No members yet.</EmptyState>
          ) : (
            <div className="space-y-2.5">
              {roster.map((m) => (
                <div
                  key={m.user_id}
                  className="grid grid-cols-[1fr_90px_100px] items-center rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <MemberAvatar seed={m.user_id} name={m.username} size={44} />
                    <div className="min-w-0">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: roleColor(m.role) }}
                      >
                        {m.role}
                      </p>
                      <p className="truncate text-sm font-semibold text-white">
                        {m.username || m.user_id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  <StatusDot online={m.status === "active" || m.status === "online"} />
                  <div className="text-right">
                    <p className="text-sm font-bold text-gold">{money(m.balance)}</p>
                    {m.activity_count > 0 && (
                      <p className="text-[10px] text-neutral-500">{m.activity_count} actions</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Club chat */}
      <div className={cn(GLASS_PANEL, "flex flex-col p-4")}>
        <CardHeader>Club Chat</CardHeader>
        <div ref={chatRef} className="mb-3 max-h-[420px] min-h-[220px] flex-1 space-y-2 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <EmptyState>Members only. Say hello.</EmptyState>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="text-[13px]">
                <span className="font-semibold text-cyan/80">{msg.username || "player"}</span>
                <span className="ml-2 text-[10px] text-neutral-600">{relTime(msg.created_at)}</span>
                <p className="text-white/80">{msg.text}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Message the club…"
          />
          <Button onClick={send} disabled={busy === "chat" || chatText.trim() === ""} size="sm">
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
