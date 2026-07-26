// Shim for HRC's video-manager (webcam tiles at the seats). We have no video feature,
// and Seat.tsx imports VideoThumbnail unconditionally, so this reports "nothing
// available" for every query rather than stubbing a fake feed — VideoOverlay and
// VideoThumbnail then render nothing and their controls stay off.
//
// Surface mirrors exactly what VideoOverlay calls. The mutators are no-ops on purpose:
// nothing here should look like it turned a camera on when it didn't.
type StateListener = () => void;

export const videoManager = {
  getLocalStream(): MediaStream | null {
    return null;
  },
  getRemoteStream(_playerId: string): MediaStream | null {
    return null;
  },
  isVideoEnabled(): boolean {
    return false;
  },
  isAudioEnabled(): boolean {
    return false;
  },
  isRecording(): boolean {
    return false;
  },
  onStateChange(_fn: StateListener): () => void {
    return () => {};
  },
  async start(_heroId?: string, _tableId?: string, _playerIds?: string[]): Promise<void> {},
  stop(): void {},
  toggleVideo(): void {},
  toggleAudio(): void {},
  startRecording(): void {},
  stopRecording(): void {},
};
export default videoManager;
