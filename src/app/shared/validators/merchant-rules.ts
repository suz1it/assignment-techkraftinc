// Pure format rules shared by the Reactive Forms validators (client) and the mock API's
// submit validation (server), so both sides agree on what "valid" means.

/** Indian PAN (ABCDE1234F) or US EIN (12-3456789 / 123456789). */
const TAX_ID = /^(?:[A-Z]{5}\d{4}[A-Z]|\d{2}-?\d{7})$/;
/** Indian IFSC (ABCD0123456) or US ABA routing number (9 digits). */
const ROUTING_CODE = /^(?:[A-Z]{4}0[A-Z0-9]{6}|\d{9})$/;
const ACCOUNT_NUMBER = /^\d{6,18}$/;
const PHONE = /^\+?[\d\s-]{7,15}$/;
const POSTAL_CODE = /^[A-Za-z\d][A-Za-z\d\s-]{1,8}[A-Za-z\d]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i;

export const normalizeTaxId = (value: string): string => value.trim().toUpperCase();

export const isValidTaxId = (value: string): boolean => TAX_ID.test(normalizeTaxId(value));
export const isValidRoutingCode = (value: string): boolean =>
  ROUTING_CODE.test(value.trim().toUpperCase());
export const isValidAccountNumber = (value: string): boolean => ACCOUNT_NUMBER.test(value.trim());
export const isValidPhone = (value: string): boolean => PHONE.test(value.trim());
export const isValidPostalCode = (value: string): boolean => POSTAL_CODE.test(value.trim());
export const isValidEmail = (value: string): boolean => EMAIL.test(value.trim());
export const isValidUrl = (value: string): boolean => URL.test(value.trim());

/**
 * Shows only the end of a value: "••••1234". At most four characters stay visible, and never more
 * than 40 % of the value, so a short account number can't be mostly given away by its mask.
 */
export function maskValue(value: string): string {
  const visible = Math.min(4, Math.floor(value.length * 0.4));
  return `••••${visible > 0 ? value.slice(-visible) : ''}`;
}

/** Calendar date (yyyy-mm-dd) that is not in the future. */
export function isPastOrTodayIsoDate(value: string, today: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  return date.getTime() <= endOfToday.getTime();
}
