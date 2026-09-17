export interface LiveStreamTrack {
  trackId: string;
  name: string;
  videoUrl: string;
  /** true for video-only HLS variants */
  isVideo: boolean;
  /** true for audio-only HLS variants */
  isAudio: boolean;
}

export interface LiveStreamInfo {
  streamId: string;
  trackCount: number;
  tracks: LiveStreamTrack[];
  title: string;
  category: string;
  viewers: number;
  avatarUrl: string;
  thumbnailUrl: string;
}

export interface AvailableStreamsResponse {
  streams: LiveStreamInfo[];
  streamCount: number;
}
