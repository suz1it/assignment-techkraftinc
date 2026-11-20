import { Injectable } from '@angular/core';
import {
  BusinessType,
  HistoryEvent,
  MerchantDetails,
  RiskLevel,
} from '../domain/application.model';
import { UserRef } from '../domain/user.model';
import { AuthSession } from '../auth/auth.models';
import { ApplicationStatus } from '../domain/application.model';
import { AuthUser } from '../domain/user.model';

export interface MockUser extends AuthUser {
  readonly username: string;
  readonly password: string;
}

/** Server-side record. Sensitive values live here in clear and are only ever returned masked or via reveal. */
export interface StoredApplication {
  readonly id: string;
  readonly status: ApplicationStatus;
  readonly createdById: string;
  readonly assignedReviewerId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
  readonly details: MerchantDetails;
  readonly taxId: string | null;
  readonly accountNumber: string | null;
  readonly riskLevel: RiskLevel | null;
  readonly history: readonly HistoryEvent[];
}

// Fictional demo accounts — documented in the README.
export const MOCK_PASSWORD = 'Passw0rd!';
const USERS: readonly MockUser[] = [
  {
    id: 'u-sales-1',
    username: 'sales1',
    name: 'Sarah Mitchell',
    role: 'SALES',
    password: MOCK_PASSWORD,
  },
  {
    id: 'u-sales-2',
    username: 'sales2',
    name: 'Ryan Cooper',
    role: 'SALES',
    password: MOCK_PASSWORD,
  },
  {
    id: 'u-rev-1',
    username: 'reviewer1',
    name: 'Emily Carter',
    role: 'REVIEWER',
    password: MOCK_PASSWORD,
  },
  {
    id: 'u-rev-2',
    username: 'reviewer2',
    name: 'Michael Brooks',
    role: 'REVIEWER',
    password: MOCK_PASSWORD,
  },
  {
    id: 'u-admin',
    username: 'admin',
    name: 'Amanda Hayes',
    role: 'ADMIN',
    password: MOCK_PASSWORD,
  },
];

export const EMPTY_DETAILS: MerchantDetails = {
  legalName: '',
  tradingName: '',
  businessType: '',
  registrationDate: '',
  website: '',
  monthlyVolume: null,
  ownerName: '',
  email: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  accountHolderName: '',
  routingCode: '',
};

/**
 * In-memory "server state". Nothing is persisted to browser storage, so a reload resets to the seed.
 * Lives in the same JS realm as the UI: it demonstrates the contract a real server must enforce,
 * it is not a security boundary.
 */
@Injectable({ providedIn: 'root' })
export class MockDb {
  accessTtlMs = 30_000;
  refreshCalls = 0;
  /** Simulated network latency range; tests set both to 0. */
  minLatencyMs = 150;
  maxLatencyMs = 450;

  // Every token belongs to a session "family": one sign-in plus all the refreshes that follow it.
  private readonly accessTokens = new Map<
    string,
    { userId: string; family: number; expiresAt: number }
  >();
  private readonly refreshTokens = new Map<string, { userId: string; family: number }>();
  /** Refresh tokens already exchanged, remembered so that a replay can be detected. */
  private readonly usedRefreshTokens = new Map<string, number>();
  private familyCounter = 0;
  private readonly applications = new Map<string, StoredApplication>();
  private tokenCounter = 0;
  private idCounter = 1000;
  private eventCounter = 0;
  private failuresRemaining = 0;

  constructor() {
    seedApplications(this);
  }

  // ---- users & tokens -------------------------------------------------------

  findUserByCredentials(username: string, password: string): AuthUser | null {
    const user = USERS.find((u) => u.username === username && u.password === password);
    return user ? toAuthUser(user) : null;
  }

  findUser(id: string): AuthUser | null {
    const user = USERS.find((u) => u.id === id);
    return user ? toAuthUser(user) : null;
  }

  reviewers(): UserRef[] {
    return USERS.filter((u) => u.role === 'REVIEWER').map(({ id, name }) => ({ id, name }));
  }

  /** Issues tokens for a new sign-in, or for a refresh within an existing session family. */
  issueSession(user: AuthUser, family = ++this.familyCounter): AuthSession {
    const id = ++this.tokenCounter;
    const expiresAt = Date.now() + this.accessTtlMs;
    const tokens = { accessToken: `access-${id}`, refreshToken: `refresh-${id}`, expiresAt };
    this.accessTokens.set(tokens.accessToken, { userId: user.id, family, expiresAt });
    this.refreshTokens.set(tokens.refreshToken, { userId: user.id, family });
    return { tokens, user };
  }

