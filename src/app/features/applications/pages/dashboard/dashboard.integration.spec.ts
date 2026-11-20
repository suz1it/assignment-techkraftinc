import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS, provideNativeDateAdapter } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from '../../../../core/auth/auth.interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { MOCK_PASSWORD, MockDb } from '../../../../core/mock/mock-db';
import { mockBackendInterceptor } from '../../../../core/mock/mock-backend.interceptor';
import Dashboard from './dashboard';

/**
 * End-to-end through the real stack (ApplicationsService → auth interceptor → mock backend → seeded DB),
 * so wiring problems that the mocked-API unit tests can't see still fail here.
 */
describe('Dashboard (integration with the mock backend)', () => {
  async function render(username: string) {
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, mockBackendInterceptor])),
        provideNativeDateAdapter(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const db = TestBed.inject(MockDb);
    db.minLatencyMs = 0;
    db.maxLatencyMs = 0;
    await firstValueFrom(TestBed.inject(AuthStore).login({ username, password: MOCK_PASSWORD }));

    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(el.querySelector('mat-progress-bar')).toBeNull();
        expect(el.querySelector('.results__count')).not.toBeNull();
      },
      { timeout: 2000 },
    );
    return el;
  }

  it('renders the first page of applications in the table for ADMIN', async () => {
    const el = await render('admin');
    expect(el.textContent).toContain('60 applications');
    expect(el.querySelector('table')).not.toBeNull();
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(10);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders only own applications for SALES', async () => {
    const el = await render('sales1');
    expect(el.textContent).toContain('30 applications');
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(10);
  });
});
