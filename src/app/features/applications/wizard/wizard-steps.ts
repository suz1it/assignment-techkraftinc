import { FormGroup } from '@angular/forms';
import { firstErrorMessage } from '../../../shared/validators/error-messages';
import { MerchantForm } from './merchant-form';

export type WizardStepKey = 'business' | 'contact' | 'bank';

export interface WizardStepDef {
  readonly key: WizardStepKey;
  /** Short label for the stepper header. */
  readonly label: string;
  /** Heading inside the step and on the review page. */
  readonly title: string;
  readonly icon: string;
}

/** The three data-entry steps, in order. "Review & submit" follows them. */
export const WIZARD_STEPS: readonly WizardStepDef[] = [
  {
    key: 'business',
    label: 'Business',
    title: 'Business details',
    icon: 'storefront',
  },
  {
    key: 'contact',
    label: 'Contact & address',
    title: 'Contact & address',
    icon: 'contact_mail',
  },
  {
    key: 'bank',
    label: 'Bank / payout',
    title: 'Bank & payout',
    icon: 'account_balance',
  },
];

export const REVIEW_STEP_INDEX = WIZARD_STEPS.length;
export const TOTAL_STEPS = WIZARD_STEPS.length + 1;

/** Human labels for every field, shared by the review page and the error summaries. */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  legalName: 'Legal name',
  tradingName: 'Trading name',
  businessType: 'Business type',
  taxId: 'Tax ID',
  registrationDate: 'Registration date',
  website: 'Website',
  monthlyVolume: 'Monthly volume',
  ownerName: 'Owner full name',
  email: 'Email',
  phone: 'Phone',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'City',
  state: 'State',
  postalCode: 'Postal code',
  country: 'Country',
  accountHolderName: 'Account holder name',
  accountNumber: 'Account number',
  confirmAccountNumber: 'Confirm account number',
  routingCode: 'IFSC / routing code',
};

/** Fields that may stay empty, so they don't count towards completion. */
const OPTIONAL_FIELDS = new Set(['tradingName', 'website', 'addressLine2', 'confirmAccountNumber']);

export interface FieldIssue {
  readonly field: string;
  readonly label: string;
  readonly message: string;
}

export interface StepSummary extends WizardStepDef {
  readonly index: number;
  readonly issues: readonly FieldIssue[];
  /** An async check (tax ID uniqueness) is still running. */
  readonly pending: boolean;
  /** The user has interacted with this step, so its errors can be shown without nagging. */
  readonly touched: boolean;
  readonly complete: boolean;
}

function controlIssues(group: FormGroup): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const [field, control] of Object.entries(group.controls)) {
    const message = firstErrorMessage(control.errors);
    if (message) issues.push({ field, label: FIELD_LABELS[field] ?? field, message });
  }
  // Group-level errors (account number confirmation) belong to the confirm field.
  const groupMessage = firstErrorMessage(group.errors);
  if (groupMessage) {
    issues.push({
      field: 'confirmAccountNumber',
      label: FIELD_LABELS['confirmAccountNumber'],
      message: groupMessage,
    });
  }
  return issues;
}

/** Validation state of each data-entry step. Pure: call it inside a computed that tracks form events. */
export function summariseSteps(form: MerchantForm): StepSummary[] {
  return WIZARD_STEPS.map((step, index) => {
    const group: FormGroup = form.controls[step.key];
    const issues = controlIssues(group);
    return {
      ...step,
      index,
      issues,
      pending: group.pending,
      touched: group.touched,
      complete: issues.length === 0 && !group.pending,
    };
  });
}

/** Required fields that currently hold a valid value, across the data-entry steps. */
export function completion(form: MerchantForm): { readonly done: number; readonly total: number } {
  let done = 0;
  let total = 0;
  for (const step of WIZARD_STEPS) {
    const group: FormGroup = form.controls[step.key];
    for (const [field, control] of Object.entries(group.controls)) {
      if (OPTIONAL_FIELDS.has(field)) continue;
      total++;
      if (control.valid) done++;
    }
  }
  return { done, total };
}
