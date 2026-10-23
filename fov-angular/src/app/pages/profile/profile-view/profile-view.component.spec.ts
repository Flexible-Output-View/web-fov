import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { UserProfile, UserService } from '../../../services/user.service';
import { ProfileViewComponent } from './profile-view.component';

describe('ProfileViewComponent', () => {
  let fixture: ComponentFixture<ProfileViewComponent>;
  let component: ProfileViewComponent;
  let authService: jasmine.SpyObj<AuthService>;
  let userService: jasmine.SpyObj<UserService>;
  let router: jasmine.SpyObj<Router>;

  const publicProfile: UserProfile = {
    id: 2,
    username: 'alice',
    bio: 'Hello',
    avatarUrl: '',
    bannerUrl: '',
    followersCount: 2,
    followingCount: 3,
    isFollowing: false,
  };

  beforeEach(async () => {
    authService = jasmine.createSpyObj('AuthService', [
      'isAuthenticated',
      'getCurrentUser',
      'logout',
    ]);
    authService.isAuthenticated.and.returnValue(true);
    authService.getCurrentUser.and.returnValue({
      username: 'viewer',
      email: 'viewer@example.com',
    });

    userService = jasmine.createSpyObj('UserService', [
      'getProfileByUsername',
      'loadProfile',
      'getCurrentProfile',
      'follow',
      'unfollow',
      'clearProfile',
    ]);
    userService.getProfileByUsername.and.returnValue(of({ ...publicProfile }));
    userService.getCurrentProfile.and.returnValue(null);

    router = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ProfileViewComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileViewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('username', 'alice');
    fixture.detectChanges();
  });

  it('loads the public profile and renders the heart button', () => {
    const button = fixture.nativeElement.querySelector(
      '.btn-follow'
    ) as HTMLButtonElement;

    expect(component.profile?.username).toBe('alice');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('🤍');
    expect(button.textContent).toContain('Suivre');
  });

  it('follows a user, updates the count and shows a success message', () => {
    userService.follow.and.returnValue(
      of({ following: true, followersCount: 3 })
    );

    const button = fixture.nativeElement.querySelector(
      '.btn-follow'
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(userService.follow).toHaveBeenCalledWith('alice');
    expect(component.following).toBeTrue();
    expect(component.profile?.followersCount).toBe(3);
    expect(component.feedbackMessage).toBe('Vous suivez maintenant alice.');

    const feedback = fixture.nativeElement.querySelector(
      '.follow-feedback.success'
    ) as HTMLElement;
    expect(feedback.textContent).toContain('Vous suivez maintenant alice.');
    expect(button.textContent).toContain('❤️');
    expect(button.textContent).toContain('Abonné');
  });

  it('unfollows a user and shows the unfollow message', () => {
    component.following = true;
    userService.unfollow.and.returnValue(
      of({ following: false, followersCount: 1 })
    );

    component.toggleFollow();
    fixture.detectChanges();

    expect(userService.unfollow).toHaveBeenCalledWith('alice');
    expect(component.following).toBeFalse();
    expect(component.profile?.followersCount).toBe(1);
    expect(component.feedbackMessage).toBe('Vous ne suivez plus alice.');
  });

  it('reverts the optimistic state and shows an error when the request fails', () => {
    userService.follow.and.returnValue(
      throwError(
        () => new HttpErrorResponse({ status: 500, error: { error: 'boom' } })
      )
    );

    component.toggleFollow();
    fixture.detectChanges();

    expect(component.following).toBeFalse();
    expect(component.profile?.followersCount).toBe(2);
    expect(component.feedbackError).toBe(
      'Impossible de mettre à jour l\u2019abonnement.'
    );
  });

  it('sends guests to the login page with a return URL', () => {
    authService.isAuthenticated.and.returnValue(false);

    component.toggleFollow();

    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/alice' },
    });
    expect(userService.follow).not.toHaveBeenCalled();
  });

  it('reloads the profile when the username input changes', () => {
    userService.getProfileByUsername.calls.reset();

    fixture.componentRef.setInput('username', 'bob');
    fixture.detectChanges();

    expect(userService.getProfileByUsername).toHaveBeenCalledWith('bob');
  });
});
