import { TestBed } from '@angular/core/testing';
import { Avatar, initialsOf, toneOf } from './avatar';

describe('Avatar', () => {
  it('derives initials from the first two words', () => {
    expect(initialsOf('Acme Coffee Ltd')).toBe('AC');
    expect(initialsOf('  riley  ')).toBe('R');
    expect(initialsOf('')).toBe('?');
  });

  it('gives the same name the same tone', () => {
    expect(toneOf('Acme')).toBe(toneOf('Acme'));
    expect(toneOf('Acme')).toBeGreaterThanOrEqual(0);
    expect(toneOf('Acme')).toBeLessThan(6);
  });

  it('renders initials hidden from assistive technology', async () => {
    const fixture = TestBed.createComponent(Avatar);
    fixture.componentRef.setInput('name', 'Pat Example');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('PE');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});
