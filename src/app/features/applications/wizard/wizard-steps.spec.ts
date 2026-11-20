import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { buildMerchantForm } from './merchant-form';
import { completion, summariseSteps } from './wizard-steps';

describe('wizard step summaries', () => {
  function emptyForm() {
    return TestBed.runInInjectionContext(() =>
      buildMerchantForm(TestBed.inject(NonNullableFormBuilder), {
        isTaxIdUnique: () => of(true),
        hasStoredTaxId: () => true,
        hasStoredAccountNumber: () => true,
      }),
    );
  }

  it('lists each step with the fields that still need attention', () => {
    const form = emptyForm();
    const [business, contact, bank] = summariseSteps(form);

    expect(business.label).toBe('Business');
    expect(business.issues.map((issue) => issue.field)).toEqual([
      'legalName',
      'businessType',
      'registrationDate',
      'monthlyVolume',
    ]);
    expect(business.issues[0]).toEqual({
      field: 'legalName',
      label: 'Legal name',
      message: 'This field is required.',
    });
    expect(business.complete).toBe(false);
    expect(contact.issues).toHaveLength(8);
    expect(bank.issues.map((issue) => issue.field)).toEqual(['accountHolderName', 'routingCode']);
  });

  it('reports the account number confirmation as an issue on the confirm field', () => {
    const form = emptyForm();
    form.controls.bank.controls.accountNumber.setValue('12345678');
    const bank = summariseSteps(form)[2];
    expect(bank.issues).toContainEqual({
      field: 'confirmAccountNumber',
      label: 'Confirm account number',
      message: 'Re-enter the account number to confirm it.',
    });
  });

  it('tracks whether the user has touched a step', () => {
    const form = emptyForm();
    expect(summariseSteps(form)[0].touched).toBe(false);
    form.controls.business.markAllAsTouched();
    expect(summariseSteps(form)[0].touched).toBe(true);
  });

  it('counts required fields only towards completion', () => {
    const form = emptyForm();
    // Stored tax ID and account number count as complete even while their inputs are blank.
    expect(completion(form)).toEqual({ done: 2, total: 16 });
    form.controls.business.controls.legalName.setValue('Acme');
    form.controls.business.controls.tradingName.setValue('Acme Stores');
    expect(completion(form)).toEqual({ done: 3, total: 16 });
  });
});
