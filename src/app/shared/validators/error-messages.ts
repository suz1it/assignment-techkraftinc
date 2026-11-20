import { ValidationErrors } from '@angular/forms';

/** Every validation error key maps to one human message, in one place. */
export const ERROR_MESSAGES: Readonly<Record<string, string | ((error: unknown) => string)>> = {
  required: 'This field is required.',
  requiredTrue: 'Please confirm to continue.',
  email: 'Enter a valid email address.',
  maxlength: (error) =>
    `Keep this under ${typeof error === 'object' && error && 'requiredLength' in error ? String(error.requiredLength) : 'the allowed'} characters.`,
  taxIdFormat: 'Enter a PAN (ABCDE1234F) or EIN (12-3456789).',
  taxIdTaken: 'This tax ID is already used by another application.',
  routingCodeFormat: 'Enter an IFSC (ABCD0123456) or 9-digit routing number.',
  accountNumberFormat: 'Account number must be 6–18 digits.',
  phoneFormat: 'Enter a valid phone number.',
  postalCodeFormat: 'Enter a valid postal code.',
  urlFormat: 'Enter a full URL, e.g. https://example.com.',
  dateInvalid: 'Enter a valid date.',
  dateInFuture: 'The date cannot be in the future.',
  positive: 'Enter an amount greater than 0.',
  confirmationRequired: 'Re-enter the account number to confirm it.',
  confirmationMismatch: 'Account numbers do not match.',
  requiredForReject: 'A comment is required when rejecting.',
};

export function firstErrorMessage(errors: ValidationErrors | null): string | null {
  if (!errors) return null;
  for (const [key, value] of Object.entries(errors)) {
    const message = ERROR_MESSAGES[key];
    if (typeof message === 'function') return message(value);
    if (message) return message;
  }
  return Object.keys(errors).length > 0 ? 'This value is not valid.' : null;
}
