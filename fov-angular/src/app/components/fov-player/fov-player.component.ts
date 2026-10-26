import {
  Component,
  Input,
  AfterViewInit,
  OnDestroy,
  HostListener,
  ViewChild,
  ElementRef,
  CUSTOM_ELEMENTS_SCHEMA,
  Inject,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import Hls from 'hls.js';
import {
  StreamEngine,
  StreamTrackView,
  STREAM_ENGINE,
  StreamEngineStats,
} from '../../services/stream-engine-interface';
import { HlsStreamEngine } from '../../services/hls-stream-service';
import { AppMountDirective } from '../../app-mount.directive';
import * as Moq from '@moq/net';
import * as Watch from '@moq/watch';
import { MoqStreamEngine } from '../../services/moq-stream-service';
import { StreamEngineDispatcher } from '../../services/stream-engine-dispatcher';
import { StatsOverlayComponent } from '../stats-overlay/stats-overlay.component';

export interface Track {
  index: number;
  name: string;
  trackId: string;
  videoUrl: string;
  isVideo: boolean;
  isAudio: boolean;
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
  isAudio: boolean;
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}

export interface AudioWrapper {
  playerId: string;
  track: Track;
  hls: Hls | null;
  audioElement: HTMLAudioElement | null;
  volume: number;
  isReady: boolean;
  bufferEnd: number;
  bufferStart: number;
}

interface SavedTrackLayout {
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
  tracks: SavedTrackLayout[];
}

const AUDIO_UNLOCKED_SESSION_KEY = 'fov_audio_unlocked';

@Component({
  selector: 'app-fov-player',
  standalone: true,
  imports: [CommonModule, AppMountDirective, StatsOverlayComponent],
  providers: [
    HlsStreamEngine,
    MoqStreamEngine,
    { provide: STREAM_ENGINE, useClass: StreamEngineDispatcher },
  ],
  templateUrl: './fov-player.component.html',
  styleUrls: ['./fov-player.component.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class FovPlayerComponent implements AfterViewInit, OnDestroy {
  @Input() streamId: string = '';

  readonly playerId = `fov_${Math.random().toString(36).substr(2, 9)}`;

  tracks: StreamTrackView[] = [];
  isLoading = true;
  isBufferingPhase = true;
  errorMessage = '';
  playbackStarted = false;
  editMode = false;
  audioUnlocked = false;

  isFullscreen = false;
  fullscreenAudioPanelOpen = false;
  layoutSaved = false;

  private savedLayoutTimeout: any = null;
  private activeDragTrack: StreamTrackView | null = null;
  private activeResizeTrack: StreamTrackView | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private initialX = 0;
  private initialY = 0;
  private initialW = 0;
  private initialH = 0;

  private readonly MOBILE_BREAKPOINT = 768;
  private readonly MAX_WIDTH_RATIO = 0.8;

  showStatsModal = false;
  engineStats: StreamEngineStats = {
    protocol: 'unknown',
    connectionHealth: 'disconnected',
    currentLatencyMs: 0,
    bufferSizeMs: 0,
    tracks: [],
    syncDriftMs: {},
  };

  @ViewChild('playerRoot') playerRoot?: ElementRef<HTMLElement>;

  constructor(
    @Inject(STREAM_ENGINE) public engine: StreamEngine,
    private cdr: ChangeDetectorRef,
  ) {}

  private get layoutStorageKey(): string {
    return `fov_layout_${this.streamId}`;
  }

  ngAfterViewInit() {
    this.audioUnlocked =
      sessionStorage.getItem(AUDIO_UNLOCKED_SESSION_KEY) === '1';

    this.engine.tracks$.subscribe((tracks) => {
      this.tracks = tracks;
      this.cdr.detectChanges();
      this.adaptTracksToViewport();
    });

    this.engine.isLoading$.subscribe((l) => {
      this.isLoading = l;
      this.cdr.detectChanges();
    });
    this.engine.isBuffering$.subscribe((b) => {
      this.isBufferingPhase = b;
      this.cdr.detectChanges();
    });
    this.engine.error$.subscribe((err) => {
      this.errorMessage = err;
      this.cdr.detectChanges();
    });
    this.engine.playbackStarted$.subscribe((started) => {
      this.playbackStarted = started;
      this.cdr.detectChanges();
      if (started) {
        this.applyStoredLayoutIfAvailable();
      }
    });

    this.engine.connect(this.streamId);
    this.engine.stats$.subscribe((stats) => {
      this.engineStats = stats;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.engine.disconnect();
    if (this.savedLayoutTimeout) clearTimeout(this.savedLayoutTimeout);
    if (this.isFullscreen) document.exitFullscreen?.().catch(() => {});
  }

  toggleStatsModal() {
    this.showStatsModal = !this.showStatsModal;
    this.cdr.detectChanges();
  }

  get videoTracks(): StreamTrackView[] {
    return this.tracks.filter((t) => t.isVideo);
  }

  get audioTracks(): StreamTrackView[] {
    return this.tracks.filter((t) => t.isAudio);
  }

  trackByTrack(index: number, track: StreamTrackView): string {
    return track.id;
  }

  getLoadingMessage(): string {
    if (this.errorMessage) return '';
    if (this.isLoading && !this.isBufferingPhase)
      return 'Connexion au serveur...';
    return 'Chargement du live...';
  }

  private getStageElement(): HTMLElement | null {
    return document.getElementById(`stageArea_${this.playerId}`);
  }

  unlockAudio() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    try {
      sessionStorage.setItem(AUDIO_UNLOCKED_SESSION_KEY, '1');
    } catch {}
    this.engine.unlockAudio();
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
  }

  toggleVisibility(track: StreamTrackView) {
    if (this.editMode) {
      track.visible = !track.visible;
      track.element.style.display = track.visible ? 'block' : 'none';
    }
  }

  moveUp(index: number) {
    if (!this.editMode || index <= 0) return;
    [this.videoTracks[index], this.videoTracks[index - 1]] = [
      this.videoTracks[index - 1],
      this.videoTracks[index],
    ];
    this.refreshZIndexes();
  }

  moveDown(index: number) {
    if (!this.editMode || index >= this.videoTracks.length - 1) return;
    [this.videoTracks[index], this.videoTracks[index + 1]] = [
      this.videoTracks[index + 1],
      this.videoTracks[index],
    ];
    this.refreshZIndexes();
  }

  private refreshZIndexes() {
    this.videoTracks.forEach((t, i) => {
      t.zIndex = 100 + (this.videoTracks.length - i);
      t.element.style.zIndex = t.zIndex.toString();
    });
  }

  maximizeTrack(track: StreamTrackView) {
    const stage = this.getStageElement();
    if (!stage) return;
    track.x = 0;
    track.y = 0;
    track.width = stage.offsetWidth;
    track.height = stage.offsetHeight;
    this.cdr.detectChanges();
  }

  minimizeTrack(track: StreamTrackView) {
    track.width = 300;
    track.height = 300 / track.aspectRatio;
    track.x = 20;
    track.y = 20;
    this.cdr.detectChanges();
  }

  isTrackMaximized(track: StreamTrackView): boolean {
    const stage = this.getStageElement();
    if (!stage) return false;
    return (
      track.width >= stage.offsetWidth * 0.9 &&
      track.height >= stage.offsetHeight * 0.9
    );
  }

  startDrag(event: PointerEvent, track: StreamTrackView) {
    if (!this.editMode || !track.isVideo) return;
    if ((event.target as HTMLElement).classList.contains('resize-handle'))
      return;
    this.activeDragTrack = track;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.initialX = track.x;
    this.initialY = track.y;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  startResize(event: PointerEvent, track: StreamTrackView) {
    if (!this.editMode || !track.isVideo) return;
    this.activeResizeTrack = track;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.initialW = track.width;
    this.initialH = track.height;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent) {
    const stage = this.getStageElement();
    if (!stage) return;
    const rect = stage.getBoundingClientRect();

    if (this.activeDragTrack) {
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      this.activeDragTrack.x = Math.max(
        0,
        Math.min(this.initialX + dx, rect.width - this.activeDragTrack.width),
      );
      this.activeDragTrack.y = Math.max(
        0,
        Math.min(this.initialY + dy, rect.height - this.activeDragTrack.height),
      );
      this.cdr.detectChanges();
    } else if (this.activeResizeTrack) {
      const dx = event.clientX - this.dragStartX;
      let newW = Math.max(
        150,
        Math.min(
          this.initialW + dx,
          rect.width - this.activeResizeTrack.x,
          rect.width * this.MAX_WIDTH_RATIO,
        ),
      );
      let newH = newW / this.activeResizeTrack.aspectRatio;
      this.activeResizeTrack.width = newW;
      this.activeResizeTrack.height = newH;
      this.cdr.detectChanges();
    }
  }

  @HostListener('window:pointerup', ['$event'])
  onPointerUp(_event: PointerEvent) {
    this.activeDragTrack = null;
    this.activeResizeTrack = null;
  }

  resetLayout() {
    const stage = this.getStageElement();
    if (!stage) return;
    const stageW = stage.offsetWidth;

    this.videoTracks.forEach((track, i) => {
      track.visible = true;
      track.element.style.display = 'block';
      if (i === 0) {
        track.width = stageW;
        track.height = stageW / track.aspectRatio;
        track.x = 0;
        track.y = 0;
      } else {
        track.width = 300;
        track.height = 300 / track.aspectRatio;
        track.x = 20;
        track.y = 20 + (i - 1) * (track.height + 10);
      }
    });
    this.refreshZIndexes();
    this.cdr.detectChanges();
  }

  setAudioVolume(track: StreamTrackView, event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    track.volume = val;
    if (!this.audioUnlocked) {
      this.unlockAudio();
    }
    this.engine.setVolume(track.id, val);
  }

  async toggleFullscreen() {
    const el = this.playerRoot?.nativeElement;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (err) {
      console.error('[FOV] Fullscreen error:', err);
    }
  }

  toggleFullscreenAudioPanel() {
    this.fullscreenAudioPanelOpen = !this.fullscreenAudioPanelOpen;
  }

  saveLayout() {
    const stage = this.getStageElement();
    if (!stage) return;
    const stageW = stage.offsetWidth || 1;
    const stageH = stage.offsetHeight || 1;

    const tracksData: SavedTrackLayout[] = this.tracks.map((t, i) => ({
      trackName: t.name,
      nx: t.x / stageW,
      ny: t.y / stageH,
      nw: t.width / stageW,
      nh: t.height / stageH,
      volume: t.volume,
      visible: t.visible,
      zIndex: t.zIndex,
      orderIndex: i,
    }));

    const layout: SavedLayout = {
      streamId: this.streamId,
      savedAt: Date.now(),
      tracks: tracksData,
    };

    try {
      localStorage.setItem(this.layoutStorageKey, JSON.stringify(layout));
      this.layoutSaved = true;
      if (this.savedLayoutTimeout) clearTimeout(this.savedLayoutTimeout);
      this.savedLayoutTimeout = setTimeout(() => {
        this.layoutSaved = false;
      }, 2500);
    } catch (e) {
      console.error('Failed to save layout:', e);
    }
    this.editMode = false;
    this.cdr.detectChanges();
  }

  private applyStoredLayoutIfAvailable() {
    try {
      const raw = localStorage.getItem(this.layoutStorageKey);
      if (!raw) return;
      const layout: SavedLayout = JSON.parse(raw);
      if (layout.streamId !== this.streamId) return;

      const stage = this.getStageElement();
      if (!stage) return;
      const stageW = stage.offsetWidth;
      const stageH = stage.offsetHeight;

      layout.tracks.forEach((saved) => {
        const track = this.tracks.find((t) => t.name === saved.trackName);
        if (track) {
          track.x = saved.nx * stageW;
          track.y = saved.ny * stageH;
          track.width = saved.nw * stageW;
          track.height = saved.nh * stageH;
          track.volume = saved.volume;
          track.visible = saved.visible;
          track.zIndex = saved.zIndex;
          track.element.style.display = track.visible ? 'block' : 'none';
        }
      });
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Failed to restore layout:', e);
    }
  }

  private adaptTracksToViewport() {
    const stage = this.getStageElement();
    if (!stage || this.tracks.length === 0) return;
    if (window.innerWidth <= this.MOBILE_BREAKPOINT) {
      this.resetLayout();
    }
  }

  refreshStream() {
    this.engine.disconnect();
    this.tracks = [];
    this.isLoading = true;
    this.isBufferingPhase = true;
    this.errorMessage = '';
    this.playbackStarted = false;
    this.cdr.detectChanges();
    this.engine.connect(this.streamId);
  }
}
