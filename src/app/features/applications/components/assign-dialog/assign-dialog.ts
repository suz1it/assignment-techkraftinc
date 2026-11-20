import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { provideOutlinedFormFields } from '../../../../shared/forms/form-field-defaults';
import { errorMessage } from '../../../../shared/http/error-message';
import { ApplicationDetail } from '../../../../core/domain/application.model';
import { UserRef } from '../../../../core/domain/user.model';
import { ApplicationsService } from '../../services/applications.service';

export interface AssignDialogData {
  readonly applicationId: string;
  readonly legalName: string;
  readonly currentReviewer: UserRef | null;
}

/** ADMIN: assign, reassign or unassign a reviewer. Closes with the updated application. */
@Component({
  selector: 'app-assign-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressBarModule,
  ],
  providers: [provideOutlinedFormFields()],
  templateUrl: './assign-dialog.html',
})
export class AssignDialog {
  private readonly api = inject(ApplicationsService);
  private readonly dialogRef = inject<MatDialogRef<AssignDialog, ApplicationDetail>>(MatDialogRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly data = inject<AssignDialogData>(MAT_DIALOG_DATA);

  protected readonly reviewers = rxResource({ stream: () => this.api.reviewers() });
  protected readonly selectedReviewerId = signal<string | null>(
    this.data.currentReviewer?.id ?? null,
  );
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSave = computed(() => {
    const selected = this.selectedReviewerId();
    return !this.saving() && selected !== null && selected !== this.data.currentReviewer?.id;
  });

  protected assign(): void {
    const reviewerId = this.selectedReviewerId();
    if (reviewerId) this.save(reviewerId);
  }

  protected unassign(): void {
    this.save(null);
  }

  /** The `saving` signal is the in-flight guard: double clicks can't send overlapping requests. */
  private save(reviewerId: string | null): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api
      .assign(this.data.applicationId, reviewerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => this.dialogRef.close(updated),
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(errorMessage(error));
        },
      });
  }
}
