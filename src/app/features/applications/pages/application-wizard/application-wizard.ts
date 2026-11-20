import { STEPPER_GLOBAL_OPTIONS, StepperSelectionEvent } from '@angular/cdk/stepper';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { Router, RouterLink } from '@angular/router';
import { Observable, filter, map, of, switchMap } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { toPolicySubject } from '../../../../core/domain/policy.models';
import { Viewport } from '../../../../core/layout/viewport';
import { Notifier } from '../../../../core/notifications/notifier';
import { PermissionService } from '../../../../core/permissions/permission-service';
import { errorMessage } from '../../../../shared/http/error-message';
import { ConfirmDialog, ConfirmDialogData } from '../../../../shared/ui/confirm-dialog';
import { ErrorState } from '../../../../shared/ui/error-state';
import { BankStep } from '../../components/wizard-steps/bank-step';
import { BusinessStep } from '../../components/wizard-steps/business-step';
import { ContactStep } from '../../components/wizard-steps/contact-step';
import { ReviewStep } from '../../components/wizard-steps/review-step';
import { ApplicationsService } from '../../services/applications.service';
import { ApplicationDraftEditor } from '../../wizard/application-draft-editor';
import { LeaveConfirmation } from '../../wizard/unsaved-changes.guard';
import { TOTAL_STEPS, WIZARD_STEPS } from '../../wizard/wizard-steps';

/**
 * The wizard screen: loads the draft, drives the stepper, and handles dialogs, notifications and
 * navigation. All form, autosave and submit logic lives in ApplicationDraftEditor.
 */
@Component({
  selector: 'app-application-wizard',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatStepperModule,
    ErrorState,
    BusinessStep,
    ContactStep,
    BankStep,
    ReviewStep,
  ],
  providers: [
    // One editor per visit, destroyed with the page (which stops autosave).
    ApplicationDraftEditor,
    // Non-linear stepper: users move freely, and each header shows done / needs-attention state.
    {
      provide: STEPPER_GLOBAL_OPTIONS,
      useValue: { showError: true, displayDefaultIndicatorType: false },
    },
  ],
  templateUrl: './application-wizard.html',
  styleUrl: './application-wizard.scss',
})
export default class ApplicationWizard implements LeaveConfirmation {
  private readonly api = inject(ApplicationsService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly auth = inject(AuthStore);
  private readonly permissions = inject(PermissionService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isCompact = inject(Viewport).isCompact;
  protected readonly editor = inject(ApplicationDraftEditor);
  protected readonly form = this.editor.form;

  /** Route param, bound by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly application = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  /** The loaded draft, or null while loading / on error (resource.value() throws on error). */
  protected readonly draft = computed(() =>
    this.application.hasValue() ? this.application.value() : null,
  );
  protected readonly loadError = computed(() =>
    this.application.error() ? errorMessage(this.application.error()) : null,
  );
  protected readonly notFound = computed(() => {
    const error = this.application.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });
  protected readonly editable = computed(() => {
    const app = this.draft();
    return app ? this.permissions.canEditDraft(toPolicySubject(app)) : false;
  });

  protected readonly totalSteps = TOTAL_STEPS;
  protected readonly selectedIndex = signal(0);
  protected readonly currentStepLabel = computed(
    () => WIZARD_STEPS[this.selectedIndex()]?.label ?? 'Review & submit',
  );

  private readonly stepper = viewChild(MatStepper);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    // Hand the draft to the editor once, when it first loads and the user may edit it.
    effect(() => {
      const app = this.draft();
      if (app && this.editable() && !untracked(this.editor.ready)) {
        untracked(() => this.editor.initialise(app));
      }
    });
  }

  protected submit(): void {
    this.editor
      .submit()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((app) => {
        this.notifier.notify('Application submitted.');
        void this.router.navigate(['/applications', app.id]);
      });
  }

  protected discard(): void {
    this.confirm({
      title: 'Discard this draft?',
      message: 'The draft and everything entered so far will be deleted. This cannot be undone.',
      confirmLabel: 'Discard draft',
      destructive: true,
    })
      .pipe(
        filter((confirmed) => confirmed),
        switchMap(() => this.editor.discard()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.notifier.notify('Draft discarded.');
        void this.router.navigate(['/applications']);
      });
  }

  /** Autosave already protects the work: flush it, and only ask when that save fails. */
  canLeave(): Observable<boolean> | boolean {
    // Signed out (or session expired): the server won't accept saves any more.
    if (!this.editor.hasUnsavedWork() || !this.auth.isAuthenticated()) return true;
    return this.editor.flush().pipe(
      switchMap((saved) =>
        saved
          ? of(true)
          : this.confirm({
              title: 'Leave without saving?',
              message: 'Your latest changes couldn’t be saved. If you leave now they will be lost.',
              confirmLabel: 'Leave',
              destructive: true,
            }),
      ),
    );
  }

  protected onStepChange(event: StepperSelectionEvent): void {
    this.selectedIndex.set(event.selectedIndex);
    // Leaving a step reveals its errors, so users see what's missing when they come back
    // and the review page can point at it.
    const left = WIZARD_STEPS[event.previouslySelectedIndex];
    if (left) this.form.controls[left.key].markAllAsTouched();
    // On long steps the user is at the bottom when they click Continue: bring the new step's top into view.
    const panel = this.panel()?.nativeElement;
    if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView?.({ block: 'start' });
  }

  /** Jump from the review page back to a step, with its errors visible. */
  protected goToStep(index: number): void {
    const step = WIZARD_STEPS[index];
    if (step) this.form.controls[step.key].markAllAsTouched();
    const stepper = this.stepper();
    if (stepper) stepper.selectedIndex = index;
  }

  protected reload(): void {
    this.application.reload();
  }

  private confirm(data: ConfirmDialogData): Observable<boolean> {
    return this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .pipe(map((confirmed) => confirmed === true));
  }
}
