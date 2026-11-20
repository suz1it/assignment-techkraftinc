import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SKIP_AUTH } from '../auth-context';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('posts credentials to /auth/login, marked to skip the auth interceptor', () => {
    service.login({ username: 'admin', password: 'x' }).subscribe();
    const req = httpTesting.expectOne({ method: 'POST', url: '/auth/login' });
    expect(req.request.body).toEqual({ username: 'admin', password: 'x' });
    expect(req.request.context.get(SKIP_AUTH)).toBe(true);
    req.flush({});
  });

  it('posts the refresh token to /auth/refresh, marked to skip the auth interceptor', () => {
    service.refresh({ refreshToken: 'r1' }).subscribe();
    const req = httpTesting.expectOne({ method: 'POST', url: '/auth/refresh' });
    expect(req.request.body).toEqual({ refreshToken: 'r1' });
    expect(req.request.context.get(SKIP_AUTH)).toBe(true);
    req.flush({});
  });

  it('posts the refresh token to /auth/logout, marked to skip the auth interceptor', () => {
    service.logout({ refreshToken: 'r1' }).subscribe();
    const req = httpTesting.expectOne({ method: 'POST', url: '/auth/logout' });
    expect(req.request.body).toEqual({ refreshToken: 'r1' });
    expect(req.request.context.get(SKIP_AUTH)).toBe(true);
    req.flush(null);
  });
});
