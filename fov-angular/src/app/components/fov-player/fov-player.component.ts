import { Component, Input, OnInit, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import Hls from 'hls.js';
import { environment } from '../../../environments/environment';

export interface Track {
  index: number;
  name: string;
  videoUrl: string;
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
}

interface ApiTracksResponse {
  tracks: Track[];
  videoCount: number;
}

@Component({
  selector: 'app-fov-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fov-player.component.html',
  styleUrls: ['./fov-player.component.scss']
})
export class FovPlayerComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input() streamId: string = '';  // ID du stream (optionnel, pour plus tard)
  @Input() useLocalFiles: boolean = false;  // Mode local pour les tests
  @Input() localBaseUrl: string = 'assets/hls_out/';
  @Input() localTracks: Track[] = [];

  videoWrappers: VideoWrapper[] = [];
  availableTracks: Track[] = [];
  editMode = false;
  isLoading = true;
  errorMessage = '';

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

  private masterPlayerId: string | null = null;
  private syncInterval: any = null;
  private trackIdCounter = 0;
  private originalTrackOrder: string[] = [];
  private readonly SYNC_THRESHOLD = 0.15;
  private readonly MAX_WIDTH_RATIO = 0.8;
  private readonly API_URL = environment.apiUrl;

  readonly playerId = `fov_${Math.random().toString(36).substr(2, 9)}`;

  constructor(private http: HttpClient) {}

  ngOnInit() {}

  ngAfterViewInit() {
    setTimeout(() => {
      this.loadTracks();
    }, 100);
  }

  ngOnDestroy() {
    this.stopSyncMonitoring();
    this.videoWrappers.forEach(w => w.hls?.destroy());
  }

  private loadTracks() {
    this.isLoading = true;
    this.errorMessage = '';

    if (this.useLocalFiles) {
      // Mode local pour les tests
      this.availableTracks = this.localTracks.length > 0 
        ? this.localTracks 
        : [
            { index: 0, name: 'first', videoUrl: 'first.m3u8' },
            { index: 1, name: 'second', videoUrl: 'second.m3u8' }
          ];
      this.initializeAllTracks();
      this.isLoading = false;
    } else {
      // Mode API
      this.http.get<ApiTracksResponse>(`${this.API_URL}/streams/available`).subscribe({
        next: (response) => {
          if (response.tracks && response.tracks.length > 0) {
            this.availableTracks = response.tracks;
            this.initializeAllTracks();
          } else {
            this.errorMessage = 'Aucun flux disponible';
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Erreur chargement des tracks:', err);
          this.errorMessage = 'Impossible de charger les flux. Le stream est-il actif ?';
          this.isLoading = false;
        }
      });
    }
  }

  private initializeAllTracks() {
    this.originalTrackOrder = this.availableTracks.map(t => t.name);
    
    this.availableTracks.forEach((track, index) => {
      setTimeout(() => {
        this.addTrack(track);
      }, index * 100);
    });
  }

  private getStageElement(): HTMLElement | null {
    return document.getElementById(`stageArea_${this.playerId}`);
  }

  private addTrack(track: Track) {
    const uniqueId = this.trackIdCounter++;
    const trackCopy: Track = { 
      ...track, 
      index: uniqueId, 
      name: `${track.name}` 
    };

    const stage = this.getStageElement();
    const stageW = stage ? stage.offsetWidth : 800;
    const stageH = stage ? stage.offsetHeight : 450;
    const isFirst = this.videoWrappers.length === 0;

    const initialWidth = isFirst ? stageW : 300;
    const initialAspectRatio = 16 / 9;

    const newWrapper: VideoWrapper = {
      playerId: `player_${this.playerId}_${trackCopy.index}`,
      track: trackCopy,
      x: isFirst ? 0 : 20,
      y: isFirst ? 0 : 20 + (this.videoWrappers.length - 1) * 20,
      width: initialWidth,
      height: initialWidth / initialAspectRatio,
      hls: null,
      videoElement: null,
      visible: true,
      zIndex: 100,
      volume: 1,
      aspectRatio: initialAspectRatio
    };

    this.videoWrappers.push(newWrapper);

    setTimeout(() => this.initHlsForWrapper(newWrapper, track.videoUrl), 50);
    setTimeout(() => this.refreshLayoutState(), 50);
  }

  removeTrack(wrapper: VideoWrapper) {
    if (!this.editMode) return;
    if (this.videoWrappers.length <= 1) return;

    const wasMaster = (wrapper.playerId === this.masterPlayerId);

    if (wrapper.hls) wrapper.hls.destroy();
    this.videoWrappers = this.videoWrappers.filter(w => w !== wrapper);
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
          this.syncAllToMaster();
        }
      }
    }, 50);
  }

  private initHlsForWrapper(wrapper: VideoWrapper, videoUrl: string) {
    const videoEl = document.getElementById(`videoElement_${this.playerId}_${wrapper.track.index}`) as HTMLVideoElement;
    if (!videoEl) return;

    wrapper.videoElement = videoEl;

    const isMaster = this.videoWrappers[0] === wrapper;

    videoEl.onloadedmetadata = () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        wrapper.aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
        wrapper.height = wrapper.width / wrapper.aspectRatio;

        const stage = this.getStageElement();
        if (stage) {
          const maxWidth = stage.offsetWidth * this.MAX_WIDTH_RATIO;
          const maxHeight = stage.offsetHeight * this.MAX_WIDTH_RATIO;

          if (wrapper.width > maxWidth) {
            wrapper.width = maxWidth;
            wrapper.height = wrapper.width / wrapper.aspectRatio;
          }

          if (wrapper.height > maxHeight) {
            wrapper.height = maxHeight;
            wrapper.width = wrapper.height * wrapper.aspectRatio;
          }
        }
      }
    };

    videoEl.volume = wrapper.volume;
    videoEl.muted = (wrapper.volume === 0);

    // Construire l'URL complète
    const fullUrl = this.useLocalFiles 
      ? this.localBaseUrl + videoUrl 
      : videoUrl;

    if (Hls.isSupported()) {
      const hls = new Hls({ 
        enableWorker: true, 
        lowLatencyMode: true,  // Mode basse latence pour le live
        liveSyncDuration: 3,
        liveMaxLatencyDuration: 10
      });
      wrapper.hls = hls;
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.error('Erreur réseau HLS, tentative de reconnexion...');
            hls.startLoad();
          } else {
            hls.recoverMediaError();
          }
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Auto-play quand le manifest est chargé (mode live)
        videoEl.play().catch(err => {
          console.warn('Autoplay bloqué:', err);
        });
      });

      hls.loadSource(fullUrl);
      hls.attachMedia(videoEl);
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = fullUrl;
      videoEl.play().catch(() => {});
    }

    if (isMaster) {
      this.masterPlayerId = wrapper.playerId;
      this.setupMasterListeners();
    }

    // Démarrer la synchronisation
    this.startSyncMonitoring();
  }

  startDrag(event: PointerEvent, wrapper: VideoWrapper) {
    if (!this.editMode) return;
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
    if (!this.editMode) return;

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

      let newX = this.initialX + dx;
      let newY = this.initialY + dy;

      const maxX = stageRect.width - this.activeDragWrapper.width;
      const maxY = stageRect.height - this.activeDragWrapper.height;

      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      this.activeDragWrapper.x = newX;
      this.activeDragWrapper.y = newY;

    } else if (this.activeResizeWrapper) {
      const dx = event.clientX - this.dragStartX;
      const ratio = this.activeResizeWrapper.aspectRatio;

      let newW = Math.max(150, this.initialW + dx);

      const maxW = stageRect.width - this.activeResizeWrapper.x;
      newW = Math.min(newW, maxW);

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
  onPointerUp(event: PointerEvent) {
    if (this.activeDragWrapper || this.activeResizeWrapper) {
      this.activeDragWrapper = null;
      this.activeResizeWrapper = null;
    }
  }

  private refreshLayoutState() {
    this.videoWrappers.forEach((w, i) => {
      w.zIndex = 100 + (this.videoWrappers.length - i);
    });
  }

  resetLayout() {
  const stage = this.getStageElement();
  const stageW = stage ? stage.offsetWidth : 800;
  const stageH = stage ? stage.offsetHeight : 450;

  // Réordonner les wrappers selon l'ordre original
  this.videoWrappers.sort((a, b) => {
    const indexA = this.originalTrackOrder.indexOf(a.track.name.split('_')[0]);
    const indexB = this.originalTrackOrder.indexOf(b.track.name.split('_')[0]);
    return indexA - indexB;
  });

  // Appliquer les positions et tailles
  this.videoWrappers.forEach((w, i) => {
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
      for (let j = 1; j < i; j++) {
        yOffset += this.videoWrappers[j].height + 10;
      }
      w.y = yOffset;
    }
    w.visible = true;
  });

  // Rafraîchir les z-index
  this.refreshLayoutState();
  this.updateMasterReference();
}

  moveUp(index: number) {
    if (!this.editMode || index <= 0) return;
    [this.videoWrappers[index], this.videoWrappers[index - 1]] =
    [this.videoWrappers[index - 1], this.videoWrappers[index]];

    this.refreshLayoutState();
    this.updateMasterReference();
  }

  moveDown(index: number) {
    if (!this.editMode || index >= this.videoWrappers.length - 1) return;
    [this.videoWrappers[index], this.videoWrappers[index + 1]] =
    [this.videoWrappers[index + 1], this.videoWrappers[index]];

    this.refreshLayoutState();
    this.updateMasterReference();
  }

  private updateMasterReference() {
    if (this.videoWrappers.length > 0) {
      const newMaster = this.videoWrappers[0];
      const wasDifferentMaster = this.masterPlayerId !== newMaster.playerId;

      this.masterPlayerId = newMaster.playerId;
      this.setupMasterListeners();

      if (wasDifferentMaster) {
        this.syncStats.clear();
        this.maxDrift = 0;
        this.syncAllToMaster();
      }
    }
  }

  private setupMasterListeners() {
    if (this.videoWrappers.length === 0) return;
    const masterWrapper = this.videoWrappers[0];
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

  private syncAllToMaster() {
    if (this.videoWrappers.length === 0) return;
    const master = this.videoWrappers[0];
    if (!master.videoElement) return;

    const masterTime = master.videoElement.currentTime;
    this.maxDrift = 0;

    this.videoWrappers.forEach((w, i) => {
      if (i === 0 || !w.videoElement) return;

      const drift = w.videoElement.currentTime - masterTime;
      const absDrift = Math.abs(drift);

      this.syncStats.set(w.track.name, drift * 1000);
      if (absDrift > this.maxDrift) this.maxDrift = absDrift;

      if (absDrift > this.SYNC_THRESHOLD) {
        w.videoElement.currentTime = masterTime;
      }
    });
  }

  startSyncMonitoring() {
    this.stopSyncMonitoring();
    this.syncInterval = setInterval(() => this.syncAllToMaster(), 500);
  }

  stopSyncMonitoring() {
    if (this.syncInterval) clearInterval(this.syncInterval);
  }

  toggleVisibility(wrapper: VideoWrapper) {
    if (this.editMode) wrapper.visible = !wrapper.visible;
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
  }

  setVolume(wrapper: VideoWrapper, event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    wrapper.volume = val;
    if (wrapper.videoElement) {
      wrapper.videoElement.volume = val;
      wrapper.videoElement.muted = (val === 0);
    }
  }

  getSyncStatus(): string {
    return this.maxDrift < 0.2 ? '✅ Synced' : '⚠️ Syncing...';
  }

  getMaxDriftMs(): number {
    return Math.round(this.maxDrift * 1000);
  }

  getSyncStatsArray() {
    return Array.from(this.syncStats.entries()).map(([name, drift]) => ({ name, drift }));
  }

  refreshStream() {
    // Recharger les tracks depuis l'API
    this.videoWrappers.forEach(w => w.hls?.destroy());
    this.videoWrappers = [];
    this.loadTracks();
  }
}
