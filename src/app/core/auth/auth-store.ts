import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { AuthUser } from '../domain/user.model';
import { AuthSession, LoginRequest } from './auth.models';
import { AuthService } from './services/auth.service';

/**
 * Session state. Tokens live in memory only (a reload means signing in again), so nothing
 * auth-related ever reaches browser storage. A real app would keep the refresh token in an
 * httpOnly cookie instead. HTTP calls are delegated to AuthService.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  private readonly session = signal<AuthSession | null>(null);
  readonly user = computed<AuthUser | null>(() => this.session()?.user ?? null);
  readonly accessToken = computed(() => this.session()?.tokens.accessToken ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  private refreshInFlight$: Observable<string> | null = null;

  login(credentials: LoginRequest): Observable<AuthUser> {
    return this.authService.login(credentials).pipe(
      tap((session) => this.session.set(session)),
      map((session) => session.user),
    );
  }

  /** The refresh currently running, if any. New requests wait on it instead of sending a stale token. */
  pendingRefresh(): Observable<string> | null {
    return this.refreshInFlight$;
  }

  /** Returns the new access token. Concurrent callers share ONE `POST /auth/refresh`. */
  refreshAccessToken(): Observable<string> {
    if (this.refreshInFlight$) return this.refreshInFlight$;

    const refreshToken = this.session()?.tokens.refreshToken;
    if (!refreshToken) {
      this.endSession();
      return throwError(() => new Error('No refresh token'));
    }

    this.refreshInFlight$ = this.authService.refresh({ refreshToken }).pipe(
      tap((session) => this.session.set(session)),
      map((session) => session.tokens.accessToken),
      catchError((error: unknown) => {
        // The server already rejected the refresh token: there is nothing left to revoke.
        this.endSession();
        return throwError(() => error);
      }),
      finalize(() => (this.refreshInFlight$ = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshInFlight$;
  }

  /**
   * Signs the user out. The server is told to revoke the session (best effort: signing out never
   * waits on the network or fails because of it), then the session is dropped locally.
   */
  logout(): void {
    const refreshToken = this.session()?.tokens.refreshToken;
    if (refreshToken) {
      this.authService.logout({ refreshToken }).subscribe({ error: () => undefined });
    }
    this.endSession();
  }

  /** Drops the session locally and returns to the sign-in page, keeping where the user was. */
  private endSession(): void {
    this.session.set(null);
    const current = this.router.url;
    const returnUrl =
      current && !current.startsWith('/login') && current !== '/' ? current : undefined;
    void this.router.navigate(['/login'], returnUrl ? { queryParams: { returnUrl } } : {});
  }

  /** Test seam: start from a known session without going through login. */
  setSession(session: AuthSession | null): void {
    this.session.set(session);
  }
}
