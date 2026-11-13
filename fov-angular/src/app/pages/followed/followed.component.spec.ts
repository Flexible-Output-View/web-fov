import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { FollowedComponent } from './followed.component';
import { AuthService } from '../../services/auth.service';
import { UserProfile, UserService } from '../../services/user.service';
import { LiveStreamsService } from '../../services/live-streams.service';
import { of, throwError } from 'rxjs';

describe('FollowedComponent', () => {
  let component: FollowedComponent;
  let fixture: ComponentFixture<FollowedComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let userService: jasmine.SpyObj<UserService>;
  let liveStreamsService: jasmine.SpyObj<LiveStreamsService>;

  const following: UserProfile[] = [
    { username: 'streamer1', avatarUrl: '', bio: 'Bio 1', bannerUrl: '', followersCount: 10, followingCount: 5 },
    { username: 'streamer2', avatarUrl: '', bio: 'Bio 2', bannerUrl: '', followersCount: 20, followingCount: 3 },
  ];

  const liveStream = {
    streamId: 's1', streamerUsername: 'streamer1', streamer: 'Streamer1',
    title: 'Live!', category: 'Gaming', viewers: 100,
    trackCount: 1, tracks: [], avatarUrl: '', thumbnailUrl: '',
  };

  beforeEach(async () => {
    authService = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    authService.isAuthenticated.and.returnValue(false);

    userService = jasmine.createSpyObj('UserService', ['getFollowing']);
    userService.getFollowing.and.returnValue(of(following));

    liveStreamsService = jasmine.createSpyObj('LiveStreamsService', ['getAvailableStreams']);
    liveStreamsService.getAvailableStreams.and.returnValue(
      of({ streams: [liveStream], streamCount: 1 }),
    );

    await TestBed.configureTestingModule({
      imports: [
        FollowedComponent,
        HttpClientTestingModule
      ],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: LiveStreamsService, useValue: liveStreamsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FollowedComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── ngOnInit ──────────────────────────────────────────────────
  describe('ngOnInit', () => {
    it('should not load when not authenticated', () => {
      fixture.detectChanges();
      expect(userService.getFollowing).not.toHaveBeenCalled();
    });

    it('should load followed channels when authenticated', () => {
      authService.isAuthenticated.and.returnValue(true);
      fixture.detectChanges();
      expect(userService.getFollowing).toHaveBeenCalled();
      expect(liveStreamsService.getAvailableStreams).toHaveBeenCalled();
    });

    it('should split live vs offline channels', () => {
      authService.isAuthenticated.and.returnValue(true);
      fixture.detectChanges();
      expect(component.liveChannels.length).toBe(1);
      expect(component.offlineChannels.length).toBe(1);
      expect(component.offlineChannels[0].username).toBe('streamer2');
    });
  });

  // ── error ─────────────────────────────────────────────────────
  describe('error handling', () => {
    it('should set loadError on forkJoin failure', () => {
      authService.isAuthenticated.and.returnValue(true);
      userService.getFollowing.and.returnValue(throwError(() => new Error()));
      fixture.detectChanges();
      expect(component.loadError).toContain('Impossible');
      expect(component.isLoading).toBeFalse();
    });
  });

  // ── setActiveTab ──────────────────────────────────────────────
  describe('setActiveTab', () => {
    it('should switch tab', () => {
      component.setActiveTab('categories');
      expect(component.activeTab).toBe('categories');
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
