import { ApplicationStatus, ApplicationSummary } from './application.model';

/**
 * The minimum an authorization decision needs to know about an application. Policy functions take
 * this (plus the canonical `AuthUser`) so the same rules run on API DTOs in the UI and on stored
 * records in the mock server.
 */
export interface PolicySubject {
  readonly status: ApplicationStatus;
  readonly createdById: string;
  readonly assignedReviewerId: string | null;
}

/** Maps the canonical application model onto a policy subject. */
export function toPolicySubject(app: ApplicationSummary): PolicySubject {
  return {
    status: app.status,
    createdById: app.createdBy.id,
    assignedReviewerId: app.assignedReviewer?.id ?? null,
  };
}
