import { Injectable, Injector, inject } from '@angular/core';

/**
 * Global toast messages. MatSnackBar (and the CDK overlay behind it) is loaded on first use, so
 * eagerly-provided code such as the error interceptor doesn't pull it into the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly injector = inject(Injector);

  notify(message: string, durationMs = 5000): void {
    void import('@angular/material/snack-bar').then(({ MatSnackBar }) =>
      this.injector.get(MatSnackBar).open(message, 'Dismiss', { duration: durationMs }),
    );
  }
}
