import { Component, computed, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { controlErrors } from '../../../../shared/forms/control-errors';
import { BUSINESS_TYPES } from '../../../../core/domain/application.model';
import { MerchantForm } from '../../wizard/merchant-form';
import { BUSINESS_TYPE_LABELS } from '../../../../core/domain/labels';

@Component({
  selector: 'app-business-step',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
  ],
  templateUrl: './business-step.html',
  styleUrl: './step.scss',
})
export class BusinessStep {
  readonly group = input.required<MerchantForm['controls']['business']>();
  /** Masked tax ID already stored on the server, if any. */
  readonly storedTaxId = input<string | null>(null);

  protected readonly errors = controlErrors(this.group);
  protected readonly businessTypes = BUSINESS_TYPES;
  protected readonly businessTypeLabels = BUSINESS_TYPE_LABELS;
  protected readonly today = new Date();
  protected readonly checkingTaxId = computed(() => {
    this.errors();
    return this.group().controls.taxId.pending;
  });
}
