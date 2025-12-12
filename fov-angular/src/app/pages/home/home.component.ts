import { Component, OnInit, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeaturedCarouselComponent } from '../../components/featured-carousel/featured-carousel.component';
import { CategoryCardComponent, Category } from '../../components/category-card/category-card.component';
import { StreamCardComponent, Stream } from '../../components/stream-card/stream-card.component';
import { StreamService } from '../../services/stream-service.service';
import Hls from 'hls.js';

interface Track {
  index: number;
  name: string;
  videoUrl: string;
  hasAudio: boolean;
}

interface VideoWrapper {
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
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FeaturedCarouselComponent, CategoryCardComponent, StreamCardComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {

  availableTracks: Track[] = [
    { index: 0, name: 'second', videoUrl: 'second.m3u8', hasAudio: true },
    { index: 1, name: 'first', videoUrl: 'first.m3u8', hasAudio: true }
  ];

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
  private readonly BASE_URL = 'assets/hls_out/';
  private readonly SYNC_THRESHOLD = 0.15;

  popularCategories: Category[] = [];
  recommendedStreams: Stream[] = [];

  constructor(private streamService: StreamService) {}

  ngOnInit() {
    this.popularCategories = this.streamService.getPopularCategories().slice(0, 5);
    this.recommendedStreams = this.streamService.getRecommendedStreams();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.addTrack('first');
    }, 100);
  }

  ngOnDestroy() {
    this.stopSyncMonitoring();
    this.videoWrappers.forEach(w => w.hls?.destroy());
  }

  addTrack(templateName: string) {
    const template = this.availableTracks.find(t => t.name === templateName);
    if (!template) return;

    const uniqueId = this.trackIdCounter++;
    const track: Track = { ...template, index: uniqueId, name: `${template.name}_${uniqueId}` };
    
    const stage = document.getElementById('stageArea');
    const stageW = stage ? stage.offsetWidth : 800;
    const stageH = stage ? stage.offsetHeight : 450;
    const isFirst = this.videoWrappers.length === 0;

    const newWrapper: VideoWrapper = {
      playerId: `player_${track.name}`,
      track,
      x: isFirst ? 0 : 20,
      y: isFirst ? 0 : 20 + (this.videoWrappers.length - 1) * 20,
      width: isFirst ? stageW : 300,
      height: isFirst ? stageH : 169,
      hls: null,
      videoElement: null,
      visible: true,
      zIndex: 100,
      volume: 1
    };

    this.videoWrappers.push(newWrapper);
    
    setTimeout(() => this.initHlsForWrapper(newWrapper), 50);
    setTimeout(() => this.refreshLayoutState(), 50);
  }

  removeTrack(wrapper: VideoWrapper) {
    if (!this.editMode) return;
    if (this.videoWrappers.length <= 1) return;

    const wasmaster = (wrapper.playerId === this.masterPlayerId);

    if (wrapper.hls) wrapper.hls.destroy();
    this.videoWrappers = this.videoWrappers.filter(w => w !== wrapper);
    this.syncStats.delete(wrapper.track.name);

    setTimeout(() => {
      this.refreshLayoutState();

      if (this.videoWrappers.length > 0) {
        const newMaster = this.videoWrappers[0];
        this.masterPlayerId = newMaster.playerId;
        this.setupMasterListeners();

        if (wasmaster) {
          this.syncStats.clear();
          this.maxDrift = 0;
          this.syncAllToMaster();
        }
      }
    }, 50);
  }

  private initHlsForWrapper(wrapper: VideoWrapper) {
    const videoEl = document.getElementById(`videoElement_${wrapper.track.index}`) as HTMLVideoElement;
    if (!videoEl) return;

    wrapper.videoElement = videoEl;
    videoEl.volume = wrapper.volume;
    videoEl.muted = (wrapper.volume === 0);

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      wrapper.hls = hls;
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) data.type === Hls.ErrorTypes.NETWORK_ERROR ? hls.startLoad() : hls.recoverMediaError();
      });
      hls.loadSource(this.BASE_URL + wrapper.track.videoUrl);
      hls.attachMedia(videoEl);
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = this.BASE_URL + wrapper.track.videoUrl;
    }

    if (this.videoWrappers[0] === wrapper) {
      this.masterPlayerId = wrapper.playerId;
      this.setupMasterListeners();
    }

    if (this.isPlaying) videoEl.play().catch(() => {});
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
    this.initialW = wrapper.width;
    this.initialH = wrapper.height;
    
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent) {
    const stage = document.getElementById('stageArea');
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
      let newW = Math.max(150, this.initialW + dx);

      const maxW = stageRect.width - this.activeResizeWrapper.x;
      newW = Math.min(newW, maxW);

      const newH = newW / (16 / 9);

      const maxH = stageRect.height - this.activeResizeWrapper.y;
      if (newH > maxH) {
        const adjustedH = maxH;
        newW = adjustedH * (16 / 9);
      }

      this.activeResizeWrapper.width = newW;
      this.activeResizeWrapper.height = newW / (16 / 9);
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
    const stage = document.getElementById('stageArea');
    const stageW = stage ? stage.offsetWidth : 800;
    const stageH = stage ? stage.offsetHeight : 450;

    this.videoWrappers.forEach((w, i) => {
      if (i === 0) {
        w.x = 0; w.y = 0; w.width = stageW; w.height = stageH;
      } else {
        w.x = 20; w.y = 20 + (i - 1) * 190; w.width = 300; w.height = 169;
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

  async playAll() {
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
    const videoEl = this.videoWrappers[0].videoElement;
    if (!videoEl) return;

    videoEl.ontimeupdate = () => this.currentTime = videoEl.currentTime;
    videoEl.onloadedmetadata = () => this.duration = videoEl.duration;
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

  stopSyncMonitoring() { if (this.syncInterval) clearInterval(this.syncInterval); }
  
  toggleVisibility(wrapper: VideoWrapper) { if (this.editMode) wrapper.visible = !wrapper.visible; }
  toggleEditMode() { this.editMode = !this.editMode; }
  onSeek(event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.videoWrappers.forEach(w => { if(w.videoElement) w.videoElement.currentTime = val; });
  }
  setVolume(wrapper: VideoWrapper, event: Event) {
    const val = parseFloat((event.target as HTMLInputElement).value);
    wrapper.volume = val;
    if (wrapper.videoElement) {
      wrapper.videoElement.volume = val;
      wrapper.videoElement.muted = (val === 0);
    }
  }
  getSyncStatus(): string { return this.maxDrift < 0.2 ? '✅ Synced' : '⚠️ Syncing...'; }
  getMaxDriftMs(): number { return Math.round(this.maxDrift * 1000); }
  getSyncStatsArray() { return Array.from(this.syncStats.entries()).map(([name, drift]) => ({ name, drift })); }
  formatTime(s: number) { 
    if(!s) return '00:00';
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return `${m}:${sec.toString().padStart(2,'0')}`;
  }
}
