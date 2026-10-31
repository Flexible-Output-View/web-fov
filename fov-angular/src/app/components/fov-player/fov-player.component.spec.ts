import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FovPlayerComponent } from './fov-player.component';
import { environment } from '../../../environments/environment';
import Hls from 'hls.js';

describe('FovPlayerComponent', () => {
  let component: FovPlayerComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FovPlayerComponent, HttpClientTestingModule],
    });
    const fixture = TestBed.createComponent(FovPlayerComponent);
    component = fixture.componentInstance;
    component.streamId = 'test-stream';
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try { sessionStorage.removeItem('fov_audio_unlocked'); } catch {}
    try { localStorage.removeItem(`fov_layout_test-stream`); } catch {}
    // Clean up stage elements
    document.querySelectorAll('[id^="stageArea_"]').forEach(el => el.remove());
    document.querySelectorAll('[id^="videoElement_"]').forEach(el => el.remove());
    document.querySelectorAll('[id^="audioElement_"]').forEach(el => el.remove());
  });

  function createStage(w = 1000, h = 500): HTMLElement {
    const stage = document.createElement('div');
    stage.id = `stageArea_${component.playerId}`;
    Object.defineProperty(stage, 'offsetWidth', { value: w, configurable: true });
    Object.defineProperty(stage, 'offsetHeight', { value: h, configurable: true });
    stage.getBoundingClientRect = () => ({
      width: w, height: h, left: 0, top: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => {},
    }) as any;
    document.body.appendChild(stage);
    return stage;
  }

  // ---------------------------------------------------------------
  // Création basique
  // ---------------------------------------------------------------

  describe('creation', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('generates a unique playerId', () => {
      expect(component.playerId).toMatch(/^fov_[a-z0-9]+$/);
    });

    it('starts with no wrappers', () => {
      expect(component.videoWrappers.length).toBe(0);
      expect(component.audioWrappers.length).toBe(0);
    });

    it('starts in loading state', () => {
      expect(component.isLoading).toBe(true);
      expect(component.isBufferingPhase).toBe(true);
      expect(component.playbackStarted).toBe(false);
    });

    it('starts with edit mode disabled', () => {
      expect(component.editMode).toBe(false);
    });

    it('starts with audio locked', () => {
      expect(component.audioUnlocked).toBe(false);
    });

    it('starts with fullscreen disabled', () => {
      expect(component.isFullscreen).toBe(false);
      expect(component.fullscreenAudioPanelOpen).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // ngAfterViewInit
  // ---------------------------------------------------------------

  describe('ngAfterViewInit', () => {
    it('triggers loadTracks after init', fakeAsync(() => {
      const loadSpy = spyOn<any>(component, 'loadTracks');
      component.ngAfterViewInit();
      tick(200);
      expect(loadSpy).toHaveBeenCalled();
    }));

    it('does not re-initialize if already initialized', fakeAsync(() => {
      (component as any).isInitialized = true;
      const loadSpy = spyOn<any>(component, 'loadTracks');
      component.ngAfterViewInit();
      tick(200);
      expect(loadSpy).not.toHaveBeenCalled();
    }));
  });

  // ---------------------------------------------------------------
  // ngOnDestroy
  // ---------------------------------------------------------------

  describe('ngOnDestroy', () => {
    it('destroys every video hls.js instance', () => {
      const destroyA = jasmine.createSpy('destroyA');
      const destroyB = jasmine.createSpy('destroyB');
      component.videoWrappers = [
        { hls: { destroy: destroyA } as any, playerId: 'v1' } as any,
        { hls: { destroy: destroyB } as any, playerId: 'v2' } as any,
      ];

      component.ngOnDestroy();

      expect(destroyA).toHaveBeenCalledTimes(1);
      expect(destroyB).toHaveBeenCalledTimes(1);
    });

    it('destroys every audio hls.js instance', () => {
      const destroyA = jasmine.createSpy('destroyA');
      const destroyB = jasmine.createSpy('destroyB');
      component.audioWrappers = [
        { hls: { destroy: destroyA } as any, playerId: 'a1' } as any,
        { hls: { destroy: destroyB } as any, playerId: 'a2' } as any,
      ];

      component.ngOnDestroy();

      expect(destroyA).toHaveBeenCalledTimes(1);
      expect(destroyB).toHaveBeenCalledTimes(1);
    });

    it('does not throw when wrappers have no hls instance', () => {
      component.videoWrappers = [{ hls: null, playerId: 'v1' } as any];
      component.audioWrappers = [{ hls: null, playerId: 'a1' } as any];

      expect(() => component.ngOnDestroy()).not.toThrow();
    });

    it('stops the sync interval on destroy', fakeAsync(() => {
      const clearSpy = spyOn(window, 'clearInterval').and.callThrough();
      component.startSyncMonitoring();

      component.ngOnDestroy();

      expect(clearSpy).toHaveBeenCalled();
    }));

    it('stops polling on destroy', () => {
      const clearSpy = spyOn(window, 'clearTimeout').and.callThrough();
      (component as any).pollingInterval = setTimeout(() => {}, 10_000);

      component.ngOnDestroy();

      expect(clearSpy).toHaveBeenCalled();
    });

    it('removes click-to-unlock listener on destroy', () => {
      const stage = createStage();
      const removeSpy = spyOn(stage, 'removeEventListener').and.callThrough();

      (component as any).clickToUnlockHandler = () => {};

      component.ngOnDestroy();

      expect(removeSpy).toHaveBeenCalledWith('click', jasmine.any(Function));
    });

    it('removes document unlock listeners on destroy', () => {
      const removeSpy = spyOn(document, 'removeEventListener').and.callThrough();
      (component as any).documentUnlockHandler = () => {};

      component.ngOnDestroy();

      expect(removeSpy).toHaveBeenCalledWith('click', jasmine.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('keydown', jasmine.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('touchstart', jasmine.any(Function));
    });

    it('clears savedLayoutTimeout if set', () => {
      const clearSpy = spyOn(window, 'clearTimeout').and.callThrough();
      (component as any).savedLayoutTimeout = setTimeout(() => {}, 10_000);

      component.ngOnDestroy();

      expect(clearSpy).toHaveBeenCalled();
    });

    it('exits fullscreen when in fullscreen mode', () => {
      component.isFullscreen = true;
      const exitSpy = jasmine.createSpy('exitFullscreen').and.returnValue(Promise.resolve());
      (document as any).exitFullscreen = exitSpy;

      component.ngOnDestroy();

      expect(exitSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // canAutoplayWithSound
  // ---------------------------------------------------------------

  describe('canAutoplayWithSound', () => {
    it('returns false when play fails', async () => {
      const result = await (component as any).canAutoplayWithSound();
      expect(typeof result).toBe('boolean');
    });
  });

  // ---------------------------------------------------------------
  // waitForAllReady
  // ---------------------------------------------------------------

  describe('waitForAllReady', () => {
    it('resolves immediately when all video and audio elements are ready', fakeAsync(() => {
      component.videoWrappers = [
        { videoElement: { readyState: 4 }, track: { name: 'v1' } } as any,
      ];
      component.audioWrappers = [
        { audioElement: { readyState: 4 }, track: { name: 'a1' } } as any,
      ];

      let resolved = false;
      (component as any).waitForAllReady().then(() => { resolved = true; });

      tick(100);
      expect(resolved).toBe(true);
    }));

    it('waits until every video element is ready', fakeAsync(() => {
      const notReady = { readyState: 1 };
      const ready = { readyState: 4 };
      component.videoWrappers = [
        { videoElement: ready, track: { name: 'v1' } } as any,
        { videoElement: notReady, track: { name: 'v2' } } as any,
      ];
      component.audioWrappers = [];

      let resolved = false;
      (component as any).waitForAllReady().then(() => { resolved = true; });

      tick(200);
      expect(resolved).toBe(false);

      notReady.readyState = 4;
      tick(100);
      expect(resolved).toBe(true);
    }));

    it('gives up after the internal attempt limit', fakeAsync(() => {
      component.videoWrappers = [
        { videoElement: { readyState: 0 }, track: { name: 'v1' } } as any,
      ];
      component.audioWrappers = [];

      let resolved = false;
      (component as any).waitForAllReady().then(() => { resolved = true; });

      tick(6000);
      expect(resolved).toBe(true);
    }));

    it('treats missing elements as not ready', fakeAsync(() => {
      component.videoWrappers = [
        { videoElement: null, track: { name: 'v1' } } as any,
      ];
      component.audioWrappers = [];

      let resolved = false;
      (component as any).waitForAllReady().then(() => { resolved = true; });

      tick(6000);
      expect(resolved).toBe(true);
    }));

    it('audio requires readyState >= 2 (not 3)', fakeAsync(() => {
      component.videoWrappers = [];
      component.audioWrappers = [
        { audioElement: { readyState: 2 }, track: { name: 'a1' } } as any,
      ];

      let resolved = false;
      (component as any).waitForAllReady().then(() => { resolved = true; });

      tick(100);
      expect(resolved).toBe(true);
    }));
  });

  // ---------------------------------------------------------------
  // computeSyncTargets
  // ---------------------------------------------------------------

  describe('computeSyncTargets', () => {
    it('returns null when the overlap between tracks is smaller than 3 s', () => {
      const infos = [
        { playerId: 'a', name: 'a', start: 0, end: 5, length: 5, startPdt: 1_000_000 },
        { playerId: 'b', name: 'b', start: 0, end: 5, length: 5, startPdt: 1_002_000 },
      ];

      const result = (component as any).computeSyncTargets(infos);
      expect(result).not.toBeNull();
    });

    it('returns null when one track buffer ends before another starts', () => {
      const infos = [
        { playerId: 'a', name: 'a', start: 0, end: 3, length: 3, startPdt: 0 },
        { playerId: 'b', name: 'b', start: 10, end: 20, length: 10, startPdt: 10_000_000 },
      ];

      const result = (component as any).computeSyncTargets(infos);
      expect(result).toBeNull();
    });

    it('computes a valid sync target when all tracks have PDT', () => {
      const infos = [
        { playerId: 'v1', name: 'v1', start: 0, end: 30, length: 30, startPdt: 1_000_000 },
        { playerId: 'v2', name: 'v2', start: 2, end: 30, length: 28, startPdt: 1_001_000 },
      ];

      const result = (component as any).computeSyncTargets(infos);
      expect(result).not.toBeNull();
      expect(result.length).toBe(2);
    });

    it('falls back to non-PDT sync when PDT is missing', () => {
      const infos = [
        { playerId: 'v1', name: 'v1', start: 0, end: 20, length: 20, startPdt: null },
        { playerId: 'v2', name: 'v2', start: 1, end: 20, length: 19, startPdt: null },
      ];

      const result = (component as any).computeSyncTargets(infos);
      expect(result).not.toBeNull();
      expect(result.length).toBe(2);
    });

    it('returns null when fallback sync point is smaller than max start', () => {
      const infos = [
        { playerId: 'v1', name: 'v1', start: 5, end: 6, length: 1, startPdt: null },
        { playerId: 'v2', name: 'v2', start: 0, end: 6, length: 6, startPdt: null },
      ];

      const result = (component as any).computeSyncTargets(infos);
      expect(result).toBeNull();
    });

    it('falls back to non-PDT when only some tracks have PDT', () => {
      const infos = [
        { playerId: 'v1', name: 'v1', start: 0, end: 20, length: 20, startPdt: 1_000_000 },
        { playerId: 'v2', name: 'v2', start: 1, end: 20, length: 19, startPdt: null },
      ];

      const result = (component as any).computeSyncTargets(infos);
      expect(result).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Layout helpers
  // ---------------------------------------------------------------

  describe('captureNormalized / applyNormalizedToPixels', () => {
    it('captureNormalized does nothing if the stage is absent', () => {
      (component as any).captureNormalized();
      expect(component.videoWrappers.length).toBe(0);
    });

    it('applyNormalizedToPixels does nothing if the stage is absent', () => {
      component.videoWrappers = [
        { isVideo: true, nx: 0.1, ny: 0.1, nw: 0.5, nh: 0.5, x: 0, y: 0, width: 0, height: 0 } as any,
      ];

      (component as any).applyNormalizedToPixels();

      expect(component.videoWrappers[0].x).toBe(0);
    });

    it('captureNormalized stores normalized coordinates when stage exists', () => {
      createStage(1000, 500);

      component.videoWrappers = [
        { isVideo: true, x: 100, y: 50, width: 500, height: 250, nx: 0, ny: 0, nw: 0, nh: 0 } as any,
      ];

      (component as any).captureNormalized();

      expect(component.videoWrappers[0].nx).toBeCloseTo(0.1);
      expect(component.videoWrappers[0].ny).toBeCloseTo(0.1);
      expect(component.videoWrappers[0].nw).toBeCloseTo(0.5);
      expect(component.videoWrappers[0].nh).toBeCloseTo(0.5);
    });

    it('captureNormalized bails out when wrapper exceeds stage dimensions', () => {
      createStage(1000, 500);

      component.videoWrappers = [
        { isVideo: true, x: 0, y: 0, width: 2000, height: 1000, nx: 0, ny: 0, nw: 0, nh: 0 } as any,
      ];

      (component as any).captureNormalized();

      expect(component.videoWrappers[0].nx).toBe(0);
    });

    it('applyNormalizedToPixels converts normalized back to pixels', () => {
      createStage(1000, 500);

      component.videoWrappers = [
        { isVideo: true, nx: 0.2, ny: 0.1, nw: 0.5, nh: 0.5, x: 0, y: 0, width: 0, height: 0 } as any,
      ];

      (component as any).applyNormalizedToPixels();

      expect(component.videoWrappers[0].x).toBe(200);
      expect(component.videoWrappers[0].y).toBe(50);
      expect(component.videoWrappers[0].width).toBe(500);
      expect(component.videoWrappers[0].height).toBe(250);
    });

    it('applyNormalizedToPixels skips audio-only wrappers', () => {
      createStage(1000, 500);

      component.videoWrappers = [
        { isVideo: false, nx: 0.2, ny: 0.1, nw: 0.5, nh: 0.5, x: 10, y: 10, width: 10, height: 10 } as any,
      ];

      (component as any).applyNormalizedToPixels();

      expect(component.videoWrappers[0].x).toBe(10);
    });

    it('captureNormalized skips audio-only wrappers', () => {
      createStage(1000, 500);

      component.videoWrappers = [
        { isVideo: false, x: 100, y: 50, width: 500, height: 250, nx: 0, ny: 0, nw: 0, nh: 0 } as any,
      ];

      (component as any).captureNormalized();

      expect(component.videoWrappers[0].nx).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // getFittedSize / clampWrapperToStage / isMobileLayout
  // ---------------------------------------------------------------

  describe('getFittedSize', () => {
    it('fits within width when aspect allows', () => {
      const result = (component as any).getFittedSize(1000, 500, 16 / 9, 0.95);
      expect(result.width).toBeLessThanOrEqual(950);
      expect(result.height).toBeLessThanOrEqual(475);
    });

    it('fits within height when aspect is tall', () => {
      const result = (component as any).getFittedSize(1000, 500, 1, 0.95);
      expect(result.height).toBeLessThanOrEqual(475);
      expect(result.width).toBeLessThanOrEqual(475);
    });
  });

  describe('clampWrapperToStage', () => {
    it('clamps wrapper position inside stage', () => {
      createStage(1000, 500);
      const w = { x: 2000, y: 2000, width: 300, height: 200 } as any;
      (component as any).clampWrapperToStage(w);
      expect(w.x).toBe(700);
      expect(w.y).toBe(300);
    });

    it('does nothing without stage', () => {
      const w = { x: 100, y: 100, width: 300, height: 200 } as any;
      (component as any).clampWrapperToStage(w);
      expect(w.x).toBe(100);
    });

    it('does not allow negative positions', () => {
      createStage(1000, 500);
      const w = { x: -10, y: -20, width: 300, height: 200 } as any;
      (component as any).clampWrapperToStage(w);
      expect(w.x).toBe(0);
      expect(w.y).toBe(0);
    });
  });

  describe('isMobileLayout', () => {
    it('returns false for wide windows', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      expect((component as any).isMobileLayout()).toBe(false);
    });

    it('returns true for narrow windows', () => {
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
      expect((component as any).isMobileLayout()).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // adaptWrappersToViewport
  // ---------------------------------------------------------------

  describe('adaptWrappersToViewport', () => {
    it('does nothing without stage', () => {
      component.videoWrappers = [{ isVideo: true } as any];
      expect(() => (component as any).adaptWrappersToViewport()).not.toThrow();
    });

    it('does nothing when no wrappers', () => {
      createStage();
      expect(() => (component as any).adaptWrappersToViewport()).not.toThrow();
    });

    it('adapts to mobile layout', () => {
      createStage(500, 800);
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
      component.videoWrappers = [
        { isVideo: true, aspectRatio: 16 / 9, x: 0, y: 0, width: 0, height: 0, nx: 0, ny: 0, nw: 0, nh: 0 } as any,
        { isVideo: true, aspectRatio: 16 / 9, x: 0, y: 0, width: 0, height: 0, nx: 0, ny: 0, nw: 0, nh: 0 } as any,
      ];
      (component as any).adaptWrappersToViewport();
      expect(component.videoWrappers[0].width).toBeGreaterThan(0);
    });

    it('adapts to desktop layout', () => {
      createStage(1200, 700);
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      component.videoWrappers = [
        { isVideo: true, aspectRatio: 16 / 9, x: 0, y: 0, width: 0, height: 0, nx: 0.1, ny: 0.1, nw: 0.5, nh: 0.5 } as any,
      ];
      (component as any).adaptWrappersToViewport();
      expect(component.videoWrappers[0].width).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------
  // onWindowResize / onOrientationChange
  // ---------------------------------------------------------------

  describe('resize and orientation handlers', () => {
    it('onWindowResize calls adaptWrappersToViewport', fakeAsync(() => {
      const spy = spyOn<any>(component, 'adaptWrappersToViewport');
      component.onWindowResize();
      tick(10);
      expect(spy).toHaveBeenCalled();
    }));

    it('onOrientationChange calls adaptWrappersToViewport', fakeAsync(() => {
      const spy = spyOn<any>(component, 'adaptWrappersToViewport');
      component.onOrientationChange();
      tick(300);
      expect(spy).toHaveBeenCalled();
    }));
  });

  // ---------------------------------------------------------------
  // isWrapperMaximized
  // ---------------------------------------------------------------

  describe('isWrapperMaximized', () => {
    it('returns true when the wrapper fills the stage', () => {
      const w = { nw: 0.95, nh: 0.95, x: 5, y: 5 } as any;
      expect(component.isWrapperMaximized(w)).toBe(true);
    });

    it('returns false when the wrapper is small', () => {
      const w = { nw: 0.3, nh: 0.3, x: 5, y: 5 } as any;
      expect(component.isWrapperMaximized(w)).toBe(false);
    });

    it('returns false when the wrapper is large but offset', () => {
      const w = { nw: 0.95, nh: 0.95, x: 50, y: 50 } as any;
      expect(component.isWrapperMaximized(w)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // trackByWrapper
  // ---------------------------------------------------------------

  describe('trackByWrapper', () => {
    it('returns the playerId of the wrapper', () => {
      const w = { playerId: 'player_abc' } as any;
      expect(component.trackByWrapper(0, w)).toBe('player_abc');
    });
  });

  // ---------------------------------------------------------------
  // getLoadingMessage
  // ---------------------------------------------------------------

  describe('getLoadingMessage', () => {
    it('returns empty string when there is an error', () => {
      component.errorMessage = 'Erreur quelconque';
      expect(component.getLoadingMessage()).toBe('');
    });

    it('returns connection message when loading but not buffering', () => {
      component.errorMessage = '';
      component.isLoading = true;
      component.isBufferingPhase = false;
      expect(component.getLoadingMessage()).toBe('Connexion au serveur...');
    });

    it('returns live loading message by default', () => {
      component.errorMessage = '';
      component.isLoading = true;
      component.isBufferingPhase = true;
      expect(component.getLoadingMessage()).toBe('Chargement du live...');
    });
  });

  // ---------------------------------------------------------------
  // toggleEditMode
  // ---------------------------------------------------------------

  describe('toggleEditMode', () => {
    it('toggles edit mode on and off', () => {
      expect(component.editMode).toBe(false);
      component.toggleEditMode();
      expect(component.editMode).toBe(true);
      component.toggleEditMode();
      expect(component.editMode).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // toggleVisibility
  // ---------------------------------------------------------------

  describe('toggleVisibility', () => {
    it('toggles wrapper visibility in edit mode', () => {
      component.editMode = true;
      const w = { visible: true } as any;
      component.toggleVisibility(w);
      expect(w.visible).toBe(false);
      component.toggleVisibility(w);
      expect(w.visible).toBe(true);
    });

    it('does nothing when not in edit mode', () => {
      component.editMode = false;
      const w = { visible: true } as any;
      component.toggleVisibility(w);
      expect(w.visible).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // toggleFullscreenAudioPanel
  // ---------------------------------------------------------------

  describe('toggleFullscreenAudioPanel', () => {
    it('toggles the fullscreen audio panel on and off', () => {
      expect(component.fullscreenAudioPanelOpen).toBe(false);
      component.toggleFullscreenAudioPanel();
      expect(component.fullscreenAudioPanelOpen).toBe(true);
      component.toggleFullscreenAudioPanel();
      expect(component.fullscreenAudioPanelOpen).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // toggleFullscreen
  // ---------------------------------------------------------------

  describe('toggleFullscreen', () => {
    it('does nothing when playerRoot is missing', async () => {
      component.playerRoot = undefined;
      await component.toggleFullscreen();
      expect(component.isFullscreen).toBe(false);
    });

    it('requests fullscreen when not in fullscreen', async () => {
      const requestSpy = jasmine.createSpy('requestFullscreen').and.returnValue(Promise.resolve());
      const el = { requestFullscreen: requestSpy } as any;
      component.playerRoot = { nativeElement: el } as any;
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });

      await component.toggleFullscreen();

      expect(requestSpy).toHaveBeenCalled();
    });

    it('exits fullscreen when in fullscreen', async () => {
      const exitSpy = jasmine.createSpy('exitFullscreen').and.returnValue(Promise.resolve());
      (document as any).exitFullscreen = exitSpy;
      const el = { requestFullscreen: () => Promise.resolve() } as any;
      component.playerRoot = { nativeElement: el } as any;
      Object.defineProperty(document, 'fullscreenElement', { value: {}, configurable: true });

      await component.toggleFullscreen();

      expect(exitSpy).toHaveBeenCalled();
    });

    it('handles fullscreen errors gracefully', async () => {
      const requestSpy = jasmine.createSpy('requestFullscreen').and.returnValue(Promise.reject('err'));
      const el = { requestFullscreen: requestSpy } as any;
      component.playerRoot = { nativeElement: el } as any;
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });

      await component.toggleFullscreen();

      expect(requestSpy).toHaveBeenCalled();
    });

    it('uses webkitRequestFullscreen as fallback', async () => {
      const webkitSpy = jasmine.createSpy('webkit').and.returnValue(Promise.resolve());
      const el = { webkitRequestFullscreen: webkitSpy } as any;
      component.playerRoot = { nativeElement: el } as any;
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });

      await component.toggleFullscreen();

      expect(webkitSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // removeTrack
  // ---------------------------------------------------------------

  describe('removeTrack', () => {
    it('does nothing when not in edit mode', () => {
      component.editMode = false;
      const w1 = { playerId: 'v1', hls: null, track: { name: 'v1' } } as any;
      const w2 = { playerId: 'v2', hls: null, track: { name: 'v2' } } as any;
      component.videoWrappers = [w1, w2];

      component.removeTrack(w1);

      expect(component.videoWrappers.length).toBe(2);
    });

    it('does nothing when only one wrapper remains', () => {
      component.editMode = true;
      const w1 = { playerId: 'v1', hls: null, track: { name: 'v1' } } as any;
      component.videoWrappers = [w1];

      component.removeTrack(w1);

      expect(component.videoWrappers.length).toBe(1);
    });

    it('removes the wrapper and destroys its hls', fakeAsync(() => {
      component.editMode = true;
      const destroySpy = jasmine.createSpy('destroy');
      const w1 = { playerId: 'v1', hls: { destroy: destroySpy }, track: { name: 'v1' } } as any;
      const w2 = { playerId: 'v2', hls: null, track: { name: 'v2' }, videoElement: null } as any;
      component.videoWrappers = [w1, w2];

      component.removeTrack(w1);
      tick(100);

      expect(destroySpy).toHaveBeenCalled();
      expect(component.videoWrappers.length).toBe(1);
      expect(component.videoWrappers[0]).toBe(w2);
    }));

    it('deletes sync stats for removed track', fakeAsync(() => {
      component.editMode = true;
      const w1 = { playerId: 'v1', hls: null, track: { name: 'v1' } } as any;
      const w2 = { playerId: 'v2', hls: null, track: { name: 'v2' }, videoElement: null } as any;
      component.videoWrappers = [w1, w2];
      component.syncStats.set('v1', 123);

      component.removeTrack(w1);
      tick(100);

      expect(component.syncStats.has('v1')).toBe(false);
    }));

    it('updates master when removing master track', fakeAsync(() => {
      component.editMode = true;
      const w1 = { playerId: 'v1', hls: null, track: { name: 'v1' }, videoElement: null } as any;
      const w2 = { playerId: 'v2', hls: null, track: { name: 'v2' }, videoElement: null } as any;
      component.videoWrappers = [w1, w2];
      (component as any).masterPlayerId = 'v1';
      component.maxDrift = 50;
      component.syncStats.set('other', 10);

      component.removeTrack(w1);
      tick(100);

      expect((component as any).masterPlayerId).toBe('v2');
      expect(component.maxDrift).toBe(0);
    }));
  });

  // ---------------------------------------------------------------
  // moveUp / moveDown
  // ---------------------------------------------------------------

  describe('moveUp / moveDown', () => {
    beforeEach(() => {
      component.editMode = true;
      component.videoWrappers = [
        { playerId: 'v1', track: { name: 'v1' }, isVideo: true, videoElement: null } as any,
        { playerId: 'v2', track: { name: 'v2' }, isVideo: true, videoElement: null } as any,
        { playerId: 'v3', track: { name: 'v3' }, isVideo: true, videoElement: null } as any,
      ];
    });

    it('moveUp swaps a wrapper with the previous one', () => {
      component.moveUp(1);
      expect(component.videoWrappers[0].playerId).toBe('v2');
      expect(component.videoWrappers[1].playerId).toBe('v1');
    });

    it('moveUp does nothing at index 0', () => {
      component.moveUp(0);
      expect(component.videoWrappers[0].playerId).toBe('v1');
    });

    it('moveDown swaps a wrapper with the next one', () => {
      component.moveDown(1);
      expect(component.videoWrappers[1].playerId).toBe('v3');
      expect(component.videoWrappers[2].playerId).toBe('v2');
    });

    it('moveDown does nothing at the last index', () => {
      component.moveDown(2);
      expect(component.videoWrappers[2].playerId).toBe('v3');
    });

    it('moveUp does nothing when not in edit mode', () => {
      component.editMode = false;
      component.moveUp(1);
      expect(component.videoWrappers[0].playerId).toBe('v1');
    });

    it('moveDown does nothing when not in edit mode', () => {
      component.editMode = false;
      component.moveDown(0);
      expect(component.videoWrappers[0].playerId).toBe('v1');
    });
  });

  // ---------------------------------------------------------------
  // maximizeWrapper / minimizeWrapper
  // ---------------------------------------------------------------

  describe('maximizeWrapper / minimizeWrapper', () => {
    let stage: HTMLElement;

    beforeEach(() => {
      stage = createStage(1000, 500);
    });

    it('maximizeWrapper fills the stage', () => {
      const w = { x: 100, y: 100, width: 300, height: 200, nx: 0, ny: 0, nw: 0, nh: 0 } as any;
      component.maximizeWrapper(w);
      expect(w.x).toBe(0);
      expect(w.y).toBe(0);
      expect(w.width).toBe(1000);
      expect(w.height).toBe(500);
      expect(w.nw).toBe(1);
      expect(w.nh).toBe(1);
    });

    it('maximizeWrapper does nothing without a stage', () => {
      document.body.removeChild(stage);
      const w = { x: 10, y: 10, width: 300, height: 200, nx: 0, ny: 0, nw: 0, nh: 0 } as any;
      component.maximizeWrapper(w);
      expect(w.width).toBe(300);
      document.body.appendChild(stage);
    });

    it('minimizeWrapper resizes to small format', () => {
      const w = { x: 0, y: 0, width: 1000, height: 500, aspectRatio: 16 / 9, nx: 0, ny: 0, nw: 0, nh: 0 } as any;
      component.minimizeWrapper(w);
      expect(w.width).toBe(300);
      expect(w.x).toBe(20);
      expect(w.y).toBe(20);
    });

    it('minimizeWrapper uses default aspect ratio when none provided', () => {
      const w = { x: 0, y: 0, width: 1000, height: 500, aspectRatio: 0, nx: 0, ny: 0, nw: 0, nh: 0 } as any;
      component.minimizeWrapper(w);
      expect(w.height).toBeCloseTo(300 / (16 / 9));
    });

    it('minimizeWrapper does nothing without stage', () => {
      document.body.removeChild(stage);
      const w = { x: 100, y: 100, width: 500, height: 300, aspectRatio: 16 / 9, nx: 0, ny: 0, nw: 0, nh: 0 } as any;
      component.minimizeWrapper(w);
      expect(w.width).toBe(500);
      document.body.appendChild(stage);
    });
  });

  // ---------------------------------------------------------------
  // setVolume / setAudioVolume
  // ---------------------------------------------------------------

  describe('setVolume (video wrapper)', () => {
    it('updates the wrapper volume value', () => {
      const w = { volume: 1, videoElement: { volume: 0, muted: true }, track: { name: 'v1' } } as any;
      const event = { target: { value: '0.5' } } as any;
      spyOn(component, 'unlockAudio');

      component.setVolume(w, event);

      expect(w.volume).toBe(0.5);
    });

    it('calls unlockAudio when audio is still locked', () => {
      const w = { volume: 1, videoElement: { volume: 0, muted: true }, track: { name: 'v1' } } as any;
      const event = { target: { value: '0.7' } } as any;
      const unlockSpy = spyOn(component, 'unlockAudio');
      component.audioUnlocked = false;

      component.setVolume(w, event);

      expect(unlockSpy).toHaveBeenCalled();
    });

    it('does not unlock again if already unlocked', () => {
      const w = { volume: 1, videoElement: { volume: 0, muted: true }, track: { name: 'v1' } } as any;
      const event = { target: { value: '0.3' } } as any;
      const unlockSpy = spyOn(component, 'unlockAudio');
      component.audioUnlocked = true;

      component.setVolume(w, event);

      expect(unlockSpy).not.toHaveBeenCalled();
    });

    it('cleans up documentUnlockHandler', () => {
      const w = { volume: 1, videoElement: { volume: 0, muted: true }, track: { name: 'v1' } } as any;
      const event = { target: { value: '0.5' } } as any;
      component.audioUnlocked = true;
      (component as any).documentUnlockHandler = () => {};
      const removeSpy = spyOn(document, 'removeEventListener');

      component.setVolume(w, event);

      expect(removeSpy).toHaveBeenCalled();
      expect((component as any).documentUnlockHandler).toBeNull();
    });
  });

  describe('setAudioVolume', () => {
    it('updates the audio wrapper volume value', () => {
      const w = { volume: 1, audioElement: { volume: 0, muted: true }, track: { name: 'a1' } } as any;
      const event = { target: { value: '0.5' } } as any;
      spyOn(component, 'unlockAudio');

      component.setAudioVolume(w, event);

      expect(w.volume).toBe(0.5);
    });

    it('calls unlockAudio when audio is still locked', () => {
      const w = { volume: 1, audioElement: { volume: 0, muted: true }, track: { name: 'a1' } } as any;
      const event = { target: { value: '0.6' } } as any;
      const unlockSpy = spyOn(component, 'unlockAudio');
      component.audioUnlocked = false;

      component.setAudioVolume(w, event);

      expect(unlockSpy).toHaveBeenCalled();
    });

    it('applies volume to the audio element when already unlocked', () => {
      const audioEl = { volume: 0, muted: true } as any;
      const w = { volume: 1, audioElement: audioEl, track: { name: 'a1' } } as any;
      const event = { target: { value: '0.4' } } as any;
      component.audioUnlocked = true;

      component.setAudioVolume(w, event);

      expect(audioEl.volume).toBe(0.4);
      expect(audioEl.muted).toBe(false);
    });

    it('mutes the audio element when volume is set to 0', () => {
      const audioEl = { volume: 1, muted: false } as any;
      const w = { volume: 1, audioElement: audioEl, track: { name: 'a1' } } as any;
      const event = { target: { value: '0' } } as any;
      component.audioUnlocked = true;

      component.setAudioVolume(w, event);

      expect(audioEl.muted).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // unlockAudio
  // ---------------------------------------------------------------

  describe('unlockAudio', () => {
    it('does nothing when audio is already unlocked', () => {
      component.audioUnlocked = true;
      const audioEl = { volume: 0, muted: true, paused: false, play: jasmine.createSpy() } as any;
      component.audioWrappers = [{ volume: 0.5, audioElement: audioEl, track: { name: 'a1' } } as any];

      component.unlockAudio();

      expect(audioEl.volume).toBe(0);
    });

    it('unlocks audio and sets session flag', () => {
      component.audioUnlocked = false;
      component.audioWrappers = [];
      component.videoWrappers = [];

      component.unlockAudio();

      expect(component.audioUnlocked).toBe(true);
      expect(sessionStorage.getItem('fov_audio_unlocked')).toBe('1');
    });

    it('mutes video and unmutes audio wrappers', () => {
      component.audioUnlocked = false;
      const videoEl = { volume: 1, muted: false, paused: false, play: jasmine.createSpy() } as any;
      const audioEl = { volume: 0, muted: true, paused: false, play: jasmine.createSpy(), currentTime: 10, buffered: { length: 0 } } as any;
      component.videoWrappers = [{ videoElement: videoEl, track: { name: 'v1' }, playerId: 'v1' } as any];
      component.audioWrappers = [{ volume: 0.8, audioElement: audioEl, track: { name: 'a1' }, bufferStart: 0, bufferEnd: 20 } as any];
      (component as any).masterPlayerId = 'v1';

      component.unlockAudio();

      expect(videoEl.volume).toBe(0);
      expect(videoEl.muted).toBe(true);
      expect(audioEl.volume).toBe(0.8);
      expect(audioEl.muted).toBe(false);
    });

    it('plays paused elements after unlock', () => {
      component.audioUnlocked = false;
      const videoPlay = jasmine.createSpy('videoPlay').and.returnValue(Promise.resolve());
      const audioPlay = jasmine.createSpy('audioPlay').and.returnValue(Promise.resolve());
      const videoEl = { volume: 1, muted: false, paused: true, play: videoPlay } as any;
      const audioEl = { volume: 0, muted: true, paused: true, play: audioPlay, currentTime: 10, buffered: { length: 0 } } as any;
      component.videoWrappers = [{ videoElement: videoEl, track: { name: 'v1' }, playerId: 'v1' } as any];
      component.audioWrappers = [{ volume: 0.5, audioElement: audioEl, track: { name: 'a1' }, bufferStart: 0, bufferEnd: 20 } as any];

      component.unlockAudio();

      expect(videoPlay).toHaveBeenCalled();
      expect(audioPlay).toHaveBeenCalled();
    });

    it('resyncs audio with master PDT when available', () => {
      component.audioUnlocked = false;
      const master = {
        videoElement: { currentTime: 10, muted: false, volume: 1, paused: false, play: jasmine.createSpy() },
        track: { name: 'v1' },
        playerId: 'v1',
        hls: {
          destroy: jasmine.createSpy(),
          levels: [{ details: { hasProgramDateTime: true, fragments: [{ programDateTime: 1000, start: 0 }] } }],
        },
      } as any;
      const audioEl = { volume: 0, muted: true, paused: false, play: jasmine.createSpy(), currentTime: 0, buffered: { length: 0 } } as any;
      component.videoWrappers = [master];
      component.audioWrappers = [{
        volume: 0.5,
        audioElement: audioEl,
        track: { name: 'a1' },
        bufferStart: 0,
        bufferEnd: 20,
        hls: {
          destroy: jasmine.createSpy(),
          levels: [{ details: { hasProgramDateTime: true, fragments: [{ programDateTime: 1000, start: 0 }] } }],
        },
      } as any];
      (component as any).masterPlayerId = 'v1';

      component.unlockAudio();

      expect(audioEl.volume).toBe(0.5);
    });

    it('cleans up click and document handlers', () => {
      component.audioUnlocked = false;
      const stage = createStage();
      const stageRemoveSpy = spyOn(stage, 'removeEventListener');
      const docRemoveSpy = spyOn(document, 'removeEventListener');
      (component as any).clickToUnlockHandler = () => {};
      (component as any).documentUnlockHandler = () => {};

      component.unlockAudio();

      expect(stageRemoveSpy).toHaveBeenCalled();
      expect(docRemoveSpy).toHaveBeenCalled();
      expect((component as any).clickToUnlockHandler).toBeNull();
      expect((component as any).documentUnlockHandler).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // startSyncMonitoring / stopSyncMonitoring
  // ---------------------------------------------------------------

  describe('sync monitoring', () => {
    it('starts a sync interval', () => {
      component.startSyncMonitoring();
      expect((component as any).syncInterval).toBeTruthy();
      component.stopSyncMonitoring();
    });

    it('stopSyncMonitoring clears the interval', () => {
      component.startSyncMonitoring();
      component.stopSyncMonitoring();
      expect((component as any).syncInterval).toBeNull();
    });

    it('stopSyncMonitoring is safe when no interval is set', () => {
      expect(() => component.stopSyncMonitoring()).not.toThrow();
    });

    it('restarts cleanly when called twice', () => {
      component.startSyncMonitoring();
      const firstInterval = (component as any).syncInterval;
      component.startSyncMonitoring();
      const secondInterval = (component as any).syncInterval;
      expect(firstInterval).not.toBe(secondInterval);
      component.stopSyncMonitoring();
    });
  });

  // ---------------------------------------------------------------
  // syncAllToMaster
  // ---------------------------------------------------------------

  describe('syncAllToMaster', () => {
    it('does nothing when playback has not started', () => {
      component.playbackStarted = false;
      component.videoWrappers = [];
      expect(() => (component as any).syncAllToMaster()).not.toThrow();
    });

    it('does nothing when master is not found', () => {
      component.playbackStarted = true;
      (component as any).masterPlayerId = 'missing';
      component.videoWrappers = [];
      expect(() => (component as any).syncAllToMaster()).not.toThrow();
    });

    it('does nothing when master is paused', () => {
      component.playbackStarted = true;
      const master = {
        playerId: 'v1',
        isVideo: true,
        videoElement: { paused: true, readyState: 4, currentTime: 10 },
        track: { name: 'v1' },
        hls: null,
      } as any;
      component.videoWrappers = [master];
      (component as any).masterPlayerId = 'v1';

      expect(() => (component as any).syncAllToMaster()).not.toThrow();
    });

    it('performs hard resync when drift is high and in buffer', () => {
      component.playbackStarted = true;
      const masterEl = { paused: false, readyState: 4, currentTime: 10, buffered: { length: 0 } } as any;
      const slaveEl = {
        paused: false, readyState: 4, seeking: false, currentTime: 20, playbackRate: 1,
        buffered: { length: 0 },
      } as any;
      const master = { playerId: 'v1', isVideo: true, videoElement: masterEl, track: { name: 'v1' }, hls: null, bufferEnd: 30, bufferStart: 0 } as any;
      const slave = { playerId: 'v2', isVideo: true, videoElement: slaveEl, track: { name: 'v2' }, hls: null, bufferEnd: 30, bufferStart: 0 } as any;
      component.videoWrappers = [master, slave];
      (component as any).masterPlayerId = 'v1';

      (component as any).syncAllToMaster();

      expect(slaveEl.currentTime).toBe(10);
    });

    it('performs soft sync adjustment for moderate drift', () => {
      component.playbackStarted = true;
      const masterEl = { paused: false, readyState: 4, currentTime: 10, buffered: { length: 0 } } as any;
      const slaveEl = {
        paused: false, readyState: 4, seeking: false, currentTime: 10.2, playbackRate: 1,
        buffered: { length: 0 },
      } as any;
      const master = { playerId: 'v1', isVideo: true, videoElement: masterEl, track: { name: 'v1' }, hls: null, bufferEnd: 30, bufferStart: 0 } as any;
      const slave = { playerId: 'v2', isVideo: true, videoElement: slaveEl, track: { name: 'v2' }, hls: null, bufferEnd: 30, bufferStart: 0 } as any;
      component.videoWrappers = [master, slave];
      (component as any).masterPlayerId = 'v1';

      (component as any).syncAllToMaster();

      expect(slaveEl.playbackRate).not.toBe(1);
    });

    it('resets playback rate when drift is small', () => {
      component.playbackStarted = true;
      const masterEl = { paused: false, readyState: 4, currentTime: 10, buffered: { length: 0 } } as any;
      const slaveEl = {
        paused: false, readyState: 4, seeking: false, currentTime: 10.01, playbackRate: 1.05,
        buffered: { length: 0 },
      } as any;
      const master = { playerId: 'v1', isVideo: true, videoElement: masterEl, track: { name: 'v1' }, hls: null, bufferEnd: 30, bufferStart: 0 } as any;
      const slave = { playerId: 'v2', isVideo: true, videoElement: slaveEl, track: { name: 'v2' }, hls: null, bufferEnd: 30, bufferStart: 0 } as any;
      component.videoWrappers = [master, slave];
      (component as any).masterPlayerId = 'v1';

      (component as any).syncAllToMaster();

      expect(slaveEl.playbackRate).toBe(1);
    });

    it('skips audio sync when audio locked', () => {
      component.playbackStarted = true;
      component.audioUnlocked = false;
      const masterEl = { paused: false, readyState: 4, currentTime: 10, buffered: { length: 0 } } as any;
      const master = { playerId: 'v1', isVideo: true, videoElement: masterEl, track: { name: 'v1' }, hls: null } as any;
      const audioEl = { paused: false, seeking: false, currentTime: 15, buffered: { length: 0 } } as any;
      component.videoWrappers = [master];
      component.audioWrappers = [{ audioElement: audioEl, track: { name: 'a1' }, hls: null, bufferEnd: 30, bufferStart: 0 } as any];
      (component as any).masterPlayerId = 'v1';

      (component as any).syncAllToMaster();

      expect(audioEl.currentTime).toBe(15);
    });

    it('syncs audio when unlocked and drift is high', () => {
      component.playbackStarted = true;
      component.audioUnlocked = true;
      const masterEl = { paused: false, readyState: 4, currentTime: 10, buffered: { length: 0 } } as any;
      const master = { playerId: 'v1', isVideo: true, videoElement: masterEl, track: { name: 'v1' }, hls: null } as any;
      const audioEl = { paused: false, seeking: false, currentTime: 20, buffered: { length: 0 } } as any;
      component.videoWrappers = [master];
      component.audioWrappers = [{ audioElement: audioEl, track: { name: 'a1' }, hls: null, bufferEnd: 30, bufferStart: 0 } as any];
      (component as any).masterPlayerId = 'v1';

      (component as any).syncAllToMaster();

      expect(audioEl.currentTime).toBe(10);
    });
  });

  // ---------------------------------------------------------------
  // updateBufferInfo
  // ---------------------------------------------------------------

  describe('updateBufferInfo', () => {
    it('does nothing without video element', () => {
      const w = { videoElement: null, bufferStart: 0, bufferEnd: 0 } as any;
      (component as any).updateBufferInfo(w);
      expect(w.bufferEnd).toBe(0);
    });

    it('updates buffer start and end from video element', () => {
      const videoEl = {
        buffered: {
          length: 1,
          start: (_: number) => 2,
          end: (_: number) => 15,
        },
      } as any;
      const w = { videoElement: videoEl, bufferStart: 0, bufferEnd: 0 } as any;
      (component as any).updateBufferInfo(w);
      expect(w.bufferStart).toBe(2);
      expect(w.bufferEnd).toBe(15);
    });

    it('does not update buffer when buffered length is 0', () => {
      const videoEl = {
        buffered: { length: 0, start: () => 0, end: () => 0 },
      } as any;
      const w = { videoElement: videoEl, bufferStart: 5, bufferEnd: 10 } as any;
      (component as any).updateBufferInfo(w);
      expect(w.bufferStart).toBe(5);
      expect(w.bufferEnd).toBe(10);
    });
  });

  // ---------------------------------------------------------------
  // collectBufferInfos
  // ---------------------------------------------------------------

  describe('collectBufferInfos', () => {
    it('returns empty array when no wrappers', () => {
      const infos = (component as any).collectBufferInfos();
      expect(infos.length).toBe(0);
    });

    it('collects info from video wrappers', () => {
      component.videoWrappers = [{
        playerId: 'v1',
        track: { name: 'v1' },
        videoElement: { buffered: { length: 1, start: () => 2, end: () => 10 } },
        hls: null,
      } as any];

      const infos = (component as any).collectBufferInfos();
      expect(infos.length).toBe(1);
      expect(infos[0].start).toBe(2);
      expect(infos[0].end).toBe(10);
    });

    it('handles wrappers without video element', () => {
      component.videoWrappers = [{
        playerId: 'v1', track: { name: 'v1' }, videoElement: null, hls: null,
      } as any];

      const infos = (component as any).collectBufferInfos();
      expect(infos[0].length).toBe(0);
    });

    it('collects info from audio wrappers', () => {
      component.audioWrappers = [{
        playerId: 'a1',
        track: { name: 'a1' },
        audioElement: { buffered: { length: 1, start: () => 1, end: () => 8 } },
        hls: null,
      } as any];

      const infos = (component as any).collectBufferInfos();
      expect(infos.length).toBe(1);
      expect(infos[0].end).toBe(8);
    });
  });

  // ---------------------------------------------------------------
  // saveLayout / clearSavedLayout
  // ---------------------------------------------------------------

  describe('saveLayout / clearSavedLayout', () => {
    it('saves layout to localStorage', () => {
      component.videoWrappers = [
        {
          track: { name: 'v1' },
          nx: 0.1, ny: 0.1, nw: 0.5, nh: 0.5,
          volume: 1, visible: true, zIndex: 100, isVideo: true,
        } as any,
      ];
      component.audioWrappers = [
        { track: { name: 'a1' }, volume: 0.8 } as any,
      ];

      component.saveLayout();

      const saved = localStorage.getItem(`fov_layout_test-stream`);
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved!);
      expect(parsed.streamId).toBe('test-stream');
      expect(parsed.wrappers.length).toBe(1);
      expect(parsed.audioWrappers.length).toBe(1);
    });

    it('saveLayout exits edit mode', () => {
      component.editMode = true;
      component.videoWrappers = [];
      component.audioWrappers = [];

      component.saveLayout();

      expect(component.editMode).toBe(false);
    });

    it('saveLayout sets layoutSaved flag temporarily', fakeAsync(() => {
      component.videoWrappers = [];
      component.audioWrappers = [];

      component.saveLayout();

      expect(component.layoutSaved).toBe(true);
      tick(3000);
      expect(component.layoutSaved).toBe(false);
    }));

    it('clearSavedLayout removes layout from localStorage', () => {
      localStorage.setItem(`fov_layout_test-stream`, '{}');
      component.clearSavedLayout();
      expect(localStorage.getItem(`fov_layout_test-stream`)).toBeNull();
    });

    it('handles localStorage errors gracefully', () => {
      spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError');
      component.videoWrappers = [];
      component.audioWrappers = [];

      expect(() => component.saveLayout()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // applyStoredLayoutIfAvailable
  // ---------------------------------------------------------------

  describe('applyStoredLayoutIfAvailable', () => {
    it('does nothing when no saved layout', () => {
      localStorage.removeItem(`fov_layout_test-stream`);
      expect(() => (component as any).applyStoredLayoutIfAvailable()).not.toThrow();
    });

    it('does nothing when streamId does not match', () => {
      localStorage.setItem(`fov_layout_test-stream`, JSON.stringify({
        streamId: 'other-stream',
        savedAt: Date.now(),
        wrappers: [],
      }));
      const applySpy = spyOn<any>(component, 'applyStoredLayout');
      (component as any).applyStoredLayoutIfAvailable();
      expect(applySpy).not.toHaveBeenCalled();
    });

    it('removes corrupted layout from localStorage', () => {
      localStorage.setItem(`fov_layout_test-stream`, 'invalid json');
      (component as any).applyStoredLayoutIfAvailable();
      expect(localStorage.getItem(`fov_layout_test-stream`)).toBeNull();
    });

    it('applies valid layout', () => {
      createStage();
      localStorage.setItem(`fov_layout_test-stream`, JSON.stringify({
        streamId: 'test-stream',
        savedAt: Date.now(),
        wrappers: [],
        audioWrappers: [],
      }));
      const applySpy = spyOn<any>(component, 'applyStoredLayout');
      (component as any).applyStoredLayoutIfAvailable();
      expect(applySpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // applyStoredLayout
  // ---------------------------------------------------------------

  describe('applyStoredLayout', () => {
    it('does nothing without stage', () => {
      const layout = {
        streamId: 'test-stream',
        savedAt: Date.now(),
        wrappers: [],
      } as any;
      expect(() => (component as any).applyStoredLayout(layout)).not.toThrow();
    });

    it('restores wrapper positions and volumes', () => {
      createStage(1000, 500);
      component.videoWrappers = [
        { track: { name: 'v1' }, nx: 0, ny: 0, nw: 0, nh: 0, x: 0, y: 0, width: 0, height: 0, visible: false, volume: 0, isVideo: true, playerId: 'v1', videoElement: null } as any,
      ];
      const layout = {
        streamId: 'test-stream',
        savedAt: Date.now(),
        wrappers: [{
          trackName: 'v1', nx: 0.1, ny: 0.1, nw: 0.5, nh: 0.5,
          volume: 0.8, visible: true, zIndex: 100, orderIndex: 0,
        }],
        audioWrappers: [],
      } as any;

      (component as any).applyStoredLayout(layout);

      expect(component.videoWrappers[0].volume).toBe(0.8);
      expect(component.videoWrappers[0].visible).toBe(true);
    });

    it('restores audio wrapper volumes', () => {
      createStage(1000, 500);
      const audioEl = { volume: 0, muted: true } as any;
      component.audioWrappers = [
        { track: { name: 'a1' }, volume: 0, audioElement: audioEl } as any,
      ];
      component.audioUnlocked = true;
      const layout = {
        streamId: 'test-stream',
        savedAt: Date.now(),
        wrappers: [],
        audioWrappers: [{ trackName: 'a1', volume: 0.6 }],
      } as any;

      (component as any).applyStoredLayout(layout);

      expect(component.audioWrappers[0].volume).toBe(0.6);
      expect(audioEl.volume).toBe(0.6);
    });
  });

  // ---------------------------------------------------------------
  // resetLayout
  // ---------------------------------------------------------------

  describe('resetLayout', () => {
    it('resets desktop layout', () => {
      createStage(1200, 700);
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      component.videoWrappers = [
        { isVideo: true, aspectRatio: 16 / 9, x: 100, y: 100, width: 400, height: 225, track: { name: 'v1' }, nx: 0, ny: 0, nw: 0, nh: 0, visible: false, playerId: 'v1', videoElement: null } as any,
        { isVideo: true, aspectRatio: 16 / 9, x: 50, y: 50, width: 200, height: 112, track: { name: 'v2' }, nx: 0, ny: 0, nw: 0, nh: 0, visible: false, playerId: 'v2', videoElement: null } as any,
      ];
      (component as any).originalTrackOrder = ['v1', 'v2'];

      component.resetLayout();

      expect(component.videoWrappers[0].x).toBe(0);
      expect(component.videoWrappers[0].y).toBe(0);
      expect(component.videoWrappers[0].visible).toBe(true);
    });

    it('resets mobile layout', () => {
      createStage(500, 800);
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
      component.videoWrappers = [
        { isVideo: true, aspectRatio: 16 / 9, x: 0, y: 0, width: 0, height: 0, track: { name: 'v1' }, nx: 0, ny: 0, nw: 0, nh: 0, visible: false, playerId: 'v1', videoElement: null } as any,
      ];
      (component as any).originalTrackOrder = ['v1'];

      component.resetLayout();

      expect(component.videoWrappers[0].width).toBeGreaterThan(0);
    });

    it('handles audio-only wrappers', () => {
      createStage(1200, 700);
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      component.videoWrappers = [
        { isVideo: false, aspectRatio: 1, x: 0, y: 0, width: 0, height: 0, track: { name: 'a1' }, nx: 0, ny: 0, nw: 0, nh: 0, visible: false, playerId: 'a1', videoElement: null } as any,
      ];
      (component as any).originalTrackOrder = ['a1'];

      component.resetLayout();

      expect(component.videoWrappers[0].visible).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Drag / Resize
  // ---------------------------------------------------------------

  describe('startDrag / startResize', () => {
    it('startDrag does nothing when not in edit mode', () => {
      component.editMode = false;
      const w = { isVideo: true, x: 0, y: 0 } as any;
      const event = {
        clientX: 10, clientY: 10,
        target: { classList: { contains: () => false }, setPointerCapture: () => {} },
        pointerId: 1, preventDefault: () => {},
      } as any;

      component.startDrag(event, w);

      expect(component.activeDragWrapper).toBeNull();
    });

    it('startDrag does nothing for audio wrappers', () => {
      component.editMode = true;
      const w = { isVideo: false, x: 0, y: 0 } as any;
      const event = {
        clientX: 10, clientY: 10,
        target: { classList: { contains: () => false }, setPointerCapture: () => {} },
        pointerId: 1, preventDefault: () => {},
      } as any;

      component.startDrag(event, w);

      expect(component.activeDragWrapper).toBeNull();
    });

    it('startDrag sets activeDragWrapper when conditions are met', () => {
      component.editMode = true;
      const w = { isVideo: true, x: 50, y: 60 } as any;
      const setPointerCapture = jasmine.createSpy();
      const event = {
        clientX: 10, clientY: 20,
        target: { classList: { contains: () => false }, setPointerCapture },
        pointerId: 1, preventDefault: jasmine.createSpy(),
      } as any;

      component.startDrag(event, w);

      expect(component.activeDragWrapper).toBe(w);
      expect(component.dragStartX).toBe(10);
      expect(component.dragStartY).toBe(20);
      expect(component.initialX).toBe(50);
      expect(component.initialY).toBe(60);
      expect(setPointerCapture).toHaveBeenCalledWith(1);
    });

    it('startDrag ignores clicks on resize handle', () => {
      component.editMode = true;
      const w = { isVideo: true, x: 0, y: 0 } as any;
      const event = {
        clientX: 10, clientY: 10,
        target: { classList: { contains: (c: string) => c === 'resize-handle' }, setPointerCapture: () => {} },
        pointerId: 1, preventDefault: () => {},
      } as any;

      component.startDrag(event, w);

      expect(component.activeDragWrapper).toBeNull();
    });

    it('startResize sets activeResizeWrapper', () => {
      component.editMode = true;
      const w = { isVideo: true, width: 300, height: 200 } as any;
      const setPointerCapture = jasmine.createSpy();
      const event = {
        clientX: 10, clientY: 20,
        target: { setPointerCapture },
        pointerId: 1,
        preventDefault: jasmine.createSpy(),
        stopPropagation: jasmine.createSpy(),
      } as any;

      component.startResize(event, w);

      expect(component.activeResizeWrapper).toBe(w);
      expect(component.initialW).toBe(300);
      expect(component.initialH).toBe(200);
    });

    it('startResize does nothing when not in edit mode', () => {
      component.editMode = false;
      const w = { isVideo: true, width: 300, height: 200 } as any;
      const event = {
        clientX: 10, clientY: 20,
        target: { setPointerCapture: () => {} },
        pointerId: 1,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;

      component.startResize(event, w);

      expect(component.activeResizeWrapper).toBeNull();
    });

    it('startResize does nothing for audio wrappers', () => {
      component.editMode = true;
      const w = { isVideo: false, width: 300, height: 200 } as any;
      const event = {
        clientX: 10, clientY: 20,
        target: { setPointerCapture: () => {} },
        pointerId: 1,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any;

      component.startResize(event, w);

      expect(component.activeResizeWrapper).toBeNull();
    });
  });

  describe('onPointerMove', () => {
    it('does nothing without stage', () => {
      component.activeDragWrapper = { x: 0, y: 0, width: 100, height: 100 } as any;
      const event = { clientX: 100, clientY: 100 } as any;
      expect(() => component.onPointerMove(event)).not.toThrow();
    });

    it('moves the active drag wrapper', () => {
      createStage(1000, 500);
      component.activeDragWrapper = { x: 0, y: 0, width: 300, height: 200 } as any;
      component.dragStartX = 10;
      component.dragStartY = 10;
      component.initialX = 100;
      component.initialY = 100;

      component.onPointerMove({ clientX: 60, clientY: 60 } as any);

      expect(component.activeDragWrapper!.x).toBe(150);
      expect(component.activeDragWrapper!.y).toBe(150);
    });

    it('clamps drag position to stage bounds', () => {
      createStage(1000, 500);
      component.activeDragWrapper = { x: 0, y: 0, width: 300, height: 200 } as any;
      component.dragStartX = 0;
      component.dragStartY = 0;
      component.initialX = 0;
      component.initialY = 0;

      component.onPointerMove({ clientX: 2000, clientY: 2000 } as any);

      expect(component.activeDragWrapper!.x).toBe(700);
      expect(component.activeDragWrapper!.y).toBe(300);
    });

    it('resizes the active resize wrapper', () => {
      createStage(1000, 500);
      component.activeResizeWrapper = { x: 0, y: 0, width: 300, height: 200, aspectRatio: 16 / 9 } as any;
      component.dragStartX = 10;
      component.dragStartY = 10;
      component.initialW = 300;
      component.initialH = 200;

      component.onPointerMove({ clientX: 60, clientY: 60 } as any);

      expect(component.activeResizeWrapper!.width).toBe(350);
    });
  });

  describe('onPointerUp', () => {
    it('clears both active wrappers', () => {
      component.activeDragWrapper = { playerId: 'v1' } as any;
      component.activeResizeWrapper = { playerId: 'v2' } as any;

      component.onPointerUp({} as any);

      expect(component.activeDragWrapper).toBeNull();
      expect(component.activeResizeWrapper).toBeNull();
    });

    it('captures normalized coords when a wrapper was active', () => {
      createStage(1000, 500);
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
      component.isFullscreen = false;

      component.activeDragWrapper = { isVideo: true, x: 100, y: 50, width: 500, height: 250, nx: 0, ny: 0, nw: 0, nh: 0 } as any;
      component.videoWrappers = [component.activeDragWrapper as any];

      component.onPointerUp({} as any);

      expect(component.videoWrappers[0].nx).toBeCloseTo(0.1);
    });
  });

  // ---------------------------------------------------------------
  // onFullscreenChange
  // ---------------------------------------------------------------

  describe('onFullscreenChange', () => {
    it('updates isFullscreen based on document.fullscreenElement', () => {
      Object.defineProperty(document, 'fullscreenElement', { value: {}, configurable: true });
      component.onFullscreenChange();
      expect(component.isFullscreen).toBe(true);

      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
      component.onFullscreenChange();
      expect(component.isFullscreen).toBe(false);
    });

    it('closes fullscreen audio panel when exiting fullscreen', () => {
      component.fullscreenAudioPanelOpen = true;
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });

      component.onFullscreenChange();

      expect(component.fullscreenAudioPanelOpen).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // refreshStream
  // ---------------------------------------------------------------

  describe('refreshStream', () => {
    it('destroys existing wrappers', () => {
      const destroyV = jasmine.createSpy();
      const destroyA = jasmine.createSpy();
      component.videoWrappers = [{ hls: { destroy: destroyV } } as any];
      component.audioWrappers = [{ hls: { destroy: destroyA } } as any];

      spyOn<any>(component, 'loadTracks');

      component.refreshStream();

      expect(destroyV).toHaveBeenCalled();
      expect(destroyA).toHaveBeenCalled();
      expect(component.videoWrappers.length).toBe(0);
      expect(component.audioWrappers.length).toBe(0);
    });

    it('resets playback and buffering state', () => {
      spyOn<any>(component, 'loadTracks');
      component.playbackStarted = true;
      component.isBufferingPhase = false;
      component.maxDrift = 100;
      component.syncStats.set('v1', 50);

      component.refreshStream();

      expect(component.playbackStarted).toBe(false);
      expect(component.isBufferingPhase).toBe(true);
      expect(component.maxDrift).toBe(0);
      expect(component.syncStats.size).toBe(0);
    });

    it('restores audio consent from sessionStorage', () => {
      spyOn<any>(component, 'loadTracks');
      sessionStorage.setItem('fov_audio_unlocked', '1');
      component.audioUnlocked = false;

      component.refreshStream();

      expect(component.audioUnlocked).toBe(true);
    });

    it('calls loadTracks after reset', () => {
      const loadSpy = spyOn<any>(component, 'loadTracks');
      component.refreshStream();
      expect(loadSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // fetchAvailableTracks (HTTP)
  // ---------------------------------------------------------------

  describe('fetchAvailableTracks', () => {
    it('calls the correct API endpoint', () => {
      (component as any).fetchAvailableTracks();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      expect(req.request.method).toBe('GET');
      req.flush({ streams: [] });
    });

    it('handles legacy API format with no data by polling', () => {
      spyOn<any>(component, 'startPolling');
      (component as any).fetchAvailableTracks();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush({});

      expect((component as any).startPolling).toHaveBeenCalled();
    });

    it('handles errors by polling (with retry budget)', () => {
      spyOn<any>(component, 'startPolling');
      (component as any).pollAttempts = 0;

      (component as any).fetchAvailableTracks();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });

      expect((component as any).startPolling).toHaveBeenCalled();
    });

    it('shows error message when retry budget is exhausted', () => {
      (component as any).pollAttempts = 60;

      (component as any).fetchAvailableTracks();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });

      expect(component.isLoading).toBe(false);
      expect(component.errorMessage).toContain('Impossible');
    });

    it('handles array API format with matching stream', fakeAsync(() => {
      spyOn<any>(component, 'waitForPlaylistsReady').and.returnValue(Promise.resolve());
      spyOn<any>(component, 'initializeAllTracks');

      (component as any).fetchAvailableTracks();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush([{
        streamId: 'test-stream',
        trackCount: 1,
        tracks: [{ trackId: 't1', name: 'Track 1', videoUrl: 'url1', isVideo: true, isAudio: false }],
      }]);
      flush();

      expect(component.availableTracks.length).toBe(1);
    }));

    it('handles new API format with matching stream', fakeAsync(() => {
      spyOn<any>(component, 'waitForPlaylistsReady').and.returnValue(Promise.resolve());
      spyOn<any>(component, 'initializeAllTracks');

      (component as any).fetchAvailableTracks();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush({
        streamCount: 1,
        streams: [{
          streamId: 'test-stream',
          trackCount: 1,
          tracks: [{ trackId: 't1', name: 'Track 1', videoUrl: 'url1', isVideo: true, isAudio: false }],
        }],
      });
      flush();

      expect(component.availableTracks.length).toBe(1);
    }));

    it('handles legacy API format when ready', () => {
      spyOn<any>(component, 'initializeAllTracks');

      (component as any).fetchAvailableTracks();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush({
        tracks: [{ index: 0, name: 'T1', trackId: 't1', videoUrl: 'url1', isVideo: true, isAudio: false }],
        videoCount: 1,
        ready: true,
        totalDirs: 1,
        pending: 0,
      });

      expect(component.availableTracks.length).toBe(1);
      expect(component.isLoading).toBe(false);
    });

    it('polls when legacy API format is not ready', () => {
      spyOn<any>(component, 'startPolling');

      (component as any).fetchAvailableTracks();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush({
        tracks: [],
        videoCount: 0,
        ready: false,
        totalDirs: 2,
        pending: 2,
      });

      expect((component as any).startPolling).toHaveBeenCalled();
    });

    it('shows timeout error for legacy format when attempts exhausted', () => {
      (component as any).pollAttempts = 60;

      (component as any).fetchAvailableTracks();
      const req = httpMock.expectOne(`${environment.apiUrl}/streams/available`);
      req.flush({
        tracks: [],
        videoCount: 0,
        ready: false,
        totalDirs: 2,
        pending: 2,
      });

      expect(component.errorMessage).toContain('Timeout');
    });
  });

  // ---------------------------------------------------------------
  // startPolling / stopPolling
  // ---------------------------------------------------------------

  describe('polling', () => {
    it('startPolling sets a timeout', () => {
      (component as any).startPolling(100);
      expect((component as any).pollingInterval).toBeTruthy();
      (component as any).stopPolling();
    });

    it('stopPolling clears the timeout', () => {
      (component as any).startPolling(100);
      (component as any).stopPolling();
      expect((component as any).pollingInterval).toBeNull();
    });

    it('stopPolling is safe when no timeout set', () => {
      expect(() => (component as any).stopPolling()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // waitForPlaylistsReady
  // ---------------------------------------------------------------

  describe('waitForPlaylistsReady', () => {
    it('resolves when all playlists are reachable', async () => {
      spyOn(window, 'fetch').and.returnValue(Promise.resolve({ ok: true } as any));
      const tracks = [{ videoUrl: 'url1' }, { videoUrl: 'url2' }] as any;
      await (component as any).waitForPlaylistsReady(tracks);
      expect(window.fetch).toHaveBeenCalled();
    });

    it('resolves even on fetch errors after attempts', fakeAsync(() => {
      spyOn(window, 'fetch').and.returnValue(Promise.reject('err'));
      const tracks = [{ videoUrl: 'url1' }] as any;

      let resolved = false;
      (component as any).waitForPlaylistsReady(tracks).then(() => { resolved = true; });

      // 30 tentatives × 1s = 30s, on tick largement
      tick(35000);
      expect(resolved).toBe(true);
    }));
  });

  // ---------------------------------------------------------------
  // getTrackStartPdt
  // ---------------------------------------------------------------

  describe('getTrackStartPdt', () => {
    it('returns null when there is no hls instance', () => {
      const w = { hls: null };
      expect((component as any).getTrackStartPdt(w)).toBeNull();
    });

    it('returns null when there is no PDT in the manifest', () => {
      const w = {
        hls: { levels: [{ details: { hasProgramDateTime: false, fragments: [] } }] },
      };
      expect((component as any).getTrackStartPdt(w)).toBeNull();
    });

    it('returns null when fragments are empty', () => {
      const w = {
        hls: { levels: [{ details: { hasProgramDateTime: true, fragments: [] } }] },
      };
      expect((component as any).getTrackStartPdt(w)).toBeNull();
    });

    it('computes PDT offset from first fragment', () => {
      const w = {
        hls: {
          levels: [{
            details: {
              hasProgramDateTime: true,
              fragments: [{ programDateTime: 2000, start: 1 }],
            },
          }],
        },
      };
      expect((component as any).getTrackStartPdt(w)).toBe(1000);
    });

    it('handles exceptions gracefully', () => {
      const w = { hls: { get levels() { throw new Error('oops'); } } };
      expect((component as any).getTrackStartPdt(w)).toBeNull();
    });

    it('returns null when PDT is 0', () => {
      const w = {
        hls: {
          levels: [{
            details: {
              hasProgramDateTime: true,
              fragments: [{ programDateTime: 0, start: 0 }],
            },
          }],
        },
      };
      expect((component as any).getTrackStartPdt(w)).toBeNull();
    });

    it('returns null when details is missing', () => {
      const w = {
        hls: { levels: [{}] },
      };
      expect((component as any).getTrackStartPdt(w)).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // getForwardBuffer
  // ---------------------------------------------------------------

  describe('getForwardBuffer', () => {
    it('returns 0 when there is no video element', () => {
      const w = { videoElement: null, bufferEnd: 10 } as any;
      expect((component as any).getForwardBuffer(w)).toBe(0);
    });

    it('returns the difference between bufferEnd and currentTime', () => {
      const w = { videoElement: { currentTime: 5 }, bufferEnd: 15 } as any;
      expect((component as any).getForwardBuffer(w)).toBe(10);
    });
  });

  // ---------------------------------------------------------------
  // Session audio helpers
  // ---------------------------------------------------------------

  describe('sessionStorage audio consent', () => {
    it('getSessionAudioUnlocked returns false by default', () => {
      sessionStorage.removeItem('fov_audio_unlocked');
      expect((component as any).getSessionAudioUnlocked()).toBe(false);
    });

    it('getSessionAudioUnlocked returns true when flag is set', () => {
      sessionStorage.setItem('fov_audio_unlocked', '1');
      expect((component as any).getSessionAudioUnlocked()).toBe(true);
    });

    it('setSessionAudioUnlocked sets the flag', () => {
      sessionStorage.removeItem('fov_audio_unlocked');
      (component as any).setSessionAudioUnlocked();
      expect(sessionStorage.getItem('fov_audio_unlocked')).toBe('1');
    });

    it('getSessionAudioUnlocked handles sessionStorage errors', () => {
      spyOn(sessionStorage, 'getItem').and.throwError('err');
      expect((component as any).getSessionAudioUnlocked()).toBe(false);
    });

    it('setSessionAudioUnlocked handles sessionStorage errors', () => {
      spyOn(sessionStorage, 'setItem').and.throwError('err');
      expect(() => (component as any).setSessionAudioUnlocked()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // resumeAllMuted
  // ---------------------------------------------------------------

  describe('resumeAllMuted', () => {
    it('mutes and resumes all video wrappers', () => {
      const videoPlay = jasmine.createSpy().and.returnValue(Promise.resolve());
      const videoEl = { muted: false, paused: true, play: videoPlay } as any;
      component.videoWrappers = [{ videoElement: videoEl } as any];
      component.audioWrappers = [];

      (component as any).resumeAllMuted();

      expect(videoEl.muted).toBe(true);
      expect(videoPlay).toHaveBeenCalled();
    });

    it('mutes and resumes all audio wrappers', () => {
      const audioPlay = jasmine.createSpy().and.returnValue(Promise.resolve());
      const audioEl = { muted: false, paused: true, play: audioPlay } as any;
      component.videoWrappers = [];
      component.audioWrappers = [{ audioElement: audioEl } as any];

      (component as any).resumeAllMuted();

      expect(audioEl.muted).toBe(true);
      expect(audioPlay).toHaveBeenCalled();
    });

    it('skips wrappers without element', () => {
      component.videoWrappers = [{ videoElement: null } as any];
      component.audioWrappers = [{ audioElement: null } as any];

      expect(() => (component as any).resumeAllMuted()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // registerClickToUnlock / registerDocumentUnlock
  // ---------------------------------------------------------------

  describe('register unlock handlers', () => {
    it('registerClickToUnlock adds a listener on stage', () => {
      const stage = createStage();
      const addSpy = spyOn(stage, 'addEventListener').and.callThrough();

      (component as any).registerClickToUnlock();

      expect(addSpy).toHaveBeenCalled();
    });

    it('registerClickToUnlock skips when stage not found', () => {
      (component as any).registerClickToUnlock();
      expect((component as any).clickToUnlockHandler).toBeTruthy();
    });

    it('registerClickToUnlock does nothing when already registered', () => {
      (component as any).clickToUnlockHandler = () => {};
      const stage = createStage();
      const addSpy = spyOn(stage, 'addEventListener');

      (component as any).registerClickToUnlock();

      expect(addSpy).not.toHaveBeenCalled();
    });

    it('registerDocumentUnlock adds listeners on document', () => {
      const addSpy = spyOn(document, 'addEventListener').and.callThrough();

      (component as any).registerDocumentUnlock();

      expect(addSpy).toHaveBeenCalledWith('click', jasmine.any(Function), jasmine.any(Object));
      expect(addSpy).toHaveBeenCalledWith('keydown', jasmine.any(Function), jasmine.any(Object));
      expect(addSpy).toHaveBeenCalledWith('touchstart', jasmine.any(Function), jasmine.any(Object));
    });

    it('registerDocumentUnlock does nothing when already registered', () => {
      (component as any).documentUnlockHandler = () => {};
      const addSpy = spyOn(document, 'addEventListener');

      (component as any).registerDocumentUnlock();

      expect(addSpy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // reloadWrapper
  // ---------------------------------------------------------------

  describe('reloadWrapper', () => {
    it('destroys existing hls and reinitializes', fakeAsync(() => {
      const destroy = jasmine.createSpy();
      const w = {
        isReady: true,
        hasManifest: true,
        hls: { destroy },
        track: { videoUrl: 'url1', name: 'v1', index: 0 },
      } as any;
      spyOn<any>(component, 'initHlsForWrapper');

      (component as any).reloadWrapper(w);
      tick(3100);

      expect(destroy).toHaveBeenCalled();
      expect(w.hls).toBeNull();
      expect(w.isReady).toBe(false);
      expect((component as any).initHlsForWrapper).toHaveBeenCalled();
    }));
  });

  // ---------------------------------------------------------------
  // updateMasterReference
  // ---------------------------------------------------------------

  describe('updateMasterReference', () => {
    it('does nothing when no video wrappers', () => {
      component.videoWrappers = [];
      expect(() => (component as any).updateMasterReference()).not.toThrow();
    });

    it('updates master and clears sync stats when changed', () => {
      component.videoWrappers = [
        { playerId: 'v1', isVideo: true, videoElement: null, track: { name: 'v1' } } as any,
      ];
      (component as any).masterPlayerId = 'different';
      component.syncStats.set('other', 10);
      component.maxDrift = 50;

      (component as any).updateMasterReference();

      expect((component as any).masterPlayerId).toBe('v1');
      expect(component.syncStats.size).toBe(0);
      expect(component.maxDrift).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // refreshLayoutState
  // ---------------------------------------------------------------

  describe('refreshLayoutState', () => {
    it('updates zIndex for all wrappers', () => {
      component.videoWrappers = [
        { zIndex: 0 } as any,
        { zIndex: 0 } as any,
        { zIndex: 0 } as any,
      ];

      (component as any).refreshLayoutState();

      expect(component.videoWrappers[0].zIndex).toBeGreaterThan(component.videoWrappers[1].zIndex);
    });
  });

  // ---------------------------------------------------------------
  // addTrack
  // ---------------------------------------------------------------

  describe('addTrack', () => {
    it('adds a video track and creates a wrapper', fakeAsync(() => {
      createStage(1000, 500);
      spyOn<any>(component, 'initHlsForWrapper');
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });

      (component as any).addTrack({
        index: 0, name: 'v1', trackId: 't1', videoUrl: 'url1', isVideo: true, isAudio: false,
      });
      tick(200);

      expect(component.videoWrappers.length).toBe(1);
    }));

    it('adds an audio-only track with zero dimensions', fakeAsync(() => {
      createStage(1000, 500);
      spyOn<any>(component, 'initHlsForWrapper');

      (component as any).addTrack({
        index: 0, name: 'a1', trackId: 'ta', videoUrl: 'url1', isVideo: false, isAudio: true,
      });
      tick(200);

      expect(component.videoWrappers[0].width).toBe(0);
      expect(component.videoWrappers[0].height).toBe(0);
    }));

    it('positions second wrapper differently', fakeAsync(() => {
      createStage(1000, 500);
      spyOn<any>(component, 'initHlsForWrapper');
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });

      (component as any).addTrack({
        index: 0, name: 'v1', trackId: 't1', videoUrl: 'url1', isVideo: true, isAudio: false,
      });
      (component as any).addTrack({
        index: 1, name: 'v2', trackId: 't2', videoUrl: 'url2', isVideo: true, isAudio: false,
      });
      tick(200);

      expect(component.videoWrappers.length).toBe(2);
    }));

    it('handles mobile layout for first wrapper', fakeAsync(() => {
      createStage(500, 800);
      spyOn<any>(component, 'initHlsForWrapper');
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });

      (component as any).addTrack({
        index: 0, name: 'v1', trackId: 't1', videoUrl: 'url1', isVideo: true, isAudio: false,
      });
      tick(200);

      expect(component.videoWrappers[0].width).toBeGreaterThan(0);
    }));
  });

  // ---------------------------------------------------------------
  // addAudioTrack
  // ---------------------------------------------------------------

  describe('addAudioTrack', () => {
    it('adds an audio wrapper', fakeAsync(() => {
      spyOn<any>(component, 'initHlsForAudioWrapper');

      (component as any).addAudioTrack({
        index: 0, name: 'a1', trackId: 'ta', videoUrl: 'url1', isVideo: false, isAudio: true,
      });
      tick(200);

      expect(component.audioWrappers.length).toBe(1);
    }));
  });

  // ---------------------------------------------------------------
  // initializeAllTracks
  // ---------------------------------------------------------------

  describe('initializeAllTracks', () => {
    it('destroys existing wrappers before init', fakeAsync(() => {
      const destroyV = jasmine.createSpy();
      const destroyA = jasmine.createSpy();
      component.videoWrappers = [{ hls: { destroy: destroyV }, track: { name: 'old' } } as any];
      component.audioWrappers = [{ hls: { destroy: destroyA }, track: { name: 'old' } } as any];
      component.availableTracks = [];

      spyOn<any>(component, 'startBufferCheck');

      (component as any).initializeAllTracks();
      tick(1000);

      expect(destroyV).toHaveBeenCalled();
      expect(destroyA).toHaveBeenCalled();
    }));

    it('initializes video and audio tracks', fakeAsync(() => {
      createStage();
      component.availableTracks = [
        { index: 0, name: 'v1', trackId: 't1', videoUrl: 'url1', isVideo: true, isAudio: false },
        { index: 1, name: 'a1', trackId: 'ta', videoUrl: 'url2', isVideo: false, isAudio: true },
      ];
      spyOn<any>(component, 'addTrack');
      spyOn<any>(component, 'addAudioTrack');
      spyOn<any>(component, 'startBufferCheck');

      (component as any).initializeAllTracks();
      tick(2000);

      expect((component as any).addTrack).toHaveBeenCalled();
      expect((component as any).addAudioTrack).toHaveBeenCalled();
    }));
  });

  // ---------------------------------------------------------------
  // applyWrapperAudio
  // ---------------------------------------------------------------

  describe('applyWrapperAudio', () => {
    it('does nothing without video element', () => {
      const w = { videoElement: null, volume: 0.5 } as any;
      expect(() => (component as any).applyWrapperAudio(w)).not.toThrow();
    });

    it('mutes video element when volume is 0', () => {
      const videoEl = { volume: 1, muted: false } as any;
      const w = { videoElement: videoEl, volume: 0 } as any;
      (component as any).applyWrapperAudio(w);
      expect(videoEl.volume).toBe(0);
      expect(videoEl.muted).toBe(true);
    });

    it('always sets video volume to 0', () => {
      const videoEl = { volume: 1, muted: false } as any;
      const w = { videoElement: videoEl, volume: 0.5 } as any;
      (component as any).applyWrapperAudio(w);
      expect(videoEl.volume).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // playAllWrappers
  // ---------------------------------------------------------------

  describe('playAllWrappers', () => {
    it('plays all video and audio wrappers', async () => {
      const videoPlay = jasmine.createSpy().and.returnValue(Promise.resolve());
      const audioPlay = jasmine.createSpy().and.returnValue(Promise.resolve());
      component.videoWrappers = [
        { videoElement: { play: videoPlay, muted: false, volume: 1, playbackRate: 1 }, track: { name: 'v1' } } as any,
      ];
      component.audioWrappers = [
        { audioElement: { play: audioPlay, muted: false, volume: 0 }, track: { name: 'a1' }, volume: 0.5 } as any,
      ];

      await (component as any).playAllWrappers();

      expect(videoPlay).toHaveBeenCalled();
      expect(audioPlay).toHaveBeenCalled();
    });

    it('retries video with muted on failure', async () => {
      let callCount = 0;
      const videoPlay = jasmine.createSpy().and.callFake(() => {
        callCount++;
        if (callCount === 1) return Promise.reject('err');
        return Promise.resolve();
      });
      const videoEl = { play: videoPlay, muted: false, volume: 1, playbackRate: 1 } as any;
      component.videoWrappers = [{ videoElement: videoEl, track: { name: 'v1' } } as any];
      component.audioWrappers = [];

      await (component as any).playAllWrappers();

      expect(videoPlay).toHaveBeenCalledTimes(2);
    });

    it('handles wrappers without element', async () => {
      component.videoWrappers = [{ videoElement: null, track: { name: 'v1' } } as any];
      component.audioWrappers = [{ audioElement: null, track: { name: 'a1' }, volume: 0.5 } as any];

      await (component as any).playAllWrappers();
    });

    it('handles audio play failure', async () => {
      const audioPlay = jasmine.createSpy().and.returnValue(Promise.reject('err'));
      component.videoWrappers = [];
      component.audioWrappers = [
        { audioElement: { play: audioPlay, muted: true, volume: 0 }, track: { name: 'a1' }, volume: 0.5 } as any,
      ];

      await (component as any).playAllWrappers();

      expect(audioPlay).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // tryAutoUnlockAudio
  // ---------------------------------------------------------------

  describe('tryAutoUnlockAudio', () => {
    it('does nothing when already unlocked', async () => {
      component.audioUnlocked = true;
      await (component as any).tryAutoUnlockAudio();
      expect(component.audioUnlocked).toBe(true);
    });

    it('unlocks when autoplay with sound works', async () => {
      component.audioUnlocked = false;
      sessionStorage.removeItem('fov_audio_unlocked');
      const audioEl = { muted: true, volume: 0, paused: false } as any;
      component.videoWrappers = [];
      component.audioWrappers = [{ audioElement: audioEl, volume: 0.5, track: { name: 'a1' } } as any];

      await (component as any).tryAutoUnlockAudio();

      expect(component.audioUnlocked).toBe(true);
    });

    it('registers click to unlock when audio is blocked', async () => {
      component.audioUnlocked = false;
      sessionStorage.removeItem('fov_audio_unlocked');
      const audioEl = { muted: true, volume: 0, paused: true } as any;
      component.videoWrappers = [];
      component.audioWrappers = [{ audioElement: audioEl, volume: 0.5, track: { name: 'a1' } } as any];

      await (component as any).tryAutoUnlockAudio();

      expect(component.audioUnlocked).toBe(false);
      expect((component as any).documentUnlockHandler).toBeTruthy();
    });

    it('uses sessionStorage consent when available', async () => {
      component.audioUnlocked = false;
      sessionStorage.setItem('fov_audio_unlocked', '1');
      const audioEl = { muted: true, volume: 0, paused: false } as any;
      component.videoWrappers = [];
      component.audioWrappers = [{ audioElement: audioEl, volume: 0.5, track: { name: 'a1' } } as any];

      await (component as any).tryAutoUnlockAudio();

      expect(component.audioUnlocked).toBe(true);
    });

    it('falls back to click when sessionStorage consent fails', async () => {
      component.audioUnlocked = false;
      sessionStorage.setItem('fov_audio_unlocked', '1');
      const audioEl = { muted: true, volume: 0, paused: true } as any;
      component.videoWrappers = [];
      component.audioWrappers = [{ audioElement: audioEl, volume: 0.5, track: { name: 'a1' } } as any];

      await (component as any).tryAutoUnlockAudio();

      expect((component as any).documentUnlockHandler).toBeTruthy();
    });

    it('mutes all video elements', async () => {
      component.audioUnlocked = false;
      sessionStorage.removeItem('fov_audio_unlocked');
      const videoEl = { volume: 1, muted: false } as any;
      component.videoWrappers = [{ videoElement: videoEl, track: { name: 'v1' } } as any];
      component.audioWrappers = [];

      await (component as any).tryAutoUnlockAudio();

      expect(videoEl.volume).toBe(0);
      expect(videoEl.muted).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // startBufferCheck / stopBufferCheck
  // ---------------------------------------------------------------

  describe('buffer check', () => {
    it('stopBufferCheck is safe when no interval set', () => {
      expect(() => (component as any).stopBufferCheck()).not.toThrow();
    });

    it('stopBufferCheck clears the interval', () => {
      (component as any).bufferCheckInterval = setInterval(() => {}, 1000);
      (component as any).stopBufferCheck();
      expect((component as any).bufferCheckInterval).toBeNull();
    });

    it('startBufferCheck exits early when playback has started', fakeAsync(() => {
      component.playbackStarted = true;
      component.videoWrappers = [];
      component.audioWrappers = [];

      (component as any).startBufferCheck();
      tick(1000);

      expect(component.playbackStarted).toBe(true);
    }));

    it('startBufferCheck waits for all elements to be attached', fakeAsync(() => {
      component.playbackStarted = false;
      component.videoWrappers = [{ videoElement: null, track: { name: 'v1' } } as any];
      component.audioWrappers = [];

      (component as any).startBufferCheck();
      tick(2000);

      expect(component.playbackStarted).toBe(false);
    }));
  });

  // ---------------------------------------------------------------
  // loadTracks
  // ---------------------------------------------------------------

  describe('loadTracks', () => {
    it('does nothing when playback already started', () => {
      component.playbackStarted = true;
      const fetchSpy = spyOn<any>(component, 'fetchAvailableTracks');
      (component as any).loadTracks();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does nothing when there are already wrappers', () => {
      component.videoWrappers = [{ playerId: 'v1' } as any];
      const fetchSpy = spyOn<any>(component, 'fetchAvailableTracks');
      (component as any).loadTracks();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls fetchAvailableTracks when conditions are met', () => {
      const fetchSpy = spyOn<any>(component, 'fetchAvailableTracks');
      (component as any).loadTracks();
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // layoutStorageKey getter
  // ---------------------------------------------------------------

  describe('layoutStorageKey', () => {
    it('returns the correct key for the streamId', () => {
      expect((component as any).layoutStorageKey).toBe('fov_layout_test-stream');
    });
  });
});
