import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { MOCK_PASSWORD, MockDb } from '../mock/mock-db';
import { mockBackendInterceptor } from '../mock/mock-backend.interceptor';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth-store';

/**
 * Real AuthStore + auth interceptor + mock backend (no HttpTestingController): the session must
 * survive repeated access-token expiry, including bursts of parallel requests, without a logout.
 */
describe('auth session (integration with the mock backend)', () => {
  let http: HttpClient;
  let auth: AuthStore;
  let db: MockDb;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, mockBackendInterceptor])),
      ],
    });
    http = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthStore);
    db = TestBed.inject(MockDb);
    db.minLatencyMs = 5;
    db.maxLatencyMs = 40;
    await firstValueFrom(auth.login({ username: 'admin', password: MOCK_PASSWORD }));
  });

  const burst = () =>
    firstValueFrom(
      forkJoin([
        http.get('/api/applications'),
        http.get('/api/applications/counts'),
        http.get('/api/reviewers'),
      ]),
    );

  it('stays signed in across repeated expiry, refreshing exactly once per expiry', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    for (let cycle = 1; cycle <= 3; cycle++) {
      db.expireAllAccessTokens();
      await burst();
      expect(db.refreshCalls).toBe(cycle);
      expect(auth.isAuthenticated()).toBe(true);
    }
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays signed in when tokens expire naturally between requests', async () => {
    // Lifetime must exceed the simulated latency, as in the app (30 s vs ≤ 450 ms).
    db.accessTtlMs = 200;
    await firstValueFrom(auth.refreshAccessToken()); // re-issue with the short TTL
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 220));
      await burst();
    }
    expect(auth.isAuthenticated()).toBe(true);
  });
});
