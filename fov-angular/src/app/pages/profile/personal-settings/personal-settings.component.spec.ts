import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PersonalSettingsComponent } from './personal-settings.component';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { UserProfile, UserService } from '../../../services/user.service';

describe('PersonalSettingsComponent', () => {
  let component: PersonalSettingsComponent;
  let fixture: ComponentFixture<PersonalSettingsComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let userService: jasmine.SpyObj<UserService>;
  let router: jasmine.SpyObj<Router>;
  let currentProfile$: BehaviorSubject<UserProfile | null>;

  const mockProfile: UserProfile = {
    username: 'testuser',
    avatarUrl: 'avatar.jpg',
    bio: 'My bio',
    bannerUrl: 'banner.jpg',
    followersCount: 10,
    followingCount: 5,
  } as UserProfile;

  function setup(authenticated = true) {
    TestBed.resetTestingModule();
    currentProfile$ = new BehaviorSubject<UserProfile | null>(null);

    authService = jasmine.createSpyObj('AuthService', ['isAuthenticated', 'logout']);
    authService.isAuthenticated.and.returnValue(authenticated);

    userService = jasmine.createSpyObj('UserService', [
      'loadProfile', 'updateProfile', 'changePassword',
      'deleteAccount', 'clearProfile',
    ], {
      currentProfile$: currentProfile$.asObservable(),
    });
    userService.loadProfile.and.returnValue(of(mockProfile));
    userService.updateProfile.and.returnValue(of(mockProfile));
    userService.changePassword.and.returnValue(of(undefined as void));
    userService.deleteAccount.and.returnValue(of(undefined as void));

    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [PersonalSettingsComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: Router, useValue: router },
      ],
    });

    fixture = TestBed.createComponent(PersonalSettingsComponent);
    component = fixture.componentInstance;
  }

  // ── ngOnInit ──────────────────────────────────────────────────
  describe('ngOnInit', () => {
    it('should redirect to /login when not authenticated', () => {
      setup(false);
      fixture.detectChanges();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should load profile when authenticated', () => {
      setup(true);
      fixture.detectChanges();
      expect(userService.loadProfile).toHaveBeenCalled();
    });

    it('should populate drafts from currentProfile$', () => {
      setup(true);
      fixture.detectChanges();
      currentProfile$.next(mockProfile);
      expect(component.bioDraft).toBe('My bio');
      expect(component.avatarUrlDraft).toBe('avatar.jpg');
      expect(component.bannerUrlDraft).toBe('banner.jpg');
    });

    it('should redirect on 401 load error', () => {
      setup(true);
      userService.loadProfile.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 401 })),
      );
      fixture.detectChanges();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should set errorMessage on non-401 load error', () => {
      setup(true);
      userService.loadProfile.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: { error: 'Fail' } })),
      );
      fixture.detectChanges();
      expect(component.errorMessage).toBe('Fail');
    });
  });

  // ── saveProfile ───────────────────────────────────────────────
  describe('saveProfile', () => {
    beforeEach(() => {
      setup(true);
      fixture.detectChanges();
      component.bioDraft = 'New bio';
    });

    it('should error when bio exceeds 300 chars', () => {
      component.bioDraft = 'a'.repeat(301);
      component.saveProfile();
      expect(component.errorMessage).toContain('300');
      expect(userService.updateProfile).not.toHaveBeenCalled();
    });

    it('should call updateProfile with drafts', () => {
      component.saveProfile();
      expect(userService.updateProfile).toHaveBeenCalledWith({
        bio: 'New bio',
        avatarUrl: '',
        bannerUrl: '',
      });
    });

    it('should show success message', () => {
      component.saveProfile();
      expect(component.successMessage).toContain('mis à jour');
    });

    it('should clear success message after 2500ms', fakeAsync(() => {
      component.saveProfile();
      tick(2500);
      expect(component.successMessage).toBe('');
    }));

    it('should extract backend validation error', () => {
      userService.updateProfile.and.returnValue(
        throwError(() => new HttpErrorResponse({
          status: 422,
          error: { errors: { bio: 'Trop long' } },
        })),
      );
      component.saveProfile();
      expect(component.errorMessage).toBe('Trop long');
    });
  });

  // ── savePassword ──────────────────────────────────────────────
  describe('savePassword', () => {
    beforeEach(() => {
      setup(true);
      fixture.detectChanges();
    });

    it('should error when fields empty', () => {
      component.savePassword();
      expect(component.errorMessage).toContain('obligatoires');
    });

    it('should error when passwords mismatch', () => {
      component.currentPassword = 'old';
      component.newPassword = 'newpass1';
      component.confirmNewPassword = 'newpass2';
      component.savePassword();
      expect(component.errorMessage).toContain('correspondent');
    });

    it('should error when new password too short', () => {
      component.currentPassword = 'old';
      component.newPassword = 'short';
      component.confirmNewPassword = 'short';
      component.savePassword();
      expect(component.errorMessage).toContain('8 caractères');
    });

    it('should error when new equals current', () => {
      component.currentPassword = 'samepass1';
      component.newPassword = 'samepass1';
      component.confirmNewPassword = 'samepass1';
      component.savePassword();
      expect(component.errorMessage).toContain('différent');
    });

    it('should call changePassword on valid input', () => {
      component.currentPassword = 'oldpass1';
      component.newPassword = 'newpass1';
      component.confirmNewPassword = 'newpass1';
      component.savePassword();
      expect(userService.changePassword).toHaveBeenCalledWith('oldpass1', 'newpass1');
    });

    it('should clear fields on success', () => {
      component.currentPassword = 'oldpass1';
      component.newPassword = 'newpass1';
      component.confirmNewPassword = 'newpass1';
      component.savePassword();
      expect(component.currentPassword).toBe('');
      expect(component.newPassword).toBe('');
      expect(component.confirmNewPassword).toBe('');
      expect(component.successMessage).toContain('Mot de passe');
    });
  });

  // ── deleteAccount ─────────────────────────────────────────────
  describe('deleteAccount', () => {
    beforeEach(() => {
      setup(true);
      fixture.detectChanges();
    });

    it('should error when password empty', () => {
      component.deleteAccount();
      expect(component.deleteErrorMessage).toContain('mot de passe');
    });

    it('should call deleteAccount with password', () => {
      component.deletePassword = 'mypassword';
      component.deleteAccount();
      expect(userService.deleteAccount).toHaveBeenCalledWith('mypassword');
    });

    it('should logout and redirect on success', () => {
      component.deletePassword = 'mypassword';
      component.deleteAccount();
      expect(authService.logout).toHaveBeenCalled();
      expect(userService.clearProfile).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should set error on failure', () => {
      userService.deleteAccount.and.returnValue(
        throwError(() => new HttpErrorResponse({
          status: 403, error: { error: 'Wrong password' },
        })),
      );
      component.deletePassword = 'wrong';
      component.deleteAccount();
      expect(component.deleteErrorMessage).toBe('Wrong password');
      expect(component.isDeletingAccount).toBeFalse();
    });

    it('should not trigger when already deleting', () => {
      component.isDeletingAccount = true;
      component.deletePassword = 'pass';
      component.deleteAccount();
      expect(userService.deleteAccount).not.toHaveBeenCalled();
    });
  });

  // ── Modal ─────────────────────────────────────────────────────
  describe('delete modal', () => {
    beforeEach(() => {
      setup(true);
      fixture.detectChanges();
    });

    it('should open modal and reset fields', () => {
      component.deletePassword = 'old';
      component.deleteErrorMessage = 'err';
      component.openDeleteModal();
      expect(component.isDeleteModalOpen).toBeTrue();
      expect(component.deletePassword).toBe('');
      expect(component.deleteErrorMessage).toBe('');
    });

    it('should close modal and reset fields', () => {
      component.isDeleteModalOpen = true;
      component.deletePassword = 'old';
      component.closeDeleteModal();
      expect(component.isDeleteModalOpen).toBeFalse();
      expect(component.deletePassword).toBe('');
    });

    it('should not close while deleting', () => {
      component.isDeleteModalOpen = true;
      component.isDeletingAccount = true;
      component.closeDeleteModal();
      expect(component.isDeleteModalOpen).toBeTrue();
    });

    it('should close on Escape key', () => {
      component.isDeleteModalOpen = true;
      component.onEscapeKey();
      expect(component.isDeleteModalOpen).toBeFalse();
    });

    it('should ignore Escape when modal closed', () => {
      component.isDeleteModalOpen = false;
      spyOn(component, 'closeDeleteModal');
      component.onEscapeKey();
      expect(component.closeDeleteModal).not.toHaveBeenCalled();
    });
  });

  // ── Image uploads (guard paths) ───────────────────────────────
  describe('image uploads', () => {
    beforeEach(() => {
      setup(true);
      fixture.detectChanges();
    });

    it('should return early when no file selected (avatar)', async () => {
      const event = { target: { files: [], value: '' } } as any;
      await component.onAvatarSelected(event);
      expect(component.avatarUrlDraft).toBe('');
    });

    it('should return early when no file selected (banner)', async () => {
      const event = { target: { files: [], value: '' } } as any;
      await component.onBannerSelected(event);
      expect(component.bannerUrlDraft).toBe('');
    });

    it('should clear avatar draft', () => {
      component.avatarUrlDraft = 'data:image/png;base64,...';
      component.removeAvatar();
      expect(component.avatarUrlDraft).toBe('');
    });

    it('should clear banner draft', () => {
      component.bannerUrlDraft = 'data:image/png;base64,...';
      component.removeBanner();
      expect(component.bannerUrlDraft).toBe('');
    });
  });

  // ── cancel ────────────────────────────────────────────────────
  describe('cancel', () => {
    it('should navigate to /profile', () => {
      setup(true);
      fixture.detectChanges();
      component.cancel();
      expect(router.navigate).toHaveBeenCalledWith(['/profile']);
    });
  });

  // ── ngOnDestroy ───────────────────────────────────────────────
  it('should complete destroy$', () => {
    setup(true);
    fixture.detectChanges();
    const spy = spyOn((component as any).destroy$, 'complete');
    component.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
  });
});
