import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService, AUTH_TOKEN_KEY } from '../services/auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['logout']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem(AUTH_TOKEN_KEY);
  });

  it('should attach Bearer token when present', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'jwt-123');
    http.get('/api/test').subscribe();
    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-123');
    req.flush({});
  });

  it('should not attach header when no token', () => {
    http.get('/api/test').subscribe();
    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('should logout + redirect on 401 for protected endpoint', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'expired');
    http.get('/api/streams/me').subscribe({ error: () => {} });
    httpMock.expectOne('/api/streams/me').flush('Unauthorized', {
      status: 401, statusText: 'Unauthorized',
    });
    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should NOT logout on 401 for /auth/login', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'tok');
    http.post('/auth/login', {}).subscribe({ error: () => {} });
    httpMock.expectOne('/auth/login').flush('Bad creds', {
      status: 401, statusText: 'Unauthorized',
    });
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('should NOT logout on 401 for /auth/register', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'tok');
    http.post('/auth/register', {}).subscribe({ error: () => {} });
    httpMock.expectOne('/auth/register').flush('Err', {
      status: 401, statusText: 'Unauthorized',
    });
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('should NOT logout on 401 when no token was sent', () => {
    http.get('/api/test').subscribe({ error: () => {} });
    httpMock.expectOne('/api/test').flush('Unauthorized', {
      status: 401, statusText: 'Unauthorized',
    });
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('should pass through non-401 errors without logout', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'valid');
    let status = 0;
    http.get('/api/test').subscribe({ error: (e) => (status = e.status) });
    httpMock.expectOne('/api/test').flush('Err', {
      status: 500, statusText: 'Server Error',
    });
    expect(status).toBe(500);
    expect(authService.logout).not.toHaveBeenCalled();
  });
});
