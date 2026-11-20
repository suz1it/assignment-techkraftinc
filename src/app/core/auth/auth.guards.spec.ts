import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  PartialMatchRouteSnapshot,
  Route,
  Router,
  UrlSegment,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Role } from '../domain/user.model';
import { authGuard, guestGuard, roleGuard } from './auth.guards';
import { AuthStore } from './auth-store';

const segments = (path: string) => path.split('/').map((p) => new UrlSegment(p, {}));
const route: Route = {};
// The guards under test don't read the snapshot.
const snapshot = {} as PartialMatchRouteSnapshot;

describe('auth guards', () => {
  let auth: AuthStore;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    auth = TestBed.inject(AuthStore);
    router = TestBed.inject(Router);
  });

  const signIn = (role: Role) =>
    auth.setSession({
      tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 1000 },
      user: { id: 'u', name: 'U', role },
    });

  const run = <T>(guard: () => T) => TestBed.runInInjectionContext(guard);

  it('authGuard redirects anonymous users to /login with a returnUrl', () => {
    const result = run(() => authGuard(route, segments('applications/APP-1'), snapshot));
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fapplications%2FAPP-1');
  });

  it('authGuard omits returnUrl for the root path', () => {
    const result = run(() => authGuard(route, [], snapshot));
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('authGuard lets signed-in users through', () => {
    signIn('SALES');
    expect(run(() => authGuard(route, segments('applications'), snapshot))).toBe(true);
  });

  it('guestGuard sends signed-in users to the dashboard', () => {
    expect(run(() => guestGuard(route, [], snapshot))).toBe(true);
    signIn('ADMIN');
    expect(router.serializeUrl(run(() => guestGuard(route, [], snapshot)) as UrlTree)).toBe(
      '/applications',
    );
  });

  it('roleGuard allows listed roles only', () => {
    signIn('SALES');
    expect(run(() => roleGuard('SALES')(route, [], snapshot))).toBe(true);
    signIn('REVIEWER');
    expect(router.serializeUrl(run(() => roleGuard('SALES')(route, [], snapshot)) as UrlTree)).toBe(
      '/applications',
    );
  });
});
