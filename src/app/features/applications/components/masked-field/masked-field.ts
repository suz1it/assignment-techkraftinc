import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthStore } from '../../../../core/auth/auth-store';
import { SensitiveField } from '../../../../core/domain/application.model';
import { errorMessage } from '../../../../shared/http/error-message';
import { ApplicationsService } from '../../services/applications.service';

export const REVEAL_DURATION_MS = 30_000;

/**
 * Shows a sensitive value masked. Authorised users can reveal it on demand: the clear value is
 * fetched from the server, held only in this component's memory, and cleared after 30 s, when the
 * user hides it, navigates away (component destroyed) or signs out.
 */
@Component({
  selector: 'app-masked-field',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <span class="value" [class.revealed]="isRevealed()">{{ display() }}</span>
    @if (canReveal() && masked()) {
      @if (loading()) {
        <mat-spinner diameter="20" aria-label="Revealing" />
      } @else {
        <button
          mat-icon-button
          type="button"
          [attr.aria-label]="toggleLabel()"
          [attr.aria-pressed]="isRevealed()"
          (click)="toggle()"
        >
          <mat-icon aria-hidden="true">{{
            isRevealed() ? 'visibility_off' : 'visibility'
          }}</mat-icon>
        </button>
      }
    }
    @if (error(); as message) {
      <span class="error" role="alert">{{ message }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    .value {
      font-family: ui-monospace, monospace;
    }
    .revealed {
      font-weight: 500;
    }
    .error {
      flex-basis: 100%;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class MaskedField {
  private readonly api = inject(ApplicationsService);
  private readonly user = inject(AuthStore).user;

  readonly applicationId = input.required<string>();
  readonly field = input.required<SensitiveField>();
  readonly label = input.required<string>();
  /** Masked value from the API, or null when nothing is stored. */
  readonly masked = input.required<string | null>();
  readonly canReveal = input(false);
  /** Emitted after a successful reveal (the server logged it in the history). */
  readonly revealedChange = output<void>();

  private readonly destroyRef = inject(DestroyRef);

  /**
   * The clear value, held only in memory. A linkedSignal: it resets to null whenever the signed-in
   * user (sign-out) or the application changes, so a clear value can never outlive its context.
   */
  protected readonly revealed = linkedSignal<string | null>(() => {
    this.user();
    this.applicationId();
    return null;
  });
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isRevealed = computed(() => this.revealed() !== null);
  protected readonly toggleLabel = computed(
    () => `${this.isRevealed() ? 'Hide' : 'Reveal'} ${this.label()}`,
  );
  protected readonly display = computed(() => this.revealed() ?? this.masked() ?? 'Not provided');

  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Navigation destroys the component: drop the value and cancel the re-mask timer.
    this.destroyRef.onDestroy(() => this.hide());
  }

  protected toggle(): void {
    if (this.revealed() !== null) {
      this.hide();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api
      .reveal(this.applicationId(), this.field())
      // A response arriving after navigation must not land in a destroyed component.
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.loading.set(false);
          this.revealed.set(value);
          if (this.hideTimer) clearTimeout(this.hideTimer);
          this.hideTimer = setTimeout(() => this.hide(), REVEAL_DURATION_MS);
          this.revealedChange.emit();
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(errorMessage(error, 'Could not reveal this value.'));
        },
      });
  }

  private hide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.revealed.set(null);
  }
}
