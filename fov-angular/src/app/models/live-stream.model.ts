export interface TrackInfo {
  trackId: string;
  videoUrl: string;
}

export interface LiveStreamInfo {
  streamId: string;
  trackCount: number;
  tracks: TrackInfo[];
}

export interface AvailableStreamsResponse {
  streams: LiveStreamInfo[];
  streamCount: number;
}
