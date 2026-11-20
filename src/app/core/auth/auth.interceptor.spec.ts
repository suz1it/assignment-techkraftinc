import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthUser } from '../domain/user.model';
import { SKIP_AUTH } from './auth-context';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth-store';
import { AuthSession } from './auth.models';

const user: AuthUser = { id: 'u1', name: 'Test User', role: 'SALES' };
const session = (accessToken: string, refreshToken: string): AuthSession => ({
  tokens: { accessToken, refreshToken, expiresAt: Date.now() + 60_000 },
  user,
});
const unauthorized = { status: 401, statusText: 'Unauthorized' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let auth: AuthStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthStore);
    auth.setSession(session('old', 'r1'));
  });

  afterEach(() => httpTesting.verify());

  it('attaches the bearer token to API requests only', () => {
    http.get('/api/applications').subscribe();
    http.get('/assets/config.json').subscribe();
    http.post('/api/x', {}, { context: new HttpContext().set(SKIP_AUTH, true) }).subscribe();

    expect(httpTesting.expectOne('/api/applications').request.headers.get('Authorization')).toBe(
      'Bearer old',
    );
    expect(httpTesting.expectOne('/assets/config.json').request.headers.has('Authorization')).toBe(
      false,
    );
    expect(httpTesting.expectOne('/api/x').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes the token exactly once when three concurrent requests get 401, then retries all of them', () => {
    const urls = ['/api/a', '/api/b', '/api/c'];
    const results: unknown[] = [];
    urls.forEach((url) => http.get(url).subscribe((body) => results.push(body)));

    urls.forEach((url) => {
      const req = httpTesting.expectOne(url);
      expect(req.request.headers.get('Authorization')).toBe('Bearer old');
      req.flush(null, unauthorized);
    });

    const refresh = httpTesting.expectOne('/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'r1' });
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush(session('new', 'r2'));

    urls.forEach((url) => {
      const retry = httpTesting.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
      retry.flush({ url });
    });
    expect(results).toEqual(urls.map((url) => ({ url })));
    expect(auth.accessToken()).toBe('new');
  });

  it('holds a request started during a refresh and sends it once with the new token', () => {
    http.get('/api/a').subscribe();
    httpTesting.expectOne('/api/a').flush(null, unauthorized);

    http.get('/api/late').subscribe();
    httpTesting.expectNone('/api/late');

    httpTesting.expectOne('/auth/refresh').flush(session('new', 'r2'));
    httpTesting.expectOne('/api/a').flush({});
    const late = httpTesting.expectOne('/api/late');
    expect(late.request.headers.get('Authorization')).toBe('Bearer new');
    late.flush({});
  });

  it('does not refresh again for a late 401 that was sent with the old token', () => {
    http.get('/api/a').subscribe();
    http.get('/api/slow').subscribe();
    const slow = httpTesting.expectOne('/api/slow');

    httpTesting.expectOne('/api/a').flush(null, unauthorized);
    httpTesting.expectOne('/auth/refresh').flush(session('new', 'r2'));
    httpTesting.expectOne('/api/a').flush({});

    slow.flush(null, unauthorized);
    httpTesting.expectNone('/auth/refresh');
    expect(httpTesting.expectOne('/api/slow').request.headers.get('Authorization')).toBe(
      'Bearer new',
    );
  });

  it('logs out, navigates to /login and errors every waiting request when the refresh fails', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const errors: unknown[] = [];
    ['/api/a', '/api/b'].forEach((url) =>
      http.get(url).subscribe({ error: (error: unknown) => errors.push(error) }),
    );
    httpTesting.expectOne('/api/a').flush(null, unauthorized);
    httpTesting.expectOne('/api/b').flush(null, unauthorized);

    httpTesting.expectOne('/auth/refresh').flush(null, unauthorized);

    expect(errors).toHaveLength(2);
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('propagates a 401 from the retried request instead of looping', () => {
    let failed = false;
    http.get('/api/a').subscribe({ error: () => (failed = true) });
    httpTesting.expectOne('/api/a').flush(null, unauthorized);
    httpTesting.expectOne('/auth/refresh').flush(session('new', 'r2'));
    httpTesting.expectOne('/api/a').flush(null, unauthorized);

    httpTesting.expectNone('/auth/refresh');
    expect(failed).toBe(true);
  });

  it('passes non-401 errors through untouched', () => {
    let status = 0;
    http.get('/api/a').subscribe({ error: (error: { status: number }) => (status = error.status) });
    httpTesting.expectOne('/api/a').flush(null, { status: 500, statusText: 'Server Error' });
    httpTesting.expectNone('/auth/refresh');
    expect(status).toBe(500);
  });
});
