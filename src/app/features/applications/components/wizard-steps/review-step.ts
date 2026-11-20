import { Component, computed, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { startWith, switchMap } from 'rxjs';
import { BUSINESS_TYPE_LABELS } from '../../../../core/domain/labels';
import { maskValue } from '../../../../shared/validators/merchant-rules';
import { MerchantForm, readDetails } from '../../wizard/merchant-form';
import {
  FIELD_LABELS,
  StepSummary,
  WizardStepKey,
  summariseSteps,
} from '../../wizard/wizard-steps';

interface ReviewRow {
  readonly field: string;
  readonly label: string;
  /** Empty string when nothing was entered. */
  readonly value: string;
  readonly error: string | null;
}

interface ReviewSection extends StepSummary {
  readonly rows: readonly ReviewRow[];
  readonly headingId: string;
  readonly editLabel: string;
}

const volumeFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/**
 * Final step: every value grouped by step, with the fields that still need attention called out
 * inline, an "Edit" jump back to each step, and the confirmation checkbox.
 */
@Component({
  selector: 'app-review-step',
  imports: [ReactiveFormsModule, MatButtonModule, MatCheckboxModule, MatIconModule],
  templateUrl: './review-step.html',
  styleUrls: ['./step.scss', './review-step.scss'],
})
export class ReviewStep {
  readonly form = input.required<MerchantForm>();
  readonly storedTaxId = input<string | null>(null);
  readonly storedAccountNumber = input<string | null>(null);
  readonly submitErrors = input<readonly string[]>([]);
  /** Index of the step the user wants to go back and edit. */
  readonly editStep = output<number>();

  private readonly formTick = toSignal(
    toObservable(this.form).pipe(switchMap((form) => form.events.pipe(startWith(null)))),
    { initialValue: null },
  );

  protected readonly sections = computed<ReviewSection[]>(() => {
    this.formTick();
    const form = this.form();
    const values = this.displayValues(form);
    return summariseSteps(form).map((step) => {
      const errors = new Map(step.issues.map((issue) => [issue.field, issue.message]));
      const rows: ReviewRow[] = values[step.key].map(([field, value]) => ({
        field,
        label: FIELD_LABELS[field] ?? field,
        value,
        error: errors.get(field) ?? null,
      }));
      // Issues with no displayed value of their own (the account number confirmation).
      for (const issue of step.issues) {
        if (!rows.some((row) => row.field === issue.field)) {
          rows.push({ field: issue.field, label: issue.label, value: '', error: issue.message });
        }
      }
      return { ...step, rows, headingId: `review-${step.key}`, editLabel: `Edit ${step.title}` };
    });
  });

  protected readonly confirmError = computed(() => {
    this.formTick();
    const control = this.form().controls.review.controls.confirmed;
    return control.touched && control.invalid;
  });

  private displayValues(form: MerchantForm): Record<WizardStepKey, [string, string][]> {
    const d = readDetails(form);
    const taxId = form.controls.business.controls.taxId.value.trim();
    const account = form.controls.bank.controls.accountNumber.value.trim();
    return {
      business: [
        ['legalName', d.legalName.trim()],
        ['tradingName', d.tradingName.trim()],
        ['businessType', d.businessType ? BUSINESS_TYPE_LABELS[d.businessType] : ''],
        ['taxId', taxId ? maskValue(taxId) : (this.storedTaxId() ?? '')],
        ['registrationDate', d.registrationDate],
        ['website', d.website.trim()],
        ['monthlyVolume', d.monthlyVolume === null ? '' : volumeFormat.format(d.monthlyVolume)],
      ],
      contact: [
        ['ownerName', d.ownerName.trim()],
        ['email', d.email.trim()],
        ['phone', d.phone.trim()],
        ['addressLine1', d.addressLine1.trim()],
        ['addressLine2', d.addressLine2.trim()],
        ['city', d.city.trim()],
        ['state', d.state.trim()],
        ['postalCode', d.postalCode.trim()],
        ['country', d.country.trim()],
      ],
      bank: [
        ['accountHolderName', d.accountHolderName.trim()],
        ['accountNumber', account ? maskValue(account) : (this.storedAccountNumber() ?? '')],
        ['routingCode', d.routingCode.trim()],
      ],
    };
  }
}
