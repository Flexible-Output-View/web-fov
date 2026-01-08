import { Component, Input, OnInit, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import Hls from 'hls.js';

export interface Track {
  index: number;
  name: string;
  videoUrl: string;
  hasAudio: boolean;
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

@Component({
  selector: 'app-fov-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fov-player.component.html',
  styleUrls: ['./fov-player.component.scss']
})
export class FovPlayerComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input() availableTracks: Track[] = [];
  @Input() baseUrl: string = 'assets/hls_out/';
  @Input() autoPlay: boolean = false;
  @Input() initialTrack: string = '';

  videoWrappers: VideoWrapper[] = [];
  editMode = false;
  isPlaying = false;
  currentTime = 0;
  duration = 0;

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
  private readonly SYNC_THRESHOLD = 0.15;
  private readonly MAX_WIDTH_RATIO = 0.8;

  // ID unique pour ce player (permet plusieurs players sur la même page)
  readonly playerId = `fov_${Math.random().toString(36).substr(2, 9)}`;

  ngOnInit() {}

  ngAfterViewInit() {
    if (this.initialTrack) {
      setTimeout(() => {
        this.addTrack(this.initialTrack);
      }, 100);
    }
  }

  ngOnDestroy() {
    this.stopSyncMonitoring();
    this.videoWrappers.forEach(w => w.hls?.destroy());
  }

  private getStageElement(): HTMLElement | null {
    return document.getElementById(`stageArea_${this.playerId}`);
  }

  addTrack(templateName: string) {
    const template = this.availableTracks.find(t => t.name === templateName);
    if (!template) return;

    const uniqueId = this.trackIdCounter++;
    const track: Track = { ...template, index: uniqueId, name: `${template.name}_${uniqueId}` };

    const stage = this.getStageElement();
    const stageW = stage ? stage.offsetWidth : 800;
    const stageH = stage ? stage.offsetHeight : 450;
    const isFirst = this.videoWrappers.length === 0;

    const initialWidth = isFirst ? stageW : 300;
    const initialAspectRatio = 16 / 9;

    const newWrapper: VideoWrapper = {
      playerId: `player_${this.playerId}_${track.name}`,
      track,
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

    setTimeout(() => this.initHlsForWrapper(newWrapper), 50);
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

  private initHlsForWrapper(wrapper: VideoWrapper) {
    const videoEl = document.getElementById(`videoElement_${this.playerId}_${wrapper.track.index}`) as HTMLVideoElement;
    if (!videoEl) return;

    wrapper.videoElement = videoEl;

    const isMaster = this.videoWrappers[0] === wrapper;

    videoEl.onloadedmetadata = () => {
      if (isMaster) {
        this.duration = videoEl.duration;
      }

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

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      wrapper.hls = hls;
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) data.type === Hls.ErrorTypes.NETWORK_ERROR ? hls.startLoad() : hls.recoverMediaError();
      });
      hls.loadSource(this.baseUrl + wrapper.track.videoUrl);
      hls.attachMedia(videoEl);
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = this.baseUrl + wrapper.track.videoUrl;
    }

    if (isMaster) {
      this.masterPlayerId = wrapper.playerId;
      this.setupMasterListeners();
    }

    if (this.isPlaying || this.autoPlay) {
      videoEl.play().catch(() => {});
    }
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

  playAll() {
    this.syncAllToMaster();
    this.startSyncMonitoring();
    this.isPlaying = true;
    this.videoWrappers.forEach(w => w.videoElement?.play().catch(() => {}));
  }

  pauseAll() {
    this.stopSyncMonitoring();
    this.isPlaying = false;
    this.videoWrappers.forEach(w => w.videoElement?.pause());
  }

  private setupMasterListeners() {
    if (this.videoWrappers.length === 0) return;
    const masterWrapper = this.videoWrappers[0];
    const videoEl = masterWrapper.videoElement;
    if (!videoEl) return;

    videoEl.ontimeupdate = () => this.currentTime = videoEl.currentTime;

    videoEl.onloadedmetadata = () => {
      this.duration = videoEl.duration;

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

    videoEl.onplay = () => this.isPlaying = true;
    videoEl.onpause = () => this.isPlaying = false;
    videoEl.onseeked = () => this.syncAllToMaster();
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

  onSeek(event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.videoWrappers.forEach(w => {
      if (w.videoElement) w.videoElement.currentTime = val;
    });
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

  formatTime(s: number) {
    if (!s) return '00:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}
