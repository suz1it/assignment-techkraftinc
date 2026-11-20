import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../auth/auth-store';
import { PolicySubject } from '../domain/policy.models';
import { Role } from '../domain/user.model';
import { PermissionService } from './permission-service';

describe('PermissionService', () => {
  let permissions: PermissionService;
  let auth: AuthStore;

  const signIn = (role: Role, id = 'u1') =>
    auth.setSession({
      tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 1000 },
      user: { id, name: 'User', role },
    });
  const submitted: PolicySubject = {
    status: 'SUBMITTED',
    createdById: 'u1',
    assignedReviewerId: 'r1',
  };
  const draft: PolicySubject = { status: 'DRAFT', createdById: 'u1', assignedReviewerId: null };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    permissions = TestBed.inject(PermissionService);
    auth = TestBed.inject(AuthStore);
  });

  it('denies everything when nobody is signed in', () => {
    expect(permissions.canCreate()).toBe(false);
    expect(permissions.canEditDraft(draft)).toBe(false);
    expect(permissions.canReveal(submitted)).toBe(false);
  });

  it('applies the shared policy to the signed-in user and reacts to user changes', () => {
    signIn('SALES');
    expect(permissions.canCreate()).toBe(true);
    expect(permissions.canEditDraft(draft)).toBe(true);
    expect(permissions.canDelete(draft)).toBe(true);
    expect(permissions.canReveal(submitted)).toBe(false);

    signIn('ADMIN', 'a1');
    expect(permissions.canCreate()).toBe(false);
    expect(permissions.canFilterByReviewer()).toBe(true);
    expect(permissions.canAssign(submitted)).toBe(true);
    expect(permissions.canDecide(submitted)).toBe(false);

    signIn('REVIEWER', 'r1');
    expect(permissions.canDecide(submitted)).toBe(true);
    expect(permissions.canReveal(submitted)).toBe(true);
  });
});
