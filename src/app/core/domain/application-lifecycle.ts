import { ApplicationStatus } from './application.model';

/** Every allowed status change. Anything not listed here is forbidden. */
const ALLOWED_TRANSITIONS: Readonly<Record<ApplicationStatus, readonly ApplicationStatus[]>> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ApplicationStatus,
    readonly to: ApplicationStatus,
  ) {
    super(`Cannot move an application from ${from} to ${to}.`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** Decided applications are immutable: no edits, assignments or further decisions. */
export function isFinal(status: ApplicationStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
