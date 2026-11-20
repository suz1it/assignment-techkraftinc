import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SKIP_AUTH } from '../auth-context';
import { AuthSession, LoginRequest, RefreshRequest } from '../auth.models';

/**
 * HTTP calls for authentication, and nothing else. Session state and the single-flight refresh
 * live in AuthStore. All calls skip the auth interceptor: they must never carry a bearer token
 * or trigger a refresh themselves.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  login(credentials: LoginRequest): Observable<AuthSession> {
    return this.http.post<AuthSession>('/auth/login', credentials, { context: skipAuth() });
  }

  refresh(body: RefreshRequest): Observable<AuthSession> {
    return this.http.post<AuthSession>('/auth/refresh', body, { context: skipAuth() });
  }

  /** Ends the session on the server, so a copied refresh token stops working. */
  logout(body: RefreshRequest): Observable<void> {
    return this.http.post<void>('/auth/logout', body, { context: skipAuth() });
  }
}

function skipAuth(): HttpContext {
  return new HttpContext().set(SKIP_AUTH, true);
}
