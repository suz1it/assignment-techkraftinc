import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatStepperHarness } from '@angular/material/stepper/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS, provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Notifier } from '../../../../core/notifications/notifier';
import { ApplicationDetail, DraftPatch } from '../../../../core/domain/application.model';
import { ApplicationsService } from '../../services/applications.service';
import ApplicationWizard from './application-wizard';
import { AUTOSAVE_DEBOUNCE_MS } from '../../wizard/application-draft-editor';
import { MerchantForm } from '../../wizard/merchant-form';

const draft = (overrides: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  id: 'APP-9',
  legalName: 'Acme Traders',
  status: 'DRAFT',
  createdBy: { id: 'u-sales', name: 'Sarah' },
  assignedReviewer: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  riskLevel: null,
  submittedAt: null,
  tradingName: '',
  businessType: 'COMPANY',
  registrationDate: '2020-01-01',
  website: '',
  monthlyVolume: 1000,
  ownerName: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+91 00000 12345',
  addressLine1: '1 Main St',
  addressLine2: '',
  city: 'Pune',
  state: 'MH',
  postalCode: '411001',
  country: 'India',
  accountHolderName: 'Acme',
  routingCode: 'TEST0000001',
  taxIdMasked: '••••234F',
  accountNumberMasked: '••••5678',
  history: [],
  ...overrides,
});

interface WizardInternals {
  form: MerchantForm;
  canLeave(): Observable<boolean> | boolean;
}

