import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import Hls from 'hls.js';
import * as API from '../models/APIModels';
import { LiveStreamsService } from './live-streams.service';
import {
  StreamEngine,
  StreamEngineStats,
  StreamTrackView,
  TrackStat,
} from './stream-engine-interface';

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
  private masterPlayerId: string | null = null;

  private readonly SYNC_THRESHOLD = 0.1;
  private readonly HARD_SYNC_THRESHOLD = 0.3;
  private readonly MIN_BUFFER_FOR_START = 6;

  private statsSubject = new BehaviorSubject<StreamEngineStats>({
    protocol: 'hls',
    connectionHealth: 'disconnected',
    currentLatencyMs: 0,
    bufferSizeMs: 0,
    tracks: [],
    syncDriftMs: {},
    bandwidthKbps: 0,
  });
  public stats$ = this.statsSubject.asObservable();
  private statsInterval: any = null;

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
      videoEl.style.display = 'block';
      videoEl.style.width = '100%';
      videoEl.style.height = '100%';
      videoEl.style.objectFit = 'contain';
      videoEl.style.backgroundColor = '#000';

      const wrapper = {
        playerId: `player_v_${i}`,
        track,
        videoElement: videoEl,
        hls: null as Hls | null,
        bufferStart: 0,
        bufferEnd: 0,
        lastMeasuredBitrate: 0,
      };

      this.initHlsForVideo(wrapper, track.videoUrl);
      return wrapper;
    });

    this.audioWrappers = audioTracks.map((track, i) => {
      const audioEl = document.createElement('audio');
      audioEl.preload = 'auto';
      audioEl.volume = 1.0;
      audioEl.muted = false;

      const wrapper = {
        playerId: `player_a_${i}`,
        track,
        audioElement: audioEl,
        hls: null as Hls | null,
        volume: 1.0,
        bufferStart: 0,
        bufferEnd: 0,
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
        volume: 0,
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
      });

      hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
        const frag = data.frag;
        if (frag && frag.stats && frag.stats.total && frag.duration) {
          const bitrateBps = (frag.stats.total * 8) / frag.duration;
          wrapper.lastMeasuredBitrate = Math.round(bitrateBps);
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn(
                '[HlsStreamEngine] Fatal network error (recovery requested):',
                data,
              );
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn(
                '[HlsStreamEngine] Fatal media error (recovery requested):',
                data,
              );
              hls.recoverMediaError();
              break;
            default:
              console.error(
                '[HlsStreamEngine] Unrecoverable HLS error, destroying instance:',
                data,
              );
              hls.destroy();
              break;
          }
        }
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(videoEl);
    } else {
      videoEl.src = videoUrl;
    }
  }

  private initHlsForAudio(wrapper: any, videoUrl: string) {
    const audioEl = wrapper.audioElement;
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
        if (audioEl.buffered.length > 0) {
          wrapper.bufferStart = audioEl.buffered.start(0);
          wrapper.bufferEnd = audioEl.buffered.end(audioEl.buffered.length - 1);
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(audioEl);
    } else {
      audioEl.src = videoUrl;
    }
  }

  private startBufferCheck() {
    let checkCount = 0;
    const check = () => {
      checkCount++;

      const videosReady = this.videoWrappers.every(
        (w) => w.videoElement && w.videoElement.readyState >= 3,
      );
      const audiosReady = this.audioWrappers.every(
        (w) => w.audioElement && w.audioElement.readyState >= 2,
      );

      if (!videosReady || !audiosReady) {
        if (checkCount > 100) {
          this.proceedWithPlayback();
          return;
        }
        setTimeout(check, 500);
        return;
      }

      const infos = this.collectBufferInfos();
      const minBuffered = Math.min(...infos.map((i) => i.length), 999);

      if (minBuffered < this.MIN_BUFFER_FOR_START && checkCount < 30) {
        setTimeout(check, 500);
        return;
      }

      this.proceedWithPlayback();
    };

    setTimeout(check, 800);
  }

  private proceedWithPlayback() {
    const infos = this.collectBufferInfos();
    const syncTargets = this.computeSyncTargets(infos);
    if (!syncTargets) {
      setTimeout(() => this.startBufferCheck(), 500);
      return;
    }
    this.startSynchronizedPlayback(syncTargets);
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
      const hls = wrapper.hls;
      if (!hls) return null;
      const details = hls.levels?.[0]?.details;
      if (!details || !details.hasProgramDateTime) return null;
      const frags = details.fragments;
      if (!frags || frags.length === 0) return null;
      const pdt = frags[0].programDateTime;
      if (!pdt || pdt === 0) return null;
      return pdt - frags[0].start * 1000;
    } catch {
      return null;
    }
  }

  private computeSyncTargets(infos: TrackBufferInfo[]) {
    const allHavePdt = infos.every((i) => i.startPdt !== null);

    if (allHavePdt) {
      const wallClockStarts = infos.map((i) => i.startPdt! + i.start * 1000);
      const wallClockEnds = infos.map((i) => i.startPdt! + i.end * 1000);
      const commonWallStart = Math.max(...wallClockStarts);
      const commonWallEnd = Math.min(...wallClockEnds);

      if (commonWallEnd - commonWallStart < 3000) {
        return null;
      }

      const targets = infos.map((inf) => {
        const t = (commonWallStart - inf.startPdt!) / 1000 + 0.1;
        return {
          id: inf.id,
          target: Math.max(inf.start + 0.1, Math.min(t, inf.end - 1)),
        };
      });

      for (let i = 0; i < infos.length; i++) {
        const inf = infos[i];
        const target = targets[i].target;
        if (target < inf.start || target > inf.end - 0.5) {
          return null;
        }
      }
      return targets;
    }

    const syncPoint = Math.min(...infos.map((i) => i.end)) - 3;
    const maxStart = Math.max(...infos.map((i) => i.start));
    if (syncPoint <= maxStart) return null;

    return infos.map((inf) => ({
      id: inf.id,
      target: Math.max(inf.start + 0.1, Math.min(syncPoint, inf.end - 1)),
    }));
  }

  private startStatsReporting() {
    if (this.statsInterval) clearInterval(this.statsInterval);

    this.statsInterval = setInterval(() => {
      const tracks: TrackStat[] = [
        ...this.videoWrappers.map((w) => {
          const currentLevel = w.hls?.currentLevel;
          const level =
            currentLevel >= 0 ? w.hls?.levels?.[currentLevel] : null;
          const levelBitrate =
            level?.bitrate ||
            level?.attrs?.BANDWIDTH ||
            w.lastMeasuredBitrate ||
            0;

          const vCodec = level?.videoCodec || 'H.264';
          const aCodec = level?.audioCodec || 'AAC';

          const bufferedEnd = w.videoElement.buffered.length
            ? w.videoElement.buffered.end(w.videoElement.buffered.length - 1)
            : 0;

          const width = w.videoElement.videoWidth || level?.width || 0;
          const height = w.videoElement.videoHeight || level?.height || 0;

          return {
            name: w.track.name,
            type: 'video' as const,
            codec: `${vCodec} / ${aCodec}`,
            resolution: `${width}x${height}`,
            bitrate:
              levelBitrate > 0
                ? `${Math.round(levelBitrate / 1000)} kbps`
                : 'N/A',
            bufferMs: Math.max(
              0,
              Math.round((bufferedEnd - w.videoElement.currentTime) * 1000),
            ),
          };
        }),
        ...this.audioWrappers.map((w) => {
          const currentLevel = w.hls?.currentLevel;
          const level =
            currentLevel >= 0 ? w.hls?.levels?.[currentLevel] : null;
          const levelBitrate = level?.bitrate || level?.attrs?.BANDWIDTH || 0;
          const aCodec = level?.audioCodec || 'AAC';

          const bufferedEnd = w.audioElement.buffered.length
            ? w.audioElement.buffered.end(w.audioElement.buffered.length - 1)
            : 0;

          return {
            name: w.track.name,
            type: 'audio' as const,
            codec: aCodec,
            bitrate:
              levelBitrate > 0
                ? `${Math.round(levelBitrate / 1000)} kbps`
                : '128 kbps',
            bufferMs: Math.max(
              0,
              Math.round((bufferedEnd - w.audioElement.currentTime) * 1000),
            ),
          };
        }),
      ];

      const activeHls = this.hlsInstances.find((h: any) => h.bandwidthEstimate);
      const bandwidthBps = (activeHls as any)?.bandwidthEstimate || 0;
      const bandwidthKbps =
        bandwidthBps > 0 ? Math.round(bandwidthBps / 1000) : 0;

      const master = this.videoWrappers.find(
        (w) => w.playerId === this.masterPlayerId,
      );
      const masterTime = master?.videoElement?.currentTime || 0;
      const masterPdt = master ? this.getTrackStartPdt(master) : null;
      const driftMs: Record<string, number> = {};

      [...this.videoWrappers, ...this.audioWrappers].forEach((w) => {
        const el = w.videoElement || w.audioElement;
        if (el) {
          const trackPdt = this.getTrackStartPdt(w);
          const expectedTime =
            masterPdt !== null && trackPdt !== null
              ? (masterPdt + masterTime * 1000 - trackPdt) / 1000
              : masterTime;
          const drift = el.currentTime - expectedTime;
          driftMs[w.track.name] = Math.round(drift * 1000);
        }
      });

      const avgBuffer =
        tracks.reduce((acc, t) => acc + (t.bufferMs || 0), 0) /
        (tracks.length || 1);

      this.statsSubject.next({
        protocol: 'hls',
        connectionHealth:
          this.hlsInstances.length > 0 ? 'connected' : 'degraded',
        currentLatencyMs: Math.round(avgBuffer),
        bufferSizeMs: Math.round(avgBuffer),
        tracks,
        syncDriftMs: driftMs,
        bandwidthKbps: bandwidthKbps,
      } as any);
    }, 1000);
  }

  private async startSynchronizedPlayback(
    targets: { id: string; target: number }[],
  ) {
    for (const w of this.videoWrappers) w.videoElement?.pause();
    for (const w of this.audioWrappers) w.audioElement?.pause();

    const videoSeeks = this.videoWrappers.map(
      (w) =>
        new Promise<void>((resolve) => {
          if (!w.videoElement) {
            resolve();
            return;
          }
          const t = targets.find((x) => x.id === w.playerId);
          const seekTarget = t?.target ?? w.bufferStart;
          const onSeeked = () => {
            w.videoElement.removeEventListener('seeked', onSeeked);
            resolve();
          };
          w.videoElement.addEventListener('seeked', onSeeked);
          w.videoElement.currentTime = seekTarget;
        }),
    );

    const audioSeeks = this.audioWrappers.map(
      (w) =>
        new Promise<void>((resolve) => {
          if (!w.audioElement) {
            resolve();
            return;
          }
          const t = targets.find((x) => x.id === w.playerId);
          const seekTarget = t?.target ?? w.bufferStart;
          if (Math.abs(w.audioElement.currentTime - seekTarget) < 0.05) {
            resolve();
            return;
          }
          const onSeeked = () => {
            w.audioElement.removeEventListener('seeked', onSeeked);
            resolve();
          };
          w.audioElement.addEventListener('seeked', onSeeked);
          w.audioElement.currentTime = seekTarget;
        }),
    );

    await Promise.all([...videoSeeks, ...audioSeeks]);

    await Promise.all([
      ...this.videoWrappers.map((w) => w.videoElement?.play().catch(() => {})),
      ...this.audioWrappers.map((w) => {
        if (w.audioElement) {
          w.audioElement.muted = false;
          w.audioElement.volume = w.volume;
          return w.audioElement.play().catch(() => {});
        }
        return Promise.resolve();
      }),
    ]);

    this.loadingSubject.next(false);
    this.bufferingSubject.next(false);
    this.playbackStartedSubject.next(true);

    this.startSyncMonitoring();
    this.startStatsReporting();
  }

  private syncAllToMaster() {
    const master = this.videoWrappers.find(
      (w) => w.playerId === this.masterPlayerId,
    );
    if (!master || !master.videoElement || master.videoElement.paused) return;

    const masterTime = master.videoElement.currentTime;
    const masterPdt = this.getTrackStartPdt(master);

    this.videoWrappers.forEach((w) => {
      if (w.playerId === this.masterPlayerId || !w.videoElement) return;
      const slavePdt = this.getTrackStartPdt(w);
      const expectedTime =
        masterPdt !== null && slavePdt !== null
          ? (masterPdt + masterTime * 1000 - slavePdt) / 1000
          : masterTime;

      const drift = w.videoElement.currentTime - expectedTime;
      const absDrift = Math.abs(drift);

      if (absDrift > this.HARD_SYNC_THRESHOLD) {
        w.videoElement.currentTime = expectedTime;
        w.videoElement.playbackRate = 1.0;
      } else if (absDrift > this.SYNC_THRESHOLD) {
        w.videoElement.playbackRate = drift > 0 ? 0.95 : 1.05;
      } else {
        w.videoElement.playbackRate = 1.0;
      }
    });

    this.audioWrappers.forEach((w) => {
      if (!w.audioElement) return;
      const audioPdt = this.getTrackStartPdt(w);
      const expectedTime =
        masterPdt !== null && audioPdt !== null
          ? (masterPdt + masterTime * 1000 - audioPdt) / 1000
          : masterTime;

      const drift = w.audioElement.currentTime - expectedTime;
      const absDrift = Math.abs(drift);

      if (absDrift > this.HARD_SYNC_THRESHOLD) {
        w.audioElement.currentTime = expectedTime;
      }
    });
  }

  private startSyncMonitoring() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => this.syncAllToMaster(), 500);
  }

  disconnect(): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
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

  resize(stageWidth: number, stageH: number): void {}
}
