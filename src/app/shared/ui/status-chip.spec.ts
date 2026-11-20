import { TestBed } from '@angular/core/testing';
import { StatusChip } from './status-chip';

describe('StatusChip', () => {
  it.each([
    ['DRAFT', 'Draft'],
    ['SUBMITTED', 'Submitted'],
    ['APPROVED', 'Approved'],
    ['REJECTED', 'Rejected'],
  ] as const)('shows %s as readable text, not colour alone', async (status, label) => {
    const fixture = TestBed.createComponent(StatusChip);
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent?.trim()).toBe(label);
    expect(host.getAttribute('data-status')).toBe(status);
  });
});
