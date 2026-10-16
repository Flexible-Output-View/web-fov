import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService, AUTH_TOKEN_KEY } from '../services/auth.service';

/** Auth endpoints legitimately return 401 (bad credentials); don't treat those as an expired session. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register'];

/**
 * Attaches the stored JWT (if any) to every outgoing API request so protected
 * endpoints such as `PUT /api/users/me` can authenticate the caller.
 *
 * Also handles expired/invalid tokens globally: a 401 on an authenticated
 * request clears the stored session and redirects to the login page.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));

      if (err.status === 401 && token && !isAuthEndpoint) {
        authService.logout();
        router.navigate(['/login']);
      }

      return throwError(() => err);
    }),
  );
};
