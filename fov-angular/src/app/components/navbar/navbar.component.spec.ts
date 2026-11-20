import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { NavbarComponent } from './navbar.component';
import { AuthService } from '../../services/auth.service';
import { UserService, UserProfile } from '../../services/user.service';
import { LiveStreamsService } from '../../services/live-streams.service';
import { LiveStreamInfo } from '../../models/live-stream.model';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let userService: jasmine.SpyObj<UserService>;
  let liveStreamsService: jasmine.SpyObj<LiveStreamsService>;
  let router: Router;
  let currentUser$: BehaviorSubject<any>;
  let currentProfile$: BehaviorSubject<UserProfile | null>;

  const mockProfile: UserProfile = {
    username: 'testuser',
    avatarUrl: 'https://example.com/avatar.jpg',
    bio: 'Hello',
  } as UserProfile;

  beforeEach(async () => {
    currentUser$ = new BehaviorSubject<any>(null);
    currentProfile$ = new BehaviorSubject<UserProfile | null>(null);

    authService = jasmine.createSpyObj('AuthService', ['isAuthenticated', 'logout'], {
      currentUser$: currentUser$.asObservable(),
    });
    authService.isAuthenticated.and.returnValue(false);

    userService = jasmine.createSpyObj('UserService', ['loadProfile', 'clearProfile', 'searchUsers'], {
      currentProfile$: currentProfile$.asObservable(),
    });
    userService.loadProfile.and.returnValue(of(mockProfile));
    userService.searchUsers.and.returnValue(of([]));

    liveStreamsService = jasmine.createSpyObj('LiveStreamsService', ['getAvailableStreams']);
    liveStreamsService.getAvailableStreams.and.returnValue(of({ streams: [], streamCount: 0 }));

    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        // Vrai Router : RouterLink et RouterLinkActive en ont besoin
        // (serializeUrl, createUrlTree, events).
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) },
            params: of({}),
            queryParams: of({}),
          },
        },
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: LiveStreamsService, useValue: liveStreamsService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    document.body.classList.remove('theme-light');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should set isAuthenticated from authService', () => {
      authService.isAuthenticated.and.returnValue(true);
      currentUser$.next({ username: 'test' });
      fixture.detectChanges();
      expect(component.isAuthenticated).toBeTrue();
    });

    it('should load profile when user is present', () => {
      authService.isAuthenticated.and.returnValue(true);
      currentUser$.next({ username: 'test' });
      fixture.detectChanges();
      expect(userService.loadProfile).toHaveBeenCalled();
    });

    it('should clear profile when user is null', () => {
      currentUser$.next(null);
      fixture.detectChanges();
      expect(component.profile).toBeNull();
    });

    it('should update profile from currentProfile$', () => {
      fixture.detectChanges();
      currentProfile$.next(mockProfile);
      expect(component.profile).toEqual(mockProfile);
    });
  });

  describe('ngOnDestroy', () => {
    it('should complete destroy$', () => {
      fixture.detectChanges();
      const destroy$ = (component as any).destroy$;
      const completeSpy = spyOn(destroy$, 'complete').and.callThrough();
      component.ngOnDestroy();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout, clear profile, and navigate to /login', () => {
      fixture.detectChanges();
      component.logout();
      expect(authService.logout).toHaveBeenCalled();
      expect(userService.clearProfile).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('avatarUrl', () => {
    it('should return profile avatarUrl', () => {
      component.profile = mockProfile;
      expect(component.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('should return null when no profile', () => {
      component.profile = null;
      expect(component.avatarUrl).toBeNull();
    });

    it('should return null when avatarUrl is empty string', () => {
      component.profile = { ...mockProfile, avatarUrl: '' };
      expect(component.avatarUrl).toBeNull();
    });
  });

  describe('initial', () => {
    it('should return uppercase first letter of username', () => {
      component.profile = mockProfile;
      expect(component.initial).toBe('T');
    });

    it('should return ? when no profile', () => {
      component.profile = null;
      expect(component.initial).toBe('?');
    });
  });

  describe('toggleTheme', () => {
    it('should toggle isDarkTheme flag', () => {
      expect(component.isDarkTheme).toBeTrue();
      component.toggleTheme();
      expect(component.isDarkTheme).toBeFalse();
      component.toggleTheme();
      expect(component.isDarkTheme).toBeTrue();
    });

    it('should toggle theme-light class on document.body', () => {
      component.toggleTheme();
      expect(document.body.classList.contains('theme-light')).toBeTrue();
      component.toggleTheme();
      expect(document.body.classList.contains('theme-light')).toBeFalse();
    });
  });

  describe('search', () => {
    const stream = (overrides: Partial<LiveStreamInfo>): LiveStreamInfo => ({
      streamId: 'u1', trackCount: 2, tracks: [], title: 'Le stream de lucas', category: 'Just Chatting',
      viewers: 0, streamer: 'lucas', streamerUsername: 'lucas', avatarUrl: '', thumbnailUrl: '',
      ...overrides,
    });

    function type(value: string): HTMLInputElement {
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#nav-search');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      return input;
    }

    function panel(): HTMLElement | null {
      return fixture.nativeElement.querySelector('.search-results');
    }

    beforeEach(() => {
      liveStreamsService.getAvailableStreams.and.returnValue(of({
        streams: [
          stream({}),
          stream({ streamId: 'u2', title: 'Speedrun', streamer: 'bob', streamerUsername: 'bob', category: 'Mario' }),
        ],
        streamCount: 2,
      }));
      userService.searchUsers.and.returnValue(of([{ username: 'lucas', avatarUrl: '' }]));
      fixture.detectChanges();
    });

    it('shows matching live streams and users after the debounce', fakeAsync(() => {
      type('LUCAS');
      tick(250);
      fixture.detectChanges();

      const streamLinks = panel()!.querySelectorAll('a[href^="/stream/"]');
      expect(streamLinks.length).toBe(1);
      expect(streamLinks[0].getAttribute('href')).toBe('/stream/u1');
      expect(panel()!.querySelector('a[href="/lucas"]')).not.toBeNull();
      expect(userService.searchUsers).toHaveBeenCalledOnceWith('LUCAS');
    }));

    it('matches streams by category, ignoring accents and case', fakeAsync(() => {
      type('mário');
      tick(250);
      fixture.detectChanges();

      const links = Array.from(panel()!.querySelectorAll('a[href^="/stream/"]'));
      expect(links.map((a) => a.getAttribute('href'))).toEqual(['/stream/u2']);
    }));

    it('shows an empty state when nothing matches', fakeAsync(() => {
      userService.searchUsers.and.returnValue(of([]));
      type('zzz');
      tick(250);
      fixture.detectChanges();

      expect(panel()!.textContent).toContain('Aucun résultat');
      expect(component.searchStatus).toBe('Aucun résultat');
    }));

    it('still shows streams when the user search fails', fakeAsync(() => {
      userService.searchUsers.and.returnValue(throwError(() => new Error('500')));
      type('speed');
      tick(250);
      fixture.detectChanges();

      expect(panel()!.querySelector('a[href="/stream/u2"]')).not.toBeNull();
    }));

    it('does not search for a blank query', fakeAsync(() => {
      type('   ');
      tick(250);
      fixture.detectChanges();

      expect(userService.searchUsers).not.toHaveBeenCalled();
      expect(panel()).toBeNull();
    }));

    it('opens the first stream on submit', fakeAsync(() => {
      type('lucas');
      fixture.nativeElement.querySelector('form[role="search"]').dispatchEvent(new Event('submit'));
      tick(250);

      expect(router.navigate).toHaveBeenCalledWith(['/stream', 'u1']);
    }));

    it('opens the first user on submit when no stream matches', fakeAsync(() => {
      userService.searchUsers.and.returnValue(of([{ username: 'alice', avatarUrl: '' }]));
      type('alice');
      fixture.nativeElement.querySelector('form[role="search"]').dispatchEvent(new Event('submit'));
      tick(250);

      expect(router.navigate).toHaveBeenCalledWith(['/', 'alice']);
    }));

    it('closes the results on Escape and on outside click', fakeAsync(() => {
      type('lucas');
      tick(250);
      fixture.detectChanges();
      expect(panel()).not.toBeNull();

      fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(panel()).toBeNull();

      component.isSearchOpen = true;
      fixture.detectChanges();
      document.body.click();
      fixture.detectChanges();
      expect(panel()).toBeNull();
    }));
  });
});
