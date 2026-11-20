import { Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { controlErrors } from '../../../../shared/forms/control-errors';
import { MerchantForm } from '../../wizard/merchant-form';

@Component({
  selector: 'app-contact-step',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './contact-step.html',
  styleUrl: './step.scss',
})
export class ContactStep {
  readonly group = input.required<MerchantForm['controls']['contact']>();
  protected readonly errors = controlErrors(this.group);
}
