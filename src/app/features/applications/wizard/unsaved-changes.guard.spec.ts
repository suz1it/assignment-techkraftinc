import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { LeaveConfirmation, unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  const run = (component: LeaveConfirmation) =>
    TestBed.runInInjectionContext(() =>
      unsavedChangesGuard(
        component,
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
        {} as RouterStateSnapshot,
      ),
    );

  it('delegates to the component (which flushes the autosave first)', async () => {
    expect(run({ canLeave: () => true })).toBe(true);
    const result = run({ canLeave: () => of(false) });
    expect(isObservable(result) && (await firstValueFrom(result))).toBe(false);
  });
});
