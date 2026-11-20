import { ApiErrorBody, Page } from '../http/api.models';
import {
  ApplicationDetail,
  ApplicationSummary,
  BUSINESS_TYPES,
  DEFAULT_PAGE_SIZE,
  DecisionRequest,
  DraftPatch,
  MerchantDetails,
  PAGE_SIZES,
  RISK_LEVELS,
  RevealResponse,
  SORT_FIELDS,
  SortField,
  StatusCounts,
} from '../domain/application.model';
import {
  isPastOrTodayIsoDate,
  isValidAccountNumber,
  isValidEmail,
  isValidPhone,
  isValidPostalCode,
  isValidRoutingCode,
  isValidTaxId,
  isValidUrl,
  maskValue,
  normalizeTaxId,
} from '../../shared/validators/merchant-rules';
import { assertTransition, isFinal } from '../domain/application-lifecycle';
import {
  canAssign,
  canCreate,
  canDecide,
  canDelete,
  canEditDraft,
  canFilterByReviewer,
  canReveal,
  canSubmit,
  canView,
  listScope,
} from '../domain/application.policy';
import { APPLICATION_STATUSES, ApplicationStatus } from '../domain/application.model';
import { AuthUser } from '../domain/user.model';
import { PolicySubject } from '../domain/policy.models';
import { EMPTY_DETAILS, MockDb, StoredApplication } from './mock-db';

