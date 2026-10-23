import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map } from 'rxjs';
import Hls from 'hls.js';
import * as API from '../models/APIModels';
import { LiveStreamsService } from './live-streams.service';
import { StreamEngine, StreamTrackView } from './stream-engine-interface';

interface TrackBufferInfo {
  id: string;
  name: string;
  start: number;
  end: number;
  length: number;
  startPdt: number | null;
}

@Injectable()
export class HlsStreamEngine implements StreamEngine {
  private tracksSubject = new BehaviorSubject<StreamTrackView[]>([]);
  public tracks$ = this.tracksSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(true);
  public isLoading$ = this.loadingSubject.asObservable();

  private bufferingSubject = new BehaviorSubject<boolean>(true);
  public isBuffering$ = this.bufferingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string>('');
  public error$ = this.errorSubject.asObservable();

  private playbackStartedSubject = new BehaviorSubject<boolean>(false);
  public playbackStarted$ = this.playbackStartedSubject.asObservable();

  private videoWrappers: any[] = [];
  private audioWrappers: any[] = [];
  private hlsInstances: Hls[] = [];
  private syncInterval: any = null;
  private bufferCheckInterval: any = null;
  private masterPlayerId: string | null = null;

  private readonly SYNC_THRESHOLD = 0.1;
  private readonly HARD_SYNC_THRESHOLD = 0.3;
  private readonly MIN_BUFFER_FOR_START = 6;

  constructor(private liveStreamsService: LiveStreamsService) {}

  connect(streamId: string): void {
    this.loadingSubject.next(true);
    this.bufferingSubject.next(true);

    this.liveStreamsService.getAvailableStreams().subscribe({
      next: (response) => {
        const stream = response.streams.find((s) => s.streamId === streamId);
        if (!stream || !stream.tracks || stream.tracks.length === 0) {
          this.errorSubject.next('Stream ou flux indisponible.');
          this.loadingSubject.next(false);
          this.bufferingSubject.next(false);
          return;
        }

        this.initializeTracks(stream.tracks);
      },
      error: (err) => {
        console.error('[HlsStreamEngine] Error loading stream:', err);
        this.errorSubject.next('Impossible de charger les flux.');
        this.loadingSubject.next(false);
        this.bufferingSubject.next(false);
      },
    });
  }

  private initializeTracks(tracks: API.LiveStreamTrack[]) {
    const videoTracks = tracks.filter((t) => t.isVideo);
    const audioTracks = tracks.filter((t) => t.isAudio);

    this.videoWrappers = videoTracks.map((track, i) => {
      const videoEl = document.createElement('video');
      videoEl.playsInline = true;
      videoEl.muted = true;
      videoEl.volume = 0;

      const wrapper = {
        playerId: `player_v_${i}`,
        track,
        videoElement: videoEl,
        hls: null as Hls | null,
        bufferStart: 0,
        bufferEnd: 0,
        isReady: false,
        aspectRatio: 16 / 9,
      };

      this.initHlsForVideo(wrapper, track.videoUrl);
      return wrapper;
    });

    this.audioWrappers = audioTracks.map((track, i) => {
      const audioEl = document.createElement('audio');
      audioEl.preload = 'auto';
      audioEl.muted = true;
      audioEl.volume = 1;

      const wrapper = {
        playerId: `player_a_${i}`,
        track,
        audioElement: audioEl,
        hls: null as Hls | null,
        bufferStart: 0,
        bufferEnd: 0,
        isReady: false,
        volume: 1,
      };

      this.initHlsForAudio(wrapper, track.videoUrl);
      return wrapper;
    });

    if (this.videoWrappers.length > 0) {
      this.masterPlayerId = this.videoWrappers[0].playerId;
    }

    const trackViews: StreamTrackView[] = [
      ...this.videoWrappers.map((w, i) => ({
        id: w.playerId,
        name: w.track.name,
        element: w.videoElement,
        isVideo: true,
        isAudio: false,
        volume: w.volume,
        visible: true,
        zIndex: 100 - i,
        x: i === 0 ? 0 : 20,
        y: i === 0 ? 0 : 20 + i * 30,
        width: 800,
        height: 450,
        aspectRatio: 16 / 9,
      })),
      ...this.audioWrappers.map((w) => ({
        id: w.playerId,
        name: w.track.name,
        element: w.audioElement,
        isVideo: false,
        isAudio: true,
        volume: w.volume,
        visible: false,
        zIndex: 0,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        aspectRatio: 1,
      })),
    ];

    this.tracksSubject.next(trackViews);
    this.loadingSubject.next(false);
    this.startBufferCheck();
  }