  /**
   * Rotation with reuse detection: a refresh token works exactly once. If an already-used token is
   * presented again, someone else holds a copy of it, so the whole session family is revoked and
   * both the attacker and the real user must sign in again.
   */
  consumeRefreshToken(token: string): { readonly user: AuthUser; readonly family: number } | null {
    const replayedFamily = this.usedRefreshTokens.get(token);
    if (replayedFamily !== undefined) {
      this.revokeFamily(replayedFamily);
      return null;
    }
    const entry = this.refreshTokens.get(token);
    if (!entry) return null;
    this.refreshTokens.delete(token);
    this.usedRefreshTokens.set(token, entry.family);
    const user = this.findUser(entry.userId);
    return user ? { user, family: entry.family } : null;
  }

  /** Sign-out: revokes every access and refresh token of the session this refresh token belongs to. */
  revokeSession(refreshToken: string): void {
    const family =
      this.refreshTokens.get(refreshToken)?.family ?? this.usedRefreshTokens.get(refreshToken);
    if (family !== undefined) this.revokeFamily(family);
  }

  private revokeFamily(family: number): void {
    for (const [token, entry] of this.accessTokens) {
      if (entry.family === family) this.accessTokens.delete(token);
    }
    for (const [token, entry] of this.refreshTokens) {
      if (entry.family === family) this.refreshTokens.delete(token);
    }
  }

  userForAccessToken(token: string): AuthUser | null {
    const entry = this.accessTokens.get(token);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return this.findUser(entry.userId);
  }

  /** Dev tool: forces the next API calls to 401 so the single-refresh flow can be demoed. */
  expireAllAccessTokens(): void {
    for (const [token, entry] of this.accessTokens) {
      this.accessTokens.set(token, { ...entry, expiresAt: 0 });
    }
  }

  latencyMs(): number {
    return this.minLatencyMs + Math.round(Math.random() * (this.maxLatencyMs - this.minLatencyMs));
  }

  // ---- failure simulation ---------------------------------------------------

  failNextRequests(count: number): void {
    this.failuresRemaining = Math.max(0, count);
  }

  get pendingFailures(): number {
    return this.failuresRemaining;
  }

  /** Returns true (and counts down) when the current API call should fail. */
  consumeFailure(): boolean {
    if (this.failuresRemaining === 0) return false;
    this.failuresRemaining--;
    return true;
  }

  // ---- applications ---------------------------------------------------------

  all(): StoredApplication[] {
    return [...this.applications.values()];
  }

  get(id: string): StoredApplication | null {
    return this.applications.get(id) ?? null;
  }

  save(app: StoredApplication): StoredApplication {
    this.applications.set(app.id, app);
    return app;
  }

  delete(id: string): void {
    this.applications.delete(id);
  }

  nextApplicationId(): string {
    return `APP-${++this.idCounter}`;
  }

  event(fields: Omit<HistoryEvent, 'id'>): HistoryEvent {
    return { id: `evt-${++this.eventCounter}`, ...fields };
  }

  userRef(id: string): UserRef {
    const user = this.findUser(id);
    return { id, name: user?.name ?? 'Unknown user' };
  }
}

function toAuthUser({ id, name, role }: MockUser): AuthUser {
  return { id, name, role };
}

// ---- seed --------------------------------------------------------------------
// All seed data is synthetic and deliberately unrealistic: the `TEST` bank code, the `00000` phone
// series, the `ZZZZZ` tax ID prefix and the zero-prefixed account numbers belong to nobody.

const MERCHANT_NAMES = [
  'Lotus Organics',
  'Bluewave Electronics',
  'Saffron Spice Co',
  'Northwind Traders',
  'Urban Threads',
  'Peak Fitness Studio',
  'Green Leaf Cafe',
  'Silverline Logistics',
  'Maple Hardware',
  'Coral Bay Travel',
  'Sunrise Bakery',
  'Quantum Tutors',
  'Harbor Fresh Seafood',
  'Pixel Print Shop',
  'Evergreen Pharmacy',
];
// Fictional merchant owners for the seed data.
const OWNER_NAMES = [
  'James Anderson',
  'Jennifer Lewis',
  'Robert Walker',
  'Jessica Hall',
  'David Young',
  'Ashley King',
  'Christopher Wright',
  'Megan Scott',
  'Daniel Green',
  'Lauren Baker',
  'Matthew Adams',
  'Rachel Nelson',
  'Andrew Hill',
  'Stephanie Campbell',
  'Joshua Roberts',
  'Nicole Turner',
  'Brandon Phillips',
  'Amber Evans',
  'Kevin Collins',
  'Heather Stewart',
];
const CITIES = [
  ['Bengaluru', 'Karnataka', '560001', 'India'],
  ['Mumbai', 'Maharashtra', '400001', 'India'],
  ['Austin', 'Texas', '73301', 'United States'],
  ['Pune', 'Maharashtra', '411001', 'India'],
  ['Seattle', 'Washington', '98101', 'United States'],
] as const;
const TYPES: readonly BusinessType[] = ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'COMPANY'];
const RISKS: readonly RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

