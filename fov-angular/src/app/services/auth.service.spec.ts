import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { HttpClient } from '@angular/common/http';
import {
  AuthService,
  AuthUser,
  AUTH_TOKEN_KEY,
} from './auth.service';
import { environment } from '../../environments/environment';

describe('AuthService', () => {
  let httpMock: HttpTestingController;

  const USER_KEY = 'fov_auth_user';

  const mockUser: AuthUser = {
    id: 1,
    username: 'john_doe',
    email: 'john@example.com',
    avatarUrl: 'https://img.test/avatar.jpg',
  };

  /**
   * AuthService is providedIn:'root'. TestBed caches root providers between
   * tests, so `TestBed.inject(AuthService)` after mutating localStorage would
   * return the SAME instance (already constructed with an empty localStorage).
   * We build a fresh instance manually whenever we need the constructor to
   * re-read localStorage.
   */
  function createFreshService(): AuthService {
    const http = TestBed.inject(HttpClient);
    return new AuthService(http);
  }

  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });

    httpMock = TestBed.inject(HttpTestingController);
    // Fresh instance, constructed with an empty localStorage.
    service = createFreshService();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── Initial State ─────────────────────────────────────────────
  describe('initial state with stored user', () => {
    it('should restore user from localStorage if valid JSON', () => {
      localStorage.setItem(USER_KEY, JSON.stringify(mockUser));

      // Construct AFTER localStorage is populated → constructor reads it.
      const newService = createFreshService();

      expect(newService.getCurrentUser()).toEqual(mockUser);
      expect(newService.getUsername()).toBe('john_doe');
      expect(newService.getEmail()).toBe('john@example.com');
    });

    it('should return null user if stored JSON is corrupt', () => {
      localStorage.setItem(USER_KEY, '{corrupted_json');

      const newService = createFreshService();
      expect(newService.getCurrentUser()).toBeNull();
    });
  });

  // ── register ──────────────────────────────────────────────────
  describe('register', () => {
    it('should send POST to /auth/register and persist session with user object', (done) => {
      const responsePayload = {
        token: 'token-reg-123',
        user: mockUser,
      };

      service.register('john_doe', 'john@example.com', 'password123').subscribe({
        next: (res) => {
          expect(res).toEqual(responsePayload);
          expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('token-reg-123');
          expect(localStorage.getItem(USER_KEY)).toContain('john_doe');
          expect(service.getCurrentUser()).toEqual(mockUser);
          expect(service.isAuthenticated()).toBeTrue();
          done();
        },
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'password123',
      });
      req.flush(responsePayload);
    });

    it('should build user from top-level fields if user object is omitted', (done) => {
      const responsePayload = {
        accessToken: 'access-token-456',
        id: 2,
        username: 'alice',
        email: 'alice@example.com',
        avatarUrl: 'a.png',
      };

      service.register('alice', 'alice@example.com', 'pass123').subscribe({
        next: () => {
          expect(service.getToken()).toBe('access-token-456');
          expect(service.getUsername()).toBe('alice');
          expect(service.getEmail()).toBe('alice@example.com');
          done();
        },
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
      req.flush(responsePayload);
    });
  });

  // ── login ─────────────────────────────────────────────────────
  describe('login', () => {
    it('should send POST to /auth/login and persist session', (done) => {
      const responsePayload = {
        token: 'login-token-789',
        user: mockUser,
      };

      service.login('john_doe', 'pass123').subscribe({
        next: () => {
          expect(service.getToken()).toBe('login-token-789');
          expect(service.isAuthenticated()).toBeTrue();
          done();
        },
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        login: 'john_doe',
        password: 'pass123',
      });
      req.flush(responsePayload);
    });

    it('should drop stale user when response has token but no user payload', (done) => {
      localStorage.setItem(USER_KEY, JSON.stringify(mockUser));

      service.login('john_doe', 'pass123').subscribe({
        next: () => {
          expect(localStorage.getItem(USER_KEY)).toBeNull();
          expect(service.getCurrentUser()).toBeNull();
          done();
        },
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush({ token: 'only-token' });
    });
  });

  // ── logout ────────────────────────────────────────────────────
  describe('logout', () => {
    it('should clear localStorage and currentUserSubject', () => {
      localStorage.setItem(AUTH_TOKEN_KEY, 'some-token');
      localStorage.setItem(USER_KEY, JSON.stringify(mockUser));

      service.logout();

      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(USER_KEY)).toBeNull();
      expect(service.getCurrentUser()).toBeNull();
      expect(service.isAuthenticated()).toBeFalse();
    });
  });

  // ── Helpers & State ───────────────────────────────────────────
  describe('state getters', () => {
    it('should return empty string for username/email when no user', () => {
      expect(service.getUsername()).toBe('');
      expect(service.getEmail()).toBe('');
    });
  });

  // ── Error handling ────────────────────────────────────────────
  describe('handleError mapping', () => {
    it('should map status 0 to network error message', (done) => {
      service.login('u', 'p').subscribe({
        error: (err: Error) => {
          expect(err.message).toBe('Impossible de contacter le serveur.');
          done();
        },
      });
      httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush('', {
        status: 0,
        statusText: 'Unknown Error',
      });
    });

    it('should map status 400 with validation errors object', (done) => {
      service.login('u', 'p').subscribe({
        error: (err: Error) => {
          expect(err.message).toBe('Nom requis Email invalide');
          done();
        },
      });
      httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush(
        { errors: { u: 'Nom requis', e: 'Email invalide' } },
        { status: 400, statusText: 'Bad Request' },
      );
    });

    it('should map status 401 to bad credentials message', (done) => {
      service.login('u', 'p').subscribe({
        error: (err: Error) => {
          expect(err.message).toBe('Identifiants incorrects.');
          done();
        },
      });
      httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush(
        {},
        { status: 401, statusText: 'Unauthorized' },
      );
    });

    it('should map status 409 to conflict message', (done) => {
      service.register('u', 'e', 'p').subscribe({
        error: (err: Error) => {
          expect(err.message).toBe(
            "Ce nom d'utilisateur ou cet email est déjà utilisé.",
          );
          done();
        },
      });
      httpMock.expectOne(`${environment.apiUrl}/auth/register`).flush(
        {},
        { status: 409, statusText: 'Conflict' },
      );
    });

    it('should map status >= 500 to server error message', (done) => {
      service.login('u', 'p').subscribe({
        error: (err: Error) => {
          expect(err.message).toBe('Erreur serveur. Réessayez dans un instant.');
          done();
        },
      });
      httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush(
        {},
        { status: 503, statusText: 'Service Unavailable' },
      );
    });
  });
});
