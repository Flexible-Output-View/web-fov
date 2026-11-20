import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { Router, ActivatedRoute, provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { of, throwError } from 'rxjs';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: Router;

  /**
   * IMPORTANT: the component's constructor runs during TestBed.createComponent(),
   * so any mock behaviour that must affect the constructor (e.g. isAuthenticated)
   * has to be configured BEFORE createComponent is called.
   */
  function createComponent(
    queryParams: Record<string, string> = {},
    authenticated = false,
  ): void {
    const route = {
      snapshot: {
        queryParamMap: { get: (k: string) => queryParams[k] ?? null },
      },
    } as unknown as ActivatedRoute;

    TestBed.resetTestingModule();

    authService = jasmine.createSpyObj<AuthService>('AuthService', [
      'isAuthenticated',
      'login',
    ]);
    // Must be set BEFORE createComponent so the constructor sees the right value.
    authService.isAuthenticated.and.returnValue(authenticated);
    authService.login.and.returnValue(of({ token: 'jwt' }));

    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: ActivatedRoute, useValue: route },
      ],
    });

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    // Constructor executes here → isAuthenticated() already stubbed.
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  }

  describe('constructor', () => {
    it('should redirect to /profile when already authenticated', () => {
      createComponent({}, true);
      fixture.detectChanges();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/profile');
    });

    it('should redirect to returnUrl when authenticated and returnUrl valid', () => {
      createComponent({ returnUrl: '/dashboard/stream' }, true);
      fixture.detectChanges();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/stream');
    });

    it('should ignore external returnUrl (//evil.com)', () => {
      createComponent({ returnUrl: '//evil.com' }, true);
      fixture.detectChanges();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/profile');
    });

    it('should ignore absolute URL returnUrl (http://evil.com)', () => {
      createComponent({ returnUrl: 'http://evil.com' }, true);
      fixture.detectChanges();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/profile');
    });

    it('should not redirect when not authenticated', () => {
      createComponent({}, false);
      fixture.detectChanges();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('onSubmit', () => {
    beforeEach(() => {
      createComponent({}, false);
      fixture.detectChanges();
    });

    it('should set error when fields empty', async () => {
      await component.onSubmit();
      expect(component.errorMessage).toContain('remplir');
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('should set error when login blank', async () => {
      component.login = '   ';
      component.password = 'secret';
      await component.onSubmit();
      expect(component.errorMessage).toContain('remplir');
    });

    it('should set error when password empty', async () => {
      component.login = 'user';
      component.password = '';
      await component.onSubmit();
      expect(component.errorMessage).toContain('remplir');
    });

    it('should call login and navigate on success', async () => {
      component.login = 'user@test.com';
      component.password = 'password123';
      await component.onSubmit();
      expect(authService.login).toHaveBeenCalledWith('user@test.com', 'password123');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/profile');
      expect(component.isLoading).toBeFalse();
    });

    it('should trim login before sending', async () => {
      component.login = '  user@test.com  ';
      component.password = 'password123';
      await component.onSubmit();
      expect(authService.login).toHaveBeenCalledWith('user@test.com', 'password123');
    });

    it('should set error message on login failure', async () => {
      authService.login.and.returnValue(throwError(() => new Error('Bad creds')));
      component.login = 'user@test.com';
      component.password = 'wrong';
      await component.onSubmit();
      expect(component.errorMessage).toBe('Bad creds');
      expect(component.isLoading).toBeFalse();
    });

    it('should set default error when err has no message', async () => {
      authService.login.and.returnValue(throwError(() => ({})));
      component.login = 'user@test.com';
      component.password = 'wrong';
      await component.onSubmit();
      expect(component.errorMessage).toContain('incorrect');
    });

    it('should manage isLoading flag', async () => {
      component.login = 'u';
      component.password = 'p';
      const promise = component.onSubmit();
      expect(component.isLoading).toBeTrue();
      await promise;
      expect(component.isLoading).toBeFalse();
    });
  });
});
