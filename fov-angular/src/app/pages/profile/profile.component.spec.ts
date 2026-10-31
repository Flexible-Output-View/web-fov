import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProfileComponent } from './profile.component';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let router: Router;

  function createComponent(authenticated = true, username = 'testuser') {
    TestBed.resetTestingModule();

    authService = jasmine.createSpyObj('AuthService', [
      'isAuthenticated', 'getUsername', 'getCurrentUser', 'getEmail',
    ]);
    authService.isAuthenticated.and.returnValue(authenticated);
    authService.getUsername.and.returnValue(username);
    authService.getCurrentUser.and.returnValue(
      authenticated ? ({ id: 1, username } as any) : null,
    );
    authService.getEmail.and.returnValue(authenticated ? 'test@test.com' : '');

    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideRouter([]),
        // ProfileComponent importe ProfileViewComponent qui injecte
        // UserService → HttpClient. Sans provideHttpClient, DI échoue.
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
      ],
    });

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
  }

  it('should create', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  it('should redirect to /login when not authenticated', () => {
    createComponent(false);
    fixture.detectChanges();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(component.username).toBe('');
  });

  it('should set username from authService when authenticated', () => {
    createComponent(true, 'alice');
    fixture.detectChanges();
    expect(component.username).toBe('alice');
  });
});
