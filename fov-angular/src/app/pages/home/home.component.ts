import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  element: HTMLElement | null;
  videoElement: HTMLVideoElement | null;
  hls: Hls | null;
  visible: boolean;
  zIndex: number;
  volume: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {

  tracks: Track[] = [
  { index: 0, name: 'second', videoUrl: 'second.m3u8', hasAudio: true },
  { index: 1, name: 'first', videoUrl: 'first.m3u8', hasAudio: true }
];

  videoWrappers: VideoWrapper[] = [];
  
  editMode = false;
  isPlaying = false;
  currentTime = 0;
  duration = 0;
  
  private masterPlayerId: string | null = null;
  private syncInterval: any = null;
  private cleanupFns: (() => void)[] = [];
  
  private readonly SYNC_THRESHOLD = 0.15;
  private readonly BASE_URL = 'assets/hls_out/';

  ngOnInit() {}

  ngAfterViewInit() {
    setTimeout(() => {
      this.initAllPlayers();
    }, 100);
  }

  ngOnDestroy() {
    this.stopSyncMonitoring();
    this.videoWrappers.forEach(w => {
      if (w.hls) w.hls.destroy();
    });
    this.cleanupFns.forEach(fn => fn());
  }

  private initAllPlayers() {
    this.tracks.forEach((track, index) => {
      const videoEl = document.getElementById(`videoElement${index}`) as HTMLVideoElement;
      const wrapperEl = document.getElementById(`videoWrapper${index}`) as HTMLElement;
      
      if (!videoEl || !wrapperEl) {
        console.warn(`Elements not found for track ${index}`);
        return;
      }

      const playerId = `player_${track.name}`;
      let hls: Hls | null = null;

      videoEl.playsInline = true;
      videoEl.controls = false;
      videoEl.muted = true;
      videoEl.volume = 1;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 30,
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error(`[${track.name}] HLS Error:`, data);
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls?.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls?.recoverMediaError();
            }
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log(`[${track.name}] Ready`);
        });

        hls.loadSource(this.BASE_URL + track.videoUrl);
        hls.attachMedia(videoEl);
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = this.BASE_URL + track.videoUrl;
      }

      const wrapper: VideoWrapper = {
        playerId,
        track,
        element: wrapperEl,
        videoElement: videoEl,
        hls,
        visible: true,
        zIndex: 100 - index,
        volume: 1
      };

      this.videoWrappers.push(wrapper);

      if (index === 0) {
        this.masterPlayerId = playerId;
        this.setupMasterListeners(videoEl);
      }

      this.applyInitialLayout(wrapperEl, index);
    });

    setTimeout(() => {
      this.setupDraggableResizable();
      this.updateZIndexes();
    }, 50);
  }

  private setupMasterListeners(videoEl: HTMLVideoElement) {
    videoEl.addEventListener('timeupdate', () => {
      this.currentTime = videoEl.currentTime;
    });

    videoEl.addEventListener('loadedmetadata', () => {
      this.duration = videoEl.duration;
    });

    videoEl.addEventListener('play', () => {
      this.isPlaying = true;
    });

    videoEl.addEventListener('pause', () => {
      this.isPlaying = false;
    });

    videoEl.addEventListener('seeked', () => {
      this.syncAllToMaster();
    });
  }

  private applyInitialLayout(wrapper: HTMLElement, index: number) {
  if (index === 0) {
    // Premier dans la liste = PIP (petit, au premier plan)
    wrapper.style.top = '20px';
    wrapper.style.left = '20px';
    wrapper.style.width = '300px';
    wrapper.style.height = '169px';
  } else {
    // Les autres = fond (plein écran, arrière-plan)
    wrapper.style.top = '0px';
    wrapper.style.left = '0px';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
  }
}

  async playAll() {
    this.syncAllToMaster();
    this.startSyncMonitoring();

    for (const wrapper of this.videoWrappers) {
      if (wrapper.videoElement) {
        try {
          await wrapper.videoElement.play();
          wrapper.videoElement.muted = false;
          wrapper.videoElement.volume = wrapper.volume;
          console.log(`[${wrapper.track.name}] Playing`);
        } catch (e) {
          console.warn(`[${wrapper.track.name}] Play failed:`, e);
        }
      }
    }
  }

  pauseAll() {
    this.stopSyncMonitoring();
    this.videoWrappers.forEach(w => {
      if (w.videoElement) w.videoElement.pause();
    });
  }

  onSeek(event: Event) {
    const input = event.target as HTMLInputElement;
    const time = parseFloat(input.value);
    
    this.videoWrappers.forEach(w => {
      if (w.videoElement) {
        w.videoElement.currentTime = time;
      }
    });
  }

  private syncAllToMaster() {
    const master = this.videoWrappers.find(w => w.playerId === this.masterPlayerId);
    if (!master?.videoElement) return;

    const masterTime = master.videoElement.currentTime;

    this.videoWrappers.forEach(w => {
      if (w.playerId === this.masterPlayerId) return;
      if (!w.videoElement) return;

      const diff = Math.abs(w.videoElement.currentTime - masterTime);
      if (diff > this.SYNC_THRESHOLD) {
        console.log(`[${w.track.name}] Resync: diff=${diff.toFixed(3)}s`);
        w.videoElement.currentTime = masterTime;
      }
    });
  }

  private startSyncMonitoring() {
    this.stopSyncMonitoring();
    this.syncInterval = setInterval(() => {
      this.syncAllToMaster();
    }, 1000);
  }

  private stopSyncMonitoring() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  setVolume(playerId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const volume = parseFloat(input.value);
    
    const wrapper = this.videoWrappers.find(w => w.playerId === playerId);
    if (wrapper) {
      wrapper.volume = volume;
      if (wrapper.videoElement) {
        wrapper.videoElement.volume = volume;
        wrapper.videoElement.muted = volume === 0;
      }
    }
  }

  getVolumePercent(playerId: string): string {
    const wrapper = this.videoWrappers.find(w => w.playerId === playerId);
    return Math.round((wrapper?.volume ?? 1) * 100) + '%';
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    
    this.videoWrappers.forEach(w => {
      if (!w.element) return;
      const handle = w.element.querySelector('.resize-handle') as HTMLElement;
      
      if (this.editMode) {
        w.element.classList.add('editable');
        if (handle) handle.style.display = 'block';
      } else {
        w.element.classList.remove('editable');
        if (handle) handle.style.display = 'none';
      }
    });
  }

  resetLayout() {
    // Réordonner les wrappers selon l'ordre original des tracks
    this.videoWrappers.sort((a, b) => a.track.index - b.track.index);
    
    // Réappliquer le layout ET les z-index
    this.videoWrappers.forEach((w, index) => {
      if (w.element) {
        this.applyInitialLayout(w.element, index);
        w.visible = true;
        w.element.style.display = 'flex';
      }
    });
    
    this.updateZIndexes();
  }

  toggleVisibility(wrapper: VideoWrapper) {
    // Bloquer si pas en mode edit
    if (!this.editMode) return;
    
    wrapper.visible = !wrapper.visible;
    if (wrapper.element) {
      wrapper.element.style.display = wrapper.visible ? 'flex' : 'none';
    }
  }

  moveUp(index: number) {
    // Bloquer si pas en mode edit
    if (!this.editMode) return;
    if (index <= 0) return;
    
    [this.videoWrappers[index], this.videoWrappers[index - 1]] = 
      [this.videoWrappers[index - 1], this.videoWrappers[index]];
    this.updateZIndexes();
  }

  moveDown(index: number) {
    // Bloquer si pas en mode edit
    if (!this.editMode) return;
    if (index >= this.videoWrappers.length - 1) return;
    
    [this.videoWrappers[index], this.videoWrappers[index + 1]] = 
      [this.videoWrappers[index + 1], this.videoWrappers[index]];
    this.updateZIndexes();
  }

  private updateZIndexes() {
    const total = this.videoWrappers.length;
    this.videoWrappers.forEach((w, index) => {
      // Premier dans la liste (index 0) = z-index le plus haut (au premier plan)
      // Dernier dans la liste = z-index le plus bas (en arrière-plan)
      w.zIndex = 100 + (total - index);
      if (w.element) {
        w.element.style.zIndex = w.zIndex.toString();
      }
    });
  }

  private setupDraggableResizable() {
    this.videoWrappers.forEach(w => {
      if (w.element) {
        this.makeDraggable(w.element);
        this.makeResizable(w.element);
      }
    });
  }

  private makeDraggable(element: HTMLElement) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    const down = (ev: PointerEvent) => {
      if (!this.editMode) return;
      if ((ev.target as HTMLElement).classList.contains('resize-handle')) return;
      
      isDragging = true;
      element.setPointerCapture(ev.pointerId);
      startX = ev.clientX;
      startY = ev.clientY;
      initialLeft = element.offsetLeft;
      initialTop = element.offsetTop;
      element.style.cursor = 'grabbing';
      ev.preventDefault();
    };

    const move = (ev: PointerEvent) => {
      if (!isDragging) return;
      element.style.left = `${initialLeft + ev.clientX - startX}px`;
      element.style.top = `${initialTop + ev.clientY - startY}px`;
    };

    const up = (ev: PointerEvent) => {
      if (isDragging) {
        isDragging = false;
        try { element.releasePointerCapture(ev.pointerId); } catch(e) {}
        element.style.cursor = 'default';
      }
    };

    element.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);

    this.cleanupFns.push(() => {
      element.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    });
  }

  private makeResizable(element: HTMLElement) {
    const handle = element.querySelector('.resize-handle') as HTMLElement;
    if (!handle) return;
    
    let isResizing = false;
    let startX = 0, startW = 0;
    const aspect = 16 / 9;

    const down = (ev: PointerEvent) => {
      if (!this.editMode) return;
      isResizing = true;
      element.setPointerCapture(ev.pointerId);
      startX = ev.clientX;
      startW = element.getBoundingClientRect().width;
      ev.stopPropagation();
      ev.preventDefault();
    };

    const move = (ev: PointerEvent) => {
      if (!isResizing) return;
      const newW = Math.max(150, startW + ev.clientX - startX);
      element.style.width = `${newW}px`;
      element.style.height = `${newW / aspect}px`;
    };

    const up = (ev: PointerEvent) => {
      if (isResizing) {
        isResizing = false;
        try { element.releasePointerCapture(ev.pointerId); } catch(e) {}
      }
    };

    handle.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);

    this.cleanupFns.push(() => {
      handle.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    });
  }

  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