export interface MockRequest {
  readonly method: string;
  /** Path without the query string, e.g. /api/applications/APP-1001 */
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

export interface MockResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

// Pure request handlers for /api/*. The caller has already authenticated `user`.
// Every rule comes from the shared policy/lifecycle functions; request bodies are never logged.

const ok = (body: unknown, status = 200): MockResponse => ({ status, body });
const error = (status: number, message: string, errors?: string[]): MockResponse => {
  const body: ApiErrorBody = errors ? { message, errors } : { message };
  return { status, body };
};
const notFound = () => error(404, 'Application not found.');

export function handleApiRequest(db: MockDb, user: AuthUser, req: MockRequest): MockResponse {
  const { method, path } = req;
  if (method === 'GET' && path === '/api/applications')
    return listApplications(db, user, req.query);
  if (method === 'GET' && path === '/api/applications/counts') return countApplications(db, user);
  if (method === 'POST' && path === '/api/applications') return createApplication(db, user);
  if (method === 'GET' && path === '/api/reviewers') return listReviewers(db, user);
  if (method === 'POST' && path === '/api/validate/tax-id')
    return validateTaxId(db, user, req.body);

  const match = /^\/api\/applications\/([^/]+)(?:\/([a-z]+))?$/.exec(path);
  if (match) {
    const app = db.get(decodeURIComponent(match[1]));
    // Applications the caller may not see are reported as missing, so their existence doesn't leak.
    if (!app || !canView(user, toSubject(app))) return notFound();
    const action = match[2] ?? '';
    switch (`${method} ${action}`) {
      case 'GET ':
        return ok(toDetail(db, app));
      case 'DELETE ':
        return deleteApplication(db, user, app);
      case 'PATCH draft':
        return patchDraft(db, user, app, req.body);
      case 'POST submit':
        return submitApplication(db, user, app);
      case 'PUT assignment':
        return updateAssignment(db, user, app, req.body);
      case 'POST decision':
        return recordDecision(db, user, app, req.body);
      case 'POST reveal':
        return revealField(db, user, app, req.body);
    }
  }
  return error(404, 'Not found.');
}

// ---- reads -------------------------------------------------------------------

function listApplications(db: MockDb, user: AuthUser, query: URLSearchParams): MockResponse {
  const page = Math.max(0, Number.parseInt(query.get('page') ?? '0', 10) || 0);
  const requestedSize = Number.parseInt(query.get('size') ?? '', 10);
  const size = PAGE_SIZES.includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;
  const q = (query.get('q') ?? '').trim().toLowerCase();
  const status = query.get('status') ?? '';
  const reviewerId = canFilterByReviewer(user) ? (query.get('reviewerId') ?? '') : '';
  const from = query.get('from') ?? '';
  const to = query.get('to') ?? '';
  const sortParam = query.get('sort') ?? 'createdAt';
  const sort: SortField = SORT_FIELDS.find((field) => field === sortParam) ?? 'createdAt';
  const direction = query.get('direction') === 'asc' ? 1 : -1;

  const filtered = scoped(db, user).filter((app) => {
    const day = app.createdAt.slice(0, 10);
    return (
      (!q || app.details.legalName.toLowerCase().includes(q) || app.id.toLowerCase().includes(q)) &&
      (!status || app.status === status) &&
      (!reviewerId || app.assignedReviewerId === reviewerId) &&
      (!from || day >= from) &&
      (!to || day <= to)
    );
  });

  const sortValue = (app: StoredApplication) =>
    sort === 'legalName'
      ? app.details.legalName.toLowerCase()
      : sort === 'status'
        ? app.status
        : app[sort];
  filtered.sort(
    (a, b) => (sortValue(a) < sortValue(b) ? -1 : sortValue(a) > sortValue(b) ? 1 : 0) * direction,
  );

  const body: Page<ApplicationSummary> = {
    items: filtered.slice(page * size, page * size + size).map((app) => toSummary(db, app)),
    total: filtered.length,
    page,
    size,
  };
  return ok(body);
}

function countApplications(db: MockDb, user: AuthUser): MockResponse {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<
    ApplicationStatus,
    number
  >;
  for (const app of scoped(db, user)) counts[app.status]++;
  const body: StatusCounts = counts;
  return ok(body);
}

function listReviewers(db: MockDb, user: AuthUser): MockResponse {
  return canFilterByReviewer(user)
    ? ok(db.reviewers())
    : error(403, 'Only admins can list reviewers.');
}

function scoped(db: MockDb, user: AuthUser): StoredApplication[] {
  const scope = listScope(user);
  return db.all().filter((app) => {
    switch (scope.kind) {
      case 'all':
        return true;
      case 'createdBy':
        return app.createdById === scope.userId;
      case 'assignedTo':
        return app.assignedReviewerId === scope.userId;
    }
  });
}

// ---- writes ------------------------------------------------------------------

function createApplication(db: MockDb, user: AuthUser): MockResponse {
  if (!canCreate(user)) return error(403, 'Only sales users can create applications.');
  const now = new Date().toISOString();
  const app = db.save({
    id: db.nextApplicationId(),
    status: 'DRAFT',
    createdById: user.id,
    assignedReviewerId: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    details: EMPTY_DETAILS,
    taxId: null,
    accountNumber: null,
    riskLevel: null,
    history: [db.event({ type: 'CREATED', actor: db.userRef(user.id), at: now })],
  });
  return ok(toDetail(db, app), 201);
}

function deleteApplication(db: MockDb, user: AuthUser, app: StoredApplication): MockResponse {
  const denied = deny(user, app, canDelete, 'DRAFT');
  if (denied) return denied;
  db.delete(app.id);
  return ok(null, 204);
}

const STRING_FIELDS = [
  'legalName',
  'tradingName',
  'registrationDate',
  'website',
  'ownerName',
  'email',
  'phone',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'accountHolderName',
  'routingCode',
] as const;

/** Partial update: only known keys are applied; omitted keys (including sensitive ones) keep their stored value. */
function patchDraft(
  db: MockDb,
  user: AuthUser,
  app: StoredApplication,
  body: unknown,
): MockResponse {
  const denied = deny(user, app, canEditDraft, 'DRAFT');
  if (denied) return denied;
  if (!isRecord(body)) return error(400, 'Invalid draft payload.');

  const patch = parseDraftPatch(body);
  if (typeof patch === 'string') return error(400, patch);

  const { taxId, accountNumber, ...details } = patch;
  const saved = db.save({
    ...app,
    details: { ...app.details, ...details },
    taxId: taxId === undefined ? app.taxId : normalizeTaxId(taxId),
    accountNumber: accountNumber === undefined ? app.accountNumber : accountNumber.trim(),
    updatedAt: new Date().toISOString(),
  });
  return ok(toDetail(db, saved));
}

function parseDraftPatch(body: Record<string, unknown>): DraftPatch | string {
  const patch: DraftPatch = {};
  for (const key of STRING_FIELDS) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') return `${key} must be text.`;
    patch[key] = value;
  }
  if (body['businessType'] !== undefined) {
    const value = body['businessType'];
    if (value !== '' && !BUSINESS_TYPES.some((type) => type === value))
      return 'Invalid business type.';
    patch.businessType = value === '' ? '' : (value as MerchantDetails['businessType']);
  }
  if (body['monthlyVolume'] !== undefined) {
    const value = body['monthlyVolume'];
    if (value !== null && typeof value !== 'number') return 'monthlyVolume must be a number.';
    patch.monthlyVolume = value;
  }
  // Sensitive values are accepted only when complete and valid; a masked placeholder never passes these checks.
  if (body['taxId'] !== undefined) {
    const value = body['taxId'];
    if (typeof value !== 'string' || !isValidTaxId(value)) return 'Invalid tax ID.';
    patch.taxId = value;
  }
  if (body['accountNumber'] !== undefined) {
    const value = body['accountNumber'];
    if (typeof value !== 'string' || !isValidAccountNumber(value)) return 'Invalid account number.';
    patch.accountNumber = value;
  }
  return patch;
}

