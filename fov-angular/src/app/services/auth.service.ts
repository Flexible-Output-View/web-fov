import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface AuthUser {
  id?: number | string;
  username: string;
  email: string;
  avatarUrl?: string;
}

interface RawAuthResponse {
  token?: string;
  accessToken?: string;
  user?: AuthUser;
  id?: number | string;
  username?: string;
  email?: string;
  avatarUrl?: string;
}

const TOKEN_KEY = 'fov_auth_token';
const USER_KEY = 'fov_auth_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API_URL = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(
    this.readStoredUser(),
  );
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  // ---------- API ----------

  register(
    username: string,
    email: string,
    password: string,
  ): Observable<RawAuthResponse> {
    return this.http
      .post<RawAuthResponse>(`${this.API_URL}/auth/register`, {
        username,
        email,
        password,
      })
      .pipe(
        tap((res) => this.persistSession(res)),
        catchError((err) => this.handleError(err)),
      );
  }

  login(login: string, password: string): Observable<RawAuthResponse> {
    return this.http
      .post<RawAuthResponse>(`${this.API_URL}/auth/login`, {
        login,
        password,
      })
      .pipe(
        tap((res) => this.persistSession(res)),
        catchError((err) => this.handleError(err)),
      );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUserSubject.next(null);
  }

  // ---------- État ----------

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getUsername(): string {
    return this.currentUserSubject.value?.username ?? '';
  }

  getEmail(): string {
    return this.currentUserSubject.value?.email ?? '';
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  // ---------- Helpers ----------

  private persistSession(res: RawAuthResponse): void {
    if (!res) {
      console.warn('[Auth] Empty response');
      return;
    }

    const token = res.token ?? res.accessToken ?? null;
    if (!token) {
      console.warn('[Auth] Response without token:', res);
      return;
    }

    const user: AuthUser | null = res.user
      ? res.user
      : res.username && res.email
        ? {
            id: res.id,
            username: res.username,
            email: res.email,
            avatarUrl: res.avatarUrl,
          }
        : null;

    localStorage.setItem(TOKEN_KEY, token);
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      this.currentUserSubject.next(user);
    }
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  private handleError(err: HttpErrorResponse) {
    let message = 'Une erreur est survenue.';

    if (err.status === 0) {
      message = 'Impossible de contacter le serveur.';
    } else if (err.status === 400) {
      message = err.error?.error || err.error?.message || 'Requête invalide.';
    } else if (err.status === 401) {
      message = err.error?.error || 'Identifiants incorrects.';
    } else if (err.status === 409) {
      message =
        err.error?.error ||
        "Ce nom d'utilisateur ou cet email est déjà utilisé.";
    } else if (err.error?.error) {
      message = err.error.error;
    } else if (err.error?.message) {
      message = err.error.message;
    } else if (err.status >= 500) {
      message = 'Erreur serveur. Réessayez dans un instant.';
    }

    return throwError(() => new Error(message));
  }
}
