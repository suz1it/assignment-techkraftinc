import { Signal, computed } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormGroup } from '@angular/forms';
import { startWith, switchMap } from 'rxjs';
import { firstErrorMessage } from '../validators/error-messages';

export type ErrorMap<T> = Partial<Record<keyof T | '$group', string>>;

/**
 * Error messages for a form group's controls, as a signal. Reactive Forms state isn't signal-based,
 * so this listens to the group's unified `events` stream (value, status — including async validator
 * results — touched, submitted) and recomputes. Reading it in an OnPush/zoneless template keeps
 * `<mat-error>` in sync. Must be called in an injection context.
 */
export function controlErrors<T extends Record<string, AbstractControl>>(
  group: Signal<FormGroup<T>>,
): Signal<ErrorMap<T>> {
  const tick = toSignal(
    toObservable(group).pipe(switchMap((g) => g.events.pipe(startWith(null)))),
    { initialValue: null },
  );
  return computed(() => {
    tick();
    const current = group();
    const errors: ErrorMap<T> = {};
    for (const key of Object.keys(current.controls) as (keyof T & string)[]) {
      const message = firstErrorMessage(current.controls[key].errors);
      if (message) errors[key] = message;
    }
    const groupMessage = firstErrorMessage(current.errors);
    if (groupMessage) errors.$group = groupMessage;
    return errors;
  });
}
