import { ApplicationDetail, ApplicationSummary } from '../domain/application.model';
import { Page } from '../http/api.models';
import { AuthUser } from '../domain/user.model';
import { MockResponse, handleApiRequest, isTaxIdTaken } from './application-handlers';
import { MockDb, StoredApplication } from './mock-db';

const sales1: AuthUser = { id: 'u-sales-1', name: 'Sarah Mitchell', role: 'SALES' };
const sales2: AuthUser = { id: 'u-sales-2', name: 'Ryan Cooper', role: 'SALES' };
const reviewer1: AuthUser = { id: 'u-rev-1', name: 'Emily Carter', role: 'REVIEWER' };
const reviewer2: AuthUser = { id: 'u-rev-2', name: 'Michael Brooks', role: 'REVIEWER' };
const admin: AuthUser = { id: 'u-admin', name: 'Amanda Hayes', role: 'ADMIN' };

const COMPLETE_DETAILS = {
  legalName: 'Acme Traders',
  tradingName: 'Acme',
  businessType: 'COMPANY',
  registrationDate: '2020-01-15',
  website: 'https://acme.example.com',
  monthlyVolume: 100000,
  ownerName: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+91 00000 12345',
  addressLine1: '1 Main Street',
  addressLine2: '',
  city: 'Pune',
  state: 'Maharashtra',
  postalCode: '411001',
  country: 'India',
  accountHolderName: 'Acme Traders',
  routingCode: 'TEST0000001',
} as const;