function submitApplication(db: MockDb, user: AuthUser, app: StoredApplication): MockResponse {
  const denied = deny(user, app, canSubmit, 'DRAFT');
  if (denied) return denied;

  const errors = submissionErrors(app);
  if (app.taxId && isTaxIdTaken(db, app.taxId, app.id)) {
    errors.push('This tax ID is already used by another application.');
  }
  if (errors.length > 0) return error(400, 'The application is incomplete.', errors);

  assertTransition(app.status, 'SUBMITTED');
  const now = new Date().toISOString();
  const saved = db.save({
    ...app,
    status: 'SUBMITTED',
    submittedAt: now,
    updatedAt: now,
    history: [db.event({ type: 'SUBMITTED', actor: db.userRef(user.id), at: now }), ...app.history],
  });
  return ok(toDetail(db, saved));
}

export function submissionErrors(app: StoredApplication): string[] {
  const d = app.details;
  const errors: string[] = [];
  const required: [string, string][] = [
    [d.legalName, 'Legal name'],
    [d.businessType, 'Business type'],
    [d.registrationDate, 'Registration date'],
    [d.ownerName, 'Owner full name'],
    [d.email, 'Email'],
    [d.phone, 'Phone'],
    [d.addressLine1, 'Address line 1'],
    [d.city, 'City'],
    [d.state, 'State'],
    [d.postalCode, 'Postal code'],
    [d.country, 'Country'],
    [d.accountHolderName, 'Account holder name'],
    [d.routingCode, 'IFSC / routing code'],
  ];
  for (const [value, label] of required) {
    if (!value.trim()) errors.push(`${label} is required.`);
  }
  if (!app.taxId) errors.push('Tax ID is required.');
  if (!app.accountNumber) errors.push('Account number is required.');
  if (d.monthlyVolume === null || d.monthlyVolume <= 0)
    errors.push('Monthly volume must be greater than 0.');
  if (d.registrationDate && !isPastOrTodayIsoDate(d.registrationDate))
    errors.push('Registration date is invalid.');
  if (d.email && !isValidEmail(d.email)) errors.push('Email is invalid.');
  if (d.phone && !isValidPhone(d.phone)) errors.push('Phone is invalid.');
  if (d.postalCode && !isValidPostalCode(d.postalCode)) errors.push('Postal code is invalid.');
  if (d.website && !isValidUrl(d.website)) errors.push('Website is invalid.');
  if (d.routingCode && !isValidRoutingCode(d.routingCode))
    errors.push('IFSC / routing code is invalid.');
  return errors;
}

function updateAssignment(
  db: MockDb,
  user: AuthUser,
  app: StoredApplication,
  body: unknown,
): MockResponse {
  const denied = deny(user, app, canAssign, 'SUBMITTED');
  if (denied) return denied;
  if (!isRecord(body) || !('reviewerId' in body)) return error(400, 'reviewerId is required.');
  const reviewerId = body['reviewerId'];
  if (reviewerId !== null && typeof reviewerId !== 'string')
    return error(400, 'Invalid reviewerId.');
  if (reviewerId !== null && db.findUser(reviewerId)?.role !== 'REVIEWER') {
    return error(400, 'The selected user is not a reviewer.');
  }
  if (reviewerId === app.assignedReviewerId) return ok(toDetail(db, app));

  const now = new Date().toISOString();
  const type =
    reviewerId === null ? 'UNASSIGNED' : app.assignedReviewerId ? 'REASSIGNED' : 'ASSIGNED';
  const reviewer = db.userRef(reviewerId ?? app.assignedReviewerId ?? '');
  const saved = db.save({
    ...app,
    assignedReviewerId: reviewerId,
    updatedAt: now,
    history: [db.event({ type, actor: db.userRef(user.id), at: now, reviewer }), ...app.history],
  });
  return ok(toDetail(db, saved));
}

