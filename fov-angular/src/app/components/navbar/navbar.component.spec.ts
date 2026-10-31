import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { NavbarComponent } from './navbar.component';
import { AuthService } from '../../services/auth.service';
import { UserService, UserProfile } from '../../services/user.service';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let userService: jasmine.SpyObj<UserService>;
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

    userService = jasmine.createSpyObj('UserService', ['loadProfile', 'clearProfile'], {
      currentProfile$: currentProfile$.asObservable(),
    });
    userService.loadProfile.and.returnValue(of(mockProfile));

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
});
