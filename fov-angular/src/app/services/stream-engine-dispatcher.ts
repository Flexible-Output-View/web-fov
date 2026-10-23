import { Injectable, Injector } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StreamEngine, StreamTrackView } from './stream-engine-interface';
import { HlsStreamEngine } from './hls-stream-service';
import { MoqStreamEngine } from './moq-stream-service';
import { LiveStreamsService } from './live-streams.service';

@Injectable()
export class StreamEngineDispatcher implements StreamEngine {
  private activeEngine: StreamEngine | null = null;

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

  constructor(
    private liveStreamsService: LiveStreamsService,
    private injector: Injector
  ) {}

  connect(streamId: string): void {
    this.loadingSubject.next(true);
    this.bufferingSubject.next(true);

    // Fetch available streams or stream info to check protocol/relay metadata
    this.liveStreamsService.getAvailableStreams().subscribe({
      next: (response) => {
        const stream = response.streams.find((s) => s.streamId === streamId);

        if (!stream) {
          this.errorSubject.next('Stream introuvable.');
          this.loadingSubject.next(false);
          this.bufferingSubject.next(false);
          return;
        }

        // Automatically choose between MoQ and HLS based on stream properties
        if (stream.protocol === 'moq' || stream.moqRelay) {
          console.log('[StreamEngineDispatcher] Routing to MoqStreamEngine');
          this.activeEngine = this.injector.get(MoqStreamEngine);
        } else {
          console.log('[StreamEngineDispatcher] Routing to HlsStreamEngine');
          this.activeEngine = this.injector.get(HlsStreamEngine);
        }

        // Pipe active engine's observables to dispatcher's observables
        this.activeEngine.tracks$.subscribe((t) => this.tracksSubject.next(t));
        this.activeEngine.isLoading$.subscribe((l) => this.loadingSubject.next(l));
        this.activeEngine.isBuffering$.subscribe((b) => this.bufferingSubject.next(b));
        this.activeEngine.error$.subscribe((e) => this.errorSubject.next(e));
        this.activeEngine.playbackStarted$.subscribe((p) => this.playbackStartedSubject.next(p));

        // Connect active engine
        this.activeEngine.connect(streamId);
      },
      error: (err) => {
        console.error('[StreamEngineDispatcher] Error inspecting stream:', err);
        this.errorSubject.next('Erreur lors de la sélection du protocole de streaming.');
        this.loadingSubject.next(false);
        this.bufferingSubject.next(false);
      },
    });
  }

  disconnect(): void {
    this.activeEngine?.disconnect();
  }

  setVolume(trackId: string, volume: number): void {
    this.activeEngine?.setVolume(trackId, volume);
  }

  unlockAudio(): void {
    this.activeEngine?.unlockAudio();
  }

  resize(stageWidth: number, stageH: number): void {
    this.activeEngine?.resize(stageWidth, stageH);
  }
}