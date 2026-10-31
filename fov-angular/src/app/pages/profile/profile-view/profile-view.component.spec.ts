import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ProfileViewComponent } from './profile-view.component';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService, AuthUser } from '../../../services/auth.service';
import { UserProfile, UserService } from '../../../services/user.service';

describe('ProfileViewComponent', () => {
  let component: ProfileViewComponent;
  let fixture: ComponentFixture<ProfileViewComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let userService: jasmine.SpyObj<UserService>;
  let router: Router;
  let currentProfile$: BehaviorSubject<UserProfile | null>;

  const mockUser: AuthUser = { id: 1, username: 'me' } as AuthUser;

  const mockProfile: UserProfile = {
    username: 'alice',
    avatarUrl: 'avatar.jpg',
    bio: 'Hello',
    bannerUrl: 'banner.jpg',
    followersCount: 100,
    followingCount: 50,
    isFollowing: false,
  } as UserProfile;

  beforeEach(async () => {
    currentProfile$ = new BehaviorSubject<UserProfile | null>(null);

    authService = jasmine.createSpyObj('AuthService', [
      'isAuthenticated', 'getCurrentUser', 'logout', 'getUsername',
    ]);
    authService.isAuthenticated.and.returnValue(false);
    authService.getCurrentUser.and.returnValue(null);
    authService.getUsername.and.returnValue('');

    userService = jasmine.createSpyObj('UserService', [
      'loadProfile', 'getProfileByUsername', 'follow', 'unfollow',
      'clearProfile', 'getCurrentProfile',
    ], {
      currentProfile$: currentProfile$.asObservable(),
    });
    userService.loadProfile.and.returnValue(of(mockProfile));
    userService.getProfileByUsername.and.returnValue(of(mockProfile));
    userService.follow.and.returnValue(of({ following: true, followersCount: 101 }));
    userService.unfollow.and.returnValue(of({ following: false, followersCount: 99 }));
    userService.getCurrentProfile.and.returnValue(null);

    await TestBed.configureTestingModule({
      imports: [ProfileViewComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: userService },
      ],
    }).compileComponents();

    // Vrai Router + spies (RouterLink a besoin de serializeUrl/createUrlTree).
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    fixture = TestBed.createComponent(ProfileViewComponent);
    component = fixture.componentInstance;
    component.username = 'alice';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('loadProfile', () => {
    it('should load other user profile via getProfileByUsername', () => {
      fixture.detectChanges();
      expect(userService.getProfileByUsername).toHaveBeenCalledWith('alice');
      expect(component.profile).toEqual(mockProfile);
    });

    it('should load own profile via loadProfile', () => {
      authService.isAuthenticated.and.returnValue(true);
      authService.getCurrentUser.and.returnValue({ username: 'alice' } as AuthUser);
      fixture.detectChanges();
      expect(userService.loadProfile).toHaveBeenCalled();
      expect(component.isOwnProfile).toBeTrue();
    });

    it('should use cached profile for own profile', () => {
      authService.isAuthenticated.and.returnValue(true);
      authService.getCurrentUser.and.returnValue({ username: 'alice' } as AuthUser);
      userService.getCurrentProfile.and.returnValue(mockProfile);
      fixture.detectChanges();
      expect(component.profile).toEqual(mockProfile);
    });

    it('should set notFound on 404', () => {
      userService.getProfileByUsername.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 404 })),
      );
      fixture.detectChanges();
      expect(component.notFound).toBeTrue();
    });

    it('should set errorMessage on non-404 error', () => {
      userService.getProfileByUsername.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      fixture.detectChanges();
      expect(component.errorMessage).toContain('Impossible');
    });

    it('should not load when username is empty', () => {
      component.username = '';
      fixture.detectChanges();
      expect(userService.getProfileByUsername).not.toHaveBeenCalled();
    });
  });

  describe('ngOnChanges', () => {
    it('should reload on subsequent username change', () => {
      fixture.detectChanges();
      userService.getProfileByUsername.calls.reset();

      component.username = 'bob';
      component.ngOnChanges({
        username: {
          currentValue: 'bob', previousValue: 'alice',
          firstChange: false, isFirstChange: () => false,
        },
      });
      expect(userService.getProfileByUsername).toHaveBeenCalledWith('bob');
    });

    it('should skip reload on first change', () => {
      fixture.detectChanges();
      userService.getProfileByUsername.calls.reset();
      component.ngOnChanges({
        username: {
          currentValue: 'alice', previousValue: undefined,
          firstChange: true, isFirstChange: () => true,
        },
      });
      expect(userService.getProfileByUsername).not.toHaveBeenCalled();
    });
  });

  describe('toggleFollow', () => {
    beforeEach(() => {
      authService.isAuthenticated.and.returnValue(true);
      fixture.detectChanges();
    });

    it('should redirect to login when not authenticated', () => {
      authService.isAuthenticated.and.returnValue(false);
      component.toggleFollow();
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/alice' },
      });
    });

    it('should follow and update state on success', () => {
      component.toggleFollow();
      expect(userService.follow).toHaveBeenCalledWith('alice');
      expect(component.following).toBeTrue();
      expect(component.profile?.followersCount).toBe(101);
    });

    it('should unfollow when already following', () => {
      component.following = true;
      component.toggleFollow();
      expect(userService.unfollow).toHaveBeenCalledWith('alice');
      expect(component.following).toBeFalse();
    });

    it('should revert on follow error', () => {
      userService.follow.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      component.toggleFollow();
      expect(component.following).toBeFalse();
      expect(component.feedbackError).toBeTruthy();
    });

    it('should revert followersCount on error', () => {
      component.profile = { ...mockProfile, followersCount: 100 };
      userService.follow.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      component.toggleFollow();
      expect(component.profile.followersCount).toBe(100);
    });

    it('should set 401-specific error message', () => {
      userService.follow.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 401 })),
      );
      component.toggleFollow();
      expect(component.feedbackError).toContain('Connectez-vous');
    });

    it('should not trigger when already pending', () => {
      component.isFollowPending = true;
      component.toggleFollow();
      expect(userService.follow).not.toHaveBeenCalled();
    });

    it('should show feedback message on success', fakeAsync(() => {
      component.toggleFollow();
      expect(component.feedbackMessage).toContain('suivez');
      tick(3000);
      expect(component.feedbackMessage).toBe('');
    }));
  });

  describe('goToSettings', () => {
    it('should navigate to personal settings', () => {
      component.goToSettings();
      expect(router.navigate).toHaveBeenCalledWith(['/profile/personal_settings']);
    });
  });

  describe('logout', () => {
    it('should logout, clear profile, navigate to login', () => {
      component.logout();
      expect(authService.logout).toHaveBeenCalled();
      expect(userService.clearProfile).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  it('should complete destroy$ and clear timer', fakeAsync(() => {
    fixture.detectChanges();
    component.toggleFollow();
    const spy = spyOn((component as any).destroy$, 'complete');
    component.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
    tick(5000);
  }));
});
