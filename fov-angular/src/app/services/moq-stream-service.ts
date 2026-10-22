import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import * as API from '../models/APIModels';
import { LiveStreamsService } from './live-streams.service';
import { StreamEngine, StreamTrackView } from './stream-engine-interface';
import * as Moq from '@moq/net';
import * as Watch from '@moq/watch';

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

  private moqConnection: Moq.Connection | null = null;
  private moqBroadcast: Watch.Broadcast | null = null;
  private players: Watch.Player[] = [];
  private audioPlayersMap: Map<string, Watch.Player> = new Map();

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

  private async initializeMoqStream(stream: API.LiveStreamInfo) {
    try {
      const relayUrl = stream.moqRelay || 'http://localhost:4443';
      this.moqConnection = new Moq.Connection({ url: new URL(relayUrl) });

      const broadcastName = Moq.Path.from(stream.streamId);
      this.moqBroadcast = new Watch.Broadcast({
        origin: this.moqConnection.origin,
        name: broadcastName,
      });

      // Fetch catalog once with retry loop
      let catalog = (await this.moqBroadcast.out.catalog) as any;
      if (!catalog?.video?.renditions || !catalog?.audio?.renditions) {
        for (let i = 0; i < 20; i++) {
          catalog = this.moqBroadcast.out.catalog.peek();
          if (catalog?.video?.renditions && catalog?.audio?.renditions) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      const videoRenditions = catalog?.video?.renditions ? Object.keys(catalog.video.renditions) : [];
      const audioRenditions = catalog?.audio?.renditions ? Object.keys(catalog.audio.renditions) : [];

      if (videoRenditions.length === 0 && audioRenditions.length === 0) {
        this.errorSubject.next('Aucune piste trouvée dans le catalogue MoQ.');
        this.loadingSubject.next(false);
        this.bufferingSubject.next(false);
        return;
      }

      this.players = [];
      this.audioPlayersMap.clear();
      const trackViews: StreamTrackView[] = [];

      // Initialize video players
      videoRenditions.forEach((renditionKey, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1088;
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.backgroundColor = '#000';

        const player = new Watch.Player({
          origin: this.moqConnection!.origin,
          probe: this.moqConnection!.probe,
          name: broadcastName,
          canvas: canvas,
          target: { name: renditionKey },
          visible: 'always',
          muted: true,
        });

        this.players.push(player);

        trackViews.push({
          id: `moq_v_${i}_${renditionKey}`,
          name: renditionKey,
          element: canvas,
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

      // Initialize audio players
      audioRenditions.forEach((audioKey, i) => {
        const player = new Watch.Player({
          origin: this.moqConnection!.origin,
          probe: this.moqConnection!.probe,
          name: broadcastName,
          muted: false,
          volume: 1.0,
        });

        try {
          if (player.audio?.source) {
            (player.audio.source.in.target as any).set({ name: audioKey });
          }
        } catch (e) {
          console.warn(`[MoqStreamEngine] Could not set target for audio key ${audioKey}:`, e);
        }

        const audioTrackId = `moq_a_${i}_${audioKey}`;
        this.players.push(player);
        this.audioPlayersMap.set(audioTrackId, player);

        const dummyAudioEl = document.createElement('audio');
        dummyAudioEl.muted = true;

        trackViews.push({
          id: audioTrackId,
          name: audioKey,
          element: dummyAudioEl,
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

      console.log('[MoqStreamEngine] ✓ MoQ synchronized multi-track playback started');
    } catch (err) {
      console.error('[MoqStreamEngine] Initialization error:', err);
      this.errorSubject.next('Erreur d\'initialisation du flux MoQ.');
      this.loadingSubject.next(false);
      this.bufferingSubject.next(false);
    }
  }

  setVolume(trackId: string, volume: number): void {
    const player = this.audioPlayersMap.get(trackId);
    if (player && typeof (player as any).setVolume === 'function') {
      (player as any).setVolume(volume);
    }
  }

  unlockAudio(): void {
    this.players.forEach((p) => {
      const emitter = p.emitter as any;
      if (emitter?.context?.state === 'suspended') {
        emitter.context.resume().catch(() => {});
      }
    });
  }

  disconnect(): void {
    this.players.forEach((p) => {
      try {
        p.close();
      } catch {}
    });
    this.players = [];
    this.audioPlayersMap.clear();
    this.moqConnection = null;
    this.moqBroadcast = null;
  }

  resize(stageWidth: number, stageH: number): void {
    return;
  }
}
