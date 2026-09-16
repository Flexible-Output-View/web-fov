import {
  Component,
  Input,
  AfterViewInit,
  OnDestroy,
  HostListener,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import Hls from 'hls.js';
import { environment } from '../../../environments/environment';

export interface Track {
  index: number;
  name: string;
  videoUrl: string;
  isVideo: boolean;
}

export interface VideoWrapper {
  playerId: string;
  track: Track;
  x: number;
  y: number;
  width: number;
  height: number;
  hls: Hls | null;
  videoElement: HTMLVideoElement | null;
  visible: boolean;
  zIndex: number;
  volume: number;
  aspectRatio: number;
  isReady: boolean;
  hasManifest: boolean;
  bufferEnd: number;
  bufferStart: number;
  isVideo: boolean;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

interface SavedWrapperLayout {
  trackName: string;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  volume: number;
  visible: boolean;
  zIndex: number;
  orderIndex: number;
}

interface SavedLayout {
  streamId: string;
  savedAt: number;
  wrappers: SavedWrapperLayout[];
}

interface ApiTracksResponse {
  tracks: Track[];
  videoCount: number;
  ready: boolean;
  pending?: number;
  totalDirs?: number;
  message?: string;
}

interface ApiStreamTrack {
  trackId: string;
  videoUrl: string;
  isVideo?: boolean;
}

interface ApiLiveStream {
  streamId: string;
  trackCount: number;
  tracks: ApiStreamTrack[];
}

interface ApiAvailableStreamsResponse {
  streams: ApiLiveStream[];
  streamCount: number;
}

interface TrackBufferInfo {
  name: string;
  start: number;
  end: number;
  length: number;
  startPdt: number | null;
}

// Clé sessionStorage pour le consentement audio (persiste F5/Ctrl+R, effacé par Ctrl+Shift+R)
const AUDIO_UNLOCKED_SESSION_KEY = 'fov_audio_unlocked';

@Component({
  selector: 'app-fov-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fov-player.component.html',
  styleUrls: ['./fov-player.component.scss'],
})
export class FovPlayerComponent implements AfterViewInit, OnDestroy {
  @Input() streamId: string = '';

  videoWrappers: VideoWrapper[] = [];
  availableTracks: Track[] = [];
  editMode = false;
  isLoading = true;
  errorMessage = '';
  isBufferingPhase = true;

  activeDragWrapper: VideoWrapper | null = null;
  activeResizeWrapper: VideoWrapper | null = null;
  dragStartX = 0;
  dragStartY = 0;
  initialX = 0;
  initialY = 0;
  initialW = 0;
  initialH = 0;

  syncStats: Map<string, number> = new Map();
  maxDrift = 0;
  playbackStarted = false;

  layoutSaved = false;
  private savedLayoutTimeout: any = null;

  private masterPlayerId: string | null = null;
  private syncInterval: any = null;
  private pollingInterval: any = null;
  private bufferCheckInterval: any = null;
  private trackIdCounter = 0;
  private originalTrackOrder: string[] = [];

  private readonly SYNC_THRESHOLD = 0.1;
  private readonly HARD_SYNC_THRESHOLD = 0.3;
  private readonly MIN_BUFFER_FOR_START = 6;
  private readonly MIN_COMMON_RANGE = 4;
  private readonly MIN_FORWARD_BUFFER = 3;
  private readonly SAFE_POSITION_MARGIN = 0.5;

  private readonly MAX_WIDTH_RATIO = 0.8;
  private readonly API_URL = environment.apiUrl;
  private readonly MAX_POLL_ATTEMPTS = 60;
  private pollAttempts = 0;
  private initGeneration = 0;
  private isInitialized = false;

  // Public : utilisé dans le template *ngIf
  audioUnlocked = false;

  private readonly MOBILE_BREAKPOINT = 768;
  private bufferCheckCount = 0;

  // Handler click-to-unlock, stocké pour pouvoir le retirer dans ngOnDestroy
  private clickToUnlockHandler: (() => void) | null = null;

  // Listener document pour déverrouiller l'audio sur n'importe quelle interaction
  private documentUnlockHandler: (() => void) | null = null;

  readonly playerId = `fov_${Math.random().toString(36).substr(2, 9)}`;

  @ViewChild('playerRoot') playerRoot?: ElementRef<HTMLElement>;

  isFullscreen = false;
  fullscreenAudioPanelOpen = false;

  constructor(private http: HttpClient) {}

  private get layoutStorageKey(): string {
    return `fov_layout_${this.streamId}`;
  }

  // ── Helpers sessionStorage audio ─────────────────────────────────────────
  private getSessionAudioUnlocked(): boolean {
    try {
      return sessionStorage.getItem(AUDIO_UNLOCKED_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }

  private setSessionAudioUnlocked(): void {
    try {
      sessionStorage.setItem(AUDIO_UNLOCKED_SESSION_KEY, '1');
    } catch {}
  }

  // ── canAutoplayWithSound ──────────────────────────────────────────────────
  // Probe silencieuse : crée une micro-vidéo en mémoire et tente play() sans mute.
  // Retourne true si le navigateur autorise l'autoplay avec son (MEI élevé).
  private async canAutoplayWithSound(): Promise<boolean> {
    try {
      const v = document.createElement('video');
      // Micro MP4 base64 valide (1 frame transparente) — suffisant pour le probe
      v.src =
        'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJtcDQxaXNvbQAAAAhmcmVlAAAADm1kYXQ=';
      v.muted = false;
      v.volume = 0.001;
      await v.play();
      v.pause();
      v.src = '';
      return true;
    } catch {
      return false;
    }
  }

  getLoadingMessage(): string {
    if (this.errorMessage) return '';
    if (this.isLoading && !this.isBufferingPhase) return 'Connexion au serveur...';
    return 'Chargement du live...';
  }

  trackByWrapper(index: number, wrapper: VideoWrapper): string {
    return wrapper.playerId;
  }

  ngAfterViewInit() {
    setTimeout(() => {
      if (!this.isInitialized) {
        this.isInitialized = true;
        this.loadTracks();
      }
    }, 100);
  }

  ngOnDestroy() {
    this.stopSyncMonitoring();
    this.stopPolling();
    this.stopBufferCheck();
    this.videoWrappers.forEach((w) => {
      w.hls?.destroy();
    });
    if (this.savedLayoutTimeout) clearTimeout(this.savedLayoutTimeout);
    if (this.isFullscreen) {
      document.exitFullscreen?.().catch(() => {});
    }

    // Nettoyage click-to-unlock stage
    if (this.clickToUnlockHandler) {
      const stage = document.getElementById(`stageArea_${this.playerId}`);
      stage?.removeEventListener('click', this.clickToUnlockHandler);
      this.clickToUnlockHandler = null;
    }

    // Nettoyage listener document
    if (this.documentUnlockHandler) {
      document.removeEventListener('click', this.documentUnlockHandler);
      document.removeEventListener('keydown', this.documentUnlockHandler);
      document.removeEventListener('touchstart', this.documentUnlockHandler);
      this.documentUnlockHandler = null;
    }
  }

  private isMobileLayout(): boolean {
    return window.innerWidth <= this.MOBILE_BREAKPOINT;
  }

  private getFittedSize(
    stageW: number,
    stageH: number,
    aspectRatio: number,
    fillRatio: number = 0.95,
  ) {
    const maxW = stageW * fillRatio;
    const maxH = stageH * fillRatio;
    let width = maxW;
    let height = width / aspectRatio;
    if (height > maxH) {
      height = maxH;
      width = height * aspectRatio;
    }
    return { width, height };
  }

  private clampWrapperToStage(wrapper: VideoWrapper) {
    const stage = this.getStageElement();
    if (!stage) return;
    const maxX = Math.max(0, stage.offsetWidth - wrapper.width);
    const maxY = Math.max(0, stage.offsetHeight - wrapper.height);
    wrapper.x = Math.max(0, Math.min(wrapper.x, maxX));
    wrapper.y = Math.max(0, Math.min(wrapper.y, maxY));
  }

  private loadTracks() {
    if (this.playbackStarted || this.videoWrappers.length > 0) return;
    this.isLoading = true;
    this.isBufferingPhase = true;
    this.playbackStarted = false;
    this.errorMessage = '';
    this.fetchAvailableTracks();
  }

  private captureNormalized(): void {
    const stage = this.getStageElement();
    if (!stage) return;
    const stageW = stage.offsetWidth;
    const stageH = stage.offsetHeight;
    if (!stageW || !stageH) return;
    if (this.isFullscreen !== !!document.fullscreenElement) return;

    for (const w of this.videoWrappers) {
      if (!w.isVideo) continue;
      if (w.width > stageW + 1 || w.height > stageH + 1) return;
      w.nx = w.x / stageW;
      w.ny = w.y / stageH;
      w.nw = w.width / stageW;
      w.nh = w.height / stageH;
    }
  }

  private applyNormalizedToPixels(): void {
    const stage = this.getStageElement();
    if (!stage) return;
    const stageW = stage.offsetWidth;
    const stageH = stage.offsetHeight;
    if (!stageW || !stageH) return;

    for (const w of this.videoWrappers) {
      if (!w.isVideo) continue;
      w.x = w.nx * stageW;
      w.y = w.ny * stageH;
      w.width = w.nw * stageW;
      w.height = w.nh * stageH;
    }
  }

  private adaptWrappersToViewport() {
    const stage = this.getStageElement();
    if (!stage || this.videoWrappers.length === 0) return;
    const stageW = stage.offsetWidth;
    const stageH = stage.offsetHeight;
    if (!stageW || !stageH) return;

    if (this.isMobileLayout()) {
      const main = this.videoWrappers.find((w) => w.isVideo);
      if (!main) return;
      const mainAspect = main.aspectRatio || 16 / 9;
      const mainFitted = this.getFittedSize(stageW, stageH * 0.68, mainAspect, 0.96);
      main.width = mainFitted.width;
      main.height = mainFitted.height;
      main.x = (stageW - main.width) / 2;
      main.y = 8;
      let currentX = 8;
      let currentY = main.y + main.height + 8;
      const thumbHeight = Math.min(90, stageH * 0.16);
      for (let i = 1; i < this.videoWrappers.length; i++) {
        const wrapper = this.videoWrappers[i];
        if (!wrapper.isVideo) continue;
        const ratio = wrapper.aspectRatio || 16 / 9;
        wrapper.height = thumbHeight;
        wrapper.width = wrapper.height * ratio;
        if (currentX + wrapper.width > stageW - 8) {
          currentX = 8;
          currentY += thumbHeight + 8;
        }
        wrapper.x = currentX;
        wrapper.y = currentY;
        currentX += wrapper.width + 8;
        this.clampWrapperToStage(wrapper);
      }
      this.captureNormalized();
    } else {
      this.applyNormalizedToPixels();
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    setTimeout(() => this.adaptWrappersToViewport(), 0);
  }

  @HostListener('window:orientationchange')
  onOrientationChange() {
    setTimeout(() => this.adaptWrappersToViewport(), 200);
  }

  @HostListener('document:fullscreenchange')
  @HostListener('document:webkitfullscreenchange')
  onFullscreenChange() {
    this.isFullscreen = !!(
      document.fullscreenElement || (document as any).webkitFullscreenElement
    );
    if (!this.isFullscreen) this.fullscreenAudioPanelOpen = false;
    setTimeout(() => this.adaptWrappersToViewport(), 100);
  }

  private fetchAvailableTracks() {
    this.http.get<any>(`${this.API_URL}/streams/available`).subscribe({
      next: (response) => {
        if (Array.isArray(response)) {
          this.handleArrayApiFormat(response);
        } else if (response.streams) {
          this.handleNewApiFormat(response as ApiAvailableStreamsResponse);
        } else if (response.tracks) {
          this.handleLegacyApiFormat(response as ApiTracksResponse);
        } else {
          this.handleNoData();
        }
      },
      error: (err) => {
        console.error(`[FOV] fetchAvailableTracks error:`, err.status, err.message);
        this.pollAttempts++;
        if (this.pollAttempts < this.MAX_POLL_ATTEMPTS) {
          this.startPolling(2000);
        } else {
          this.isLoading = false;
          this.isBufferingPhase = false;
          this.errorMessage = 'Impossible de charger les flux.';
        }
      },
    });
  }

  private waitForPlaylistsReady(tracks: Track[]): Promise<void> {
    const tracksToCheck = tracks.filter((t) => t.videoUrl);
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 30;
      const check = async () => {
        attempts++;
        try {
          const results = await Promise.all(
            tracksToCheck.map((t) =>
              fetch(t.videoUrl, { method: 'HEAD', cache: 'no-store' })
                .then((r) => r.ok)
                .catch(() => false),
            ),
          );
          if (results.every((r) => r === true)) {
            resolve();
          } else if (attempts < maxAttempts) {
            setTimeout(check, 1000);
          } else {
            resolve();
          }
        } catch {
          if (attempts < maxAttempts) setTimeout(check, 1000);
          else resolve();
        }
      };
      check();
    });
  }

  private handleArrayApiFormat(streams: any[]) {
    const stream = streams.find(
      (s) => s.streamId === this.streamId && (s.trackCount ?? 0) > 0,
    );
    if (stream && stream.tracks && stream.tracks.length > 0) {
      this.stopPolling();
      this.availableTracks = stream.tracks.map((t: any, i: number) => ({
        index: i,
        name: t.trackId,
        videoUrl: t.videoUrl,
        isVideo: t.isVideo ?? true,
      }));
      this.waitForPlaylistsReady(this.availableTracks).then(() => {
        this.initializeAllTracks();
        this.isLoading = false;
      });
    } else {
      this.handleNoData();
    }
  }

  private handleNewApiFormat(response: ApiAvailableStreamsResponse) {
    const stream = response.streams.find(
      (s) => s.streamId === this.streamId && (s.trackCount ?? 0) > 0,
    );
    if (stream && stream.tracks.length > 0) {
      this.stopPolling();
      this.availableTracks = stream.tracks.map((t, i) => ({
        index: i,
        name: t.trackId,
        videoUrl: t.videoUrl,
        isVideo: t.isVideo ?? true,
      }));
      this.waitForPlaylistsReady(this.availableTracks).then(() => {
        this.initializeAllTracks();
        this.isLoading = false;
      });
    } else {
      this.handleNoData();
    }
  }

  private handleLegacyApiFormat(response: ApiTracksResponse) {
    const totalDirs = response.totalDirs || 0;
    const readyCount = response.videoCount || 0;
    const pending = response.pending || 0;
    const allReady = totalDirs > 0 && pending === 0 && readyCount === totalDirs;
    if (allReady && response.tracks && response.tracks.length > 0) {
      this.stopPolling();
      this.availableTracks = response.tracks;
      this.initializeAllTracks();
      this.isLoading = false;
    } else {
      this.pollAttempts++;
      if (this.pollAttempts < this.MAX_POLL_ATTEMPTS) {
        const pollDelay =
          pending > 0 && readyCount > 0 ? 500 : totalDirs > 0 ? 1000 : 2000;
        this.startPolling(pollDelay);
      } else {
        this.isLoading = false;
        this.isBufferingPhase = false;
        this.errorMessage = 'Timeout.';
      }
    }
  }

  private handleNoData() {
    this.pollAttempts++;
    if (this.pollAttempts < this.MAX_POLL_ATTEMPTS) {
      this.startPolling(2000);
    } else {
      this.isLoading = false;
      this.isBufferingPhase = false;
      this.errorMessage = 'Timeout: les flux ne sont pas disponibles.';
    }
  }

  private startPolling(delay: number = 2000) {
    this.stopPolling();
    this.pollingInterval = setTimeout(() => {
      this.fetchAvailableTracks();
    }, delay);
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private initializeAllTracks() {
    const generation = ++this.initGeneration;

    if (this.videoWrappers.length > 0) {
      this.videoWrappers.forEach((w) => {
        if (w.hls) {
          w.hls.destroy();
          w.hls = null;
        }
      });
      this.videoWrappers = [];
    }

    this.originalTrackOrder = this.availableTracks.map((t) => t.name);
    this.playbackStarted = false;
    this.isBufferingPhase = true;
    this.bufferCheckCount = 0;

    const stagger = this.availableTracks.length <= 2 ? 200 : 100;

    this.availableTracks.forEach((track, index) => {
      setTimeout(() => {
        if (generation !== this.initGeneration) return;
        this.addTrack(track);
      }, index * stagger);
    });

    const totalStagger = this.availableTracks.length * stagger;
    setTimeout(() => {
      if (generation !== this.initGeneration) return;
      this.startBufferCheck();
    }, totalStagger + 500);
  }

  private getStageElement(): HTMLElement | null {
    return document.getElementById(`stageArea_${this.playerId}`);
  }

  private addTrack(track: Track) {
    const uniqueId = this.trackIdCounter++;
    const trackCopy: Track = { ...track, index: uniqueId, name: `${track.name}` };

    const stage = this.getStageElement();
    const stageW = stage ? stage.offsetWidth : 800;
    const stageH = stage ? stage.offsetHeight : 450;

    const isFirst = this.videoWrappers.length === 0;
    const initialAspectRatio = 16 / 9;

    let initialWidth: number;
    let initialHeight: number;
    let initialX: number;
    let initialY: number;

    if (isFirst) {
      if (this.isMobileLayout()) {
        const fitted = this.getFittedSize(stageW, stageH * 0.68, initialAspectRatio, 0.96);
        initialWidth = fitted.width;
        initialHeight = fitted.height;
        initialX = (stageW - initialWidth) / 2;
        initialY = 8;
      } else {
        initialWidth = stageW;
        initialHeight = initialWidth / initialAspectRatio;
        initialX = 0;
        initialY = 0;
      }
    } else {
      if (this.isMobileLayout()) {
        initialHeight = Math.min(90, stageH * 0.16);
        initialWidth = initialHeight / (1 / initialAspectRatio);
        initialX = 8;
        initialY = Math.min(
          stageH - initialHeight - 8,
          20 + (this.videoWrappers.length - 1) * 20,
        );
      } else {
        initialWidth = 300;
        initialHeight = initialWidth / initialAspectRatio;
        initialX = 20;
        initialY = 20 + (this.videoWrappers.length - 1) * 20;
      }
    }

    if (!track.isVideo) {
      initialWidth = 0;
      initialHeight = 0;
      initialX = 0;
      initialY = 0;
    }

    const initNx = stageW > 0 ? initialX / stageW : 0;
    const initNy = stageH > 0 ? initialY / stageH : 0;
    const initNw = stageW > 0 ? initialWidth / stageW : 1;
    const initNh = stageH > 0 ? initialHeight / stageH : 1;

    const newWrapper: VideoWrapper = {
      playerId: `player_${this.playerId}_${trackCopy.index}`,
      track: trackCopy,
      x: initialX,
      y: initialY,
      width: initialWidth,
      height: initialHeight,
      hls: null,
      videoElement: null,
      visible: true,
      zIndex: 100,
      volume: 1,
      aspectRatio: initialAspectRatio,
      isReady: false,
      hasManifest: false,
      bufferEnd: 0,
      bufferStart: 0,
      isVideo: track.isVideo,
      nx: initNx,
      ny: initNy,
      nw: initNw,
      nh: initNh,
    };

    this.videoWrappers.push(newWrapper);

    setTimeout(() => {
      this.initHlsForWrapper(newWrapper, track.videoUrl);
      this.refreshLayoutState();
      this.adaptWrappersToViewport();
    }, 100);
  }

  removeTrack(wrapper: VideoWrapper) {
    if (!this.editMode) return;
    if (this.videoWrappers.length <= 1) return;
    const wasMaster = wrapper.playerId === this.masterPlayerId;
    if (wrapper.hls) wrapper.hls.destroy();
    this.videoWrappers = this.videoWrappers.filter((w) => w !== wrapper);
    this.syncStats.delete(wrapper.track.name);
    setTimeout(() => {
      this.refreshLayoutState();
      if (this.videoWrappers.length > 0) {
        const newMaster = this.videoWrappers[0];
        this.masterPlayerId = newMaster.playerId;
        this.setupMasterListeners();
        if (wasMaster) {
          this.syncStats.clear();
          this.maxDrift = 0;
        }
      }
    }, 50);
  }

  private initHlsForWrapper(wrapper: VideoWrapper, videoUrl: string, attempt = 0) {
    const videoEl = document.getElementById(
      `videoElement_${this.playerId}_${wrapper.track.index}`,
    ) as HTMLVideoElement;

    if (!videoEl) {
      if (attempt < 20) {
        setTimeout(() => this.initHlsForWrapper(wrapper, videoUrl, attempt + 1), 50);
      } else {
        console.error(
          `[FOV] [${wrapper.track.name}] Video element NOT FOUND after 20 attempts`,
        );
      }
      return;
    }

    wrapper.videoElement = videoEl;
    wrapper.isReady = false;
    wrapper.hasManifest = false;

    const isMaster = this.videoWrappers[0] === wrapper;

    videoEl.onloadedmetadata = () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        wrapper.aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
      }
      setTimeout(() => this.adaptWrappersToViewport(), 0);
    };

    videoEl.volume = wrapper.volume;
    videoEl.muted = true;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveSyncDuration: 10,
        liveMaxLatencyDuration: 30,
        liveDurationInfinity: true,
        liveBackBufferLength: 30,
        maxBufferLength: 60,
        maxMaxBufferLength: 90,
        maxBufferSize: 200 * 1000 * 1000,
        maxBufferHole: 0.5,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 20000,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 10,
        levelLoadingRetryDelay: 1000,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 10,
        maxFragLookUpTolerance: 0.25,
        startPosition: -1,
        startFragPrefetch: true,
        xhrSetup: (xhr: XMLHttpRequest, _url: string) => {
          xhr.setRequestHeader('Cache-Control', 'no-cache');
        },
      });

      wrapper.hls = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, _data) => {
        wrapper.hasManifest = true;
        videoEl.pause();
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
        const frags = data.details.fragments.slice(0, 3);
        console.log(
          `[FOV] [${wrapper.track.name}] LEVEL_LOADED hasPDT:${data.details.hasProgramDateTime}`,
          frags.map((f) => ({ pdt: f.programDateTime, start: f.start.toFixed(2) })),
        );
      });

      hls.on(Hls.Events.FRAG_BUFFERED, (_event, _data) => {
        this.updateBufferInfo(wrapper);
        if (!wrapper.isReady) {
          wrapper.isReady = true;
          console.log(
            `[FOV] [${wrapper.track.name}] First fragment buffered — ${wrapper.bufferStart.toFixed(1)}→${wrapper.bufferEnd.toFixed(1)}s`,
          );
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          if (!this.isBufferingPhase) {
            console.warn(
              `[FOV] [${wrapper.track.name}] bufferStalledError — fwd: ${this.getForwardBuffer(wrapper).toFixed(1)}s`,
            );
          }
          return;
        }
        if (data.fatal) {
          console.error(
            `[FOV] [${wrapper.track.name}] FATAL ${data.type}: ${data.details}`,
          );
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setTimeout(() => {
                if (wrapper.hls) wrapper.hls.startLoad();
              }, 2000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              this.reloadWrapper(wrapper);
              break;
          }
        }
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(videoEl);
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = videoUrl;
      wrapper.isReady = true;
      wrapper.hasManifest = true;
    }

    if (isMaster) {
      this.masterPlayerId = wrapper.playerId;
      this.setupMasterListeners();
    }
  }

  private getForwardBuffer(wrapper: VideoWrapper): number {
    if (!wrapper.videoElement) return 0;
    return wrapper.bufferEnd - wrapper.videoElement.currentTime;
  }

  private updateBufferInfo(wrapper: VideoWrapper) {
    if (!wrapper.videoElement) return;
    const videoEl = wrapper.videoElement;
    if (videoEl.buffered.length > 0) {
      wrapper.bufferStart = videoEl.buffered.start(0);
      wrapper.bufferEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
    }
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

  private collectBufferInfos(): TrackBufferInfo[] {
    return this.videoWrappers.map((w) => {
      const vid = w.videoElement;
      let start = 0,
        end = 0,
        length = 0;
      if (vid && vid.buffered.length > 0) {
        start = vid.buffered.start(0);
        end = vid.buffered.end(vid.buffered.length - 1);
        length = end - start;
      }
      const startPdt = this.getTrackStartPdt(w);
      return { name: w.track.name, start, end, length, startPdt };
    });
  }

  private computeSyncTargets(
    infos: TrackBufferInfo[],
  ): { name: string; target: number }[] | null {
    const allHavePdt = infos.every((i) => i.startPdt !== null);

    if (allHavePdt) {
      const wallClockStarts = infos.map((i) => i.startPdt! + i.start * 1000);
      const wallClockEnds = infos.map((i) => i.startPdt! + i.end * 1000);
      const commonWallStart = Math.max(...wallClockStarts);
      const commonWallEnd = Math.min(...wallClockEnds);

      if (commonWallEnd - commonWallStart < 3000) {
        console.log('[FOV] PDT overlap < 3s — waiting');
        return null;
      }

      const targets = infos.map((inf) => {
        const t = (commonWallStart - inf.startPdt!) / 1000 + 0.1;
        return {
          name: inf.name,
          target: Math.max(inf.start + 0.1, Math.min(t, inf.end - 1)),
        };
      });

      for (let i = 0; i < infos.length; i++) {
        const inf = infos[i];
        const target = targets[i].target;
        if (target < inf.start || target > inf.end - 0.5) {
          console.log(
            `[FOV] Track ${inf.name}: target ${target.toFixed(2)}s outside buffer — waiting`,
          );
          return null;
        }
      }

      const overlapSec = (commonWallEnd - commonWallStart) / 1000;
      console.log(
        `[FOV] PDT overlap: ${overlapSec.toFixed(1)}s — targets: ${targets.map((t) => `${t.name}→${t.target.toFixed(2)}s`).join(', ')}`,
      );
      return targets;
    }

    console.log('[FOV] No PDT — fallback sync');
    const ends = infos.map((i) => i.end);
    const starts = infos.map((i) => i.start);
    const syncPoint = Math.min(...ends) - 3;
    const maxStart = Math.max(...starts);

    if (syncPoint <= maxStart) {
      console.log(
        `[FOV] Fallback syncPoint ${syncPoint.toFixed(1)}s <= maxStart — waiting`,
      );
      return null;
    }

    const targets = infos.map((i) => ({
      name: i.name,
      target: Math.max(i.start + 0.1, Math.min(syncPoint, i.end - 1)),
    }));
    console.log(`[FOV] Fallback syncPoint: ${syncPoint.toFixed(2)}s`);
    return targets;
  }

  private startBufferCheck(): void {
    this.bufferCheckCount = 0;

    const check = () => {
      // Guard : si la lecture a déjà démarré, on arrête
      if (this.playbackStarted) return;

      if (this.videoWrappers.length === 0) {
        setTimeout(check, 500);
        return;
      }
      if (this.videoWrappers.some((w) => !w.videoElement)) {
        setTimeout(check, 500);
        return;
      }

      this.bufferCheckCount++;
      const logThisTick = this.bufferCheckCount % 8 === 1;

      const infos = this.collectBufferInfos();

      if (logThisTick) {
        const summary = infos
          .map(
            (i) =>
              `${i.name}: ${i.length.toFixed(1)}s [${i.start.toFixed(1)}-${i.end.toFixed(1)}]${i.startPdt ? ' PDT:' + new Date(i.startPdt).toISOString().substr(11, 8) : ' (no PDT)'}`,
          )
          .join(' | ');
        console.log(
          `[FOV] Buffer check #${this.bufferCheckCount}: ${summary} | min: ${Math.min(...infos.map((i) => i.length)).toFixed(1)}s`,
        );
      }

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

      console.log(
        `%c[FOV] ✓ Buffer ready — starting synchronized playback`,
        'color: #16a34a; font-weight: bold',
      );
      this.startSynchronizedPlayback(syncTargets);
    };

    setTimeout(check, 800);
  }

  private stopBufferCheck() {
    if (this.bufferCheckInterval) {
      clearInterval(this.bufferCheckInterval);
      this.bufferCheckInterval = null;
    }
  }

  private async startSynchronizedPlayback(
    targets: { name: string; target: number }[],
  ): Promise<void> {
    if (this.playbackStarted) return;

    console.log(
      `[FOV] startSynchronizedPlayback — ${targets.map((t) => `${t.name}→${t.target.toFixed(2)}s`).join(', ')}`,
    );

    for (const w of this.videoWrappers) {
      if (w.videoElement) w.videoElement.pause();
    }

    const seekPromises = this.videoWrappers.map((w) => {
      return new Promise<void>((resolve) => {
        if (!w.videoElement) {
          resolve();
          return;
        }
        const t = targets.find((t) => t.name === w.track.name);
        const seekTarget = t?.target ?? w.bufferStart;
        const onSeeked = () => {
          w.videoElement!.removeEventListener('seeked', onSeeked);
          resolve();
        };
        w.videoElement.addEventListener('seeked', onSeeked);
        w.videoElement.currentTime = seekTarget;
      });
    });

    await Promise.all(seekPromises);
    await this.waitForAllReady();
    await this.playAllWrappers();

    // Tenter le déverrouillage audio après que les vidéos ont démarré
    await this.tryAutoUnlockAudio();

    requestAnimationFrame(() => {
      this.playbackStarted = true;
      this.isBufferingPhase = false;

      for (const w of this.videoWrappers) {
        this.updateBufferInfo(w);
        console.log(
          `[FOV] [${w.track.name}] Post-play ct:${w.videoElement?.currentTime.toFixed(2)} buf:${w.bufferStart.toFixed(1)}-${w.bufferEnd.toFixed(1)}`,
        );
      }

      this.applyStoredLayoutIfAvailable();
      this.startSyncMonitoring();
      console.log(
        '%c[FOV] ✓ Playback fully started',
        'color: #16a34a; font-weight: bold; font-size: 14px',
      );
    });
  }

  // ── tryAutoUnlockAudio ────────────────────────────────────────────────────
  // Ordre de priorité :
  //   1. sessionStorage dit que l'utilisateur a déjà consenti → démuette directement
  //   2. Probe canAutoplayWithSound() → navigateur autorise l'autoplay avec son
  //   3. Tente de démuetter et vérifie si le navigateur a mis en pause silencieusement
  //   4. Sinon : lecture muette + overlay + listeners
  private async tryAutoUnlockAudio(): Promise<void> {
  if (this.audioUnlocked) return;

  // ── Priorité 1 : consentement sessionStorage ──────────────────────────
  // On tente de démuetter. Si le navigateur bloque quand même (vidéo pausée
  // silencieusement), on bascule vers l'overlay sans mettre audioUnlocked=true.
  if (this.getSessionAudioUnlocked()) {
    console.log('[FOV] sessionStorage consent found — attempting unmute');
    let blockedByBrowser = false;

    for (const w of this.videoWrappers) {
      if (!w.videoElement) continue;
      try {
        w.videoElement.volume = w.volume;
        w.videoElement.muted = (w.volume === 0);
        // Détecter si le navigateur a mis en pause silencieusement
        if (w.videoElement.paused && w.volume > 0) {
          blockedByBrowser = true;
          w.videoElement.muted = true;
        }
      } catch {
        blockedByBrowser = true;
        w.videoElement.muted = true;
      }
    }

    if (!blockedByBrowser) {
      this.audioUnlocked = true;
      console.log('[FOV] Audio auto-unlocked via sessionStorage consent');
      return;
    }

    // Le navigateur a bloqué malgré le consentement mémorisé
    // → on efface la clé (état incohérent) et on bascule vers l'overlay
    console.warn(
      '[FOV] sessionStorage consent present but browser still blocks — ' +
      'clearing key, showing overlay',
    );
    try { sessionStorage.removeItem(AUDIO_UNLOCKED_SESSION_KEY); } catch {}
    this.resumeAllMuted();
    this.registerClickToUnlock();
    this.registerDocumentUnlock();
    return;
  }

  // ── Priorité 2 : probe canAutoplayWithSound ───────────────────────────
  const canAutoplay = await this.canAutoplayWithSound();
  if (canAutoplay) {
    console.log('[FOV] canAutoplayWithSound probe passed — unmuting directly');
    let blockedByBrowser = false;

    for (const w of this.videoWrappers) {
      if (!w.videoElement) continue;
      try {
        w.videoElement.volume = w.volume;
        w.videoElement.muted = (w.volume === 0);
        if (w.videoElement.paused && w.volume > 0) {
          blockedByBrowser = true;
          w.videoElement.muted = true;
        }
      } catch {
        blockedByBrowser = true;
        w.videoElement.muted = true;
      }
    }

    if (!blockedByBrowser) {
      this.audioUnlocked = true;
      this.setSessionAudioUnlocked();
      console.log('[FOV] Auto audio unlock succeeded via probe');
      return;
    }

    console.warn('[FOV] probe passed but browser blocked unmute — showing overlay');
    this.resumeAllMuted();
    this.registerClickToUnlock();
    this.registerDocumentUnlock();
    return;
  }

  // ── Priorité 3 : tentative directe ───────────────────────────────────
  let anyBlocked = false;

  for (const w of this.videoWrappers) {
    if (!w.videoElement) continue;
    try {
      w.videoElement.volume = w.volume;
      w.videoElement.muted = (w.volume === 0);
      if (w.videoElement.paused || (w.videoElement.muted && w.volume > 0)) {
        anyBlocked = true;
        w.videoElement.muted = true;
      }
    } catch {
      anyBlocked = true;
      w.videoElement.muted = true;
    }
  }

  if (!anyBlocked) {
    this.audioUnlocked = true;
    this.setSessionAudioUnlocked();
    console.log('[FOV] Auto audio unlock succeeded');
    return;
  }

  // ── Priorité 4 : overlay + listeners ─────────────────────────────────
  console.warn(
    '[FOV] Auto audio unlock blocked by browser — waiting for user interaction',
  );
  this.resumeAllMuted();
  this.registerClickToUnlock();
  this.registerDocumentUnlock();
}

  // ── resumeAllMuted ────────────────────────────────────────────────────────
  private resumeAllMuted(): void {
    for (const w of this.videoWrappers) {
      if (!w.videoElement) continue;
      w.videoElement.muted = true;
      if (w.videoElement.paused) {
        w.videoElement.play().catch(() => {});
      }
    }
    console.log('[FOV] Resumed all wrappers muted — waiting for click to unmute');
  }

  // ── registerClickToUnlock ─────────────────────────────────────────────────
  private registerClickToUnlock(): void {
    if (this.clickToUnlockHandler) return;
    this.clickToUnlockHandler = () => this.unlockAudio();

    const stage = document.getElementById(`stageArea_${this.playerId}`);
    if (stage) {
      stage.addEventListener('click', this.clickToUnlockHandler, { once: true });
      console.log('[FOV] Click-to-unlock registered on stage');
    } else {
      console.warn('[FOV] Stage not found for click-to-unlock');
    }
  }

  // ── registerDocumentUnlock ────────────────────────────────────────────────
  private registerDocumentUnlock(): void {
    if (this.documentUnlockHandler) return;
    this.documentUnlockHandler = () => this.unlockAudio();

    document.addEventListener('click', this.documentUnlockHandler, {
      once: true,
      capture: true,
    });
    document.addEventListener('keydown', this.documentUnlockHandler, {
      once: true,
      capture: true,
    });
    document.addEventListener('touchstart', this.documentUnlockHandler, {
      once: true,
      capture: true,
      passive: true,
    });

    console.log('[FOV] Document-wide unlock listener registered');
  }

  // ── unlockAudio ───────────────────────────────────────────────────────────
  // Point d'entrée unique pour déverrouiller l'audio.
  // Appelé par : overlay click, listener stage, listener document, setVolume()
  unlockAudio(): void {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.setSessionAudioUnlocked(); // Persiste dans la session (survit à F5/Ctrl+R)

    for (const w of this.videoWrappers) {
      if (!w.videoElement) continue;
      w.videoElement.volume = w.volume;
      w.videoElement.muted = w.volume === 0;
      if (w.videoElement.paused) {
        w.videoElement.play().catch(() => {});
      }
    }

    // Nettoyage des listeners restants
    if (this.clickToUnlockHandler) {
      const stage = document.getElementById(`stageArea_${this.playerId}`);
      stage?.removeEventListener('click', this.clickToUnlockHandler);
      this.clickToUnlockHandler = null;
    }
    if (this.documentUnlockHandler) {
      document.removeEventListener('click', this.documentUnlockHandler, {
        capture: true,
      });
      document.removeEventListener('keydown', this.documentUnlockHandler, {
        capture: true,
      });
      document.removeEventListener('touchstart', this.documentUnlockHandler, {
        capture: true,
      });
      this.documentUnlockHandler = null;
    }

    console.log('[FOV] Audio unlocked by user interaction');
  }

  private waitForAllReady(): Promise<void> {
    return new Promise((resolve) => {
      let waitCount = 0;
      const check = () => {
        waitCount++;
        const allReady = this.videoWrappers.every(
          (w) => w.videoElement && w.videoElement.readyState >= 3,
        );
        if (waitCount % 20 === 1) {
          console.log(
            `[FOV] waitForAllReady #${waitCount}: ${this.videoWrappers.map((w) => `${w.track.name}:${w.videoElement?.readyState ?? '?'}`).join(', ')}`,
          );
        }
        if (allReady) {
          resolve();
        } else if (waitCount > 100) {
          console.warn('[FOV] waitForAllReady timeout');
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  private reloadWrapper(wrapper: VideoWrapper) {
    wrapper.isReady = false;
    wrapper.hasManifest = false;
    if (wrapper.hls) {
      wrapper.hls.destroy();
      wrapper.hls = null;
    }
    setTimeout(() => {
      this.initHlsForWrapper(wrapper, wrapper.track.videoUrl);
    }, 3000);
  }

  private syncAllToMaster() {
    if (this.videoWrappers.length < 2 || !this.playbackStarted) return;

    const master = this.videoWrappers.find((w) => w.playerId === this.masterPlayerId);
    if (!master || !master.isVideo || !master.videoElement) return;
    if (master.videoElement.paused || master.videoElement.readyState < 3) return;

    const masterTime = master.videoElement.currentTime;
    const masterPdt = this.getTrackStartPdt(master);
    this.maxDrift = 0;

    this.videoWrappers.forEach((w) => this.updateBufferInfo(w));

    this.videoWrappers.forEach((w) => {
      if (w.playerId === this.masterPlayerId) return;
      if (
        !w.videoElement ||
        w.videoElement.paused ||
        w.videoElement.seeking ||
        w.videoElement.readyState < 3
      )
        return;

      const slaveTime = w.videoElement.currentTime;
      const slavePdt = this.getTrackStartPdt(w);

      let drift: number;
      if (masterPdt !== null && slavePdt !== null) {
        const expectedSlaveTime = (masterPdt + masterTime * 1000 - slavePdt) / 1000;
        drift = slaveTime - expectedSlaveTime;
      } else {
        drift = slaveTime - masterTime;
      }

      const absDrift = Math.abs(drift);
      this.syncStats.set(w.track.name, drift * 1000);
      if (absDrift > this.maxDrift) this.maxDrift = absDrift;

      if (absDrift > this.HARD_SYNC_THRESHOLD) {
        const expectedSlaveTime =
          masterPdt !== null && slavePdt !== null
            ? (masterPdt + masterTime * 1000 - slavePdt) / 1000
            : masterTime;
        if (expectedSlaveTime >= w.bufferStart && expectedSlaveTime <= w.bufferEnd) {
          console.warn(
            `[FOV] [${w.track.name}] Hard resync: ${(drift * 1000).toFixed(0)}ms → ${expectedSlaveTime.toFixed(2)}s`,
          );
          w.videoElement.currentTime = expectedSlaveTime;
          w.videoElement.playbackRate = 1;
        } else {
          w.videoElement.playbackRate = drift > 0 ? 0.95 : 1.05;
        }
      } else if (absDrift > this.SYNC_THRESHOLD) {
        w.videoElement.playbackRate = drift > 0 ? 0.98 : 1.02;
      } else {
        if (w.videoElement.playbackRate !== 1) w.videoElement.playbackRate = 1;
      }
    });
  }

  startSyncMonitoring() {
    this.stopSyncMonitoring();
    this.syncInterval = setInterval(() => this.syncAllToMaster(), 500);
  }

  stopSyncMonitoring() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  startDrag(event: PointerEvent, wrapper: VideoWrapper) {
    if (!this.editMode || !wrapper.isVideo) return;
    if ((event.target as HTMLElement).classList.contains('resize-handle')) return;
    this.activeDragWrapper = wrapper;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.initialX = wrapper.x;
    this.initialY = wrapper.y;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  startResize(event: PointerEvent, wrapper: VideoWrapper) {
    if (!this.editMode || !wrapper.isVideo) return;
    this.activeResizeWrapper = wrapper;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.initialW = wrapper.width;
    this.initialH = wrapper.height;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent) {
    const stage = this.getStageElement();
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();

    if (this.activeDragWrapper) {
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      const newX = Math.max(
        0,
        Math.min(this.initialX + dx, stageRect.width - this.activeDragWrapper.width),
      );
      const newY = Math.max(
        0,
        Math.min(this.initialY + dy, stageRect.height - this.activeDragWrapper.height),
      );
      this.activeDragWrapper.x = newX;
      this.activeDragWrapper.y = newY;
    } else if (this.activeResizeWrapper) {
      const dx = event.clientX - this.dragStartX;
      const ratio = this.activeResizeWrapper.aspectRatio;
      const maxAllowedW = stageRect.width * this.MAX_WIDTH_RATIO;
      let newW = Math.max(
        150,
        Math.min(
          this.initialW + dx,
          stageRect.width - this.activeResizeWrapper.x,
          maxAllowedW,
        ),
      );
      let newH = newW / ratio;
      const maxH = stageRect.height - this.activeResizeWrapper.y;
      if (newH > maxH) {
        newH = maxH;
        newW = newH * ratio;
      }
      this.activeResizeWrapper.width = newW;
      this.activeResizeWrapper.height = newH;
    }
  }

  @HostListener('window:pointerup', ['$event'])
  onPointerUp(_event: PointerEvent) {
    if (this.activeDragWrapper || this.activeResizeWrapper) {
      this.captureNormalized();
    }
    this.activeDragWrapper = null;
    this.activeResizeWrapper = null;
  }

  private refreshLayoutState() {
    this.videoWrappers.forEach((w, i) => {
      w.zIndex = 100 + (this.videoWrappers.length - i);
    });
  }

  resetLayout() {
    if (this.isMobileLayout()) {
      this.adaptWrappersToViewport();
      this.refreshLayoutState();
      this.updateMasterReference();
      this.captureNormalized();
      return;
    }

    const stage = this.getStageElement();
    const stageW = stage ? stage.offsetWidth : 800;
    const stageH = stage ? stage.offsetHeight : 450;

    const videoWrappers = this.videoWrappers.filter((w) => w.isVideo);
    videoWrappers.sort((a, b) => {
      const indexA = this.originalTrackOrder.indexOf(a.track.name.split('_')[0]);
      const indexB = this.originalTrackOrder.indexOf(b.track.name.split('_')[0]);
      return indexA - indexB;
    });

    let videoIndex = 0;
    this.videoWrappers.forEach((w) => {
      if (!w.isVideo) {
        w.visible = true;
        return;
      }
      const i = videoIndex++;
      if (i === 0) {
        w.x = 0;
        w.y = 0;
        w.width = stageW;
        w.height = w.width / w.aspectRatio;
        if (w.height > stageH) {
          w.height = stageH;
          w.width = w.height * w.aspectRatio;
        }
      } else {
        w.x = 20;
        w.width = 300;
        w.height = w.width / w.aspectRatio;
        let yOffset = 20;
        for (let j = 1; j < i; j++) yOffset += this.videoWrappers[j].height + 10;
        w.y = yOffset;
      }
      w.visible = true;
    });

    this.refreshLayoutState();
    this.updateMasterReference();
  }

  moveUp(index: number) {
    if (!this.editMode || index <= 0) return;
    [this.videoWrappers[index], this.videoWrappers[index - 1]] = [
      this.videoWrappers[index - 1],
      this.videoWrappers[index],
    ];
    this.refreshLayoutState();
    this.updateMasterReference();
  }

  moveDown(index: number) {
    if (!this.editMode || index >= this.videoWrappers.length - 1) return;
    [this.videoWrappers[index], this.videoWrappers[index + 1]] = [
      this.videoWrappers[index + 1],
      this.videoWrappers[index],
    ];
    this.refreshLayoutState();
    this.updateMasterReference();
  }

  private updateMasterReference() {
    const masterWrapper = this.videoWrappers.find((w) => w.isVideo);
    if (masterWrapper) {
      const wasDifferentMaster = this.masterPlayerId !== masterWrapper.playerId;
      this.masterPlayerId = masterWrapper.playerId;
      this.setupMasterListeners();
      if (wasDifferentMaster) {
        console.log(`[FOV] Master changed to: ${masterWrapper.track.name}`);
        this.syncStats.clear();
        this.maxDrift = 0;
      }
    }
  }

  private setupMasterListeners() {
    if (this.videoWrappers.length === 0) return;
    const masterWrapper = this.videoWrappers.find((w) => w.playerId === this.masterPlayerId);
    if (!masterWrapper) return;
    const videoEl = masterWrapper.videoElement;
    if (!videoEl) return;

    videoEl.onloadedmetadata = () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        masterWrapper.aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
        masterWrapper.height = masterWrapper.width / masterWrapper.aspectRatio;
        const stage = this.getStageElement();
        if (stage) {
          const maxHeight = stage.offsetHeight;
          if (masterWrapper.height > maxHeight) {
            masterWrapper.height = maxHeight;
            masterWrapper.width = masterWrapper.height * masterWrapper.aspectRatio;
          }
        }
      }
    };
  }

  toggleVisibility(wrapper: VideoWrapper) {
    if (this.editMode) {
      wrapper.visible = !wrapper.visible;
    }
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
  }

  async toggleFullscreen() {
    const el = this.playerRoot?.nativeElement;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if ((el as any).webkitRequestFullscreen)
          await (el as any).webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen)
          await (document as any).webkitExitFullscreen();
      }
    } catch (err) {
      console.error('[FOV] Fullscreen error:', err);
    }
  }

  toggleFullscreenAudioPanel() {
    this.fullscreenAudioPanelOpen = !this.fullscreenAudioPanelOpen;
  }

  private applyWrapperAudio(wrapper: VideoWrapper) {
    if (!wrapper.videoElement) return;
    wrapper.videoElement.volume = wrapper.volume;
    wrapper.videoElement.muted = wrapper.volume === 0;
  }

  // ── maximizeWrapper ───────────────────────────────────────────────────────
  maximizeWrapper(wrapper: VideoWrapper): void {
    const stage = this.getStageElement();
    if (!stage) return;
    wrapper.x = 0;
    wrapper.y = 0;
    wrapper.width = stage.offsetWidth;
    wrapper.height = stage.offsetHeight;
    wrapper.nx = 0;
    wrapper.ny = 0;
    wrapper.nw = 1;
    wrapper.nh = 1;
  }

  // ── minimizeWrapper ───────────────────────────────────────────────────────
  minimizeWrapper(wrapper: VideoWrapper): void {
    const stage = this.getStageElement();
    if (!stage) return;
    const smallW = 300;
    const smallH = smallW / (wrapper.aspectRatio || 16 / 9);
    wrapper.width = smallW;
    wrapper.height = smallH;
    wrapper.x = 20;
    wrapper.y = 20;
    wrapper.nx = wrapper.x / stage.offsetWidth;
    wrapper.ny = wrapper.y / stage.offsetHeight;
    wrapper.nw = wrapper.width / stage.offsetWidth;
    wrapper.nh = wrapper.height / stage.offsetHeight;
  }

  // ── isWrapperMaximized ────────────────────────────────────────────────────
  isWrapperMaximized(wrapper: VideoWrapper): boolean {
    return wrapper.nw > 0.9 && wrapper.nh > 0.9 && wrapper.x < 10 && wrapper.y < 10;
  }

  private async playAllWrappers() {
    // Toutes les vidéos démarrent en muet — unlockAudio() ou tryAutoUnlockAudio()
    // appliquera le volume réel après avoir vérifié les permissions du navigateur.
    for (const w of this.videoWrappers) {
      if (w.videoElement) {
        w.videoElement.playbackRate = 1;
        w.videoElement.muted = true;
        w.videoElement.volume = w.volume;
      }
    }

    const playResults = await Promise.all(
      this.videoWrappers.map(async (w) => {
        if (!w.videoElement) return 'no-element';
        try {
          await w.videoElement.play();
          return 'ok';
        } catch (err: any) {
          w.videoElement.muted = true;
          try {
            await w.videoElement.play();
            return 'ok-muted';
          } catch (err2: any) {
            console.error(`[FOV] [${w.track.name}] play() failed:`, err2.message);
            return 'failed';
          }
        }
      }),
    );

    console.log(
      '[FOV] Play results:',
      this.videoWrappers.map((w, i) => `${w.track.name}:${playResults[i]}`).join(', '),
    );

    // Mettre à jour le volume (sans démuetter — c'est tryAutoUnlockAudio qui décide)
    for (const w of this.videoWrappers) {
      if (w.videoElement) w.videoElement.volume = w.volume;
    }
  }

  setVolume(wrapper: VideoWrapper, event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    wrapper.volume = val;
    // L'utilisateur interagit manuellement → audio déverrouillé
    if (!this.audioUnlocked) {
      this.unlockAudio();
    } else {
      this.applyWrapperAudio(wrapper);
    }
    // Nettoyer les listeners de déverrouillage si encore actifs
    if (this.documentUnlockHandler) {
      document.removeEventListener('click', this.documentUnlockHandler, { capture: true });
      document.removeEventListener('keydown', this.documentUnlockHandler, {
        capture: true,
      });
      document.removeEventListener('touchstart', this.documentUnlockHandler, {
        capture: true,
      });
      this.documentUnlockHandler = null;
    }
  }

  saveLayout(): void {
    this.captureNormalized();

    const wrappers: SavedWrapperLayout[] = this.videoWrappers.map((w, i) => ({
      trackName: w.track.name,
      nx: w.nx,
      ny: w.ny,
      nw: w.nw,
      nh: w.nh,
      volume: w.volume,
      visible: w.visible,
      zIndex: w.zIndex,
      orderIndex: i,
    }));

    const layout: SavedLayout = {
      streamId: this.streamId,
      savedAt: Date.now(),
      wrappers,
    };

    try {
      localStorage.setItem(this.layoutStorageKey, JSON.stringify(layout));
      console.log('[FOV] ✓ Layout saved');
      this.layoutSaved = true;
      if (this.savedLayoutTimeout) clearTimeout(this.savedLayoutTimeout);
      this.savedLayoutTimeout = setTimeout(() => {
        this.layoutSaved = false;
      }, 2500);
    } catch (e) {
      console.error('[FOV] Failed to save layout:', e);
    }

    this.editMode = false;
  }

  private applyStoredLayoutIfAvailable(): void {
    try {
      const raw = localStorage.getItem(this.layoutStorageKey);
      if (!raw) return;
      const layout: SavedLayout = JSON.parse(raw);
      if (layout.streamId !== this.streamId) return;
      console.log(
        `[FOV] Restoring layout savedAt: ${new Date(layout.savedAt).toLocaleTimeString()}`,
      );
      this.applyStoredLayout(layout);
    } catch (e) {
      console.error('[FOV] Failed to parse saved layout:', e);
      localStorage.removeItem(this.layoutStorageKey);
    }
  }

  private applyStoredLayout(layout: SavedLayout): void {
    const stage = this.getStageElement();
    if (!stage) return;

    // ── 1. Réordonner ─────────────────────────────────────────────────────
    const ordered: VideoWrapper[] = [];
    const unmatched: VideoWrapper[] = [...this.videoWrappers];
    const sortedSaved = [...layout.wrappers].sort((a, b) => a.orderIndex - b.orderIndex);

    for (const saved of sortedSaved) {
      const idx = unmatched.findIndex((w) => w.track.name === saved.trackName);
      if (idx !== -1) ordered.push(unmatched.splice(idx, 1)[0]);
    }
    ordered.push(...unmatched);
    this.videoWrappers = ordered;

    // ── 2. Appliquer les propriétés ───────────────────────────────────────
    for (const w of this.videoWrappers) {
      const saved = layout.wrappers.find((s) => s.trackName === w.track.name);
      if (!saved) continue;
      w.nx = saved.nx;
      w.ny = saved.ny;
      w.nw = saved.nw;
      w.nh = saved.nh;
      w.visible = saved.visible;
      w.volume = saved.volume;
    }

    // ── 3. Pixels (sans clamper la taille) ────────────────────────────────
    this.applyNormalizedToPixels();

    const stageW = stage.offsetWidth;
    const stageH = stage.offsetHeight;
    for (const w of this.videoWrappers) {
      if (!w.isVideo) continue;
      // Clamper uniquement la position, PAS la taille
      w.x = Math.max(0, Math.min(w.x, stageW - 20));
      w.y = Math.max(0, Math.min(w.y, stageH - 20));
    }

    // ── 4. zIndex + master ─────────────────────────────────────────────────
    this.refreshLayoutState();
    this.updateMasterReference();

    // ── 5. Resync immédiat des slaves ──────────────────────────────────────
    if (this.playbackStarted) {
      const master = this.videoWrappers.find((w) => w.playerId === this.masterPlayerId);
      if (master?.videoElement) {
        const masterTime = master.videoElement.currentTime;
        const masterPdt = this.getTrackStartPdt(master);

        for (const w of this.videoWrappers) {
          if (w.playerId === this.masterPlayerId || !w.videoElement) continue;
          const slavePdt = this.getTrackStartPdt(w);
          const targetTime =
            masterPdt !== null && slavePdt !== null
              ? (masterPdt + masterTime * 1000 - slavePdt) / 1000
              : masterTime;

          const alreadyThere = Math.abs(w.videoElement.currentTime - targetTime) < 0.3;
          const inBuffer = targetTime >= w.bufferStart && targetTime <= w.bufferEnd - 0.3;

          if (alreadyThere) {
            console.log(
              `[FOV] [${w.track.name}] Post-layout resync — already at ${targetTime.toFixed(2)}s`,
            );
          } else if (inBuffer) {
            console.log(
              `[FOV] [${w.track.name}] Post-layout resync → ${targetTime.toFixed(2)}s`,
            );
            w.videoElement.currentTime = targetTime;
            w.videoElement.playbackRate = 1;
          } else {
            console.warn(
              `[FOV] [${w.track.name}] Post-layout resync ${targetTime.toFixed(2)}s outside buffer — skipped`,
            );
          }
        }
      }
    }

    // ── 6. Appliquer les volumes sauvegardés (si audio déjà déverrouillé) ─
    // Ne pas appeler applyWrapperAudio si l'audio n'est pas encore déverrouillé
    // pour ne pas déclencher la politique d'autoplay du navigateur.
    if (this.audioUnlocked) {
      for (const w of this.videoWrappers) {
        this.applyWrapperAudio(w);
      }
    }

    console.log('%c[FOV] ✓ Layout restored', 'color: #16a34a; font-weight: bold');
  }

  clearSavedLayout(): void {
    localStorage.removeItem(this.layoutStorageKey);
  }

  // ── refreshStream ─────────────────────────────────────────────────────────
  // IMPORTANT : ne PAS effacer sessionStorage ici.
  // Le consentement audio doit survivre à un refresh manuel dans le même onglet.
  refreshStream() {
    this.stopSyncMonitoring();
    this.stopPolling();
    this.stopBufferCheck();
    this.videoWrappers.forEach((w) => {
      if (w.hls) {
        w.hls.destroy();
        w.hls = null;
      }
    });
    this.videoWrappers = [];
    this.syncStats.clear();
    this.maxDrift = 0;
    this.playbackStarted = false;
    this.isBufferingPhase = true;
    this.pollAttempts = 0;
    this.isInitialized = false;
    this.bufferCheckCount = 0;

    // Restaurer le consentement audio depuis sessionStorage
    // (survit à F5/Ctrl+R mais pas à Ctrl+Shift+R)
    this.audioUnlocked = this.getSessionAudioUnlocked();
    if (this.audioUnlocked) {
      console.log('[FOV] refreshStream: audio consent restored from sessionStorage');
    }

    this.loadTracks();
  }
}
