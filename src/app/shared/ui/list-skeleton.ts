import { Component, computed, input } from '@angular/core';

/**
 * Shimmering placeholder rows for a list's first load. Decorative only: the owning region
 * announces loading through `aria-busy` and its progress bar.
 */
@Component({
  selector: 'app-list-skeleton',
  host: { 'aria-hidden': 'true' },
  template: `
    @for (row of rowIndexes(); track row) {
      <div class="row">
        <span class="circle"></span>
        <span class="lines">
          <span class="bar bar--wide"></span>
          <span class="bar bar--narrow"></span>
        </span>
        <span class="bar bar--pill"></span>
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      padding: 0 16px 16px;
    }
    @media (min-width: 600px) {
      :host {
        padding: 0 24px 16px;
      }
    }
    .row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 0;
      border-bottom: 1px solid var(--app-panel-border);
    }
    .row:last-child {
      border-bottom: 0;
    }
    .lines {
      display: grid;
      flex: 1;
      gap: 8px;
    }
    .circle,
    .bar {
      display: block;
      background: linear-gradient(
        90deg,
        var(--mat-sys-surface-container-high) 0%,
        var(--mat-sys-surface-container) 50%,
        var(--mat-sys-surface-container-high) 100%
      );
      background-size: 200% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }
    .circle {
      flex: none;
      inline-size: 36px;
      block-size: 36px;
      border-radius: 50%;
    }
    .bar {
      block-size: 10px;
      border-radius: 5px;
    }
    .bar--wide {
      inline-size: min(280px, 70%);
    }
    .bar--narrow {
      inline-size: min(140px, 40%);
    }
    .bar--pill {
      flex: none;
      inline-size: 84px;
      block-size: 22px;
      border-radius: 11px;
    }
    @keyframes shimmer {
      from {
        background-position: 100% 0;
      }
      to {
        background-position: -100% 0;
      }
    }
  `,
})
export class ListSkeleton {
  readonly rows = input(5);
  protected readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
}
