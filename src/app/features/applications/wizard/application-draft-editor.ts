import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder } from '@angular/forms';
import {
  EMPTY,
  Observable,
  catchError,
  debounceTime,
  defer,
  filter,
  finalize,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { ApplicationDetail, DraftPatch } from '../../../core/domain/application.model';
import { errorList, errorMessage } from '../../../shared/http/error-message';
import { maskValue } from '../../../shared/validators/merchant-rules';
import { ApplicationsService } from '../services/applications.service';
import { DraftSaveQueue } from './draft-save-queue';
import {
  SavedSnapshot,
  applySavedPatch,
  buildMerchantForm,
  computeDraftPatch,
  patchFormFromDraft,
  snapshotFrom,
} from './merchant-form';
import { completion, summariseSteps } from './wizard-steps';

export const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Everything about editing one draft, without any UI: the typed form, autosave through the
 * serialized save queue, submit and discard. Provided by the wizard page, so each visit gets a
 * fresh editor that is torn down (and stops saving) when the page is destroyed.
 *
 * The page stays responsible for what the user sees: loading the draft, stepper navigation,
 * confirmation dialogs, notifications and routing.
 */
@Injectable()
export class ApplicationDraftEditor {
  private readonly api = inject(ApplicationsService);

  private applicationId = '';
  /** The last state the server acknowledged; patches are diffs against it. */
  private snapshot: SavedSnapshot | null = null;
  /** Set once the draft is submitted or discarded: nothing left to protect on leave. */
  private finished = false;

  /** Masked values the server holds; sensitive inputs start empty and "blank" means "keep". */
  readonly storedTaxId = signal<string | null>(null);
  readonly storedAccountNumber = signal<string | null>(null);

  readonly form = buildMerchantForm(inject(NonNullableFormBuilder), {
    isTaxIdUnique: (taxId) => this.api.isTaxIdUnique(taxId, this.applicationId),
    hasStoredTaxId: () => this.storedTaxId() !== null,
    hasStoredAccountNumber: () => this.storedAccountNumber() !== null,
  });

  /** True once a draft is loaded into the form and autosave is running. */
  readonly ready = signal(false);
  readonly submitting = signal(false);
  readonly submitErrors = signal<readonly string[]>([]);
  readonly actionError = signal<string | null>(null);

  /** Re-evaluates form-derived state on every value, status and touched change (Reactive Forms aren't signals). */
  private readonly formTick = toSignal(this.form.events.pipe(startWith(null)), {
    initialValue: null,
  });

  /** Stepper header state per data-entry step. Errors show once the user has touched that step. */
  readonly stepStates = computed(() => {
    this.formTick();
    return summariseSteps(this.form).map((step) => ({
      label: step.label,
      complete: step.complete,
      showError: step.touched && step.issues.length > 0,
      errorText: `${step.issues.length} to fix`,
    }));
  });

  readonly progress = computed(() => {
    this.formTick();
    const { done, total } = completion(this.form);
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
  });

  private readonly saveQueue = new DraftSaveQueue<DraftPatch>({
    computePatch: () => (this.snapshot ? computeDraftPatch(this.form, this.snapshot) : null),
    save: (patch) => this.api.saveDraft(this.applicationId, patch),
    onSaved: (patch) => this.recordSaved(patch),
    errorMessage: (error) => errorMessage(error, 'Couldn’t save your changes.'),
  });
  readonly saveStatus = this.saveQueue.status;
  readonly savedAt = computed(() => {
    const status = this.saveStatus();
    return status.state === 'saved' ? status.at : null;
  });

  constructor() {
    // Autosave: debounce typing, then hand a tick to the serialized queue.
    this.form.valueChanges
      .pipe(
        debounceTime(AUTOSAVE_DEBOUNCE_MS),
        filter(() => this.ready() && !this.finished),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.saveQueue.schedule());

    inject(DestroyRef).onDestroy(() => this.saveQueue.stop());
  }

  /** Loads a draft into the form and starts autosave. Call once, when the draft first arrives. */
  initialise(app: ApplicationDetail): void {
    this.applicationId = app.id;
    this.storedTaxId.set(app.taxIdMasked);
    this.storedAccountNumber.set(app.accountNumberMasked);
    // Tax ID and account number are "required unless already stored". Re-validate them silently
    // now that the stored values are known; the patch below then emits events carrying the correct
    // validity, so step state and error summaries aren't stale.
    this.form.controls.business.controls.taxId.updateValueAndValidity({ emitEvent: false });
    this.form.controls.bank.controls.accountNumber.updateValueAndValidity({ emitEvent: false });
    patchFormFromDraft(this.form, app);
    this.snapshot = snapshotFrom(app);
    // Show what's already wrong in a resumed draft, without nagging on a brand-new one.
    if (app.legalName) this.form.markAllAsTouched();
    this.form.controls.review.controls.confirmed.markAsUntouched();
    this.saveQueue.start();
    this.ready.set(true);
  }

  /** Re-sends whatever the server hasn't acknowledged yet (the Retry button). */
  retrySave(): void {
    this.saveQueue.schedule();
  }

  /** True while there is a live draft whose edits must be saved before leaving. */
  hasUnsavedWork(): boolean {
    return this.ready() && !this.finished;
  }

  /** Saves anything outstanding: emits `true` when everything is saved, `false` when it failed. */
  flush(): Observable<boolean> {
    return this.saveQueue.flush();
  }

  /**
   * Validates, flushes the latest edits, then submits. Emits the submitted application on success;
   * completes without emitting when blocked or failed (the reason is in `actionError`). The
   * `submitting` signal is the in-flight guard, so repeated clicks are ignored.
   */
  submit(): Observable<ApplicationDetail> {
    return defer(() => {
      if (this.submitting() || !this.validateForSubmit()) return EMPTY;
      this.submitting.set(true);
      this.submitErrors.set([]);
      this.actionError.set(null);
      return this.saveQueue.flush().pipe(
        switchMap((saved) => {
          if (saved) return this.api.submit(this.applicationId);
          this.actionError.set('Your latest changes couldn’t be saved. Retry saving, then submit.');
          return EMPTY;
        }),
        tap(() => this.finish()),
        catchError((error: unknown) => {
          this.submitErrors.set(errorList(error));
          this.actionError.set(errorMessage(error, 'Submission failed.'));
          return EMPTY;
        }),
        finalize(() => this.submitting.set(false)),
      );
    });
  }

  /**
   * Deletes the draft. Autosave is paused first so no save races the delete, and resumed if the
   * delete fails. Emits once on success; completes without emitting on failure.
   */
  discard(): Observable<void> {
    return defer(() => {
      this.saveQueue.stop();
      return this.api.delete(this.applicationId).pipe(
        tap(() => (this.finished = true)),
        catchError((error: unknown) => {
          this.saveQueue.start();
          this.actionError.set(errorMessage(error, 'Couldn’t discard the draft.'));
          return EMPTY;
        }),
      );
    });
  }

  private finish(): void {
    this.finished = true;
    this.saveQueue.stop();
  }

  private recordSaved(patch: DraftPatch): void {
    if (!this.snapshot) return;
    this.snapshot = applySavedPatch(this.snapshot, patch);
    if (patch.taxId) this.storedTaxId.set(maskValue(patch.taxId));
    if (patch.accountNumber) this.storedAccountNumber.set(maskValue(patch.accountNumber));
  }

  private validateForSubmit(): boolean {
    this.form.markAllAsTouched();
    if (this.form.pending) {
      this.actionError.set('Still checking the tax ID. Try again in a moment.');
      return false;
    }
    if (this.form.invalid) {
      this.actionError.set('Some fields need attention. Check each step for errors.');
      return false;
    }
    return true;
  }
}
