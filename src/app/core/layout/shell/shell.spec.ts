import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Notifier } from '../../notifications/notifier';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../auth/auth-store';
import { MockDb } from '../../mock/mock-db';
import { Role } from '../../domain/user.model';
import Shell from './shell';

@Component({ template: '' })
class Blank {}

describe('Shell', () => {
  const notify = vi.fn();

  async function render(role: Role) {
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter([{ path: 'login', component: Blank }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Notifier, useValue: { notify } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    TestBed.inject(AuthStore).setSession({
      tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 1000 },
      user: { id: 'u', name: 'Pat Example', role },
    });
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows "New application" only to SALES', async () => {
    const { el } = await render('SALES');
    expect(el.textContent).toContain('New application');
    expect(el.textContent).toContain('Pat Example');
    expect(el.textContent).toContain('Sales');
  });

  it('hides "New application" from reviewers', async () => {
    const { el } = await render('REVIEWER');
    expect(el.textContent).not.toContain('New application');
    expect(el.textContent).toContain('Reviewer');
  });

  it('dev tools expire tokens and schedule failures on the mock server', async () => {
    const { fixture } = await render('ADMIN');
    const db = TestBed.inject(MockDb);
    const expire = vi.spyOn(db, 'expireAllAccessTokens');
    const shell = fixture.componentInstance as unknown as {
      expireToken(): void;
      failNextRequests(): void;
      logout(): void;
    };
    shell.expireToken();
    shell.failNextRequests();
    expect(expire).toHaveBeenCalled();
    expect(db.pendingFailures).toBe(3);
    expect(notify).toHaveBeenCalledTimes(2);

    shell.logout();
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false);
    TestBed.inject(HttpTestingController).expectOne('/auth/logout').flush(null);
  });
});
