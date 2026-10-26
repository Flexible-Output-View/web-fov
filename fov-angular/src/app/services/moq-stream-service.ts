import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import * as API from '../models/APIModels';
import { LiveStreamsService } from './live-streams.service';
import {
  StreamEngine,
  StreamEngineStats,
  StreamTrackView,
  TrackStat,
} from './stream-engine-interface';
import * as Moq from '@moq/net';
import * as Watch from '@moq/watch';
import '@moq/watch/element';
import type MoqWatch from '@moq/watch/element';

@Injectable()
export class MoqStreamEngine implements StreamEngine {
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

  private watchElements: MoqWatch[] = [];
  private audioWatchesMap: Map<string, MoqWatch> = new Map();
  private connection: Moq.Connection | null = null;

  private statsSubject = new BehaviorSubject<StreamEngineStats>({
    protocol: 'moq',
    connectionHealth: 'disconnected',
    currentLatencyMs: 0,
    bufferSizeMs: 0,
    tracks: [],
    syncDriftMs: {},
    bandwidthKbps: 0,
  } as any);
  public stats$ = this.statsSubject.asObservable();
  private statsInterval: any = null;

  private trackStatsTrackers = new Map<
    string,
    {
      prevBytes: number;
      prevTime: number;
      bitrate: string;
    }
  >();
  private syncBaseOffsets = new Map<string, number>();

  constructor(private liveStreamsService: LiveStreamsService) {}

  connect(streamId: string): void {
    this.loadingSubject.next(true);
    this.bufferingSubject.next(true);

    this.liveStreamsService.getAvailableStreams().subscribe({
      next: (response) => {
        const stream = response.streams.find((s) => s.streamId === streamId);
        if (!stream || !stream.moqRelay) {
          this.errorSubject.next('Stream MoQ ou relais indisponible.');
          this.loadingSubject.next(false);
          this.bufferingSubject.next(false);
          return;
        }

        this.initializeMoqStream(stream);
      },
      error: (err) => {
        console.error('[MoqStreamEngine] Error loading stream list:', err);
        this.errorSubject.next('Impossible de charger les flux MoQ.');
        this.loadingSubject.next(false);
        this.bufferingSubject.next(false);
      },
    });
  }

  private startMoqStatsReporting(
    watchElements: MoqWatch[],
    videoRenditions: string[],
    audioRenditions: string[],
  ) {
    if (this.statsInterval) clearInterval(this.statsInterval);

    let lastReportTime = Date.now();

    this.statsInterval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - lastReportTime) / 1000;
      lastReportTime = now;

      const tracks: TrackStat[] = [];
      const driftMs: Record<string, number> = {};
      let totalBuffer = 0;
      let totalBytesDelta = 0;

      const masterWatch = watchElements[0];
      const masterTs = masterWatch
        ? Number(masterWatch.sync?.out?.timestamp?.peek() || 0)
        : 0;

      watchElements.forEach((w, idx) => {
        const isVideo = idx < videoRenditions.length;
        const name = isVideo
          ? videoRenditions[idx]
          : audioRenditions[idx - videoRenditions.length];

        const stats = isVideo
          ? (w.video?.out?.stats?.peek() as any)
          : (w.audio?.out?.stats?.peek() as any);
        const config = isVideo
          ? (w.video?.source?.out?.config?.peek() as any)
          : (w.audio?.source?.out?.config?.peek() as any);

        const currentBytes = Number(stats?.bytesReceived || stats?.bytes || 0);

        let tracker = this.trackStatsTrackers.get(name);
        if (!tracker) {
          tracker = {
            prevBytes: currentBytes,
            prevTime: now,
            bitrate: '0 kbps',
          };
          this.trackStatsTrackers.set(name, tracker);
        }

        let bitrateStr = tracker.bitrate;
        let byteDiff = 0;
        if (deltaTime > 0) {
          byteDiff = Math.max(0, currentBytes - tracker.prevBytes);
          totalBytesDelta += byteDiff;
          const kbps = Math.round((byteDiff * 8) / (deltaTime * 1000));
          bitrateStr = `${kbps} kbps`;
          tracker.prevBytes = currentBytes;
          tracker.prevTime = now;
          tracker.bitrate = bitrateStr;
        }

        const bufferSec = Number(
          w.sync?.out?.buffered?.peek() || w.sync?.out?.jitter?.peek() || 0,
        );
        const bufferMs = Math.round(
          bufferSec > 100 ? bufferSec : bufferSec * 1000,
        );
        totalBuffer += bufferMs;

        const trackTs = Number(w.sync?.out?.timestamp?.peek() || 0);
        let rawDrift = 0;
        if (masterTs > 0 && trackTs > 0) {
          const rawDiff = trackTs - masterTs;
          if (!this.syncBaseOffsets.has(name)) {
            this.syncBaseOffsets.set(name, rawDiff);
          }
          const baseOffset = this.syncBaseOffsets.get(name)!;
          rawDrift = Math.round(rawDiff - baseOffset);
        }
        driftMs[name] = rawDrift;

        tracks.push({
          name,
          type: isVideo ? 'video' : 'audio',
          codec: config?.codec || (isVideo ? 'avc3.640028' : 'mp4a.40.2'),
          resolution:
            isVideo && config?.codedWidth
              ? `${config.codedWidth}x${config.codedHeight}`
              : isVideo
                ? '1920x1088'
                : undefined,
          bitrate: bitrateStr,
          bufferMs: bufferMs,
        });
      });

