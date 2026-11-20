import { AbstractControl, AsyncValidatorFn, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Observable, catchError, map, of, switchMap, timer } from 'rxjs';
import {
  isPastOrTodayIsoDate,
  isValidAccountNumber,
  isValidPhone,
  isValidPostalCode,
  isValidRoutingCode,
  isValidTaxId,
  isValidUrl,
} from './merchant-rules';

// Reactive Forms validators built on the shared merchant rules. Empty values are left to
// `Validators.required` (or `requiredUnless`) so each error key means exactly one thing.

const isBlank = (value: unknown) => value === null || value === undefined || value === '';

function patternRule(key: string, test: (value: string) => boolean): () => ValidatorFn {
  return () => (control: AbstractControl<unknown>) => {
    const value = control.value;
    if (isBlank(value)) return null;
    return typeof value === 'string' && test(value) ? null : { [key]: true };
  };
}

export const taxIdFormat = patternRule('taxIdFormat', isValidTaxId);
export const routingCodeFormat = patternRule('routingCodeFormat', isValidRoutingCode);
export const accountNumberFormat = patternRule('accountNumberFormat', isValidAccountNumber);
export const phoneFormat = patternRule('phoneFormat', isValidPhone);
export const postalCodeFormat = patternRule('postalCodeFormat', isValidPostalCode);
export const urlFormat = patternRule('urlFormat', isValidUrl);

/** Rejects whitespace-only input for required text fields. */
export function notBlank(): ValidatorFn {
  return (control: AbstractControl<unknown>) =>
    typeof control.value === 'string' && control.value.length > 0 && !control.value.trim()
      ? { required: true }
      : null;
}

/** Date picker value (Date) that is a real date and not in the future. */
export function notInFuture(today: () => Date = () => new Date()): ValidatorFn {
  return (control: AbstractControl<unknown>) => {
    const value = control.value;
    if (isBlank(value)) return null;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return { dateInvalid: true };
    const iso = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    return isPastOrTodayIsoDate(iso, today()) ? null : { dateInFuture: true };
  };
}

export function positiveNumber(): ValidatorFn {
  return (control: AbstractControl<unknown>) => {
    const value = control.value;
    if (isBlank(value)) return null;
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? null
      : { positive: true };
  };
}

/**
 * Required, unless the server already holds a value. Used for sensitive fields, which come back
 * masked and start empty: leaving them empty keeps the stored value.
 */
export function requiredUnless(hasStoredValue: () => boolean): ValidatorFn {
  return (control: AbstractControl<unknown>) =>
    isBlank(control.value) && !hasStoredValue() ? { required: true } : null;
}

/**
 * Cross-field (group) validator: when `field` has a value, `confirmField` must repeat it.
 * Errors are set on the group so they don't fight the individual field validators.
 */
export function matchingConfirmation(field: string, confirmField: string): ValidatorFn {
  return (group: AbstractControl<unknown>): ValidationErrors | null => {
    const value = group.get(field)?.value;
    const confirm = group.get(confirmField)?.value;
    if (isBlank(value)) return null;
    if (isBlank(confirm)) return { confirmationRequired: true };
    return value === confirm ? null : { confirmationMismatch: true };
  };
}

export const TAX_ID_CHECK_DEBOUNCE_MS = 400;

/**
 * Async uniqueness check against the server (POST body, never the URL). Debounced with RxJS;
 * because Angular unsubscribes from the previous validation run, typing cancels stale checks.
 * Network failures don't block the user — the server re-checks uniqueness on submit.
 */
export function uniqueTaxId(isUnique: (taxId: string) => Observable<boolean>): AsyncValidatorFn {
  return (control: AbstractControl<unknown>) => {
    const value = control.value;
    if (typeof value !== 'string' || !isValidTaxId(value)) return of(null);
    return timer(TAX_ID_CHECK_DEBOUNCE_MS).pipe(
      switchMap(() => isUnique(value)),
      map((unique) => (unique ? null : { taxIdTaken: true })),
      catchError(() => of(null)),
    );
  };
}
