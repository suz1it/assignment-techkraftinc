import { Injectable, computed, inject } from '@angular/core';
import { AuthStore } from '../auth/auth-store';
import * as policy from '../domain/application.policy';
import { AuthUser } from '../domain/user.model';
import { PolicySubject } from '../domain/policy.models';

/** Signal-friendly facade over the pure policy functions, bound to the signed-in user. */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly user = inject(AuthStore).user;

  readonly canCreate = computed(() => this.check((user) => policy.canCreate(user)));
  readonly canFilterByReviewer = computed(() =>
    this.check((user) => policy.canFilterByReviewer(user)),
  );

  canEditDraft(app: PolicySubject): boolean {
    return this.check((user) => policy.canEditDraft(user, app));
  }

  canDelete(app: PolicySubject): boolean {
    return this.check((user) => policy.canDelete(user, app));
  }

  canAssign(app: PolicySubject): boolean {
    return this.check((user) => policy.canAssign(user, app));
  }

  canDecide(app: PolicySubject): boolean {
    return this.check((user) => policy.canDecide(user, app));
  }

  canReveal(app: PolicySubject): boolean {
    return this.check((user) => policy.canReveal(user, app));
  }

  private check(rule: (user: AuthUser) => boolean): boolean {
    const user = this.user();
    return user ? rule(user) : false;
  }
}
