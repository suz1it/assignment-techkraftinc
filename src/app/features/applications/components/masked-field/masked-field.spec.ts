import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { ApplicationsService } from '../../services/applications.service';
import { MaskedField, REVEAL_DURATION_MS } from './masked-field';

describe('MaskedField', () => {
  const reveal = vi.fn();

  async function render(canReveal: boolean) {
    reveal.mockReset().mockReturnValue(of('ABCDE1234F'));
    TestBed.configureTestingModule({
      imports: [MaskedField],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: ApplicationsService, useValue: { reveal } },
      ],
    });
    const auth = TestBed.inject(AuthStore);
    auth.setSession({
      tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 1000 },
      user: { id: 'u-rev', name: 'Reviewer', role: 'REVIEWER' },
    });
    const fixture = TestBed.createComponent(MaskedField);
    fixture.componentRef.setInput('applicationId', 'APP-1');
    fixture.componentRef.setInput('field', 'taxId');
    fixture.componentRef.setInput('label', 'tax ID');
    fixture.componentRef.setInput('masked', '••••234F');
    fixture.componentRef.setInput('canReveal', canReveal);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = () => el.querySelector<HTMLButtonElement>('button');
    const render$ = () => fixture.detectChanges();
    return { fixture, el, toggle, render: render$, auth };
  }

  it('shows the masked value and no reveal control for unauthorised users', async () => {
    const { el, toggle } = await render(false);
    expect(el.textContent).toContain('••••234F');
    expect(toggle()).toBeNull();
  });

  it('reveals on demand, announces state, and re-masks after 30 seconds', async () => {
    vi.useFakeTimers();
    try {
      const { el, toggle, render: rerender } = await render(true);
      expect(toggle()?.getAttribute('aria-label')).toBe('Reveal tax ID');
      toggle()?.click();
      rerender();
      expect(reveal).toHaveBeenCalledWith('APP-1', 'taxId');
      expect(el.textContent).toContain('ABCDE1234F');
      expect(toggle()?.getAttribute('aria-pressed')).toBe('true');

      vi.advanceTimersByTime(REVEAL_DURATION_MS);
      rerender();
      expect(el.textContent).not.toContain('ABCDE1234F');
      expect(el.textContent).toContain('••••234F');
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides again when the user clicks hide', async () => {
    const { el, toggle, render: rerender } = await render(true);
    toggle()?.click();
    rerender();
    toggle()?.click();
    rerender();
    expect(el.textContent).not.toContain('ABCDE1234F');
  });

  it('clears the revealed value on sign-out', async () => {
    const { el, toggle, render: rerender, auth } = await render(true);
    toggle()?.click();
    rerender();
    expect(el.textContent).toContain('ABCDE1234F');
    auth.setSession(null);
    rerender();
    expect(el.textContent).not.toContain('ABCDE1234F');
  });

  it('drops the revealed value and its timer when the component is destroyed (navigation)', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, toggle, render: rerender } = await render(true);
      toggle()?.click();
      rerender();
      const pendingTimers = vi.getTimerCount();
      const state = fixture.componentInstance as unknown as { revealed: () => string | null };
      fixture.destroy();
      expect(state.revealed()).toBeNull();
      // The 30 s re-mask timer is cancelled rather than left running.
      expect(vi.getTimerCount()).toBeLessThan(pendingTimers);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a reveal response that arrives after the user navigated away', async () => {
    const { fixture, toggle, render: rerender } = await render(true);
    const late = new Subject<string>();
    reveal.mockReturnValue(late);
    toggle()?.click();
    rerender();
    const state = fixture.componentInstance as unknown as { revealed: () => string | null };
    fixture.destroy();
    late.next('ABCDE1234F');
    expect(late.observed).toBe(false);
    expect(state.revealed()).toBeNull();
  });

  it('shows the server error when reveal is refused', async () => {
    const { el, toggle, render: rerender } = await render(true);
    reveal.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { message: 'Not allowed.' } })),
    );
    toggle()?.click();
    rerender();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Not allowed.');
  });
});
