import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { EMPTY, finalize, map, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { controlErrors } from '../../../../shared/forms/control-errors';
import { errorMessage } from '../../../../shared/http/error-message';
import { ConfirmDialog, ConfirmDialogData } from '../../../../shared/ui/confirm-dialog';
import {
  ApplicationDetail,
  Decision,
  RISK_LEVELS,
  RiskLevel,
} from '../../../../core/domain/application.model';
import { ApplicationsService } from '../../services/applications.service';
import { RISK_LABELS } from '../../../../core/domain/labels';

/**
 * Reviewer controls. The parent renders this only when the shared policy says the user may
 * decide — it is not in the DOM for SALES or ADMIN — and the mock API enforces the same rule.
 */
@Component({
  selector: 'app-decision-panel',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
  ],
  templateUrl: './decision-panel.html',
  styleUrl: './decision-panel.scss',
})
export class DecisionPanel {
  private readonly api = inject(ApplicationsService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly applicationId = input.required<string>();
  readonly decided = output<ApplicationDetail>();

  protected readonly riskLevels = RISK_LEVELS;
  protected readonly riskLabels = RISK_LABELS;
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly form = this.fb.group({
    riskLevel: this.fb.control<RiskLevel | ''>('', Validators.required),
    comment: ['', Validators.maxLength(1000)],
  });
  /** Field errors as a signal (driven by the form's events), so the zoneless template stays in sync. */
  protected readonly errors = controlErrors(signal(this.form).asReadonly());
  protected readonly showRiskLevelError = computed(() => {
    this.errors();
    const control = this.form.controls.riskLevel;
    return control.touched && control.invalid;
  });
  /** True from the confirm dialog until the server answers; also the double-click guard. */
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected approve(): void {
    this.decide('APPROVED');
  }

  protected reject(): void {
    this.decide('REJECTED');
  }

  /** One decision at a time: clicks while confirming or saving are ignored. */
  private decide(decision: Decision): void {
    if (this.saving() || !this.validate(decision)) return;
    const { riskLevel, comment } = this.form.getRawValue();
    if (!riskLevel) return;
    this.saving.set(true);
    this.error.set(null);
    this.confirm(decision)
      .pipe(
        switchMap((confirmed) =>
          confirmed
            ? this.api.decide(this.applicationId(), { decision, riskLevel, comment })
            : EMPTY,
        ),
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => this.decided.emit(updated),
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  /** Comment is required only for a rejection, so it's checked per action rather than statically. */
  private validate(decision: Decision): boolean {
    const comment = this.form.controls.comment;
    if (decision === 'REJECTED' && !comment.value.trim()) {
      comment.setErrors({ ...comment.errors, requiredForReject: true });
    } else if (comment.hasError('requiredForReject')) {
      comment.updateValueAndValidity();
    }
    this.form.markAllAsTouched();
    return this.form.valid;
  }

  private confirm(decision: Decision) {
    const data: ConfirmDialogData =
      decision === 'APPROVED'
        ? {
            title: 'Approve application?',
            message: 'This decision is final.',
            confirmLabel: 'Approve',
          }
        : {
            title: 'Reject application?',
            message: 'This decision is final.',
            confirmLabel: 'Reject',
            destructive: true,
          };
    return this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .pipe(map((confirmed) => confirmed === true));
  }
}
