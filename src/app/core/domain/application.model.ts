// Canonical merchant-application model. Framework-independent: shared by the UI, the policies
// and the mock API, so the client and the "server" always agree on shapes.
import { UserRef } from './user.model';

export const APPLICATION_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const BUSINESS_TYPES = ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'COMPANY'] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export type Decision = 'APPROVED' | 'REJECTED';

/** Fields that are masked by default and only revealed to authorised roles. */
export type SensitiveField = 'taxId' | 'accountNumber';

/** Non-sensitive merchant details. Every field is optional while the application is a draft. */
export interface MerchantDetails {
  legalName: string;
  tradingName: string;
  businessType: BusinessType | '';
  /** ISO date (yyyy-mm-dd) or '' */
  registrationDate: string;
  website: string;
  monthlyVolume: number | null;
  ownerName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  accountHolderName: string;
  routingCode: string;
}

export type HistoryEventType =
  | 'CREATED'
  | 'SUBMITTED'
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'UNASSIGNED'
  | 'REVEALED'
  | 'APPROVED'
  | 'REJECTED';

/** Audit event. Never carries sensitive values, only which field was revealed. */
export interface HistoryEvent {
  readonly id: string;
  readonly type: HistoryEventType;
  readonly actor: UserRef;
  readonly at: string;
  readonly reviewer?: UserRef;
  readonly riskLevel?: RiskLevel;
  readonly comment?: string;
  readonly field?: SensitiveField;
}

export interface ApplicationSummary {
  readonly id: string;
  readonly legalName: string;
  readonly status: ApplicationStatus;
  readonly createdBy: UserRef;
  readonly assignedReviewer: UserRef | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly riskLevel: RiskLevel | null;
}

export interface ApplicationDetail extends ApplicationSummary, Readonly<MerchantDetails> {
  readonly submittedAt: string | null;
  /** Masked (e.g. "••••1234") or null when nothing is stored. Clear values are only returned by reveal. */
  readonly taxIdMasked: string | null;
  readonly accountNumberMasked: string | null;
  readonly history: readonly HistoryEvent[];
}

// ---- Commands and responses (the application API contract) ------------------

/**
 * Partial draft update. Omitted keys keep their stored value on the server.
 * Sensitive values are only present when the user explicitly entered a new, valid value.
 * The confirm-account-number field is deliberately absent: it is never persisted.
 */
export type DraftPatch = Partial<MerchantDetails> & {
  taxId?: string;
  accountNumber?: string;
};

export interface DecisionRequest {
  decision: Decision;
  riskLevel: RiskLevel;
  comment: string;
}

export interface RevealResponse {
  readonly field: SensitiveField;
  readonly value: string;
}

/** Columns the list endpoint can sort by. */
export const SORT_FIELDS = ['legalName', 'createdAt', 'updatedAt', 'status'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

/** Page sizes the list endpoint accepts; the first is the default. Shared by the UI and the mock API. */
export const PAGE_SIZES: readonly number[] = [10, 25, 50];
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

export type StatusCounts = Readonly<Record<ApplicationStatus, number>>;
