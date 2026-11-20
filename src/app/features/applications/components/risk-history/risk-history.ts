import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { HistoryEvent } from '../../../../core/domain/application.model';
import { RISK_LABELS, SENSITIVE_FIELD_LABELS } from '../../../../core/domain/labels';

interface HistoryRow {
  readonly id: string;
  readonly at: string;
  readonly summary: string;
  readonly riskLabel: string | null;
  readonly comment: string | null;
  readonly decision: 'APPROVED' | 'REJECTED' | null;
}

function describe(event: HistoryEvent): string {
  const actor = event.actor.name;
  const reviewer = event.reviewer?.name ?? 'a reviewer';
  switch (event.type) {
    case 'CREATED':
      return `${actor} created the application`;
    case 'SUBMITTED':
      return `${actor} submitted the application`;
    case 'ASSIGNED':
      return `${actor} assigned ${reviewer}`;
    case 'REASSIGNED':
      return `${actor} reassigned to ${reviewer}`;
    case 'UNASSIGNED':
      return `${actor} unassigned ${reviewer}`;
    case 'REVEALED':
      return `${actor} revealed the ${event.field ? SENSITIVE_FIELD_LABELS[event.field] : 'sensitive field'}`;
    case 'APPROVED':
      return `${actor} approved the application`;
    case 'REJECTED':
      return `${actor} rejected the application`;
  }
}

/** Audit / risk timeline, newest first. Events never contain sensitive values. */
@Component({
  selector: 'app-risk-history',
  imports: [DatePipe],
  template: `
    @if (rows().length === 0) {
      <p>No history yet.</p>
    } @else {
      <ol class="timeline">
        @for (row of rows(); track row.id) {
          <li class="timeline__item" [attr.data-decision]="row.decision">
            <p class="timeline__summary">{{ row.summary }}</p>
            <p class="timeline__meta">
              <time [attr.datetime]="row.at">{{ row.at | date: 'medium' }}</time>
              @if (row.riskLabel) {
                · Risk: <strong>{{ row.riskLabel }}</strong>
              }
            </p>
            @if (row.comment) {
              <blockquote class="timeline__comment">{{ row.comment }}</blockquote>
            }
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .timeline {
      margin: 0;
      padding: 0 0 0 16px;
      list-style: none;
      border-left: 2px solid var(--mat-sys-outline-variant);
    }
    .timeline__item {
      position: relative;
      padding: 0 0 16px 12px;
    }
    .timeline__item::before {
      content: '';
      position: absolute;
      left: -23px;
      top: 4px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--mat-sys-outline);
    }
    .timeline__item[data-decision='APPROVED']::before {
      background: var(--mat-sys-tertiary);
    }
    .timeline__item[data-decision='REJECTED']::before {
      background: var(--mat-sys-error);
    }
    .timeline__summary {
      margin: 0;
      font: var(--mat-sys-body-large);
    }
    .timeline__meta {
      margin: 2px 0 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .timeline__comment {
      margin: 8px 0 0;
      padding: 8px 12px;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-surface-container);
    }
  `,
})
export class RiskHistory {
  readonly events = input.required<readonly HistoryEvent[]>();

  protected readonly rows = computed<HistoryRow[]>(() =>
    this.events().map((event) => ({
      id: event.id,
      at: event.at,
      summary: describe(event),
      riskLabel: event.riskLevel ? RISK_LABELS[event.riskLevel] : null,
      comment: event.comment ?? null,
      decision: event.type === 'APPROVED' || event.type === 'REJECTED' ? event.type : null,
    })),
  );
}
