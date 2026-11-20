import { APPLICATION_STATUSES, ApplicationStatus } from './application.model';
import {
  InvalidTransitionError,
  assertTransition,
  canTransition,
  isFinal,
} from './application-lifecycle';

describe('application lifecycle', () => {
  const allowed: [ApplicationStatus, ApplicationStatus][] = [
    ['DRAFT', 'SUBMITTED'],
    ['SUBMITTED', 'APPROVED'],
    ['SUBMITTED', 'REJECTED'],
  ];

  it.each(allowed)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  const forbidden = APPLICATION_STATUSES.flatMap((from) =>
    APPLICATION_STATUSES.map((to) => [from, to] as [ApplicationStatus, ApplicationStatus]),
  ).filter(([from, to]) => !allowed.some(([a, b]) => a === from && b === to));

  it.each(forbidden)('forbids %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
  });

  it('treats only decided applications as final', () => {
    expect(isFinal('APPROVED')).toBe(true);
    expect(isFinal('REJECTED')).toBe(true);
    expect(isFinal('DRAFT')).toBe(false);
    expect(isFinal('SUBMITTED')).toBe(false);
  });
});
