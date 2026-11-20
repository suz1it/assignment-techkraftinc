import { BreakpointObserver } from '@angular/cdk/layout';
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/** Below 960px the sidenav overlays content and tables collapse into cards. */
export const COMPACT_QUERY = '(max-width: 959.98px)';

@Injectable({ providedIn: 'root' })
export class Viewport {
  readonly isCompact = toSignal(
    inject(BreakpointObserver)
      .observe(COMPACT_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
}
