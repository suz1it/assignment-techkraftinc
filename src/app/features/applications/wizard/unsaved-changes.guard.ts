import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

export interface LeaveConfirmation {
  /** Flush pending work; resolve false to stay on the page. */
  canLeave(): Observable<boolean> | boolean;
}

/**
 * Autosave already protects the user's work, so leaving never prompts by default: the component
 * flushes the pending save first and only asks when that save fails.
 */
export const unsavedChangesGuard: CanDeactivateFn<LeaveConfirmation> = (component) =>
  component.canLeave();
