import { HttpInterceptorFn } from '@angular/common/http';
import { AUTH_TOKEN_KEY } from '../services/auth.service';

/**
 * Attaches the stored JWT (if any) to every outgoing API request so protected
 * endpoints such as `PUT /api/users/me` can authenticate the caller.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    return next(req);
  }

  return next(
    req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  );
};
