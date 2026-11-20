import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom, of, throwError } from 'rxjs';
import { ApplicationDetail, DraftPatch } from '../../../core/domain/application.model';
import { TAX_ID_CHECK_DEBOUNCE_MS } from '../../../shared/validators/merchant-validators';
import { ApplicationsService } from '../services/applications.service';
import { ApplicationDraftEditor } from './application-draft-editor';

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

describe('ApplicationDraftEditor', () => {
  const api = {
    saveDraft: vi.fn<(id: string, patch: DraftPatch) => Observable<ApplicationDetail>>(),
    submit: vi.fn<(id: string) => Observable<ApplicationDetail>>(),
    delete: vi.fn<(id: string) => Observable<void>>(),
    isTaxIdUnique: vi.fn<(taxId: string, applicationId: string) => Observable<boolean>>(),
  };

  function setup(app: ApplicationDetail | null = draft()) {
    api.saveDraft.mockReset().mockImplementation(() => of(draft()));
    api.submit.mockReset().mockReturnValue(of(draft({ status: 'SUBMITTED' })));
    api.delete.mockReset().mockReturnValue(of(undefined));
    api.isTaxIdUnique.mockReset().mockReturnValue(of(true));
    TestBed.configureTestingModule({
      providers: [ApplicationDraftEditor, { provide: ApplicationsService, useValue: api }],
    });
    const editor = TestBed.inject(ApplicationDraftEditor);
    if (app) editor.initialise(app);
    return editor;
  }

  /** Subscribes and collects what a one-shot editor action emitted. */
  async function run<T>(action: Observable<T>): Promise<T[]> {
    const emitted: T[] = [];
    await new Promise<void>((resolve) =>
      action.subscribe({ next: (value) => emitted.push(value), complete: resolve }),
    );
    return emitted;
  }

  it('has nothing to save or protect before a draft is loaded', () => {
    const editor = setup(null);
    expect(editor.ready()).toBe(false);
    expect(editor.hasUnsavedWork()).toBe(false);
    expect(editor.saveStatus()).toEqual({ state: 'idle' });
  });

  it('loads the draft, keeps sensitive inputs empty and treats stored values as present', () => {
    const editor = setup();
    const { business, bank } = editor.form.controls;
    expect(editor.ready()).toBe(true);
    expect(business.controls.legalName.value).toBe('Acme Traders');
    expect(business.controls.taxId.value).toBe('');
    expect(business.controls.taxId.valid).toBe(true);
    expect(bank.controls.accountNumber.valid).toBe(true);
    expect(editor.storedTaxId()).toBe('••••234F');
    expect(editor.hasUnsavedWork()).toBe(true);
  });

  it('requires the sensitive fields when nothing is stored yet', () => {
    const editor = setup(draft({ taxIdMasked: null, accountNumberMasked: null }));
    const { business, bank } = editor.form.controls;
    expect(business.controls.taxId.hasError('required')).toBe(true);
    expect(bank.controls.accountNumber.hasError('required')).toBe(true);
  });

  it('reports step state and progress as signals', () => {
    const editor = setup(draft({ city: '' }));
    const [business, contact] = editor.stepStates();
    expect(business.complete).toBe(true);
    expect(contact.showError).toBe(true);
    expect(contact.errorText).toBe('1 to fix');

    const before = editor.progress().done;
    editor.form.controls.contact.controls.city.setValue('Pune');
    expect(editor.progress().done).toBe(before + 1);
    expect(editor.stepStates()[1].showError).toBe(false);
  });

  it('flushes only the changed fields to the server', async () => {
    const editor = setup();
    editor.form.controls.contact.controls.city.setValue('Mumbai');
    expect(await firstValueFrom(editor.flush())).toBe(true);
    expect(api.saveDraft).toHaveBeenCalledWith('APP-9', { city: 'Mumbai' });
    expect(editor.saveStatus().state).toBe('saved');
    expect(editor.savedAt()).toBeInstanceOf(Date);
  });

  it('shows the new masked hint after a new account number is saved, never the clear value', async () => {
    const editor = setup(draft({ accountNumberMasked: null }));
    const { bank } = editor.form.controls;
    bank.controls.accountNumber.setValue('123456789');
    bank.controls.confirmAccountNumber.setValue('123456789');
    await firstValueFrom(editor.flush());
    expect(api.saveDraft).toHaveBeenCalledWith('APP-9', { accountNumber: '123456789' });
    expect(editor.storedAccountNumber()).toBe('••••789');
  });

  it('checks tax ID uniqueness against this application', async () => {
    vi.useFakeTimers();
    try {
      const editor = setup();
      editor.form.controls.business.controls.taxId.setValue('ZZZZZ1234Z');
      await vi.advanceTimersByTimeAsync(TAX_ID_CHECK_DEBOUNCE_MS);
      expect(api.isTaxIdUnique).toHaveBeenCalledWith('ZZZZZ1234Z', 'APP-9');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('submit', () => {
    const confirm = (editor: ApplicationDraftEditor) =>
      editor.form.controls.review.controls.confirmed.setValue(true);

    it('refuses while the tax ID check is still running', async () => {
      vi.useFakeTimers();
      try {
        const editor = setup();
        confirm(editor);
        editor.form.controls.business.controls.taxId.setValue('ZZZZZ1234Z');
        expect(await run(editor.submit())).toEqual([]);
        expect(editor.actionError()).toBe('Still checking the tax ID. Try again in a moment.');
        expect(api.submit).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('refuses an invalid form and says why', async () => {
      const editor = setup();
      expect(await run(editor.submit())).toEqual([]);
      expect(editor.actionError()).toContain('Some fields need attention');
    });

    it('ignores a second submit while the first is in flight', () => {
      const editor = setup();
      confirm(editor);
      const response = new Subject<ApplicationDetail>();
      api.submit.mockReturnValue(response);
      editor.submit().subscribe();
      editor.submit().subscribe();
      expect(editor.submitting()).toBe(true);
      expect(api.submit).toHaveBeenCalledTimes(1);
      response.next(draft({ status: 'SUBMITTED' }));
      response.complete();
      expect(editor.submitting()).toBe(false);
    });

    it('does nothing until subscribed (no side effects on a cold call)', () => {
      const editor = setup();
      confirm(editor);
      editor.submit();
      expect(editor.submitting()).toBe(false);
      expect(api.submit).not.toHaveBeenCalled();
    });

    it('stops autosave after a successful submit', async () => {
      const editor = setup();
      confirm(editor);
      const [submitted] = await run(editor.submit());
      expect(submitted.status).toBe('SUBMITTED');
      expect(editor.hasUnsavedWork()).toBe(false);
    });

    it('keeps server field errors for the review page', async () => {
      const editor = setup();
      confirm(editor);
      api.submit.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { message: 'Incomplete', errors: ['Tax ID is required.'] },
            }),
        ),
      );
      expect(await run(editor.submit())).toEqual([]);
      expect(editor.submitErrors()).toEqual(['Tax ID is required.']);
      expect(editor.actionError()).toBe('Incomplete');
      expect(editor.hasUnsavedWork()).toBe(true);
    });
  });

  describe('discard', () => {
    it('deletes the draft, after which there is nothing left to protect', async () => {
      const editor = setup();
      expect(await run(editor.discard())).toHaveLength(1);
      expect(api.delete).toHaveBeenCalledWith('APP-9');
      expect(editor.hasUnsavedWork()).toBe(false);
    });

    it('explains a failed delete and resumes autosave', async () => {
      const editor = setup();
      api.delete.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      expect(await run(editor.discard())).toEqual([]);
      expect(editor.actionError()).toBe('Couldn’t discard the draft.');
      expect(editor.hasUnsavedWork()).toBe(true);

      editor.form.controls.contact.controls.city.setValue('Mumbai');
      await firstValueFrom(editor.flush());
      expect(api.saveDraft).toHaveBeenCalledWith('APP-9', { city: 'Mumbai' });
    });
  });
});
