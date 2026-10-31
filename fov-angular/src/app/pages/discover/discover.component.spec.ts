import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DiscoverComponent } from './discover.component';
import { ActivatedRoute } from '@angular/router';
import { TwitchService } from '../../services/twitch.service';
import { LiveStreamsService } from '../../services/live-streams.service';
import { BehaviorSubject, of, throwError } from 'rxjs';

describe('DiscoverComponent', () => {
  let component: DiscoverComponent;
  let fixture: ComponentFixture<DiscoverComponent>;
  let twitchService: jasmine.SpyObj<TwitchService>;
  let liveStreamsService: jasmine.SpyObj<LiveStreamsService>;
  let params$: BehaviorSubject<Record<string, string>>;

  beforeEach(async () => {
    params$ = new BehaviorSubject<Record<string, string>>({});

    twitchService = jasmine.createSpyObj('TwitchService', ['getTopCategories']);
    twitchService.getTopCategories.and.returnValue(
      of([{ name: 'Gaming', viewers: '100k', image: 'img.jpg' }]),
    );

    liveStreamsService = jasmine.createSpyObj('LiveStreamsService', ['getAvailableStreams']);
    liveStreamsService.getAvailableStreams.and.returnValue(
      of({ streams: [], streamCount: 0 }),
    );

    await TestBed.configureTestingModule({
      imports: [DiscoverComponent],
      providers: [
        provideRouter([]),                                    // ← ajout
        { provide: TwitchService, useValue: twitchService },
        { provide: LiveStreamsService, useValue: liveStreamsService },
        { provide: ActivatedRoute, useValue: { params: params$.asObservable() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DiscoverComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── ngOnInit ──────────────────────────────────────────────────
  describe('ngOnInit', () => {
    it('should load categories + streams when no param', () => {
      fixture.detectChanges();
      expect(twitchService.getTopCategories).toHaveBeenCalledWith(30);
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalled();
      expect(component.categoryName).toBeNull();
    });

    it('should decode slug when name param present', () => {
      params$.next({ name: 'just-chatting' });
      fixture.detectChanges();
      expect(component.categoryName).toBe('Just Chatting');
      expect(twitchService.getTopCategories).not.toHaveBeenCalled();
    });
  });

  // ── error paths ───────────────────────────────────────────────
  describe('error handling', () => {
    it('should set empty categories on error', () => {
      twitchService.getTopCategories.and.returnValue(throwError(() => new Error()));
      fixture.detectChanges();
      expect(component.allCategories).toEqual([]);
      expect(component.isLoadingCategories).toBeFalse();
    });

    it('should set empty streams on error', () => {
      liveStreamsService.getAvailableStreams.and.returnValue(throwError(() => new Error()));
      fixture.detectChanges();
      expect(component.liveStreams).toEqual([]);
      expect(component.isLoadingStreams).toBeFalse();
    });
  });

  // ── setActiveTab ──────────────────────────────────────────────
  describe('setActiveTab', () => {
    it('should switch tab', () => {
      fixture.detectChanges();
      component.setActiveTab('channels');
      expect(component.activeTab).toBe('channels');
    });

    it('should load streams when switching to empty channels tab', () => {
      fixture.detectChanges();
      liveStreamsService.getAvailableStreams.calls.reset();
      component.liveStreams = [];
      component.setActiveTab('channels');
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalled();
    });

    it('should not reload when channels already loaded', () => {
      fixture.detectChanges();
      component.liveStreams = [{ streamId: '1' } as any];
      liveStreamsService.getAvailableStreams.calls.reset();
      component.setActiveTab('channels');
      expect(liveStreamsService.getAvailableStreams).not.toHaveBeenCalled();
    });
  });

  // ── ngOnDestroy ───────────────────────────────────────────────
  it('should complete destroy$', () => {
    fixture.detectChanges();
    const spy = spyOn((component as any).destroy$, 'complete');
    component.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
  });
});
