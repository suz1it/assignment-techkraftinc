import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Sort } from '@angular/material/sort';
import { MatSortHarness } from '@angular/material/sort/testing';
import { MatTableHarness } from '@angular/material/table/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { ApplicationSummary } from '../../../../core/domain/application.model';
import { AuthUser } from '../../../../core/domain/user.model';
import { ApplicationList } from './application-list';

const sales: AuthUser = { id: 'u-sales', name: 'Sarah', role: 'SALES' };
const admin: AuthUser = { id: 'u-admin', name: 'Amanda', role: 'ADMIN' };

const summary = (overrides: Partial<ApplicationSummary>): ApplicationSummary => ({
  id: 'APP-1',
  legalName: 'Acme Traders',
  status: 'SUBMITTED',
  createdBy: { id: 'u-sales', name: 'Sarah' },
  assignedReviewer: null,
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: '2026-01-11T00:00:00Z',
  riskLevel: null,
  ...overrides,
});

describe('ApplicationList', () => {
  async function render(
    user: AuthUser,
    applications: ApplicationSummary[],
    { compact = false } = {},
  ) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    TestBed.inject(AuthStore).setSession({
      tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 },
      user,
    });
    const fixture = TestBed.createComponent(ApplicationList);
    fixture.componentRef.setInput('applications', applications);
    fixture.componentRef.setInput('compact', compact);
    await fixture.whenStable();
    const assigned: ApplicationSummary[] = [];
    const sorted: Sort[] = [];
    fixture.componentInstance.assign.subscribe((app) => assigned.push(app));
    fixture.componentInstance.sortChange.subscribe((sort) => sorted.push(sort));
    const loader = TestbedHarnessEnvironment.loader(fixture);
    return { el: fixture.nativeElement as HTMLElement, loader, assigned, sorted };
  }

  describe('table (wide screens)', () => {
    it('shows one row per application with its status and reviewer', async () => {
      const { loader } = await render(admin, [
        summary({ id: 'APP-1', assignedReviewer: { id: 'u-rev-1', name: 'Emily Carter' } }),
        summary({ id: 'APP-2', legalName: '', status: 'DRAFT' }),
      ]);
      const table = await loader.getHarness(MatTableHarness);
      const rows = await table.getRows();
      expect(rows).toHaveLength(2);

      const first = await rows[0].getCellTextByColumnName();
      expect(first['legalName']).toContain('Acme Traders');
      expect(first['legalName']).toContain('APP-1');
      expect(first['status']).toBe('Submitted');
      expect(first['reviewer']).toContain('Emily Carter');

      const second = await rows[1].getCellTextByColumnName();
      expect(second['legalName']).toContain('Untitled draft');
      expect(second['reviewer']).toBe('Unassigned');
    });

    it('links each merchant to its detail page', async () => {
      const { el } = await render(admin, [summary({ id: 'APP-7' })]);
      expect(el.querySelector('.merchant__link')?.getAttribute('href')).toBe('/applications/APP-7');
    });

    it('offers Resume to the SALES owner of a draft, and no Assign', async () => {
      const { el, loader } = await render(sales, [summary({ status: 'DRAFT' })]);
      expect(el.querySelector('a[href="/applications/APP-1/edit"]')?.textContent).toContain(
        'Resume',
      );
      expect(await loader.getAllHarnesses(MatButtonHarness.with({ text: 'Assign' }))).toHaveLength(
        0,
      );
    });

    it('offers Assign to ADMIN for SUBMITTED applications only, and emits the row', async () => {
      const submitted = summary({ id: 'APP-1', status: 'SUBMITTED' });
      const { loader, assigned } = await render(admin, [
        submitted,
        summary({ id: 'APP-2', status: 'APPROVED' }),
      ]);
      const assignButtons = await loader.getAllHarnesses(MatButtonHarness.with({ text: 'Assign' }));
      expect(assignButtons).toHaveLength(1);
      await assignButtons[0].click();
      expect(assigned).toEqual([submitted]);
    });

    it('emits sort changes from the column headers, with the current sort shown', async () => {
      const { loader, sorted } = await render(admin, [summary({})]);
      const sort = await loader.getHarness(MatSortHarness);
      const active = await sort.getActiveHeader();
      expect(await active?.getLabel()).toBe('Created');
      expect(await active?.getSortDirection()).toBe('desc');

      const [merchant] = await sort.getSortHeaders({ label: 'Merchant' });
      await merchant.click();
      expect(sorted).toEqual([{ active: 'legalName', direction: 'asc' }]);
    });
  });

  describe('cards (compact screens)', () => {
    it('renders cards instead of a table, with the same actions', async () => {
      const { el, loader, assigned } = await render(admin, [summary({ legalName: '' })], {
        compact: true,
      });
      expect(el.querySelector('table')).toBeNull();
      const cards = el.querySelectorAll('li.card');
      expect(cards).toHaveLength(1);
      expect(cards[0].textContent).toContain('Untitled draft');
      expect(cards[0].textContent).toContain('Unassigned');

      await (await loader.getHarness(MatButtonHarness.with({ text: 'Assign' }))).click();
      expect(assigned).toHaveLength(1);
    });

    it('shows the reviewer name and no action bar when nothing is allowed', async () => {
      const { el } = await render(
        sales,
        [summary({ status: 'APPROVED', assignedReviewer: { id: 'u-rev-1', name: 'Emily' } })],
        { compact: true },
      );
      expect(el.querySelector('.card__meta')?.textContent).toContain('Emily');
      expect(el.querySelector('.card__actions')).toBeNull();
    });
  });
});
