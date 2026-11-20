import { Component, computed, input } from '@angular/core';
import { ApplicationStatus } from '../../core/domain/application.model';
import { STATUS_LABELS } from '../../core/domain/labels';

/** Status shown as text plus colour, so it never relies on colour alone. */
@Component({
  selector: 'app-status-chip',
  template: `{{ label() }}`,
  host: { class: 'status-chip', '[attr.data-status]': 'status()' },
  styles: `
    :host {
      --chip-fg: var(--app-status-draft-fg);
      --chip-bg: var(--app-status-draft-bg);
      --chip-accent: var(--app-status-draft-accent);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px 3px 8px;
      border-radius: var(--mat-sys-corner-full);
      font: var(--mat-sys-label-medium);
      font-weight: 600;
      white-space: nowrap;
      background: var(--chip-bg);
      color: var(--chip-fg);
    }
    :host::before {
      content: '';
      inline-size: 6px;
      block-size: 6px;
      border-radius: 50%;
      background: var(--chip-accent);
    }
    :host([data-status='SUBMITTED']) {
      --chip-fg: var(--app-status-submitted-fg);
      --chip-bg: var(--app-status-submitted-bg);
      --chip-accent: var(--app-status-submitted-accent);
    }
    :host([data-status='APPROVED']) {
      --chip-fg: var(--app-status-approved-fg);
      --chip-bg: var(--app-status-approved-bg);
      --chip-accent: var(--app-status-approved-accent);
    }
    :host([data-status='REJECTED']) {
      --chip-fg: var(--app-status-rejected-fg);
      --chip-bg: var(--app-status-rejected-bg);
      --chip-accent: var(--app-status-rejected-accent);
    }
  `,
})
export class StatusChip {
  readonly status = input.required<ApplicationStatus>();
  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
}
