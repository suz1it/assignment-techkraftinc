import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { ApplicationStatus } from '../../../../core/domain/application.model';
import { Role } from '../../../../core/domain/user.model';
import { ApplicationDetail as Detail } from '../../../../core/domain/application.model';
import { ApplicationsService } from '../../services/applications.service';
import ApplicationDetail from './application-detail';

const detail = (status: ApplicationStatus, reviewerId: string | null): Detail => ({
  id: 'APP-1',
  legalName: 'Acme Traders',
  status,
  createdBy: { id: 'u-sales', name: 'Sarah' },
  assignedReviewer: reviewerId ? { id: reviewerId, name: 'Emily' } : null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  riskLevel: null,
  submittedAt: '2026-01-02T00:00:00Z',
  tradingName: 'Acme',
  businessType: 'COMPANY',
  registrationDate: '2020-01-01',
  website: '',
  monthlyVolume: 1000,
  ownerName: 'Jane',
  email: 'jane@example.com',
  phone: '+91 00000 12345',
  addressLine1: '1 Main St',
  addressLine2: '',
  city: 'Pune',
  state: 'MH',
  postalCode: '411001',
  country: 'India',
  accountHolderName: 'Acme',
  routingCode: 'TEST0000001',
  taxIdMasked: '••••234F',
  accountNumberMasked: '••••6789',
  history: [
    {
      id: 'e1',
      type: 'SUBMITTED',
      actor: { id: 'u-sales', name: 'Sarah' },
      at: '2026-01-02T00:00:00Z',
    },
  ],
});

describe('ApplicationDetail', () => {
  let get$: Subject<Detail>;
  const open = vi.fn();

  function render(role: Role, userId: string) {
    get$ = new Subject();
    TestBed.configureTestingModule({
      imports: [ApplicationDetail],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: ApplicationsService, useValue: { get: () => get$, reveal: () => of('x') } },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    TestBed.inject(AuthStore).setSession({
      tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 1000 },
      user: { id: userId, name: 'User', role },
    });
    const fixture = TestBed.createComponent(ApplicationDetail);
    fixture.componentRef.setInput('id', 'APP-1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    };
    return { el, settle };
  }

  it('renders the sections, masked sensitive fields and history', async () => {
    const { el, settle } = render('SALES', 'u-sales');
    get$.next(detail('SUBMITTED', 'u-rev'));
    await settle();
    for (const heading of [
      'Business',
      'Contact & address',
      'Bank / payout',
      'Status & assignment',
      'Risk history',
    ]) {
      expect(el.textContent).toContain(heading);
    }
    expect(el.textContent).toContain('••••234F');
    expect(el.textContent).toContain('Sarah submitted the application');
  });

  it('never renders reviewer controls or reveal buttons for SALES', async () => {
    const { el, settle } = render('SALES', 'u-sales');
    get$.next(detail('SUBMITTED', 'u-rev'));
    await settle();
    expect(el.querySelector('app-decision-panel')).toBeNull();
    expect(el.textContent).not.toContain('Review decision');
    expect(el.querySelector('app-masked-field button')).toBeNull();
  });

  it('shows the decision panel and reveal controls to the assigned reviewer', async () => {
    const { el, settle } = render('REVIEWER', 'u-rev');
    get$.next(detail('SUBMITTED', 'u-rev'));
    await settle();
    expect(el.querySelector('app-decision-panel')).not.toBeNull();
    expect(el.querySelectorAll('app-masked-field button')).toHaveLength(2);
  });

  it('hides the decision panel once the application is decided', async () => {
    const { el, settle } = render('REVIEWER', 'u-rev');
    get$.next(detail('APPROVED', 'u-rev'));
    await settle();
    expect(el.querySelector('app-decision-panel')).toBeNull();
  });

  it('gives ADMIN assignment (only while SUBMITTED) but no decision panel', async () => {
    const { el, settle } = render('ADMIN', 'u-admin');
    get$.next(detail('SUBMITTED', null));
    await settle();
    expect(el.querySelector('app-decision-panel')).toBeNull();
    const assign = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Assign reviewer'),
    );
    expect(assign).toBeDefined();
    open.mockReturnValue({ afterClosed: () => of(detail('SUBMITTED', 'u-rev')) });
    assign?.click();
    await settle();
    expect(el.textContent).toContain('Emily');
  });

  it('shows no assignment control on decided applications', async () => {
    const { el, settle } = render('ADMIN', 'u-admin');
    get$.next(detail('REJECTED', 'u-rev'));
    await settle();
    expect(el.textContent).not.toContain('Change reviewer');
  });

  it('shows "not found" for 404s and Retry for other errors', async () => {
    const first = render('SALES', 'u-sales');
    get$.error(new HttpErrorResponse({ status: 404 }));
    await first.settle();
    expect(first.el.textContent).toContain('Application not found');

    TestBed.resetTestingModule();
    const second = render('SALES', 'u-sales');
    get$.error(new HttpErrorResponse({ status: 500, error: { message: 'Server down' } }));
    await second.settle();
    expect(second.el.querySelector('[role="alert"]')?.textContent).toContain('Server down');
  });
});
