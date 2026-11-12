import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    router = jasmine.createSpyObj('Router', ['createUrlTree']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('should return true when authenticated', () => {
    authService.isAuthenticated.and.returnValue(true);
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as any, { url: '/dashboard' } as any),
    );
    expect(result).toBeTrue();
  });

  it('should redirect to /login with returnUrl when not authenticated', () => {
    authService.isAuthenticated.and.returnValue(false);
    const mockTree = {} as any;
    router.createUrlTree.and.returnValue(mockTree);

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as any, { url: '/dashboard/stream' } as any),
    );

    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/dashboard/stream' },
    });
    expect(result).toBe(mockTree);
  });
});
