import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

export interface TrackStat {
  name: string;
  type: 'video' | 'audio';
  codec?: string;
  resolution?: string;
  bitrate?: string;
  bufferMs?: number;
}

export interface StreamEngineStats {
  protocol: 'moq' | 'hls' | 'unknown';
  connectionHealth: 'connected' | 'buffering' | 'degraded' | 'disconnected';
  currentLatencyMs: number;
  bufferSizeMs: number;
  tracks: TrackStat[];
  syncDriftMs: Record<string, number>;
}

export interface StreamTrackView {
  id: string;
  name: string;
  element: HTMLElement;
  isVideo: boolean;
  isAudio: boolean;
  volume: number;
  visible: boolean;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
}

export abstract class StreamEngine {
  abstract readonly tracks$: Observable<StreamTrackView[]>;
  abstract readonly isLoading$: Observable<boolean>;
  abstract readonly isBuffering$: Observable<boolean>;
  abstract readonly error$: Observable<string>;
  abstract readonly playbackStarted$: Observable<boolean>;
  abstract readonly stats$: Observable<StreamEngineStats>;

  abstract connect(streamId: string): void;
  abstract disconnect(): void;
  abstract setVolume(trackId: string, volume: number): void;
  abstract unlockAudio(): void;
  abstract resize(stageWidth: number, stageH: number): void;
}

export const STREAM_ENGINE = new InjectionToken<StreamEngine>('STREAM_ENGINE');
