import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { ApplicationDetail } from '../../../core/domain/application.model';
import {
  MerchantForm,
  applySavedPatch,
  buildMerchantForm,
  computeDraftPatch,
  patchFormFromDraft,
  snapshotFrom,
} from './merchant-form';

const draft = (overrides: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  id: 'APP-1',
  legalName: 'Acme',
  status: 'DRAFT',
  createdBy: { id: 'u', name: 'U' },
  assignedReviewer: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  riskLevel: null,
  submittedAt: null,
  tradingName: '',
  businessType: 'COMPANY',
  registrationDate: '2020-02-03',
  website: '',
  monthlyVolume: 5000,
  ownerName: '',
  email: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  accountHolderName: '',
  routingCode: '',
  taxIdMasked: '••••234F',
  accountNumberMasked: null,
  history: [],
  ...overrides,
});

describe('merchant form: partial draft patches', () => {
  let form: MerchantForm;
  let stored = { taxId: true, account: false };

  beforeEach(() => {
    stored = { taxId: true, account: false };
    form = TestBed.runInInjectionContext(() =>
      buildMerchantForm(TestBed.inject(NonNullableFormBuilder), {
        isTaxIdUnique: () => of(true),
        hasStoredTaxId: () => stored.taxId,
        hasStoredAccountNumber: () => stored.account,
      }),
    );
  });

  const load = (app = draft()) => {
    patchFormFromDraft(form, app);
    return snapshotFrom(app);
  };

  it('restores a draft without ever putting masked values into the form', () => {
    load();
    expect(form.controls.business.controls.legalName.value).toBe('Acme');
    expect(form.controls.business.controls.registrationDate.value?.getFullYear()).toBe(2020);
    expect(form.controls.business.controls.taxId.value).toBe('');
    expect(form.controls.bank.controls.accountNumber.value).toBe('');
  });

  it('returns null when nothing changed since the last acknowledged save', () => {
    const snapshot = load();
    expect(computeDraftPatch(form, snapshot)).toBeNull();
  });

  it('sends only the keys that changed', () => {
    const snapshot = load();
    form.controls.contact.controls.city.setValue('Pune');
    form.controls.business.controls.monthlyVolume.setValue(7000);
    expect(computeDraftPatch(form, snapshot)).toEqual({ city: 'Pune', monthlyVolume: 7000 });
  });

  it('omits an empty sensitive field so the stored value is preserved', () => {
    const snapshot = load();
    form.controls.contact.controls.city.setValue('Pune');
    const patch = computeDraftPatch(form, snapshot);
    expect(patch).not.toHaveProperty('taxId');
    expect(patch).not.toHaveProperty('accountNumber');
  });

  it('omits an incomplete or invalid sensitive value', () => {
    const snapshot = load();
    form.controls.business.controls.taxId.setValue('ABCD');
    expect(computeDraftPatch(form, snapshot)).toBeNull();
  });

  it('sends a changed, valid tax ID (normalised) once', async () => {
    const snapshot = load();
    form.controls.business.controls.taxId.setValue('abcde1234f');
    await vi.waitFor(() => expect(form.controls.business.controls.taxId.pending).toBe(false), {
      timeout: 2000,
    });
    const patch = computeDraftPatch(form, snapshot);
    expect(patch).toEqual({ taxId: 'ABCDE1234F' });
    const after = applySavedPatch(snapshot, patch ?? {});
    expect(computeDraftPatch(form, after)).toBeNull();
  });

  it('sends the account number only once it is confirmed, and never the confirmation', () => {
    const snapshot = load();
    const bank = form.controls.bank.controls;
    bank.accountNumber.setValue('12345678');
    expect(computeDraftPatch(form, snapshot)).toBeNull();

    bank.confirmAccountNumber.setValue('12345679');
    expect(computeDraftPatch(form, snapshot)).toBeNull();

    bank.confirmAccountNumber.setValue('12345678');
    const patch = computeDraftPatch(form, snapshot);
    expect(patch).toEqual({ accountNumber: '12345678' });
    expect(JSON.stringify(patch)).not.toContain('confirm');
  });

  it('makes sensitive fields required only when nothing is stored', () => {
    load(draft({ taxIdMasked: null }));
    stored.taxId = false;
    form.controls.business.controls.taxId.updateValueAndValidity();
    expect(form.controls.business.controls.taxId.hasError('required')).toBe(true);
    stored.taxId = true;
    form.controls.business.controls.taxId.updateValueAndValidity();
    expect(form.controls.business.controls.taxId.hasError('required')).toBe(false);
  });
});
