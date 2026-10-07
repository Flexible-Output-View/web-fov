import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FovPlayerComponent } from './fov-player.component';

describe('FovPlayerComponent', () => {
  let component: FovPlayerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FovPlayerComponent, HttpClientTestingModule],
    });
    const fixture = TestBed.createComponent(FovPlayerComponent);
    component = fixture.componentInstance;
    component.streamId = 'test-stream';
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
      component.videoWrappers = [
        { hls: null, playerId: 'v1' } as any,
      ];
      component.audioWrappers = [
        { hls: null, playerId: 'a1' } as any,
      ];

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
      for (let i = 0; i < result.length; i++) {
        const inf = infos[i];
        expect(result[i].target).toBeGreaterThanOrEqual(inf.start);
        expect(result[i].target).toBeLessThanOrEqual(inf.end);
      }
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
  });

  // ---------------------------------------------------------------
  // Helpers de layout
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
});
