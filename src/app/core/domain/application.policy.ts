import { AuthUser } from './user.model';
import { PolicySubject } from './policy.models';

// Authorization rules as pure functions over (authenticated user, application).
// The Angular PermissionService and the mock API handlers both call these, so the UI
// and the "server" can never disagree. Hiding a button is UX; the handlers enforce.

const isOwner = (user: AuthUser, app: PolicySubject) => app.createdById === user.id;
const isAssignedReviewer = (user: AuthUser, app: PolicySubject) =>
  user.role === 'REVIEWER' && app.assignedReviewerId === user.id;

export function canCreate(user: AuthUser): boolean {
  return user.role === 'SALES';
}

export function canView(user: AuthUser, app: PolicySubject): boolean {
  switch (user.role) {
    case 'ADMIN':
      return true;
    case 'SALES':
      return isOwner(user, app);
    case 'REVIEWER':
      return isAssignedReviewer(user, app);
  }
}

export function canEditDraft(user: AuthUser, app: PolicySubject): boolean {
  return user.role === 'SALES' && isOwner(user, app) && app.status === 'DRAFT';
}

export function canSubmit(user: AuthUser, app: PolicySubject): boolean {
  return canEditDraft(user, app);
}

export function canDelete(user: AuthUser, app: PolicySubject): boolean {
  return canEditDraft(user, app);
}

/** Assign, reassign and unassign: ADMIN only, and only while the application awaits a decision. */
export function canAssign(user: AuthUser, app: PolicySubject): boolean {
  return user.role === 'ADMIN' && app.status === 'SUBMITTED';
}

export function canDecide(user: AuthUser, app: PolicySubject): boolean {
  return isAssignedReviewer(user, app) && app.status === 'SUBMITTED';
}

export function canReveal(user: AuthUser, app: PolicySubject): boolean {
  return (user.role === 'ADMIN' || user.role === 'REVIEWER') && canView(user, app);
}

export function canFilterByReviewer(user: AuthUser): boolean {
  return user.role === 'ADMIN';
}

/** Which applications a list query may return for this user. */
export type ListScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'createdBy'; readonly userId: string }
  | { readonly kind: 'assignedTo'; readonly userId: string };

export function listScope(user: AuthUser): ListScope {
  switch (user.role) {
    case 'ADMIN':
      return { kind: 'all' };
    case 'SALES':
      return { kind: 'createdBy', userId: user.id };
    case 'REVIEWER':
      return { kind: 'assignedTo', userId: user.id };
  }
}