describe('mock application handlers', () => {
  let db: MockDb;

  beforeEach(() => {
    db = new MockDb();
  });

  const call = (user: AuthUser, method: string, path: string, body: unknown = null, query = '') =>
    handleApiRequest(db, user, { method, path, query: new URLSearchParams(query), body });
  const find = (predicate: (app: StoredApplication) => boolean): StoredApplication => {
    const app = db.all().find(predicate);
    if (!app) throw new Error('No seeded application matches');
    return app;
  };
  const url = (app: StoredApplication, action = '') =>
    `/api/applications/${app.id}${action ? `/${action}` : ''}`;
  const detail = (res: MockResponse) => res.body as ApplicationDetail;
  const createDraft = (user = sales1) => detail(call(user, 'POST', '/api/applications'));

  describe('listing', () => {
    it('returns only own applications to SALES and assigned ones to REVIEWERs', () => {
      const salesPage = call(sales1, 'GET', '/api/applications', null, 'size=50')
        .body as Page<ApplicationSummary>;
      expect(salesPage.items.every((app) => app.createdBy.id === sales1.id)).toBe(true);

      const reviewerPage = call(reviewer1, 'GET', '/api/applications', null, 'size=50')
        .body as Page<ApplicationSummary>;
      expect(reviewerPage.items.length).toBeGreaterThan(0);
      expect(reviewerPage.items.every((app) => app.assignedReviewer?.id === reviewer1.id)).toBe(
        true,
      );
    });

    it('pages, filters and sorts on the server', () => {
      const page = call(
        admin,
        'GET',
        '/api/applications',
        null,
        'page=1&size=10&status=DRAFT&sort=legalName&direction=asc',
      ).body as Page<ApplicationSummary>;
      expect(page.page).toBe(1);
      expect(page.items.every((app) => app.status === 'DRAFT')).toBe(true);
      const names = page.items.map((app) => app.legalName.toLowerCase());
      expect(names).toEqual([...names].sort());
    });

    it('ignores the reviewer filter for non-admins', () => {
      const page = call(sales1, 'GET', '/api/applications', null, 'size=50&reviewerId=u-rev-2')
        .body as Page<ApplicationSummary>;
      expect(page.items.some((app) => app.assignedReviewer?.id !== 'u-rev-2')).toBe(true);
    });

    it('never returns sensitive values in list or detail responses', () => {
      const app = find((a) => a.taxId !== null && a.accountNumber !== null);
      const body = JSON.stringify(call(admin, 'GET', url(app)).body);
      expect(body).not.toContain(app.taxId ?? '');
      expect(body).not.toContain(app.accountNumber ?? '');
      expect(detail(call(admin, 'GET', url(app))).taxIdMasked).toMatch(/^••••.{4}$/);
    });

    it('reports applications outside the caller scope as not found', () => {
      const app = find((a) => a.createdById === sales2.id);
      expect(call(sales1, 'GET', url(app)).status).toBe(404);
    });
  });

  describe('drafts', () => {
    it('applies partial updates and keeps omitted sensitive values', () => {
      const draft = createDraft();
      call(sales1, 'PATCH', `/api/applications/${draft.id}/draft`, {
        taxId: 'ABCDE1234F',
        accountNumber: '123456789',
      });
      const res = call(sales1, 'PATCH', `/api/applications/${draft.id}/draft`, {
        legalName: 'Acme',
      });

      expect(res.status).toBe(200);
      const stored = db.get(draft.id);
      expect(stored?.details.legalName).toBe('Acme');
      expect(stored?.taxId).toBe('ABCDE1234F');
      expect(stored?.accountNumber).toBe('123456789');
    });

    it('never persists the confirm-account-number field or unknown keys', () => {
      const draft = createDraft();
      call(sales1, 'PATCH', `/api/applications/${draft.id}/draft`, {
        confirmAccountNumber: '123456789',
        legalName: 'X',
      });
      expect(JSON.stringify(db.get(draft.id))).not.toContain('confirmAccountNumber');
    });

    it('rejects masked placeholders and invalid sensitive values', () => {
      const draft = createDraft();
      expect(
        call(sales1, 'PATCH', `/api/applications/${draft.id}/draft`, { taxId: '••••234F' }).status,
      ).toBe(400);
      expect(
        call(sales1, 'PATCH', `/api/applications/${draft.id}/draft`, { accountNumber: '12' })
          .status,
      ).toBe(400);
      expect(db.get(draft.id)?.taxId).toBeNull();
    });

    it('blocks draft edits by other users and after submission', () => {
      const draft = createDraft();
      expect(
        call(sales2, 'PATCH', `/api/applications/${draft.id}/draft`, { legalName: 'X' }).status,
      ).toBe(404);
      const submitted = find((a) => a.status === 'SUBMITTED' && a.createdById === sales1.id);
      expect(call(sales1, 'PATCH', url(submitted, 'draft'), { legalName: 'X' }).status).toBe(409);
    });

    it('lets only SALES create drafts', () => {
      expect(call(admin, 'POST', '/api/applications').status).toBe(403);
      expect(call(reviewer1, 'POST', '/api/applications').status).toBe(403);
      expect(createDraft().status).toBe('DRAFT');
    });
  });

  describe('draft deletion', () => {
    it('lets the owner delete a DRAFT', () => {
      const draft = createDraft();
      expect(call(sales1, 'DELETE', `/api/applications/${draft.id}`).status).toBe(204);
      expect(db.get(draft.id)).toBeNull();
    });

    it('refuses deletion by other roles, other owners and for non-draft applications', () => {
      const draft = createDraft();
      expect(call(admin, 'DELETE', `/api/applications/${draft.id}`).status).toBe(403);
      expect(call(sales2, 'DELETE', `/api/applications/${draft.id}`).status).toBe(404);
      const submitted = find((a) => a.status === 'SUBMITTED' && a.createdById === sales1.id);
      expect(call(sales1, 'DELETE', url(submitted)).status).toBe(409);
      expect(db.get(draft.id)).not.toBeNull();
    });
  });

  describe('submission', () => {
    it('rejects incomplete applications with field errors', () => {
      const draft = createDraft();
      const res = call(sales1, 'POST', `/api/applications/${draft.id}/submit`);
      expect(res.status).toBe(400);
      expect((res.body as { errors: string[] }).errors).toEqual(
        expect.arrayContaining([
          'Legal name is required.',
          'Tax ID is required.',
          'Account number is required.',
        ]),
      );
    });

    it('re-checks tax ID uniqueness at submit time', () => {
      const existing = find((a) => a.taxId !== null);
      const draft = createDraft();
      // Simulate a clash created after the async validator ran.
      db.save({
        ...(db.get(draft.id) as StoredApplication),
        details: { ...COMPLETE_DETAILS },
        taxId: existing.taxId,
        accountNumber: '123456789',
      });
      const res = call(sales1, 'POST', `/api/applications/${draft.id}/submit`);
      expect(res.status).toBe(400);
      expect((res.body as { errors: string[] }).errors).toContain(
        'This tax ID is already used by another application.',
      );
    });

    it('submits a complete draft and records the event', () => {
      const draft = createDraft();
      call(sales1, 'PATCH', `/api/applications/${draft.id}/draft`, {
        ...COMPLETE_DETAILS,
        taxId: 'ZZZZZ9999Z',
        accountNumber: '123456789',
      });
      const res = call(sales1, 'POST', `/api/applications/${draft.id}/submit`);
      expect(res.status).toBe(200);
      expect(detail(res).status).toBe('SUBMITTED');
      expect(detail(res).assignedReviewer).toBeNull();
      expect(detail(res).history[0].type).toBe('SUBMITTED');
    });
  });

  describe('assignment authorization', () => {
    it('lets ADMIN assign, reassign and unassign a SUBMITTED application', () => {
      const app = find((a) => a.status === 'SUBMITTED' && a.assignedReviewerId === null);
      expect(
        detail(call(admin, 'PUT', url(app, 'assignment'), { reviewerId: 'u-rev-1' }))
          .assignedReviewer?.id,
      ).toBe('u-rev-1');
      expect(
        detail(call(admin, 'PUT', url(app, 'assignment'), { reviewerId: 'u-rev-2' }))
          .assignedReviewer?.id,
      ).toBe('u-rev-2');
      const unassigned = detail(call(admin, 'PUT', url(app, 'assignment'), { reviewerId: null }));
      expect(unassigned.assignedReviewer).toBeNull();
      expect(unassigned.history.slice(0, 3).map((e) => e.type)).toEqual([
        'UNASSIGNED',
        'REASSIGNED',
        'ASSIGNED',
      ]);
    });

    it.each(['DRAFT', 'APPROVED', 'REJECTED'] as const)(
      'refuses assignment on %s applications',
      (status) => {
        const app = find((a) => a.status === status);
        expect(call(admin, 'PUT', url(app, 'assignment'), { reviewerId: 'u-rev-1' }).status).toBe(
          409,
        );
        expect(db.get(app.id)?.assignedReviewerId).toBe(app.assignedReviewerId);
      },
    );

    it('refuses assignment by non-admins and to non-reviewers', () => {
      const app = find((a) => a.status === 'SUBMITTED' && a.assignedReviewerId === reviewer1.id);
      expect(call(reviewer1, 'PUT', url(app, 'assignment'), { reviewerId: 'u-rev-2' }).status).toBe(
        403,
      );
      expect(call(admin, 'PUT', url(app, 'assignment'), { reviewerId: 'u-sales-1' }).status).toBe(
        400,
      );
    });
  });

  describe('decisions', () => {
    const decide = (user: AuthUser, app: StoredApplication, body: unknown) =>
      call(user, 'POST', url(app, 'decision'), body);

    it('lets the assigned reviewer approve with a risk level', () => {
      const app = find((a) => a.status === 'SUBMITTED' && a.assignedReviewerId === reviewer1.id);
      const res = decide(reviewer1, app, { decision: 'APPROVED', riskLevel: 'LOW', comment: '' });
      expect(detail(res).status).toBe('APPROVED');
      expect(detail(res).riskLevel).toBe('LOW');
    });

    it('requires a comment when rejecting', () => {
      const app = find((a) => a.status === 'SUBMITTED' && a.assignedReviewerId === reviewer1.id);
      expect(
        decide(reviewer1, app, { decision: 'REJECTED', riskLevel: 'HIGH', comment: ' ' }).status,
      ).toBe(400);
    });

    it('is final: a second decision is refused', () => {
      const app = find((a) => a.status === 'SUBMITTED' && a.assignedReviewerId === reviewer1.id);
      decide(reviewer1, app, { decision: 'APPROVED', riskLevel: 'LOW', comment: '' });
      const decided = db.get(app.id) as StoredApplication;
      expect(
        decide(reviewer1, decided, { decision: 'REJECTED', riskLevel: 'HIGH', comment: 'x' })
          .status,
      ).toBe(409);
      expect(db.get(app.id)?.status).toBe('APPROVED');
    });

    it('refuses decisions by ADMIN, SALES and unassigned reviewers', () => {
      const app = find((a) => a.status === 'SUBMITTED' && a.assignedReviewerId === reviewer1.id);
      const body = { decision: 'APPROVED', riskLevel: 'LOW', comment: '' };
      expect(decide(admin, app, body).status).toBe(403);
      expect(decide(reviewer2, app, body).status).toBe(404);
      const own = find((a) => a.status === 'SUBMITTED' && a.createdById === sales1.id);
      expect(decide(sales1, own, body).status).toBe(403);
    });
  });

  describe('reveal permissions', () => {
    const assigned = () =>
      find(
        (a) =>
          a.assignedReviewerId === reviewer1.id && a.taxId !== null && a.accountNumber !== null,
      );

    it('returns the clear value with no-store caching and logs an event without the value', () => {
      const app = assigned();
      const res = call(reviewer1, 'POST', url(app, 'reveal'), { field: 'taxId' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ field: 'taxId', value: app.taxId });
      expect(res.headers?.['Cache-Control']).toBe('no-store');
      const event = db.get(app.id)?.history[0];
      expect(event?.type).toBe('REVEALED');
      expect(event?.field).toBe('taxId');
      expect(JSON.stringify(event)).not.toContain(app.taxId ?? '');
    });

    it('lets ADMIN reveal the account number', () => {
      const app = assigned();
      expect(call(admin, 'POST', url(app, 'reveal'), { field: 'accountNumber' }).body).toEqual({
        field: 'accountNumber',
        value: app.accountNumber,
      });
    });

    it('refuses SALES (even the owner) and unassigned reviewers', () => {
      const app = assigned();
      const owner = app.createdById === sales1.id ? sales1 : sales2;
      expect(call(owner, 'POST', url(app, 'reveal'), { field: 'taxId' }).status).toBe(403);
      expect(call(reviewer2, 'POST', url(app, 'reveal'), { field: 'taxId' }).status).toBe(404);
    });

    it('rejects unknown fields', () => {
      expect(call(admin, 'POST', url(assigned(), 'reveal'), { field: 'email' }).status).toBe(400);
    });
  });

  describe('tax ID uniqueness', () => {
    it('checks against every other non-deleted application via POST body', () => {
      const existing = find((a) => a.taxId !== null);
      const draft = createDraft();
      expect(
        call(sales1, 'POST', '/api/validate/tax-id', {
          taxId: existing.taxId,
          applicationId: draft.id,
        }).body,
      ).toEqual({ unique: false });
      expect(
        call(sales1, 'POST', '/api/validate/tax-id', {
          taxId: 'QQQQQ1111Q',
          applicationId: draft.id,
        }).body,
      ).toEqual({ unique: true });
    });

    it('excludes the application itself', () => {
      const existing = find((a) => a.taxId !== null);
      expect(isTaxIdTaken(db, existing.taxId ?? '', existing.id)).toBe(false);
    });
  });

  describe('list query handling', () => {
    const list = (query: string, user: AuthUser = admin) =>
      call(user, 'GET', '/api/applications', null, query).body as Page<ApplicationSummary>;

    it('searches by merchant name or application ID, case-insensitively', () => {
      const target = find((a) => a.details.legalName.startsWith('Lotus'));
      expect(list('q=LOTUS&size=50').items.every((a) => a.legalName.includes('Lotus'))).toBe(true);
      expect(list(`q=${target.id.toLowerCase()}`).items.map((a) => a.id)).toEqual([target.id]);
    });

    it('filters by an inclusive created-date range', () => {
      const days = db
        .all()
        .map((a) => a.createdAt.slice(0, 10))
        .sort();
      const from = days[10];
      const to = days[20];
      const page = list(`from=${from}&to=${to}&size=50`);
      expect(page.total).toBe(11);
      expect(
        page.items.every((a) => a.createdAt.slice(0, 10) >= from && a.createdAt.slice(0, 10) <= to),
      ).toBe(true);
    });

    it('sorts by status and by last update, newest first by default', () => {
      const byStatus = list('sort=status&direction=asc&size=50').items.map((a) => a.status);
      expect(byStatus).toEqual([...byStatus].sort());
      const byUpdate = list('sort=updatedAt&size=50').items.map((a) => a.updatedAt);
      expect(byUpdate).toEqual([...byUpdate].sort().reverse());
    });

    it('falls back to safe defaults for unsupported paging and sort values', () => {
      const page = list('page=-2&size=1000&sort=taxId');
      expect(page.page).toBe(0);
      expect(page.size).toBe(10);
      expect(page.items).toHaveLength(10);
      expect(list('page=abc').page).toBe(0);
    });
  });

  describe('malformed requests', () => {
    const patch = (body: unknown) => {
      const draft = createDraft();
      return call(sales1, 'PATCH', `/api/applications/${draft.id}/draft`, body);
    };
    const message = (res: MockResponse) => (res.body as { message: string }).message;

    it.each([
      [null, 'Invalid draft payload.'],
      [['legalName'], 'Invalid draft payload.'],
      [{ legalName: 42 }, 'legalName must be text.'],
      [{ businessType: 'LLC' }, 'Invalid business type.'],
      [{ monthlyVolume: '1000' }, 'monthlyVolume must be a number.'],
    ])('rejects a draft patch of %j with 400', (body, expected) => {
      const res = patch(body);
      expect(res.status).toBe(400);
      expect(message(res)).toBe(expected);
    });

    it('accepts cleared values in a draft patch', () => {
      const res = patch({ businessType: '', monthlyVolume: null, website: '' });
      expect(res.status).toBe(200);
      expect(detail(res)).toMatchObject({ businessType: '', monthlyVolume: null, website: '' });
    });

    it('lists every invalid format when submitting', () => {
      const draft = createDraft();
      call(sales1, 'PATCH', `/api/applications/${draft.id}/draft`, {
        ...COMPLETE_DETAILS,
        registrationDate: '2999-01-01',
        monthlyVolume: 0,
        email: 'not-an-email',
        phone: 'call me',
        postalCode: '!',
        website: 'ftp:/nowhere',
        routingCode: 'BAD',
        taxId: 'ZZZZZ9999Z',
        accountNumber: '123456789',
      });
      const res = call(sales1, 'POST', `/api/applications/${draft.id}/submit`);
      expect(res.status).toBe(400);
      expect((res.body as { errors: string[] }).errors).toEqual([
        'Monthly volume must be greater than 0.',
        'Registration date is invalid.',
        'Email is invalid.',
        'Phone is invalid.',
        'Postal code is invalid.',
        'Website is invalid.',
        'IFSC / routing code is invalid.',
      ]);
      expect(db.get(draft.id)?.status).toBe('DRAFT');
    });

    it('validates assignment payloads and treats re-assigning the same reviewer as a no-op', () => {
      const app = find((a) => a.status === 'SUBMITTED' && a.assignedReviewerId === reviewer1.id);
      const assign = (body: unknown) => call(admin, 'PUT', url(app, 'assignment'), body);
      expect(assign(null).status).toBe(400);
      expect(assign({}).status).toBe(400);
      expect(assign({ reviewerId: 7 }).status).toBe(400);

      const historyBefore = db.get(app.id)?.history.length;
      expect(assign({ reviewerId: reviewer1.id }).status).toBe(200);
      expect(db.get(app.id)?.history.length).toBe(historyBefore);
    });

    it.each([
      [null, 'Invalid decision payload.'],
      [{ decision: 'MAYBE', riskLevel: 'LOW' }, 'Decision must be APPROVED or REJECTED.'],
      [{ decision: 'APPROVED', riskLevel: 'EXTREME' }, 'Risk level is required.'],
      [
        { decision: 'REJECTED', riskLevel: 'HIGH', comment: '   ' },
        'A comment is required when rejecting.',
      ],
    ])(
      'rejects a decision of %j with 400 and leaves the application undecided',
      (body, expected) => {
        const app = find((a) => a.status === 'SUBMITTED' && a.assignedReviewerId === reviewer1.id);
        const res = call(reviewer1, 'POST', url(app, 'decision'), body);
        expect(res.status).toBe(400);
        expect(message(res)).toBe(expected);
        expect(db.get(app.id)?.status).toBe('SUBMITTED');
      },
    );

    it('records an approval comment, trimmed', () => {
      const app = find((a) => a.status === 'SUBMITTED' && a.assignedReviewerId === reviewer1.id);
      const res = call(reviewer1, 'POST', url(app, 'decision'), {
        decision: 'APPROVED',
        riskLevel: 'LOW',
        comment: '  Looks good  ',
      });
      expect(detail(res).history[0].comment).toBe('Looks good');
    });

    it('answers 404 when revealing a field that has nothing stored', () => {
      const app = find((a) => a.status === 'DRAFT' && a.accountNumber === null);
      const res = call(admin, 'POST', url(app, 'reveal'), { field: 'accountNumber' });
      expect(res.status).toBe(404);
      expect(db.get(app.id)?.history[0].type).not.toBe('REVEALED');
    });

    it('validates tax ID checks: SALES only, and a tax ID is required', () => {
      expect(call(admin, 'POST', '/api/validate/tax-id', { taxId: 'ZZZZZ1234Z' }).status).toBe(403);
      expect(call(sales1, 'POST', '/api/validate/tax-id', {}).status).toBe(400);
      expect(call(sales1, 'POST', '/api/validate/tax-id', { taxId: 'QQQQQ1111Q' }).body).toEqual({
        unique: true,
      });
    });
  });

  it('returns 404 for unknown routes and lets only admins list reviewers', () => {
    expect(call(admin, 'GET', '/api/unknown').status).toBe(404);
    expect(call(admin, 'GET', '/api/reviewers').body).toHaveLength(2);
    expect(call(sales1, 'GET', '/api/reviewers').status).toBe(403);
  });
});