describe('ApplicationWizard', () => {
  const api = {
    get: vi.fn(),
    saveDraft: vi.fn<(id: string, patch: DraftPatch) => Observable<ApplicationDetail>>(),
    submit: vi.fn(),
    delete: vi.fn(),
    isTaxIdUnique: vi.fn(() => of(true)),
  };
  const dialogOpen = vi.fn();
  const notify = vi.fn();

  async function render(app = draft(), { fakeTimers = false } = {}) {
    if (fakeTimers) vi.useFakeTimers();
    api.get.mockReset().mockReturnValue(of(app));
    api.saveDraft.mockReset().mockReturnValue(of(app));
    api.submit.mockReset().mockReturnValue(of({ ...app, status: 'SUBMITTED' }));
    api.delete.mockReset().mockReturnValue(of(undefined));
    dialogOpen.mockReset();
    TestBed.configureTestingModule({
      imports: [ApplicationWizard],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideNativeDateAdapter(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: ApplicationsService, useValue: api },
        { provide: MatDialog, useValue: { open: dialogOpen } },
        { provide: Notifier, useValue: { notify } },
      ],
    });
    TestBed.inject(AuthStore).setSession({
      tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 },
      user: { id: 'u-sales', name: 'Sarah', role: 'SALES' },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ApplicationWizard);
    fixture.componentRef.setInput('id', 'APP-9');
    fixture.detectChanges();
    const settle = async () => {
      if (fakeTimers) await vi.advanceTimersByTimeAsync(1);
      else await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    };
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    const wizard = fixture.componentInstance as unknown as WizardInternals;
    const click = (label: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)?.click();
    return { fixture, el, wizard, settle, click, navigate };
  }

  const confirmDialog = (answer: boolean) =>
    dialogOpen.mockReturnValue({ afterClosed: () => of(answer) });

  it('restores the draft and keeps sensitive inputs empty, showing only the masked hint', async () => {
    const { el, wizard } = await render();
    expect(wizard.form.controls.business.controls.legalName.value).toBe('Acme Traders');
    expect(wizard.form.controls.business.controls.taxId.value).toBe('');
    expect(el.textContent).toContain('Saved as ••••234F');
  });

  it('autosaves a partial patch after the debounce', async () => {
    try {
      const { wizard } = await render(draft(), { fakeTimers: true });
      wizard.form.controls.contact.controls.city.setValue('Mumbai');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 2);
      expect(api.saveDraft).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2);
      expect(api.saveDraft).toHaveBeenCalledTimes(1);
      expect(api.saveDraft).toHaveBeenCalledWith('APP-9', { city: 'Mumbai' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a save error with Retry and keeps what the user typed', async () => {
    try {
      const { el, wizard, settle, click } = await render(draft(), { fakeTimers: true });
      api.saveDraft.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      wizard.form.controls.contact.controls.city.setValue('Mumbai');
      // Debounce, then the two backoff retries (1 s + 2 s).
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 3000);
      await settle();
      expect(el.textContent).toContain('Couldn’t save');
      expect(wizard.form.controls.contact.controls.city.value).toBe('Mumbai');

      api.saveDraft.mockReturnValue(of(draft({ city: 'Mumbai' })));
      click('Retry');
      await settle();
      expect(api.saveDraft).toHaveBeenLastCalledWith('APP-9', { city: 'Mumbai' });
      expect(el.textContent).toContain('Saved');
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks every section complete on the review page when nothing needs fixing', async () => {
    const { el } = await render();
    const badges = [...el.querySelectorAll('.review-card__badge')].map((b) =>
      b.textContent?.trim(),
    );
    expect(badges).toEqual(['Complete', 'Complete', 'Complete']);
    expect(el.querySelector('.review-row--error')).toBeNull();
  });

  it('points the review page at the step with errors and jumps back to it', async () => {
    const { fixture, el, settle } = await render(draft({ city: '' }));
    const contactCard = el.querySelector('[aria-labelledby="review-contact"]');
    expect(contactCard?.querySelector('.review-card__badge')?.textContent?.trim()).toBe('1 to fix');
    const city = [...el.querySelectorAll('.review-row--error')].map((row) => row.textContent);
    expect(city).toHaveLength(1);
    expect(city[0]).toContain('City');
    expect(city[0]).toContain('This field is required.');

    el.querySelector<HTMLButtonElement>('button[aria-label="Edit Contact & address"]')?.click();
    await settle();
    const stepper = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);
    const steps = await stepper.getSteps();
    expect(await steps[1].isSelected()).toBe(true);
  });

  it('shows each step header as done or "N to fix", and lets the user move freely', async () => {
    const { fixture } = await render(draft({ city: '', email: '' }));
    const stepper = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatStepperHarness);
    const steps = await stepper.getSteps();
    expect(await Promise.all(steps.map((step) => step.getLabel()))).toEqual([
      'Business',
      'Contact & address',
      'Bank / payout',
      'Review & submit',
    ]);
    expect(await steps[0].isSelected()).toBe(true);
    expect(await steps[1].hasErrors()).toBe(true);
    // A complete step the user isn't on shows as done (the current step never does).
    expect(await steps[2].isCompleted()).toBe(true);
    expect(await steps[2].hasErrors()).toBe(false);

    // Non-linear: jump straight to the last step.
    await steps[3].select();
    expect(await steps[3].isSelected()).toBe(true);
  });

  it('blocks submit while invalid and explains why', async () => {
    const { el, settle, click } = await render();
    click('Submit application');
    await settle();
    expect(api.submit).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Some fields need attention');
  });

  it('flushes pending edits before submitting, then navigates to the detail page', async () => {
    const { wizard, settle, click, navigate } = await render();
    wizard.form.controls.review.controls.confirmed.setValue(true);
    wizard.form.controls.contact.controls.city.setValue('Mumbai');
    click('Submit application');
    await settle();

    expect(api.saveDraft).toHaveBeenCalledWith('APP-9', { city: 'Mumbai' });
    expect(api.submit).toHaveBeenCalledWith('APP-9');
    expect(api.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      api.submit.mock.invocationCallOrder[0],
    );
    expect(navigate).toHaveBeenCalledWith(['/applications', 'APP-9']);
    expect(await Promise.resolve(wizard.canLeave())).toBe(true);
  });

  it('does not submit when the final save fails', async () => {
    const { el, wizard, settle, click } = await render();
    api.saveDraft.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    wizard.form.controls.review.controls.confirmed.setValue(true);
    wizard.form.controls.contact.controls.city.setValue('Mumbai');
    vi.useFakeTimers();
    try {
      click('Submit application');
      await vi.advanceTimersByTimeAsync(10_000);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    expect(api.submit).not.toHaveBeenCalled();
    expect(el.textContent).toContain('couldn’t be saved');
  });

  it('shows server-side submission errors (e.g. duplicate tax ID)', async () => {
    const { el, wizard, settle, click } = await render();
    api.submit.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              message: 'Incomplete',
              errors: ['This tax ID is already used by another application.'],
            },
          }),
      ),
    );
    wizard.form.controls.review.controls.confirmed.setValue(true);
    click('Submit application');
    await settle();
    expect(el.textContent).toContain('This tax ID is already used by another application.');
  });

  describe('leaving the page (unsaved-changes guard)', () => {
    it('lets the user leave once pending changes are saved, without prompting', async () => {
      const { wizard } = await render();
      wizard.form.controls.contact.controls.city.setValue('Mumbai');
      const result = wizard.canLeave();
      expect(isObservable(result) ? await firstValueFrom(result) : result).toBe(true);
      expect(api.saveDraft).toHaveBeenCalledWith('APP-9', { city: 'Mumbai' });
      expect(dialogOpen).not.toHaveBeenCalled();
    });

    it('asks before leaving when the save fails', async () => {
      const { wizard } = await render();
      api.saveDraft.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      confirmDialog(false);
      wizard.form.controls.contact.controls.city.setValue('Mumbai');
      vi.useFakeTimers();
      try {
        const result = wizard.canLeave() as Observable<boolean>;
        const answer = firstValueFrom(result);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(await answer).toBe(false);
      } finally {
        vi.useRealTimers();
      }
      expect(dialogOpen).toHaveBeenCalled();
    });

    it('does not try to save after sign-out', async () => {
      const { wizard } = await render();
      TestBed.inject(AuthStore).setSession(null);
      expect(wizard.canLeave()).toBe(true);
    });
  });

  it('discards the draft after confirmation', async () => {
    const { settle, click, navigate } = await render();
    confirmDialog(true);
    click('Discard draft');
    await settle();
    expect(api.delete).toHaveBeenCalledWith('APP-9');
    expect(navigate).toHaveBeenCalledWith(['/applications']);
  });

  it('keeps the draft when discard is cancelled', async () => {
    const { settle, click } = await render();
    confirmDialog(false);
    click('Discard draft');
    await settle();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('shows an error with Retry (instead of crashing) when the draft fails to load', async () => {
    api.get.mockReset().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    TestBed.configureTestingModule({
      imports: [ApplicationWizard],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideNativeDateAdapter(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: ApplicationsService, useValue: api },
        { provide: MatDialog, useValue: { open: dialogOpen } },
        { provide: Notifier, useValue: { notify } },
      ],
    });
    const fixture = TestBed.createComponent(ApplicationWizard);
    fixture.componentRef.setInput('id', 'APP-9');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('New application');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('refuses to edit an application that is no longer a draft', async () => {
    const { el } = await render(draft({ status: 'SUBMITTED' }));
    expect(el.textContent).toContain('can no longer be edited');
    expect(el.querySelector('mat-stepper')).toBeNull();
  });
});
