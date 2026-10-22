export interface ChatMessage {
  id: number | string;
  streamId: string;
  userId: number | string | null;
  username: string;
  message: string;
  createdAt: string;
}

export interface SendChatResponse {
  message: ChatMessage;
}

export interface LiveStreamTrack {
  index: number;
  name: string;
  trackId: string;
  videoUrl: string;
  isVideo: boolean;
  isAudio: boolean;
}

export interface TracksResponse {
  tracks: LiveStreamTrack[];
  videoCount: number;
  ready: boolean;
  pending?: number;
  totalDirs?: number;
  message?: string;
}

export interface LiveStreamInfo {
  streamId: string;
  trackCount: number;
  tracks: LiveStreamTrack[];
  title: string;
  category: string;
  viewers: number;
  avatarUrl: string;
  protocol: string;
  moqRelay?: string;
  thumbnailUrl: string;
}

export interface AvailableStreams {
  streams: LiveStreamInfo[];
  streamCount: number;
}

export interface AuthUser {
  id?: number | string;
  username: string;
  email: string;
  avatarUrl?: string;
}

export interface RawAuthResponse {
  token?: string;
  accessToken?: string;
  user?: AuthUser;
  id?: number | string;
  username?: string;
  email?: string;
  avatarUrl?: string;
}
