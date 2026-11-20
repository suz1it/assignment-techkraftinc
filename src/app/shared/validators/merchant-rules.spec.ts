import {
  isPastOrTodayIsoDate,
  isValidAccountNumber,
  isValidEmail,
  isValidPhone,
  isValidPostalCode,
  isValidRoutingCode,
  isValidTaxId,
  isValidUrl,
  maskValue,
} from './merchant-rules';

describe('merchant rules', () => {
  it.each(['ABCDE1234F', 'abcde1234f', '12-3456789', '123456789'])('accepts tax ID %s', (value) => {
    expect(isValidTaxId(value)).toBe(true);
  });

  it.each(['ABCD1234F', '••••234F', '12-345678', ''])('rejects tax ID "%s"', (value) => {
    expect(isValidTaxId(value)).toBe(false);
  });

  it('validates routing codes, account numbers and contact fields', () => {
    expect(isValidRoutingCode('TEST0000001')).toBe(true);
    expect(isValidRoutingCode('021000021')).toBe(true);
    expect(isValidRoutingCode('TEST1000001')).toBe(false);
    expect(isValidAccountNumber('123456')).toBe(true);
    expect(isValidAccountNumber('12345')).toBe(false);
    expect(isValidPhone('+91 00000 12345')).toBe(true);
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPostalCode('411001')).toBe(true);
    expect(isValidPostalCode('!')).toBe(false);
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidUrl('https://acme.example.com')).toBe(true);
    expect(isValidUrl('acme')).toBe(false);
  });

  it('accepts only real dates that are not in the future', () => {
    const today = new Date('2026-05-10T12:00:00');
    expect(isPastOrTodayIsoDate('2026-05-10', today)).toBe(true);
    expect(isPastOrTodayIsoDate('2026-05-11', today)).toBe(false);
    expect(isPastOrTodayIsoDate('10/05/2026', today)).toBe(false);
  });

  it('shows at most the last four characters of a normal-length value', () => {
    expect(maskValue('ABCDE1234F')).toBe('••••234F');
    expect(maskValue('0000020007919')).toBe('••••7919');
  });

  it.each([
    ['123456789', '••••789'],
    ['123456', '••••56'],
    ['12', '••••'],
  ])('never reveals more than 40%% of a short value: %s → %s', (value, masked) => {
    expect(maskValue(value)).toBe(masked);
  });
});
