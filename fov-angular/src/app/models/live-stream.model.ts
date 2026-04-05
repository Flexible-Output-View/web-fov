export interface LiveStreamTrack {
  trackId: string;
  videoUrl: string;
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