const DAY_MS = 86_400_000;
const SEED_COUNT = 60;

function seedApplications(db: MockDb): void {
  const sales = ['u-sales-1', 'u-sales-2'];
  const reviewers = ['u-rev-1', 'u-rev-2'];
  const now = Date.now();

  for (let i = 0; i < SEED_COUNT; i++) {
    const createdById = sales[i % 2];
    const reviewerId = reviewers[Math.floor(i / 2) % 2];
    const createdAtMs = now - (SEED_COUNT - i) * 2 * DAY_MS;
    const createdAt = new Date(createdAtMs).toISOString();
    const at = (offsetDays: number) => new Date(createdAtMs + offsetDays * DAY_MS).toISOString();
    const [city, state, postalCode, country] = CITIES[i % CITIES.length];
    const name = `${MERCHANT_NAMES[i % MERCHANT_NAMES.length]}${i >= MERCHANT_NAMES.length ? ` ${Math.floor(i / MERCHANT_NAMES.length) + 1}` : ''}`;
    const status = seedStatus(i);
    const isDraft = status === 'DRAFT';
    const assigned =
      status === 'APPROVED' || status === 'REJECTED' || (status === 'SUBMITTED' && i % 3 !== 0);
    const risk = RISKS[i % RISKS.length];

    const details: MerchantDetails = {
      ...EMPTY_DETAILS,
      legalName: name,
      tradingName: isDraft && i % 2 === 0 ? '' : name.split(' ')[0],
      businessType: TYPES[i % TYPES.length],
      registrationDate: new Date(createdAtMs - 400 * DAY_MS).toISOString().slice(0, 10),
      website: `https://${name.toLowerCase().replace(/[^a-z]+/g, '')}.example.com`,
      monthlyVolume: 50_000 + (i % 7) * 25_000,
      ownerName: OWNER_NAMES[i % OWNER_NAMES.length],
      email: `owner${i + 1}@example.com`,
      phone: `+91 00000 ${String(10_000 + i).slice(-5)}`,
      addressLine1: `${10 + i} Market Road`,
      city: isDraft ? '' : city,
      state: isDraft ? '' : state,
      postalCode: isDraft ? '' : postalCode,
      country: isDraft ? '' : country,
      accountHolderName: isDraft ? '' : name,
      routingCode: isDraft ? '' : 'TEST0000001',
    };

    const history: HistoryEvent[] = [
      db.event({ type: 'CREATED', actor: db.userRef(createdById), at: createdAt }),
    ];
    if (!isDraft)
      history.push(db.event({ type: 'SUBMITTED', actor: db.userRef(createdById), at: at(1) }));
    if (assigned) {
      history.push(
        db.event({
          type: 'ASSIGNED',
          actor: db.userRef('u-admin'),
          at: at(1.5),
          reviewer: db.userRef(reviewerId),
        }),
      );
    }
    if (status === 'APPROVED' || status === 'REJECTED') {
      history.push(
        db.event({
          type: status,
          actor: db.userRef(reviewerId),
          at: at(2),
          riskLevel: status === 'REJECTED' ? 'HIGH' : risk === 'HIGH' ? 'MEDIUM' : risk,
          comment:
            status === 'REJECTED'
              ? 'Incomplete KYC documents and high chargeback history.'
              : 'Checks passed.',
        }),
      );
    }

    const lastEvent = history[history.length - 1];
    db.save({
      id: db.nextApplicationId(),
      status,
      createdById,
      assignedReviewerId: assigned ? reviewerId : null,
      createdAt,
      updatedAt: lastEvent.at,
      submittedAt: isDraft ? null : at(1),
      details,
      taxId: `ZZZZZ${String(1000 + i)}${String.fromCharCode(65 + (i % 26))}`,
      accountNumber: isDraft && i % 2 === 0 ? null : `00000${String(20_000_000 + i * 7919)}`,
      riskLevel: lastEvent.riskLevel ?? null,
      history: history.reverse(),
    });
  }
}

/** Deterministic mix: ~12 drafts, ~22 submitted (some unassigned), ~14 approved, ~12 rejected. */
function seedStatus(i: number): ApplicationStatus {
  const bucket = i % 5;
  if (bucket === 0) return 'DRAFT';
  if (bucket === 1 || bucket === 2)
    return i > 40 ? 'SUBMITTED' : bucket === 1 ? 'APPROVED' : 'SUBMITTED';
  if (bucket === 3) return i % 2 === 0 ? 'REJECTED' : 'SUBMITTED';
  return i % 3 === 0 ? 'REJECTED' : 'APPROVED';
}
