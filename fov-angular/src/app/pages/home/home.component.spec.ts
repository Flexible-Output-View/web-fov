import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks, flush } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import { TwitchService } from '../../services/twitch.service';
import { LiveStreamsService } from '../../services/live-streams.service';
import { of, throwError } from 'rxjs';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let twitchService: jasmine.SpyObj<TwitchService>;
  let liveStreamsService: jasmine.SpyObj<LiveStreamsService>;

  beforeEach(async () => {
    twitchService = jasmine.createSpyObj('TwitchService', ['getTopCategories']);
    twitchService.getTopCategories.and.returnValue(
      of([{ name: 'Gaming', viewers: '100k', image: 'img.jpg' }]),
    );

    liveStreamsService = jasmine.createSpyObj('LiveStreamsService', ['getAvailableStreams']);
    liveStreamsService.getAvailableStreams.and.returnValue(
      of({
        streams: [{
          streamId: '1', title: 'Test', category: 'Gaming', viewers: 50,
          trackCount: 1, tracks: [], streamer: 'user', avatarUrl: '', thumbnailUrl: '',
        }],
        streamCount: 1,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: TwitchService, useValue: twitchService },
        { provide: LiveStreamsService, useValue: liveStreamsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
  });

  afterEach(fakeAsync(() => {
    discardPeriodicTasks();
    flush();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── ngOnInit ──────────────────────────────────────────────────
  describe('ngOnInit', () => {
    it('should load 5 categories', fakeAsync(() => {
      component.ngOnInit();
      tick();
      expect(twitchService.getTopCategories).toHaveBeenCalledWith(5);
      expect(component.popularCategories.length).toBe(1);
      expect(component.isLoadingCategories).toBeFalse();
    }));

    it('should fetch live streams immediately', fakeAsync(() => {
      component.ngOnInit();
      tick();
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalledTimes(1);
      expect(component.isLoadingLiveStreams).toBeFalse();
    }));

    it('should poll every 10 s', fakeAsync(() => {
      component.ngOnInit();
      tick();
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalledTimes(1);
      tick(10_000);
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalledTimes(2);
    }));
  });

  // ── error paths ───────────────────────────────────────────────
  describe('error handling', () => {
    it('should clear categories on error', fakeAsync(() => {
      twitchService.getTopCategories.and.returnValue(throwError(() => new Error()));
      component.ngOnInit();
      tick();
      expect(component.popularCategories).toEqual([]);
      expect(component.isLoadingCategories).toBeFalse();
    }));
  });

  // ── refreshLiveStreams ────────────────────────────────────────
  describe('refreshLiveStreams', () => {
    it('should reload streams', fakeAsync(() => {
      component.ngOnInit();
      tick();
      liveStreamsService.getAvailableStreams.calls.reset();
      component.refreshLiveStreams();
      tick();
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalled();
      expect(component.isLoadingLiveStreams).toBeFalse();
    }));

    it('should handle refresh error', fakeAsync(() => {
      component.ngOnInit();
      tick();
      liveStreamsService.getAvailableStreams.and.returnValue(throwError(() => new Error()));
      component.refreshLiveStreams();
      tick();
      expect(component.isLoadingLiveStreams).toBeFalse();
    }));
  });

  // ── ngOnDestroy ───────────────────────────────────────────────
  it('should complete destroy$', fakeAsync(() => {
    component.ngOnInit();
    tick();
    const spy = spyOn((component as any).destroy$, 'complete');
    component.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
  }));
});