      const avgBuffer = watchElements.length
        ? Math.round(totalBuffer / watchElements.length)
        : 0;
      const rtt = Number(this.connection?.probe.peek()?.rtt || 0);

      const bandwidthKbps =
        deltaTime > 0
          ? Math.round((totalBytesDelta * 8) / (deltaTime * 1000))
          : 0;

      this.statsSubject.next({
        protocol: 'moq',
        connectionHealth:
          rtt < 150 ? 'connected' : rtt < 300 ? 'degraded' : 'buffering',
        currentLatencyMs: avgBuffer,
        bufferSizeMs: avgBuffer,
        tracks,
        syncDriftMs: driftMs,
        bandwidthKbps: bandwidthKbps,
      } as any);
    }, 1000);
  }

  private async initializeMoqStream(stream: API.LiveStreamInfo) {
    try {
      const relayUrl = stream.moqRelay || 'http://localhost:4443';
      const relayUri = new URL(relayUrl);
      const broadcastName = Moq.Path.from(stream.streamId);

      this.connection = new Moq.Connection({ url: relayUri });
      const broadcast = new Watch.Broadcast({
        origin: this.connection.origin,
        name: broadcastName,
      });

      let catalog: any = null;
      while (true) {
        try {
          catalog = broadcast.out.catalog.peek();
          if (catalog?.video?.renditions && catalog?.audio?.renditions) {
            break;
          }
          catalog = await Promise.race([
            broadcast.out.catalog,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 5000),
            ),
          ]);
          if (catalog?.video?.renditions && catalog?.audio?.renditions) {
            break;
          }
        } catch (e) {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!catalog?.video?.renditions && !catalog?.audio?.renditions) {
        this.errorSubject.next(
          "Timeout : Le catalogue MoQ est introuvable ou le flux n'a pas démarré.",
        );
        this.loadingSubject.next(false);
        this.bufferingSubject.next(false);
        return;
      }

      const videoRenditions = catalog?.video?.renditions
        ? Object.keys(catalog.video.renditions)
        : [];
      const audioRenditions = catalog?.audio?.renditions
        ? Object.keys(catalog.audio.renditions)
        : [];

      if (videoRenditions.length === 0 && audioRenditions.length === 0) {
        this.errorSubject.next('Aucune piste trouvée dans le catalogue MoQ.');
        this.loadingSubject.next(false);
        this.bufferingSubject.next(false);
        return;
      }

      this.watchElements = [];
      this.audioWatchesMap.clear();
      this.trackStatsTrackers.clear();
      this.syncBaseOffsets.clear();
      const trackViews: StreamTrackView[] = [];

      videoRenditions.forEach((renditionKey, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1088;
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.backgroundColor = '#000';

        const watchEl = document.createElement('moq-watch') as MoqWatch;
        watchEl.url = relayUri;
        watchEl.name = broadcastName;
        watchEl.muted = true;
        watchEl.delay = Moq.Time.Milli(250);
        watchEl.appendChild(canvas);

        watchEl.controls.target.set({ name: renditionKey });

        this.watchElements.push(watchEl);

        trackViews.push({
          id: `moq_v_${i}_${renditionKey}`,
          name: renditionKey,
          element: watchEl,
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
        });
      });

      audioRenditions.forEach((audioKey, i) => {
        const watchEl = document.createElement('moq-watch') as MoqWatch;
        watchEl.url = relayUri;
        watchEl.name = broadcastName;
        watchEl.muted = false;
        watchEl.volume = 1.0;
        watchEl.delay = Moq.Time.Milli(250);

        try {
          if (watchEl.audio?.source) {
            (watchEl.audio.source.in.target as any).set({ name: audioKey });
          }
        } catch (e) {
          console.warn(
            `[MoqStreamEngine] Could not set target for audio key ${audioKey}:`,
            e,
          );
        }

        const audioTrackId = `moq_a_${i}_${audioKey}`;
        this.watchElements.push(watchEl);
        this.audioWatchesMap.set(audioTrackId, watchEl);

        trackViews.push({
          id: audioTrackId,
          name: audioKey,
          element: watchEl,
          isVideo: false,
          isAudio: true,
          volume: 1.0,
          visible: false,
          zIndex: 0,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          aspectRatio: 1,
        });
      });

      this.tracksSubject.next(trackViews);
      this.loadingSubject.next(false);
      this.bufferingSubject.next(false);
      this.playbackStartedSubject.next(true);

      this.startMoqStatsReporting(
        this.watchElements,
        videoRenditions,
        audioRenditions,
      );

      console.log(
        '[MoqStreamEngine] ✓ MoQ multi-track playback initialized via <moq-watch>',
      );
    } catch (err) {
      console.error('[MoqStreamEngine] Initialization error:', err);
      this.errorSubject.next("Erreur d'initialisation du flux MoQ.");
      this.loadingSubject.next(false);
      this.bufferingSubject.next(false);
    }
  }

  setVolume(trackId: string, volume: number): void {
    const watch = this.audioWatchesMap.get(trackId);
    if (watch) {
      watch.volume = volume;
    }
  }

  unlockAudio(): void {
    this.watchElements.forEach((w) => {
      const emitter = w.emitter as any;
      if (emitter?.context?.state === 'suspended') {
        emitter.context.resume().catch(() => {});
      }
    });
  }

  disconnect(): void {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.watchElements.forEach((w) => {
      w.remove();
    });
    this.watchElements = [];
    this.audioWatchesMap.clear();
    this.trackStatsTrackers.clear();
    this.syncBaseOffsets.clear();
    this.connection = null;
  }

  resize(stageWidth: number, stageH: number): void {}
}
