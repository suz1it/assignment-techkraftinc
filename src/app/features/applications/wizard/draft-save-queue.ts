import { Signal, computed, signal } from '@angular/core';
import {
  Observable,
  Subject,
  Subscription,
  catchError,
  concatMap,
  defer,
  finalize,
  map,
  of,
  retry,
  tap,
  timer,
} from 'rxjs';

export type SaveStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'saving' }
  | { readonly state: 'saved'; readonly at: Date }
  | { readonly state: 'error'; readonly message: string };

export interface DraftSaveQueueOptions<P> {
  /** Called when a save actually runs; returns null when there is nothing new to send. */
  readonly computePatch: () => P | null;
  readonly save: (patch: P) => Observable<unknown>;
  /** Called after the server acknowledged `patch` (update the saved snapshot here). */
  readonly onSaved: (patch: P) => void;
  readonly retryCount?: number;
  readonly retryBaseDelayMs?: number;
  readonly errorMessage?: (error: unknown) => string;
}

/**
 * Serialized autosave. Every "save tick" goes through `concatMap`, so at most one write is in flight
 * and responses can never apply out of order. The patch is computed when a tick *runs* (not when it
 * was queued), against the last acknowledged snapshot:
 *  - ticks that piled up during a save coalesce: later ones find nothing new and are skipped;
 *  - after a failure the snapshot is unchanged, so the next tick re-sends the failed keys.
 * The form itself is never touched here, so failures can't lose what the user typed.
 */
export class DraftSaveQueue<P> {
  private readonly ticks$ = new Subject<void>();
  /** Saves queued or in flight. */
  private readonly pending = signal(0);
  private readonly idleListeners = new Set<() => void>();
  private readonly _status = signal<SaveStatus>({ state: 'idle' });
  private subscription: Subscription | null = null;
  private lastTickSucceeded = true;

  readonly status: Signal<SaveStatus> = this._status.asReadonly();
  /** True while anything is queued or saving. */
  readonly isBusy = computed(() => this.pending() > 0);

  constructor(private readonly options: DraftSaveQueueOptions<P>) {}

  start(): void {
    if (this.subscription) return;
    const retryCount = this.options.retryCount ?? 2;
    const baseDelay = this.options.retryBaseDelayMs ?? 1000;

    this.subscription = this.ticks$
      .pipe(
        concatMap(() =>
          defer(() => {
            const patch = this.options.computePatch();
            if (patch === null) return of(true);
            this._status.set({ state: 'saving' });
            return this.options.save(patch).pipe(
              retry({
                count: retryCount,
                delay: (_error, attempt) => timer(baseDelay * 2 ** (attempt - 1)),
              }),
              tap(() => {
                this.options.onSaved(patch);
                this._status.set({ state: 'saved', at: new Date() });
              }),
              map(() => true),
              catchError((error: unknown) => {
                this._status.set({
                  state: 'error',
                  message: this.options.errorMessage?.(error) ?? 'Couldn’t save your changes.',
                });
                return of(false);
              }),
            );
          }).pipe(
            tap((succeeded) => (this.lastTickSucceeded = succeeded)),
            finalize(() => this.setPending(this.pending() - 1)),
          ),
        ),
      )
      .subscribe();
  }

  /** Queue a save (debounced form changes, Retry button). */
  schedule(): void {
    if (!this.subscription) return;
    this.pending.update((count) => count + 1);
    this.ticks$.next();
  }

  /**
   * Saves anything outstanding and emits once the queue is idle: `true` when everything is
   * saved, `false` when the last save failed. Used before submit and before leaving the page.
   */
  flush(): Observable<boolean> {
    this.schedule();
    return new Observable<boolean>((subscriber) => {
      const done = () => {
        subscriber.next(this.lastTickSucceeded);
        subscriber.complete();
      };
      if (this.pending() === 0) {
        done();
        return undefined;
      }
      this.idleListeners.add(done);
      return () => this.idleListeners.delete(done);
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.setPending(0);
  }

  /** Updates the counter and, when the queue drains, releases anyone waiting in flush(). */
  private setPending(count: number): void {
    this.pending.set(count);
    if (count === 0) {
      for (const notify of [...this.idleListeners]) notify();
    }
  }
}
