// Human-readable labels for domain values, defined once so every screen says the same thing.
import { ApplicationStatus, BusinessType, RiskLevel, SensitiveField } from './application.model';
import { Role } from './user.model';

export const STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const BUSINESS_TYPE_LABELS: Readonly<Record<BusinessType, string>> = {
  SOLE_PROPRIETORSHIP: 'Sole proprietorship',
  PARTNERSHIP: 'Partnership',
  COMPANY: 'Company',
};

export const RISK_LABELS: Readonly<Record<RiskLevel, string>> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

/** Lower-case, for use inside sentences ("revealed the tax ID"). */
export const SENSITIVE_FIELD_LABELS: Readonly<Record<SensitiveField, string>> = {
  taxId: 'tax ID',
  accountNumber: 'bank account number',
};

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  SALES: 'Sales',
  REVIEWER: 'Reviewer',
  ADMIN: 'Admin',
};
