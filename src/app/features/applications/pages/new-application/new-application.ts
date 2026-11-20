import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { errorMessage } from '../../../../shared/http/error-message';
import { ErrorState } from '../../../../shared/ui/error-state';
import { ApplicationsService } from '../../services/applications.service';

/** Creates a DRAFT on the server, then hands over to the wizard at /applications/:id/edit. */
@Component({
  selector: 'app-new-application',
  imports: [MatProgressBarModule, ErrorState],
  template: `
    <h1>New application</h1>
    @if (error(); as message) {
      <app-error-state [message]="message" (retry)="create()" />
    } @else {
      <mat-progress-bar mode="indeterminate" aria-label="Creating draft" />
      <p>Creating your draft…</p>
    }
  `,
  styles: `
    h1 {
      margin: 0 0 16px;
      font: var(--mat-sys-headline-small);
    }
  `,
})
export default class NewApplication {
  private readonly api = inject(ApplicationsService);
  private readonly router = inject(Router);

  private readonly destroyRef = inject(DestroyRef);

  protected readonly error = signal<string | null>(null);
  /** In-flight guard: a second click on Retry can't create a second draft. */
  private readonly creating = signal(false);

  constructor() {
    this.create();
  }

  protected create(): void {
    if (this.creating()) return;
    this.creating.set(true);
    this.error.set(null);
    this.api
      .create()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draft) => {
          void this.router.navigate(['/applications', draft.id, 'edit'], { replaceUrl: true });
        },
        error: (error: unknown) => {
          this.creating.set(false);
          this.error.set(errorMessage(error, 'Couldn’t create a draft.'));
        },
      });
  }
}