function recordDecision(
  db: MockDb,
  user: AuthUser,
  app: StoredApplication,
  body: unknown,
): MockResponse {
  const denied = deny(user, app, canDecide, 'SUBMITTED');
  if (denied) return denied;
  const request = parseDecision(body);
  if (typeof request === 'string') return error(400, request);

  assertTransition(app.status, request.decision);
  const now = new Date().toISOString();
  const comment = request.comment.trim();
  const saved = db.save({
    ...app,
    status: request.decision,
    riskLevel: request.riskLevel,
    updatedAt: now,
    history: [
      db.event({
        type: request.decision,
        actor: db.userRef(user.id),
        at: now,
        riskLevel: request.riskLevel,
        ...(comment ? { comment } : {}),
      }),
      ...app.history,
    ],
  });
  return ok(toDetail(db, saved));
}

function parseDecision(body: unknown): DecisionRequest | string {
  if (!isRecord(body)) return 'Invalid decision payload.';
  const { decision, riskLevel, comment } = body;
  if (decision !== 'APPROVED' && decision !== 'REJECTED')
    return 'Decision must be APPROVED or REJECTED.';
  if (!RISK_LEVELS.some((level) => level === riskLevel)) return 'Risk level is required.';
  const text = typeof comment === 'string' ? comment : '';
  if (decision === 'REJECTED' && !text.trim()) return 'A comment is required when rejecting.';
  return { decision, riskLevel: riskLevel as DecisionRequest['riskLevel'], comment: text };
}

function revealField(
  db: MockDb,
  user: AuthUser,
  app: StoredApplication,
  body: unknown,
): MockResponse {
  if (!canReveal(user, toSubject(app)))
    return error(403, 'You are not allowed to reveal this field.');
  const field = isRecord(body) ? body['field'] : undefined;
  if (field !== 'taxId' && field !== 'accountNumber') return error(400, 'Unknown field.');
  const value = app[field];
  if (!value) return error(404, 'Nothing is stored for this field.');

  const now = new Date().toISOString();
  // The audit event records who revealed which field — never the value.
  db.save({
    ...app,
    history: [
      db.event({ type: 'REVEALED', actor: db.userRef(user.id), at: now, field }),
      ...app.history,
    ],
  });
  const response: RevealResponse = { field, value };
  return {
    status: 200,
    body: response,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  };
}

function validateTaxId(db: MockDb, user: AuthUser, body: unknown): MockResponse {
  if (!canCreate(user)) return error(403, 'Not allowed.');
  if (!isRecord(body) || typeof body['taxId'] !== 'string') return error(400, 'taxId is required.');
  const applicationId = typeof body['applicationId'] === 'string' ? body['applicationId'] : null;
  return ok({ unique: !isTaxIdTaken(db, body['taxId'], applicationId) });
}

/** Uniqueness spans every other non-deleted application, whatever its status. */
export function isTaxIdTaken(db: MockDb, taxId: string, exceptId: string | null): boolean {
  const normalized = normalizeTaxId(taxId);
  return db
    .all()
    .some(
      (app) =>
        app.id !== exceptId && app.taxId !== null && normalizeTaxId(app.taxId) === normalized,
    );
}

// ---- helpers -----------------------------------------------------------------

/**
 * Runs a policy check. If it fails only because of the application's status, the answer is 409
 * (a lifecycle conflict); if the user could never do it, 403.
 */
function deny(
  user: AuthUser,
  app: StoredApplication,
  policy: (user: AuthUser, app: PolicySubject) => boolean,
  requiredStatus: ApplicationStatus,
): MockResponse | null {
  const subject = toSubject(app);
  if (policy(user, subject)) return null;
  if (policy(user, { ...subject, status: requiredStatus })) {
    const reason = isFinal(app.status)
      ? 'it has already been decided'
      : `its status is ${app.status}`;
    return error(409, `This action is not possible because ${reason}.`);
  }
  return error(403, 'You are not allowed to perform this action.');
}

function toSubject(app: StoredApplication): PolicySubject {
  return {
    status: app.status,
    createdById: app.createdById,
    assignedReviewerId: app.assignedReviewerId,
  };
}

function toSummary(db: MockDb, app: StoredApplication): ApplicationSummary {
  return {
    id: app.id,
    legalName: app.details.legalName,
    status: app.status,
    createdBy: db.userRef(app.createdById),
    assignedReviewer: app.assignedReviewerId ? db.userRef(app.assignedReviewerId) : null,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    riskLevel: app.riskLevel,
  };
}

function toDetail(db: MockDb, app: StoredApplication): ApplicationDetail {
  return {
    ...toSummary(db, app),
    ...app.details,
    submittedAt: app.submittedAt,
    taxIdMasked: app.taxId ? maskValue(app.taxId) : null,
    accountNumberMasked: app.accountNumber ? maskValue(app.accountNumber) : null,
    history: app.history,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
