import { HttpErrorResponse, HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Notifier } from '../notifications/notifier';

/**
 * Global notifications for errors no screen is expected to handle locally. Never touches 401
 * (the auth interceptor owns it) and never retries: screens render their own error + Retry,
 * and the draft save queue has its own retry policy.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifier = inject(Notifier);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === HttpStatusCode.Forbidden) {
          notifier.notify('You do not have permission to do that.');
        } else if (error.status === 0) {
          notifier.notify('Network error. Check your connection.');
        }
      }
      return throwError(() => error);
    }),
  );
};
