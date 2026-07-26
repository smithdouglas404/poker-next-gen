// Shim for HRC's ws-client, which its Emote/Taunt components import as a singleton.
//
// HRC ships its own WebSocket transport; we use Nakama via GameProvider, so this is a
// LOCAL event bus with the same surface. Seat.tsx only renders the bubbles
// (EmoteBubble / TauntBubble), so keeping the subscribe API satisfied is enough for the
// table to render — bubbles simply never fire until emotes are mapped to a Nakama op.
//
// Deliberately does NOT pretend to reach the network: send() is a local dispatch only.
// Wire it to a real op before shipping any emote/taunt CONTROL, so we never ship a
// button that looks like it sent something it didn't (CLAUDE.md non-negotiable #4).

type Handler = (msg: any) => void;

class LocalBus {
  private handlers = new Map<string, Set<Handler>>();

  on(type: string, fn: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  off(type: string, fn: Handler): void {
    this.handlers.get(type)?.delete(fn);
  }

  /** Local dispatch only — no transport. See the note above. */
  send(msg: { type: string; [k: string]: unknown }): void {
    this.handlers.get(msg.type)?.forEach((fn) => fn(msg));
  }
}

export const wsClient = new LocalBus();
export default wsClient;
