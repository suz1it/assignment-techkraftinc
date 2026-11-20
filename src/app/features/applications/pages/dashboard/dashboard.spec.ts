import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MATERIAL_ANIMATIONS, provideNativeDateAdapter } from '@angular/material/core';
import { MatDateRangeInputHarness } from '@angular/material/datepicker/testing';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatSortHarness } from '@angular/material/sort/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Role, UserRef } from '../../../../core/domain/user.model';
import { ApplicationSummary, StatusCounts } from '../../../../core/domain/application.model';
import { Page } from '../../../../core/http/api.models';
import { ApplicationsService } from '../../services/applications.service';
import Dashboard from './dashboard';

const summary = (overrides: Partial<ApplicationSummary>): ApplicationSummary => ({
  id: 'APP-1',
  legalName: 'Acme Traders',
  status: 'SUBMITTED',
  createdBy: { id: 'u-sales', name: 'Sales' },
  assignedReviewer: null,
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: '2026-01-10T00:00:00Z',
  riskLevel: null,
  ...overrides,
});
const page = (items: ApplicationSummary[]): Page<ApplicationSummary> => ({
  items,
  total: items.length,
  page: 0,
  size: 10,
});

describe('Dashboard', () => {
  let list$: Subject<Page<ApplicationSummary>>;
  const list = vi.fn<(query: unknown) => Observable<Page<ApplicationSummary>>>();
  const open = vi.fn();
  let counts$: () => Observable<StatusCounts> = () =>
    of({ DRAFT: 2, SUBMITTED: 5, APPROVED: 3, REJECTED: 1 });
  let reviewers$: () => Observable<UserRef[]> = () => of([]);

  async function render(role: Role, userId = 'u-sales') {
    list$ = new Subject();
    list.mockReset().mockImplementation(() => list$);
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideNativeDateAdapter(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: ApplicationsService,
          useValue: {
            list,
            reviewers: () => reviewers$(),
            counts: () => counts$(),
          },
        },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    TestBed.inject(AuthStore).setSession({
      tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 1000 },
      user: { id: userId, name: 'User', role },
    });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // Resources settle on a microtask; avoid whenStable(), which waits on unrelated Material tasks.
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    };
    return { fixture, el, settle };
  }

  it('shows a loading indicator, then the results', async () => {
    const { el, settle } = await render('SALES');
    expect(el.querySelector('mat-progress-bar')).not.toBeNull();
    list$.next(page([summary({ status: 'DRAFT' })]));
    await settle();
    expect(el.querySelector('mat-progress-bar')).toBeNull();
    expect(el.textContent).toContain('Acme Traders');
    expect(el.textContent).toContain('1 application');
  });

  it('requests the first page with default filters', async () => {
    await render('ADMIN', 'u-admin');
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 0, size: 10, q: '', status: '', sort: 'createdAt' }),
    );
  });

  it('shows an error with a working Retry', async () => {
    const { el, settle } = await render('SALES');
    list$.error(new Error('boom'));
    await settle();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');

    list$ = new Subject();
    list.mockImplementation(() => list$);
    (el.querySelector('app-error-state button') as HTMLButtonElement).click();
    await settle();
    expect(list).toHaveBeenCalledTimes(2);
    list$.next(page([summary({})]));
    await settle();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows an empty state', async () => {
    const { el, settle } = await render('REVIEWER', 'u-rev');
    list$.next(page([]));
    await settle();
    expect(el.textContent).toContain('No applications yet.');
  });

  it('offers "New application" and Resume to SALES only', async () => {
    const { el, settle } = await render('SALES');
    list$.next(page([summary({ status: 'DRAFT' })]));
    await settle();
    expect(el.textContent).toContain('New application');
    expect(el.textContent).toContain('Resume');
    expect(el.textContent).not.toContain('Assign');
  });

  it('offers Assign to ADMIN only for SUBMITTED applications', async () => {
    const { el, settle } = await render('ADMIN', 'u-admin');
    list$.next(
      page([
        summary({ id: 'APP-1', status: 'SUBMITTED' }),
        summary({ id: 'APP-2', status: 'APPROVED' }),
      ]),
    );
    await settle();
    expect(el.textContent).not.toContain('New application');
    const assignButtons = [...el.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'Assign',
    );
    expect(assignButtons).toHaveLength(1);

    open.mockReturnValue({ afterClosed: () => of(undefined) });
    assignButtons[0].click();
    expect(open).toHaveBeenCalled();
  });

  it('debounces search into the URL and resets paging', async () => {
    vi.useFakeTimers();
    try {
      const { el } = await render('SALES');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const input = el.querySelector('input[type="search"]') as HTMLInputElement;
      input.value = 'ac';
      input.dispatchEvent(new Event('input'));
      input.value = 'acme';
      input.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(299);
      expect(navigate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith([], {
        queryParams: { q: 'acme', page: null },
        queryParamsHandling: 'merge',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads filters from query-param inputs', async () => {
    const { fixture } = await render('ADMIN', 'u-admin');
    fixture.componentRef.setInput('status', 'APPROVED');
    fixture.componentRef.setInput('page', '2');
    fixture.componentRef.setInput('size', '25');
    fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'APPROVED', page: 2, size: 25 }),
    );
  });

  it('shows per-status counts that toggle the status filter', async () => {
    const { el, settle } = await render('ADMIN', 'u-admin');
    list$.next(page([]));
    await settle();
    const cards = [...el.querySelectorAll<HTMLButtonElement>('.count-card')];
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Draft: 2',
      'Submitted: 5',
      'Approved: 3',
      'Rejected: 1',
    ]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    cards[1].click();
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { status: 'SUBMITTED', page: null },
      queryParamsHandling: 'merge',
    });
  });

  it('greets the user and explains what their list contains', async () => {
    const { el } = await render('REVIEWER', 'u-rev');
    expect(el.querySelector('.page-header__eyebrow')?.textContent).toMatch(
      /^Good (morning|afternoon|evening), User$/,
    );
    expect(el.textContent).toContain('Applications waiting on your risk review');
  });

  it('shows skeleton rows until the first page arrives', async () => {
    const { el, settle } = await render('ADMIN', 'u-admin');
    expect(el.querySelector('app-list-skeleton')).not.toBeNull();
    list$.next(page([summary({})]));
    await settle();
    expect(el.querySelector('app-list-skeleton')).toBeNull();
  });

  it('sorts on the server via the URL', async () => {
    const { fixture, settle } = await render('ADMIN', 'u-admin');
    list$.next(page([summary({})]));
    await settle();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const sort = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSortHarness);
    const [merchant] = await sort.getSortHeaders({ label: 'Merchant' });
    await merchant.click();
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { sort: 'legalName', direction: 'asc', page: null },
      queryParamsHandling: 'merge',
    });

    fixture.componentRef.setInput('sort', 'legalName');
    fixture.componentRef.setInput('direction', 'asc');
    fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'legalName', direction: 'asc' }),
    );
  });

  describe('filters and paging (Material harnesses)', () => {
    /** Renders with the first page already loaded, so harness stabilisation never waits on a request. */
    async function renderLoaded(role: Role, userId: string, items = [summary({})], total = 1) {
      const rendered = await render(role, userId);
      list$.next({ ...page(items), total });
      await rendered.settle();
      // Later requests (filter changes, reloads) answer at once, so harnesses never wait on them.
      const respondWith = (next: ApplicationSummary[], nextTotal = next.length) =>
        list.mockImplementation(() => of({ ...page(next), total: nextTotal }));
      respondWith(items, total);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const loader = TestbedHarnessEnvironment.loader(rendered.fixture);
      const select = async (label: string) =>
        (
          await loader.getHarness(MatFormFieldHarness.with({ floatingLabelText: label }))
        ).getControl(MatSelectHarness);
      return { ...rendered, loader, navigate, select, respondWith };
    }
    const merged = (queryParams: Record<string, unknown>) => ({
      queryParams,
      queryParamsHandling: 'merge',
    });

    it('filters by status from the Status select and returns to the first page', async () => {
      const { select, navigate } = await renderLoaded('SALES', 'u-sales');
      const status = await select('Status');
      await status?.open();
      const options = await status?.getOptions();
      expect(await Promise.all((options ?? []).map((option) => option.getText()))).toEqual([
        'All statuses',
        'Draft',
        'Submitted',
        'Approved',
        'Rejected',
      ]);
      await status?.clickOptions({ text: 'Approved' });
      expect(navigate).toHaveBeenCalledWith([], merged({ status: 'APPROVED', page: null }));
    });

    it('lets ADMIN filter by reviewer, and hides that filter from other roles', async () => {
      reviewers$ = () => of([{ id: 'u-rev-1', name: 'Emily Carter' }]);
      try {
        const { select, navigate } = await renderLoaded('ADMIN', 'u-admin');
        const reviewer = await select('Assigned reviewer');
        await reviewer?.open();
        await reviewer?.clickOptions({ text: 'Emily Carter' });
        expect(navigate).toHaveBeenCalledWith([], merged({ reviewerId: 'u-rev-1', page: null }));
      } finally {
        reviewers$ = () => of([]);
      }
    });

    it('does not offer the reviewer filter to SALES', async () => {
      const { loader } = await renderLoaded('SALES', 'u-sales');
      expect(
        await loader.getAllHarnesses(
          MatFormFieldHarness.with({ floatingLabelText: 'Assigned reviewer' }),
        ),
      ).toHaveLength(0);
    });

    it('puts the created-date range into the URL as yyyy-mm-dd', async () => {
      const { loader, navigate } = await renderLoaded('SALES', 'u-sales');
      const range = await loader.getHarness(MatDateRangeInputHarness);
      await (await range.getStartInput()).setValue('1/5/2026');
      expect(navigate).toHaveBeenCalledWith([], merged({ from: '2026-01-05', page: null }));
      await (await range.getEndInput()).setValue('1/20/2026');
      expect(navigate).toHaveBeenCalledWith([], merged({ to: '2026-01-20', page: null }));
    });

    it('shows the current date filter from the URL in the range input', async () => {
      const { fixture, loader } = await renderLoaded('SALES', 'u-sales');
      fixture.componentRef.setInput('from', '2026-01-05');
      const range = await loader.getHarness(MatDateRangeInputHarness);
      expect(await (await range.getStartInput()).getValue()).not.toBe('');
      expect(await (await range.getEndInput()).getValue()).toBe('');
    });

    it('pages through results and changes the page size via the paginator', async () => {
      const { loader, navigate } = await renderLoaded('ADMIN', 'u-admin', [summary({})], 30);
      const paginator = await loader.getHarness(MatPaginatorHarness);
      expect(await paginator.getRangeLabel()).toContain('of 30');
      await paginator.goToNextPage();
      expect(navigate).toHaveBeenLastCalledWith([], merged({ page: 1, size: null }));
      await paginator.setPageSize(25);
      expect(navigate).toHaveBeenLastCalledWith([], merged({ page: null, size: 25 }));
    });

    it('offers Clear filters only while a filter is active', async () => {
      const { fixture, loader, navigate } = await renderLoaded('SALES', 'u-sales');
      const clearButtons = () =>
        loader.getAllHarnesses(MatButtonHarness.with({ text: 'Clear filters' }));
      expect(await clearButtons()).toHaveLength(0);

      fixture.componentRef.setInput('q', 'acme');
      const [clear] = await clearButtons();
      await clear.click();
      expect(navigate).toHaveBeenCalledWith([], { queryParams: {} });
    });

    it('explains an empty result caused by filters and offers to clear them', async () => {
      const { fixture, el, loader, respondWith } = await renderLoaded('SALES', 'u-sales');
      respondWith([]);
      fixture.componentRef.setInput('status', 'REJECTED');
      await fixture.whenStable();
      expect(el.textContent).toContain('No matches');
      expect(el.textContent).toContain('No applications match these filters.');
      // One in the filter bar, one in the empty state.
      expect(
        await loader.getAllHarnesses(MatButtonHarness.with({ text: 'Clear filters' })),
      ).toHaveLength(2);
    });

    it('toggles the status filter off when the active count tile is pressed again', async () => {
      const { fixture, el, navigate } = await renderLoaded('ADMIN', 'u-admin');
      fixture.componentRef.setInput('status', 'SUBMITTED');
      await fixture.whenStable();
      const submitted = el.querySelector<HTMLButtonElement>('.count-card[data-status="SUBMITTED"]');
      expect(submitted?.getAttribute('aria-pressed')).toBe('true');
      submitted?.click();
      expect(navigate).toHaveBeenCalledWith([], merged({ status: null, page: null }));
    });

    it('reloads the list and counts after a reviewer is assigned', async () => {
      const counts = vi.fn(() => of({ DRAFT: 0, SUBMITTED: 1, APPROVED: 0, REJECTED: 0 }));
      counts$ = counts;
      try {
        const { loader } = await renderLoaded('ADMIN', 'u-admin');
        open.mockReturnValue({ afterClosed: () => of(true) });
        const callsBefore = list.mock.calls.length;
        await (await loader.getHarness(MatButtonHarness.with({ text: 'Assign' }))).click();
        expect(open).toHaveBeenCalled();
        expect(list.mock.calls.length).toBe(callsBefore + 1);
        expect(counts).toHaveBeenCalledTimes(2);
      } finally {
        counts$ = () => of({ DRAFT: 2, SUBMITTED: 5, APPROVED: 3, REJECTED: 1 });
      }
    });
  });

  it('still renders the table when the optional counts and reviewer requests fail', async () => {
    counts$ = () => throwError(() => new Error('counts down'));
    reviewers$ = () => throwError(() => new Error('reviewers down'));
    try {
      const { el, settle } = await render('ADMIN', 'u-admin');
      list$.next(page([summary({})]));
      await settle();
      expect(el.querySelector('table')).not.toBeNull();
      expect(el.textContent).toContain('Acme Traders');
    } finally {
      counts$ = () => of({ DRAFT: 2, SUBMITTED: 5, APPROVED: 3, REJECTED: 1 });
      reviewers$ = () => of([]);
    }
  });
});