  private initHlsForVideo(wrapper: any, videoUrl: string) {
    const videoEl = wrapper.videoElement;
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveSyncDuration: 10,
        liveMaxLatencyDuration: 30,
        liveDurationInfinity: true,
        liveBackBufferLength: 30,
        maxBufferLength: 60,
      });
      wrapper.hls = hls;
      this.hlsInstances.push(hls);

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (videoEl.buffered.length > 0) {
          wrapper.bufferStart = videoEl.buffered.start(0);
          wrapper.bufferEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
        }
        wrapper.isReady = true;
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(videoEl);
    } else {
      videoEl.src = videoUrl;
      wrapper.isReady = true;
    }
  }

  private initHlsForAudio(wrapper: any, videoUrl: string) {
    const audioEl = wrapper.audioElement;
    if (Hls.isSupported()) {
      const hls = new Hls();
      wrapper.hls = hls;
      this.hlsInstances.push(hls);

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (audioEl.buffered.length > 0) {
          wrapper.bufferStart = audioEl.buffered.start(0);
          wrapper.bufferEnd = audioEl.buffered.end(audioEl.buffered.length - 1);
        }
        wrapper.isReady = true;
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(audioEl);
    } else {
      audioEl.src = videoUrl;
      wrapper.isReady = true;
    }
  }

  private startBufferCheck() {
    const check = () => {
      const videosReady = this.videoWrappers.every(
        (w) => w.videoElement && w.videoElement.readyState >= 3,
      );
      const audiosReady = this.audioWrappers.every(
        (w) => w.audioElement && w.audioElement.readyState >= 2,
      );

      if (!videosReady || !audiosReady) {
        setTimeout(check, 500);
        return;
      }

      const infos = this.collectBufferInfos();
      const minBuffered = Math.min(...infos.map((i) => i.length));

      if (minBuffered < this.MIN_BUFFER_FOR_START) {
        setTimeout(check, 500);
        return;
      }

      const syncTargets = this.computeSyncTargets(infos);
      if (!syncTargets) {
        setTimeout(check, 500);
        return;
      }

      this.startSynchronizedPlayback(syncTargets);
    };

    setTimeout(check, 800);
  }

  private collectBufferInfos(): TrackBufferInfo[] {
    const vInfos = this.videoWrappers.map((w) => ({
      id: w.playerId,
      name: w.track.name,
      start: w.videoElement.buffered.length
        ? w.videoElement.buffered.start(0)
        : 0,
      end: w.videoElement.buffered.length
        ? w.videoElement.buffered.end(w.videoElement.buffered.length - 1)
        : 0,
      length:
        (w.videoElement.buffered.length
          ? w.videoElement.buffered.end(w.videoElement.buffered.length - 1)
          : 0) -
        (w.videoElement.buffered.length ? w.videoElement.buffered.start(0) : 0),
      startPdt: this.getTrackStartPdt(w),
    }));

    const aInfos = this.audioWrappers.map((w) => ({
      id: w.playerId,
      name: w.track.name,
      start: w.audioElement.buffered.length
        ? w.audioElement.buffered.start(0)
        : 0,
      end: w.audioElement.buffered.length
        ? w.audioElement.buffered.end(w.audioElement.buffered.length - 1)
        : 0,
      length:
        (w.audioElement.buffered.length
          ? w.audioElement.buffered.end(w.audioElement.buffered.length - 1)
          : 0) -
        (w.audioElement.buffered.length ? w.audioElement.buffered.start(0) : 0),
      startPdt: this.getTrackStartPdt(w),
    }));

    return [...vInfos, ...aInfos];
  }

  private getTrackStartPdt(wrapper: any): number | null {
    try {
      const details = wrapper.hls?.levels?.[0]?.details;
      if (!details || !details.hasProgramDateTime || !details.fragments.length)
        return null;
      return (
        details.fragments[0].programDateTime - details.fragments[0].start * 1000
      );
    } catch {
      return null;
    }
  }

  private computeSyncTargets(infos: TrackBufferInfo[]) {
    const syncPoint = Math.min(...infos.map((i) => i.end)) - 3;
    const maxStart = Math.max(...infos.map((i) => i.start));
    if (syncPoint <= maxStart) return null;

    return infos.map((inf) => ({
      id: inf.id,
      target: Math.max(inf.start + 0.1, Math.min(syncPoint, inf.end - 1)),
    }));
  }

  private async startSynchronizedPlayback(
    targets: { id: string; target: number }[],
  ) {
    for (const w of this.videoWrappers) w.videoElement?.pause();
    for (const w of this.audioWrappers) w.audioElement?.pause();

    for (const w of this.videoWrappers) {
      const t = targets.find((x) => x.id === w.playerId);
      if (t && w.videoElement) w.videoElement.currentTime = t.target;
    }
    for (const w of this.audioWrappers) {
      const t = targets.find((x) => x.id === w.playerId);
      if (t && w.audioElement) w.audioElement.currentTime = t.target;
    }

    await Promise.all([
      ...this.videoWrappers.map((w) => w.videoElement?.play().catch(() => {})),
      ...this.audioWrappers.map((w) => w.audioElement?.play().catch(() => {})),
    ]);

    this.bufferingSubject.next(false);
    this.playbackStartedSubject.next(true);
    this.startSyncMonitoring();
  }

  private syncAllToMaster() {
    const master = this.videoWrappers.find(
      (w) => w.playerId === this.masterPlayerId,
    );
    if (!master || !master.videoElement || master.videoElement.paused) return;

    const masterTime = master.videoElement.currentTime;

    this.videoWrappers.forEach((w) => {
      if (w.playerId === this.masterPlayerId || !w.videoElement) return;
      const drift = w.videoElement.currentTime - masterTime;
      if (Math.abs(drift) > this.HARD_SYNC_THRESHOLD) {
        w.videoElement.currentTime = masterTime;
      } else if (Math.abs(drift) > this.SYNC_THRESHOLD) {
        w.videoElement.playbackRate = drift > 0 ? 0.98 : 1.02;
      } else {
        w.videoElement.playbackRate = 1;
      }
    });
  }

  private startSyncMonitoring() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => this.syncAllToMaster(), 500);
  }

  disconnect(): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.bufferCheckInterval) clearInterval(this.bufferCheckInterval);
    this.hlsInstances.forEach((hls) => hls.destroy());
    this.hlsInstances = [];
    this.videoWrappers = [];
    this.audioWrappers = [];
  }

  setVolume(trackId: string, volume: number): void {
    const audio = this.audioWrappers.find((w) => w.playerId === trackId);
    if (audio && audio.audioElement) {
      audio.volume = volume;
      audio.audioElement.volume = volume;
      audio.audioElement.muted = volume === 0;
    }
  }

  unlockAudio(): void {
    this.audioWrappers.forEach((w) => {
      if (w.audioElement) {
        w.audioElement.muted = false;
        w.audioElement.volume = w.volume;
        w.audioElement.play().catch(() => {});
      }
    });
  }

  resize(stageWidth: number, stageH: number): void {
    // Layout resizing handled via CSS or component layer
  }
}
