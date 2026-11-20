import {
  HttpErrorResponse,
  HttpHeaders,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, delay, mergeMap, of, throwError, timer } from 'rxjs';
import { LoginRequest, RefreshRequest } from '../auth/auth.models';
import { InvalidTransitionError } from '../domain/application-lifecycle';
import { MockResponse, handleApiRequest } from './application-handlers';
import { MockDb } from './mock-db';

/**
 * Acts as the server for /auth/* and /api/*. Registered LAST so the auth interceptor sees its
 * 401s exactly like real server responses. Never logs request bodies or tokens.
 */
export const mockBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const db = inject(MockDb);
  const path = req.url.split('?')[0];

  if (path === '/auth/login' && req.method === 'POST') {
    const body = req.body as Partial<LoginRequest> | null;
    const user = db.findUserByCredentials(body?.username ?? '', body?.password ?? '');
    return respond(
      req,
      db,
      user
        ? { status: 200, body: db.issueSession(user) }
        : unauthorized('Invalid username or password.'),
    );
  }

  if (path === '/auth/refresh' && req.method === 'POST') {
    db.refreshCalls++;
    const body = req.body as Partial<RefreshRequest> | null;
    const session = db.consumeRefreshToken(body?.refreshToken ?? '');
    return respond(
      req,
      db,
      session
        ? { status: 200, body: db.issueSession(session.user, session.family) }
        : unauthorized('Session expired.'),
    );
  }

  if (path === '/auth/logout' && req.method === 'POST') {
    const body = req.body as Partial<RefreshRequest> | null;
    db.revokeSession(body?.refreshToken ?? '');
    // Always 204: the answer must not reveal whether the token was valid.
    return respond(req, db, { status: 204, body: null });
  }

  if (path.startsWith('/api/')) {
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const user = db.userForAccessToken(token);
    if (!user) return respond(req, db, unauthorized('Unauthorized'));
    if (db.consumeFailure()) {
      return respond(req, db, { status: 500, body: { message: 'Simulated server error.' } });
    }
    return respond(
      req,
      db,
      runHandler(() =>
        handleApiRequest(db, user, {
          method: req.method,
          path,
          query: new URLSearchParams(req.urlWithParams.split('?')[1] ?? ''),
          body: req.body,
        }),
      ),
    );
  }

  return next(req);
};

function runHandler(handler: () => MockResponse): MockResponse {
  try {
    return handler();
  } catch (error: unknown) {
    if (error instanceof InvalidTransitionError)
      return { status: 409, body: { message: error.message } };
    throw error;
  }
}

function unauthorized(message: string): MockResponse {
  return { status: 401, body: { message } };
}

function respond(
  req: HttpRequest<unknown>,
  db: MockDb,
  res: MockResponse,
): Observable<HttpResponse<unknown>> {
  const headers = new HttpHeaders(res.headers ?? {});
  const latency = db.latencyMs();
  if (res.status >= 400) {
    return timer(latency).pipe(
      mergeMap(() =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: res.status,
              statusText: statusText(res.status),
              url: req.url,
              error: res.body,
              headers,
            }),
        ),
      ),
    );
  }
  return of(new HttpResponse({ status: res.status, body: res.body, headers, url: req.url })).pipe(
    delay(latency),
  );
}

function statusText(status: number): string {
  const texts: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    500: 'Internal Server Error',
  };
  return texts[status] ?? 'Error';
}
