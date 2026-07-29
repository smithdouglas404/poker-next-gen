"use client";

// Daily.co video manager — real camera/mic capture and peer video for live
// tables. Ported from the reference HighRollersClub implementation
// (client/src/lib/video-manager.ts), which itself is a drop-in replacement
// for an older P2P WebRTC manager — same public API, so VideoOverlay.tsx and
// Seat.tsx need no changes beyond what's already ported here.
//
// One deliberate change from the reference: the meeting-token fetch is a
// Nakama RPC (`video_token_get`) instead of a REST endpoint, matching how
// every other server call in this app works. If the server reports
// `available: false` (DAILY_API_KEY not configured), `start()` bails out
// without creating a Daily call object — never a fake "connected" state.

import DailyIframe, { type DailyCall } from "@daily-co/daily-js";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

type StateListener = () => void;

interface VideoTokenResponse {
  available: boolean;
  token?: string;
  message?: string;
}

class VideoManager {
  private daily: DailyCall | null = null;
  private localStream: MediaStream | null = null;
  private remoteStreams = new Map<string, MediaStream>();
  private videoEnabled = true;
  private audioEnabled = true;
  private recording = false;
  private listeners = new Set<StateListener>();

  async start(_heroId?: string, tableId?: string, _playerIds?: string[]): Promise<void> {
    if (this.daily || !tableId) return; // already active, or no table to join

    let token: string;
    try {
      const res = (await callSessionRpc("video_token_get", { match_id: tableId })) as VideoTokenResponse;
      if (!res.available || !res.token) {
        console.warn("[video] Video chat unavailable:", res.message);
        return;
      }
      token = res.token;
    } catch (err) {
      console.warn("[video] Token fetch error:", err);
      return;
    }

    this.daily = DailyIframe.createCallObject({ videoSource: true, audioSource: true });

    this.daily.on("participant-joined", this.handleParticipantChange);
    this.daily.on("participant-updated", this.handleParticipantChange);
    this.daily.on("participant-left", this.handleParticipantChange);
    this.daily.on("track-started", this.handleTrackEvent);
    this.daily.on("track-stopped", this.handleTrackEvent);
    this.daily.on("recording-started", () => {
      this.recording = true;
      this.notifyListeners();
    });
    this.daily.on("recording-stopped", () => {
      this.recording = false;
      this.notifyListeners();
    });
    this.daily.on("error", (e) => console.error("[video] Daily error:", e));

    try {
      await this.daily.join({ token });
      await this.daily.updateSendSettings({ video: { maxQuality: "low" } });
    } catch (err) {
      console.error("[video] Failed to join Daily room:", err);
      this.daily.destroy();
      this.daily = null;
      return;
    }

    this.rebuildLocalStream();
    this.rebuildRemoteStreams();
    this.notifyListeners();
  }

  stop(): void {
    if (this.daily) {
      try {
        this.daily.leave();
      } catch {}
      try {
        this.daily.destroy();
      } catch {}
      this.daily = null;
    }
    this.localStream = null;
    this.remoteStreams.clear();
    this.recording = false;
    this.notifyListeners();
  }

  toggleVideo(): void {
    if (!this.daily) return;
    this.videoEnabled = !this.videoEnabled;
    this.daily.setLocalVideo(this.videoEnabled);
    this.rebuildLocalStream();
    this.notifyListeners();
  }

  toggleAudio(): void {
    if (!this.daily) return;
    this.audioEnabled = !this.audioEnabled;
    this.daily.setLocalAudio(this.audioEnabled);
    this.notifyListeners();
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(userId: string): MediaStream | null {
    return this.remoteStreams.get(userId) || null;
  }

  isVideoEnabled(): boolean {
    return this.videoEnabled;
  }

  isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  isRecording(): boolean {
    return this.recording;
  }

  onStateChange(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async startRecording(): Promise<boolean> {
    if (!this.daily) return false;
    try {
      await this.daily.startRecording();
      this.recording = true;
      this.notifyListeners();
      return true;
    } catch (e) {
      console.error("[video] Failed to start recording:", e);
      return false;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.daily) return;
    try {
      await this.daily.stopRecording();
    } catch {}
    this.recording = false;
    this.notifyListeners();
  }

  private rebuildLocalStream() {
    if (!this.daily) {
      this.localStream = null;
      return;
    }
    const local = this.daily.participants()?.local;
    if (!local) {
      this.localStream = null;
      return;
    }
    const tracks: MediaStreamTrack[] = [];
    if (local.videoTrack) tracks.push(local.videoTrack as MediaStreamTrack);
    if (local.audioTrack) tracks.push(local.audioTrack as MediaStreamTrack);
    this.localStream = tracks.length > 0 ? new MediaStream(tracks) : null;
  }

  private rebuildRemoteStreams() {
    if (!this.daily) return;
    const participants = this.daily.participants();
    this.remoteStreams.clear();

    for (const [sessionId, p] of Object.entries(participants)) {
      if (sessionId === "local") continue;
      const playerId = p.user_id; // poker userId set in the meeting token
      if (!playerId) continue;

      const tracks: MediaStreamTrack[] = [];
      if (p.videoTrack) tracks.push(p.videoTrack as MediaStreamTrack);
      if (p.audioTrack) tracks.push(p.audioTrack as MediaStreamTrack);
      if (tracks.length > 0) {
        this.remoteStreams.set(playerId, new MediaStream(tracks));
      }
    }
  }

  private handleParticipantChange = () => {
    this.rebuildLocalStream();
    this.rebuildRemoteStreams();
    this.notifyListeners();
  };

  private handleTrackEvent = () => {
    this.rebuildLocalStream();
    this.rebuildRemoteStreams();
    this.notifyListeners();
  };

  private notifyListeners() {
    this.listeners.forEach((fn) => fn());
  }
}

export const videoManager = new VideoManager();
export default videoManager;
