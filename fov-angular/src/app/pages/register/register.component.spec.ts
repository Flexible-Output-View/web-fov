import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RegisterComponent } from './register.component';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../services/auth.service';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: Router;

  function createComponent(authenticated = false) {
    TestBed.resetTestingModule();

    authService = jasmine.createSpyObj('AuthService', [
      'isAuthenticated', 'register', 'getCurrentUser', 'getUsername',
    ]);
    authService.isAuthenticated.and.returnValue(authenticated);
    authService.register.and.returnValue(of({ token: 'jwt' } as any));
    authService.getCurrentUser.and.returnValue(null);
    authService.getUsername.and.returnValue('');

    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    });

    // On injecte le vrai Router fourni par provideRouter, puis on spy
    // dessus : RouterLink / RouterLinkActive disposent ainsi de
    // serializeUrl/createUrlTree/events.
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
  }

  describe('constructor', () => {
    it('should redirect to /profile when already authenticated', () => {
      createComponent(true);
      expect(router.navigate).toHaveBeenCalledWith(['/profile']);
    });

    it('should not redirect when not authenticated', () => {
      createComponent(false);
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('onSubmit', () => {
    beforeEach(() => {
      createComponent(false);
      fixture.detectChanges();
    });

    it('should error when fields empty', async () => {
      await component.onSubmit();
      expect(component.errorMessage).toContain('remplir');
    });

    it('should error when username blank', async () => {
      component.username = '   ';
      component.email = 'a@b.com';
      component.password = '12345678';
      component.confirmPassword = '12345678';
      await component.onSubmit();
      expect(component.errorMessage).toContain('remplir');
    });

    it('should error when passwords mismatch', async () => {
      component.username = 'user';
      component.email = 'a@b.com';
      component.password = '12345678';
      component.confirmPassword = '87654321';
      await component.onSubmit();
      expect(component.errorMessage).toContain('correspondent');
    });

    it('should error when password too short', async () => {
      component.username = 'user';
      component.email = 'a@b.com';
      component.password = '1234567';
      component.confirmPassword = '1234567';
      await component.onSubmit();
      expect(component.errorMessage).toContain('8 caractères');
    });

    it('should register and navigate on success', async () => {
      component.username = '  user  ';
      component.email = '  a@b.com  ';
      component.password = '12345678';
      component.confirmPassword = '12345678';
      await component.onSubmit();
      expect(authService.register).toHaveBeenCalledWith('user', 'a@b.com', '12345678');
      expect(router.navigate).toHaveBeenCalledWith(['/profile']);
    });

    it('should set error on register failure', async () => {
      authService.register.and.returnValue(throwError(() => new Error('Email pris')));
      component.username = 'user';
      component.email = 'a@b.com';
      component.password = '12345678';
      component.confirmPassword = '12345678';
      await component.onSubmit();
      expect(component.errorMessage).toBe('Email pris');
    });

    it('should set default error when err has no message', async () => {
      authService.register.and.returnValue(throwError(() => ({})));
      component.username = 'user';
      component.email = 'a@b.com';
      component.password = '12345678';
      component.confirmPassword = '12345678';
      await component.onSubmit();
      expect(component.errorMessage).toContain('inscription');
    });

    it('should manage isLoading flag', async () => {
      component.username = 'u';
      component.email = 'e@e.com';
      component.password = '12345678';
      component.confirmPassword = '12345678';
      const p = component.onSubmit();
      expect(component.isLoading).toBeTrue();
      await p;
      expect(component.isLoading).toBeFalse();
    });
  });
});
