import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks, flush } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { StreamComponent } from './stream.component';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { LiveStreamsService } from '../../services/live-streams.service';
import { ViewerPresenceService } from '../../services/viewer-presence.service';
import { LiveStreamInfo } from '../../models/live-stream.model';

describe('StreamComponent', () => {
  let component: StreamComponent;
  let fixture: ComponentFixture<StreamComponent>;
  let liveStreamsService: jasmine.SpyObj<LiveStreamsService>;
  let viewerPresence: jasmine.SpyObj<ViewerPresenceService>;
  let router: jasmine.SpyObj<Router>;
  let params$: BehaviorSubject<Record<string, string>>;

  const mockStream: LiveStreamInfo = {
    streamId: 's1',
    trackCount: 1,
    tracks: [],
    title: 'Test Stream',
    category: 'Gaming',
    viewers: 100,
    streamer: 'Streamer1',
    streamerUsername: 'streamer1',
    avatarUrl: '',
    thumbnailUrl: '',
  };

  beforeEach(async () => {
    params$ = new BehaviorSubject<Record<string, string>>({ streamId: 's1' });

    liveStreamsService = jasmine.createSpyObj('LiveStreamsService', ['getStreamById']);
    liveStreamsService.getStreamById.and.returnValue(of(mockStream));

    viewerPresence = jasmine.createSpyObj('ViewerPresenceService', ['start', 'stop'], {
      counts$: of(null),
    });

    router = jasmine.createSpyObj('Router', [
      'navigate', 'navigateByUrl', 'createUrlTree', 'serializeUrl',
    ]);
    router.navigate.and.returnValue(Promise.resolve(true));
    router.navigateByUrl.and.returnValue(Promise.resolve(true));
    router.createUrlTree.and.returnValue({} as any);
    router.serializeUrl.and.returnValue('/');
    Object.defineProperty(router, 'events', { value: of({} as any) });

    await TestBed.configureTestingModule({
      imports: [
        StreamComponent,
        HttpClientTestingModule,
      ],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { params: params$.asObservable() } },
        { provide: Router, useValue: router },
        { provide: LiveStreamsService, useValue: liveStreamsService },
        { provide: ViewerPresenceService, useValue: viewerPresence },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamComponent);
    component = fixture.componentInstance;
  });

  afterEach(fakeAsync(() => {
    discardPeriodicTasks();
    flush();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('streamerName', () => {
    it('should prefer streamerUsername', () => {
      component.streamInfo = mockStream;
      expect(component.streamerName).toBe('streamer1');
    });

    it('should fallback to streamer', () => {
      component.streamInfo = { ...mockStream, streamerUsername: null };
      expect(component.streamerName).toBe('Streamer1');
    });

    it('should return empty when no streamInfo', () => {
      expect(component.streamerName).toBe('');
    });
  });

  describe('checkStream', () => {
    it('should load stream on init', fakeAsync(() => {
      fixture.detectChanges();
      tick();
      expect(liveStreamsService.getStreamById).toHaveBeenCalledWith('s1');
      expect(component.streamInfo).toEqual(mockStream);
      expect(component.isLive).toBeTrue();
      expect(component.isLoading).toBeFalse();
      expect(viewerPresence.start).toHaveBeenCalledWith('s1');
    }));

    it('should retry when stream is null', fakeAsync(() => {
      liveStreamsService.getStreamById.and.returnValue(of(null));
      fixture.detectChanges();
      tick();
      expect(component.isLive).toBeFalse();
      expect(liveStreamsService.getStreamById).toHaveBeenCalledTimes(1);

      tick(2000);
      expect(liveStreamsService.getStreamById).toHaveBeenCalledTimes(2);
    }));

    it('should give up after 5 attempts', fakeAsync(() => {
      liveStreamsService.getStreamById.and.returnValue(of(null));
      fixture.detectChanges();
      tick();
      tick(2000);
      tick(2000);
      tick(2000);
      tick(2000);
      expect(liveStreamsService.getStreamById).toHaveBeenCalledTimes(5);
      expect(component.isLoading).toBeFalse();
      expect(component.isLive).toBeFalse();
    }));

    it('should set error after 5 failed attempts', fakeAsync(() => {
      liveStreamsService.getStreamById.and.returnValue(
        throwError(() => new Error('Network')),
      );
      spyOn(console, 'error');
      fixture.detectChanges();
      tick();
      tick(2000);
      tick(2000);
      tick(2000);
      tick(2000);
      expect(component.errorMessage).toContain('Impossible');
    }));
  });

  describe('onStreamEnded', () => {
    it('should set isLive to false and start countdown', fakeAsync(() => {
      fixture.detectChanges();
      tick();
      component.onStreamEnded();
      expect(component.isLive).toBeFalse();
      expect(component.streamEndedMessage).toContain('terminé');
      expect(component.redirectCountdown).toBe(5);
      expect(viewerPresence.stop).toHaveBeenCalled();
    }));

    it('should redirect after countdown', fakeAsync(() => {
      fixture.detectChanges();
      tick();
      component.onStreamEnded();
      tick(5000);
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    }));

    it('should decrement countdown each second', fakeAsync(() => {
      fixture.detectChanges();
      tick();
      component.onStreamEnded();
      tick(1000);
      expect(component.redirectCountdown).toBe(4);
      tick(1000);
      expect(component.redirectCountdown).toBe(3);
    }));
  });

  describe('goBack', () => {
    it('should navigate to /', fakeAsync(() => {
      fixture.detectChanges();
      tick();
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    }));

    it('should clear redirect interval', fakeAsync(() => {
      fixture.detectChanges();
      tick();
      component.onStreamEnded();
      component.goBack();
      tick(10_000);
      expect(router.navigate).toHaveBeenCalledTimes(1);
    }));
  });

  describe('retry', () => {
    it('should re-check stream', fakeAsync(() => {
      fixture.detectChanges();
      tick();
      liveStreamsService.getStreamById.calls.reset();
      component.retry();
      tick();
      expect(liveStreamsService.getStreamById).toHaveBeenCalled();
    }));
  });

  describe('ngOnDestroy', () => {
    it('should stop viewer presence and complete destroy$', fakeAsync(() => {
      fixture.detectChanges();
      tick();
      const destroy$ = (component as any).destroy$;
      const completeSpy = spyOn(destroy$, 'complete').and.callThrough();
      component.ngOnDestroy();
      expect(viewerPresence.stop).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    }));
  });

  it('should expose viewerCount$ from presence service', () => {
    expect(component.viewerCount$).toBeDefined();
  });
});
