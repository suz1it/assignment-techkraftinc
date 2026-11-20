import { FormControl, FormGroup } from '@angular/forms';
import { Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { firstErrorMessage } from './error-messages';
import {
  TAX_ID_CHECK_DEBOUNCE_MS,
  accountNumberFormat,
  matchingConfirmation,
  notBlank,
  notInFuture,
  phoneFormat,
  positiveNumber,
  requiredUnless,
  routingCodeFormat,
  taxIdFormat,
  uniqueTaxId,
  urlFormat,
  postalCodeFormat,
} from './merchant-validators';

const errorsOf = (validator: ReturnType<typeof taxIdFormat>, value: unknown) =>
  validator(new FormControl(value));

describe('merchant validators', () => {
  describe('format validators', () => {
    it.each([
      [taxIdFormat(), 'ABCDE1234F', 'ABC', 'taxIdFormat'],
      [routingCodeFormat(), 'TEST0000001', 'TEST1', 'routingCodeFormat'],
      [accountNumberFormat(), '12345678', '12', 'accountNumberFormat'],
      [phoneFormat(), '+91 00000 12345', 'call me', 'phoneFormat'],
      [postalCodeFormat(), '411001', '#', 'postalCodeFormat'],
      [urlFormat(), 'https://acme.example.com', 'acme', 'urlFormat'],
    ])('%#: accepts valid, rejects invalid, ignores empty', (validator, valid, invalid, key) => {
      expect(errorsOf(validator, valid)).toBeNull();
      expect(errorsOf(validator, invalid)).toEqual({ [key]: true });
      expect(errorsOf(validator, '')).toBeNull();
    });
  });

  it('notBlank rejects whitespace-only text', () => {
    expect(errorsOf(notBlank(), '   ')).toEqual({ required: true });
    expect(errorsOf(notBlank(), 'Acme')).toBeNull();
  });

  it('notInFuture accepts past dates and rejects future or invalid ones', () => {
    const validator = notInFuture(() => new Date('2026-06-01T12:00:00'));
    expect(errorsOf(validator, new Date('2026-06-01T00:00:00'))).toBeNull();
    expect(errorsOf(validator, new Date('2026-06-02T00:00:00'))).toEqual({ dateInFuture: true });
    expect(errorsOf(validator, new Date('invalid'))).toEqual({ dateInvalid: true });
    expect(errorsOf(validator, null)).toBeNull();
  });

  it('positiveNumber requires a number above zero', () => {
    expect(errorsOf(positiveNumber(), 10)).toBeNull();
    expect(errorsOf(positiveNumber(), 0)).toEqual({ positive: true });
    expect(errorsOf(positiveNumber(), null)).toBeNull();
  });

  it('requiredUnless is satisfied by a value stored on the server', () => {
    let stored = false;
    const validator = requiredUnless(() => stored);
    expect(errorsOf(validator, '')).toEqual({ required: true });
    stored = true;
    expect(errorsOf(validator, '')).toBeNull();
  });

  describe('matchingConfirmation (cross-field)', () => {
    const group = (value: string, confirm: string) =>
      new FormGroup(
        { account: new FormControl(value), confirm: new FormControl(confirm) },
        { validators: matchingConfirmation('account', 'confirm') },
      );

    it('is valid when the value is empty (keeping a stored value)', () => {
      expect(group('', '').errors).toBeNull();
    });

    it('requires the confirmation once a value is entered', () => {
      expect(group('12345678', '').errors).toEqual({ confirmationRequired: true });
    });

    it('flags a mismatch and accepts a match', () => {
      expect(group('12345678', '12345679').errors).toEqual({ confirmationMismatch: true });
      expect(group('12345678', '12345678').errors).toBeNull();
    });
  });

  describe('uniqueTaxId (async)', () => {
    const run = (validator: ReturnType<typeof uniqueTaxId>, value: string) => {
      const result = validator(new FormControl(value));
      return isObservable(result) ? firstValueFrom(result as Observable<unknown>) : result;
    };

    it('skips the server for incomplete values', async () => {
      const check = vi.fn();
      expect(await run(uniqueTaxId(check), 'ABC')).toBeNull();
      expect(check).not.toHaveBeenCalled();
    });

    it('debounces, then reports a taken tax ID', async () => {
      vi.useFakeTimers();
      try {
        const check = vi.fn(() => of(false));
        const pending = run(uniqueTaxId(check), 'ABCDE1234F');
        await vi.advanceTimersByTimeAsync(TAX_ID_CHECK_DEBOUNCE_MS - 1);
        expect(check).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(await pending).toEqual({ taxIdTaken: true });
        expect(check).toHaveBeenCalledWith('ABCDE1234F');
      } finally {
        vi.useRealTimers();
      }
    });

    it('passes unique values and does not block on network errors', async () => {
      vi.useFakeTimers();
      try {
        const ok = run(
          uniqueTaxId(() => of(true)),
          'ABCDE1234F',
        );
        const failed = run(
          uniqueTaxId(() => throwError(() => new Error('offline'))),
          'ABCDE1234F',
        );
        await vi.advanceTimersByTimeAsync(TAX_ID_CHECK_DEBOUNCE_MS);
        expect(await ok).toBeNull();
        expect(await failed).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('maps every error key to a message', () => {
    expect(firstErrorMessage({ taxIdTaken: true })).toContain('already used');
    expect(firstErrorMessage({ maxlength: { requiredLength: 10 } })).toContain('10');
    expect(firstErrorMessage({ somethingUnknown: true })).toBe('This value is not valid.');
    expect(firstErrorMessage(null)).toBeNull();
  });
});
