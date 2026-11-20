import {
  HttpClient,
  HttpErrorResponse,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthSession } from '../auth/auth.models';
import { MOCK_PASSWORD, MockDb } from './mock-db';
import { mockBackendInterceptor } from './mock-backend.interceptor';

describe('mockBackendInterceptor', () => {
  let http: HttpClient;
  let db: MockDb;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([mockBackendInterceptor])),
        // Anything the mock doesn't own reaches this fake network instead of a real one.
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    db = TestBed.inject(MockDb);
    db.minLatencyMs = 0;
    db.maxLatencyMs = 0;
  });

  const login = (username = 'admin', password = MOCK_PASSWORD) =>
    firstValueFrom(http.post<AuthSession>('/auth/login', { username, password }));
  const statusOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return 200;
    } catch (error: unknown) {
      return error instanceof HttpErrorResponse ? error.status : -1;
    }
  };
  const authed = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lets requests it does not own (e.g. static assets) through to the network', async () => {
    const response = firstValueFrom(http.get('/assets/config.json'));
    TestBed.inject(HttpTestingController).expectOne('/assets/config.json').flush({ ok: true });
    expect(await response).toEqual({ ok: true });
  });

  it('answers malformed auth bodies with 401 instead of crashing', async () => {
    expect(await statusOf(firstValueFrom(http.post('/auth/login', null)))).toBe(401);
    expect(await statusOf(firstValueFrom(http.post('/auth/refresh', null)))).toBe(401);
  });

  it('signs in with valid credentials and rejects invalid ones', async () => {
    const session = await login();
    expect(session.user.role).toBe('ADMIN');
    expect(await statusOf(login('admin', 'wrong'))).toBe(401);
  });

  it('rejects API calls without a valid, unexpired token', async () => {
    expect(await statusOf(firstValueFrom(http.get('/api/applications')))).toBe(401);
    const { tokens } = await login();
    expect(
      await statusOf(firstValueFrom(http.get('/api/applications', authed(tokens.accessToken)))),
    ).toBe(200);
    db.expireAllAccessTokens();
    expect(
      await statusOf(firstValueFrom(http.get('/api/applications', authed(tokens.accessToken)))),
    ).toBe(401);
  });

  it('rotates refresh tokens so each works only once', async () => {
    const { tokens } = await login();
    const refresh = () =>
      firstValueFrom(
        http.post<AuthSession>('/auth/refresh', { refreshToken: tokens.refreshToken }),
      );
    expect((await refresh()).tokens.accessToken).not.toBe(tokens.accessToken);
    expect(await statusOf(refresh())).toBe(401);
    expect(db.refreshCalls).toBe(2);
  });

  it('treats a replayed refresh token as stolen and revokes the whole session', async () => {
    const { tokens } = await login();
    const refresh = (refreshToken: string) =>
      firstValueFrom(http.post<AuthSession>('/auth/refresh', { refreshToken }));
    const apiStatus = (accessToken: string) =>
      statusOf(firstValueFrom(http.get('/api/applications', authed(accessToken))));

    // The real user refreshes; an attacker then replays the old, already-used token.
    const rotated = await refresh(tokens.refreshToken);
    expect(await statusOf(refresh(tokens.refreshToken))).toBe(401);

    // Everything issued in that session is now dead, for the attacker and the user alike.
    expect(await apiStatus(rotated.tokens.accessToken)).toBe(401);
    expect(await statusOf(refresh(rotated.tokens.refreshToken))).toBe(401);
  });

  it('keeps other sessions alive when one session is revoked', async () => {
    const first = await login();
    const second = await login();
    await firstValueFrom(http.post('/auth/refresh', { refreshToken: first.tokens.refreshToken }));
    await statusOf(
      firstValueFrom(http.post('/auth/refresh', { refreshToken: first.tokens.refreshToken })),
    );
    expect(
      await statusOf(
        firstValueFrom(http.get('/api/applications', authed(second.tokens.accessToken))),
      ),
    ).toBe(200);
  });

  it('revokes the session on sign-out and answers 204 whether or not the token was valid', async () => {
    const { tokens } = await login();
    const logout = (refreshToken: string) =>
      firstValueFrom(http.post<null>('/auth/logout', { refreshToken }, { observe: 'response' }));
    expect((await logout(tokens.refreshToken)).status).toBe(204);
    expect(
      await statusOf(firstValueFrom(http.get('/api/applications', authed(tokens.accessToken)))),
    ).toBe(401);
    expect(
      await statusOf(
        firstValueFrom(http.post('/auth/refresh', { refreshToken: tokens.refreshToken })),
      ),
    ).toBe(401);
    expect((await logout('not-a-real-token')).status).toBe(204);
    expect(
      (await firstValueFrom(http.post<null>('/auth/logout', null, { observe: 'response' }))).status,
    ).toBe(204);
  });

  it('fails the requested number of API calls with 500 when simulating failures', async () => {
    const { tokens } = await login();
    db.failNextRequests(2);
    const get = () =>
      statusOf(firstValueFrom(http.get('/api/applications', authed(tokens.accessToken))));
    expect([await get(), await get(), await get()]).toEqual([500, 500, 200]);
  });

  it('marks reveal responses as no-store', async () => {
    const { tokens } = await login();
    const app = db.all().find((a) => a.taxId !== null);
    const res = await firstValueFrom(
      http.post(
        `/api/applications/${app?.id}/reveal`,
        { field: 'taxId' },
        { ...authed(tokens.accessToken), observe: 'response' },
      ),
    );
    expect((res as HttpResponse<unknown>).headers.get('Cache-Control')).toBe('no-store');
  });
});
