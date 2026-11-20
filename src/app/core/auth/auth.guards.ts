import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { Role } from '../domain/user.model';
import { AuthStore } from './auth-store';

// Guards are UX only: they keep people away from screens they can't use.
// The mock API enforces the same rules on every request.

export const authGuard: CanMatchFn = (_route, segments) => {
  if (inject(AuthStore).isAuthenticated()) return true;
  const path = segments.map((segment) => segment.path).join('/');
  const returnUrl = path ? `/${path}` : undefined;
  return inject(Router).createUrlTree(['/login'], returnUrl ? { queryParams: { returnUrl } } : {});
};

export const guestGuard: CanMatchFn = () =>
  inject(AuthStore).isAuthenticated() ? inject(Router).createUrlTree(['/applications']) : true;

export function roleGuard(...roles: Role[]): CanMatchFn {
  return () => {
    const role = inject(AuthStore).user()?.role;
    return role && roles.includes(role) ? true : inject(Router).createUrlTree(['/applications']);
  };
}
