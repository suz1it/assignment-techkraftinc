import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from './auth-store';
import { AuthSession } from './auth.models';

const session: AuthSession = {
  tokens: { accessToken: 'a1', refreshToken: 'r1', expiresAt: Date.now() + 60_000 },
  user: { id: 'u1', name: 'Test User', role: 'ADMIN' },
};

describe('AuthStore', () => {
  let store: AuthStore;
  let httpTesting: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(AuthStore);
    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpTesting.verify());

  it('signs in and exposes the user and token', () => {
    let signedIn = '';
    store.login({ username: 'admin', password: 'x' }).subscribe((user) => (signedIn = user.name));
    httpTesting.expectOne('/auth/login').flush(session);

    expect(signedIn).toBe('Test User');
    expect(store.isAuthenticated()).toBe(true);
    expect(store.accessToken()).toBe('a1');
    expect(store.user()?.role).toBe('ADMIN');
  });

  it('shares one refresh request between concurrent callers', () => {
    store.setSession(session);
    const tokens: string[] = [];
    store.refreshAccessToken().subscribe((token) => tokens.push(token));
    store.refreshAccessToken().subscribe((token) => tokens.push(token));

    httpTesting
      .expectOne('/auth/refresh')
      .flush({ ...session, tokens: { ...session.tokens, accessToken: 'a2' } });

    expect(tokens).toEqual(['a2', 'a2']);
    expect(store.pendingRefresh()).toBeNull();
  });

  it('logs out when there is no refresh token', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    let failed = false;
    store.refreshAccessToken().subscribe({ error: () => (failed = true) });
    expect(failed).toBe(true);
    expect(navigate).toHaveBeenCalled();
  });

  it('asks the server to revoke the session on sign-out, and signs out locally at once', () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setSession(session);
    store.logout();
    expect(store.isAuthenticated()).toBe(false);
    const req = httpTesting.expectOne({ method: 'POST', url: '/auth/logout' });
    expect(req.request.body).toEqual({ refreshToken: 'r1' });
    // A failed revoke must not resurrect the session or throw.
    req.flush(null, { status: 500, statusText: 'Server Error' });
    expect(store.isAuthenticated()).toBe(false);
  });

  it('does not call /auth/logout when the refresh token was already rejected', () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setSession(session);
    store.refreshAccessToken().subscribe({ error: () => undefined });
    httpTesting
      .expectOne('/auth/refresh')
      .flush({ message: 'Session expired.' }, { status: 401, statusText: 'Unauthorized' });
    expect(store.isAuthenticated()).toBe(false);
    httpTesting.expectNone('/auth/logout');
  });

  it('keeps the current page as returnUrl but never returns to /login', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/applications/APP-1');
    store.setSession(session);
    store.logout();
    httpTesting.expectOne('/auth/logout').flush(null);
    expect(navigate).toHaveBeenLastCalledWith(['/login'], {
      queryParams: { returnUrl: '/applications/APP-1' },
    });

    vi.spyOn(router, 'url', 'get').mockReturnValue('/login?returnUrl=%2Fx');
    store.logout();
    expect(navigate).toHaveBeenLastCalledWith(['/login'], {});
    expect(store.isAuthenticated()).toBe(false);
  });
});
