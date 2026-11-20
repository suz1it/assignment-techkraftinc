import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
  HttpStatusCode,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, of, switchMap, take, throwError } from 'rxjs';
import { SKIP_AUTH } from './auth-context';
import { AuthStore } from './auth-store';

const isApiRequest = (req: HttpRequest<unknown>) => req.url.startsWith('/api/');

const is401 = (error: unknown): error is HttpErrorResponse =>
  error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized;

const withBearer = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/**
 * Attaches the bearer token to our API only. When several in-flight requests get 401 together,
 * they all wait on ONE shared refresh and are then retried once with the new token.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_AUTH) || !isApiRequest(req)) return next(req);

  // Injected up front: the callbacks below run outside the injection context.
  const auth = inject(AuthStore);

  // A request started while a refresh is running waits for the new token.
  const tokenToSend$ = auth.pendingRefresh() ?? of(auth.accessToken());

  return tokenToSend$.pipe(
    take(1),
    switchMap((sentWith) =>
      next(withBearer(req, sentWith)).pipe(
        catchError((error: unknown) => {
          if (!is401(error)) return throwError(() => error);
          const current = auth.accessToken();
          // A refresh already finished after this request left: just retry with the newer token.
          const retryToken$ =
            current && current !== sentWith ? of(current) : auth.refreshAccessToken();
          // `next` does not re-enter this interceptor, so a second 401 propagates instead of looping.
          return retryToken$.pipe(switchMap((token) => next(withBearer(req, token))));
        }),
      ),
    ),
  );
};
