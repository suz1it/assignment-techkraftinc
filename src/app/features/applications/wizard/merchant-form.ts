import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { normalizeTaxId } from '../../../shared/validators/merchant-rules';
import {
  accountNumberFormat,
  matchingConfirmation,
  notBlank,
  notInFuture,
  phoneFormat,
  positiveNumber,
  postalCodeFormat,
  requiredUnless,
  routingCodeFormat,
  taxIdFormat,
  uniqueTaxId,
  urlFormat,
} from '../../../shared/validators/merchant-validators';
import {
  ApplicationDetail,
  BusinessType,
  DraftPatch,
  MerchantDetails,
} from '../../../core/domain/application.model';

export interface MerchantFormDeps {
  readonly isTaxIdUnique: (taxId: string) => Observable<boolean>;
  /** Whether the server already holds a value (sensitive fields start empty on resume). */
  readonly hasStoredTaxId: () => boolean;
  readonly hasStoredAccountNumber: () => boolean;
}

const text = (max: number) => [Validators.maxLength(max)];
const requiredText = (max: number) => [Validators.required, notBlank(), Validators.maxLength(max)];

/** One typed group per wizard step. */
export function buildMerchantForm(fb: NonNullableFormBuilder, deps: MerchantFormDeps) {
  return fb.group({
    business: fb.group({
      legalName: ['', requiredText(120)],
      tradingName: ['', text(120)],
      businessType: fb.control<BusinessType | ''>('', Validators.required),
      taxId: fb.control('', {
        validators: [requiredUnless(deps.hasStoredTaxId), taxIdFormat()],
        asyncValidators: [uniqueTaxId(deps.isTaxIdUnique)],
      }),
      registrationDate: fb.control<Date | null>(null, [Validators.required, notInFuture()]),
      website: ['', [urlFormat(), Validators.maxLength(200)]],
      monthlyVolume: fb.control<number | null>(null, [Validators.required, positiveNumber()]),
    }),
    contact: fb.group({
      ownerName: ['', requiredText(120)],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
      phone: ['', [Validators.required, phoneFormat()]],
      addressLine1: ['', requiredText(200)],
      addressLine2: ['', text(200)],
      city: ['', requiredText(80)],
      state: ['', requiredText(80)],
      postalCode: ['', [Validators.required, postalCodeFormat()]],
      country: ['', requiredText(80)],
    }),
    bank: fb.group(
      {
        accountHolderName: ['', requiredText(120)],
        accountNumber: ['', [requiredUnless(deps.hasStoredAccountNumber), accountNumberFormat()]],
        // Client-only: never persisted or sent to the server.
        confirmAccountNumber: [''],
        routingCode: ['', [Validators.required, routingCodeFormat()]],
      },
      { validators: matchingConfirmation('accountNumber', 'confirmAccountNumber') },
    ),
    review: fb.group({
      confirmed: [false, Validators.requiredTrue],
    }),
  });
}

export type MerchantForm = ReturnType<typeof buildMerchantForm>;

/** What the server has acknowledged. Autosave diffs against this. */
export interface SavedSnapshot {
  readonly details: MerchantDetails;
  /** Sensitive values this session has successfully sent (never the server's stored value). */
  readonly taxId: string | null;
  readonly accountNumber: string | null;
}

export function snapshotFrom(app: ApplicationDetail): SavedSnapshot {
  return { details: pickDetails(app), taxId: null, accountNumber: null };
}

/** Fills the form from a draft. Sensitive fields stay empty: the server only returns masked values. */
export function patchFormFromDraft(form: MerchantForm, app: ApplicationDetail): void {
  const d = pickDetails(app);
  form.patchValue({
    business: {
      legalName: d.legalName,
      tradingName: d.tradingName,
      businessType: d.businessType,
      registrationDate: d.registrationDate ? new Date(`${d.registrationDate}T00:00:00`) : null,
      website: d.website,
      monthlyVolume: d.monthlyVolume,
    },
    contact: {
      ownerName: d.ownerName,
      email: d.email,
      phone: d.phone,
      addressLine1: d.addressLine1,
      addressLine2: d.addressLine2,
      city: d.city,
      state: d.state,
      postalCode: d.postalCode,
      country: d.country,
    },
    bank: { accountHolderName: d.accountHolderName, routingCode: d.routingCode },
  });
}

/** Non-sensitive details as they currently stand in the form. */
export function readDetails(form: MerchantForm): MerchantDetails {
  const { business, contact, bank } = form.getRawValue();
  return {
    legalName: business.legalName,
    tradingName: business.tradingName,
    businessType: business.businessType,
    registrationDate: toIsoDate(business.registrationDate),
    website: business.website,
    monthlyVolume: business.monthlyVolume,
    ownerName: contact.ownerName,
    email: contact.email,
    phone: contact.phone,
    addressLine1: contact.addressLine1,
    addressLine2: contact.addressLine2,
    city: contact.city,
    state: contact.state,
    postalCode: contact.postalCode,
    country: contact.country,
    accountHolderName: bank.accountHolderName,
    routingCode: bank.routingCode,
  };
}

/**
 * The partial update to send: changed non-sensitive keys, plus a sensitive value only when the
 * user typed a new one that is complete and valid (format, uniqueness, confirmation). Returns
 * null when there is nothing to save. The confirm field is never included.
 */
export function computeDraftPatch(form: MerchantForm, snapshot: SavedSnapshot): DraftPatch | null {
  const patch: DraftPatch = {};
  const details = readDetails(form);
  for (const key of Object.keys(details) as (keyof MerchantDetails)[]) {
    if (details[key] !== snapshot.details[key]) {
      Object.assign(patch, { [key]: details[key] });
    }
  }

  const taxIdControl = form.controls.business.controls.taxId;
  const taxId = normalizeTaxId(taxIdControl.value);
  if (taxId && taxIdControl.valid && taxId !== snapshot.taxId) patch.taxId = taxId;

  const bank = form.controls.bank;
  const accountNumber = bank.controls.accountNumber.value.trim();
  const accountConfirmed =
    !bank.hasError('confirmationRequired') && !bank.hasError('confirmationMismatch');
  if (
    accountNumber &&
    bank.controls.accountNumber.valid &&
    accountConfirmed &&
    accountNumber !== snapshot.accountNumber
  ) {
    patch.accountNumber = accountNumber;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function applySavedPatch(snapshot: SavedSnapshot, patch: DraftPatch): SavedSnapshot {
  const { taxId, accountNumber, ...details } = patch;
  return {
    details: { ...snapshot.details, ...details },
    taxId: taxId ?? snapshot.taxId,
    accountNumber: accountNumber ?? snapshot.accountNumber,
  };
}

function pickDetails(app: ApplicationDetail): MerchantDetails {
  return {
    legalName: app.legalName,
    tradingName: app.tradingName,
    businessType: app.businessType,
    registrationDate: app.registrationDate,
    website: app.website,
    monthlyVolume: app.monthlyVolume,
    ownerName: app.ownerName,
    email: app.email,
    phone: app.phone,
    addressLine1: app.addressLine1,
    addressLine2: app.addressLine2,
    city: app.city,
    state: app.state,
    postalCode: app.postalCode,
    country: app.country,
    accountHolderName: app.accountHolderName,
    routingCode: app.routingCode,
  };
}

function toIsoDate(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
