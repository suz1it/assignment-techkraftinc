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
} from './application.policy';
import { ApplicationStatus } from './application.model';
import { AuthUser } from './user.model';
import { PolicySubject } from './policy.models';

const sales: AuthUser = { id: 's1', name: 'Sales One', role: 'SALES' };
const otherSales: AuthUser = { id: 's2', name: 'Sales Two', role: 'SALES' };
const reviewer: AuthUser = { id: 'r1', name: 'Reviewer One', role: 'REVIEWER' };
const otherReviewer: AuthUser = { id: 'r2', name: 'Reviewer Two', role: 'REVIEWER' };
const admin: AuthUser = { id: 'a1', name: 'Admin', role: 'ADMIN' };

const app = (
  status: ApplicationStatus,
  assignedReviewerId: string | null = 'r1',
): PolicySubject => ({
  status,
  createdById: 's1',
  assignedReviewerId,
});

describe('application policy', () => {
  it('lets only SALES create applications', () => {
    expect(canCreate(sales)).toBe(true);
    expect(canCreate(reviewer)).toBe(false);
    expect(canCreate(admin)).toBe(false);
  });

  describe('visibility', () => {
    it('shows SALES only their own applications', () => {
      expect(canView(sales, app('SUBMITTED'))).toBe(true);
      expect(canView(otherSales, app('SUBMITTED'))).toBe(false);
    });

    it('shows REVIEWERs only applications assigned to them', () => {
      expect(canView(reviewer, app('SUBMITTED'))).toBe(true);
      expect(canView(otherReviewer, app('SUBMITTED'))).toBe(false);
      expect(canView(reviewer, app('SUBMITTED', null))).toBe(false);
    });

    it('shows ADMIN everything', () => {
      expect(canView(admin, app('DRAFT', null))).toBe(true);
    });

    it('scopes list queries by role', () => {
      expect(listScope(admin)).toEqual({ kind: 'all' });
      expect(listScope(sales)).toEqual({ kind: 'createdBy', userId: 's1' });
      expect(listScope(reviewer)).toEqual({ kind: 'assignedTo', userId: 'r1' });
    });
  });

  describe('draft editing, submission and deletion', () => {
    it.each([canEditDraft, canSubmit, canDelete])(
      'allows only the owner while DRAFT (%o)',
      (rule) => {
        expect(rule(sales, app('DRAFT', null))).toBe(true);
        expect(rule(otherSales, app('DRAFT', null))).toBe(false);
        expect(rule(admin, app('DRAFT', null))).toBe(false);
        expect(rule(reviewer, app('DRAFT'))).toBe(false);
        for (const status of ['SUBMITTED', 'APPROVED', 'REJECTED'] as const) {
          expect(rule(sales, app(status))).toBe(false);
        }
      },
    );
  });

  describe('assignment', () => {
    it('allows ADMIN to assign only while SUBMITTED', () => {
      expect(canAssign(admin, app('SUBMITTED', null))).toBe(true);
      expect(canAssign(admin, app('SUBMITTED', 'r1'))).toBe(true);
    });

    it.each(['DRAFT', 'APPROVED', 'REJECTED'] as const)('blocks assignment on %s', (status) => {
      expect(canAssign(admin, app(status))).toBe(false);
    });

    it('never lets SALES or REVIEWER assign', () => {
      expect(canAssign(sales, app('SUBMITTED'))).toBe(false);
      expect(canAssign(reviewer, app('SUBMITTED'))).toBe(false);
    });
  });

  describe('decisions', () => {
    it('allows only the assigned reviewer on a SUBMITTED application', () => {
      expect(canDecide(reviewer, app('SUBMITTED'))).toBe(true);
      expect(canDecide(otherReviewer, app('SUBMITTED'))).toBe(false);
      expect(canDecide(admin, app('SUBMITTED'))).toBe(false);
      expect(canDecide(sales, app('SUBMITTED'))).toBe(false);
    });

    it.each(['APPROVED', 'REJECTED', 'DRAFT'] as const)('is final once %s', (status) => {
      expect(canDecide(reviewer, app(status))).toBe(false);
    });
  });

  describe('reveal', () => {
    it('never lets SALES reveal, even on their own application', () => {
      expect(canReveal(sales, app('SUBMITTED'))).toBe(false);
    });

    it('lets the assigned reviewer and ADMIN reveal', () => {
      expect(canReveal(reviewer, app('APPROVED'))).toBe(true);
      expect(canReveal(admin, app('DRAFT', null))).toBe(true);
    });

    it('blocks a reviewer who is not assigned', () => {
      expect(canReveal(otherReviewer, app('SUBMITTED'))).toBe(false);
    });
  });

  it('offers the reviewer filter to ADMIN only', () => {
    expect(canFilterByReviewer(admin)).toBe(true);
    expect(canFilterByReviewer(reviewer)).toBe(false);
    expect(canFilterByReviewer(sales)).toBe(false);
  });
});
