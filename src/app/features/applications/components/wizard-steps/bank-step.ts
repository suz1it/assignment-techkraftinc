import { Component, input } from '@angular/core';
import { AbstractControl, FormGroupDirective, NgForm, ReactiveFormsModule } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { controlErrors } from '../../../../shared/forms/control-errors';
import { MerchantForm } from '../../wizard/merchant-form';

/** Shows the confirm field as invalid when the group-level confirmation check fails. */
class ConfirmationErrorMatcher implements ErrorStateMatcher {
  isErrorState(control: AbstractControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const group = control?.parent;
    const groupInvalid =
      !!group && (group.hasError('confirmationMismatch') || group.hasError('confirmationRequired'));
    return !!control && (control.touched || !!form?.submitted) && (control.invalid || groupInvalid);
  }
}

@Component({
  selector: 'app-bank-step',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './bank-step.html',
  styleUrl: './step.scss',
})
export class BankStep {
  readonly group = input.required<MerchantForm['controls']['bank']>();
  /** Masked account number already stored on the server, if any. */
  readonly storedAccountNumber = input<string | null>(null);

  protected readonly errors = controlErrors(this.group);
  protected readonly confirmationMatcher = new ConfirmationErrorMatcher();
}
