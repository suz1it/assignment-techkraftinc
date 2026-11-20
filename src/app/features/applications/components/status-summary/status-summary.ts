import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ApplicationStatus } from '../../../../core/domain/application.model';

export interface StatusTile {
  readonly status: ApplicationStatus;
  readonly label: string;
  readonly icon: string;
  readonly count: number;
  /** Whole-number percentage of all visible applications. */
  readonly share: number;
  readonly active: boolean;
  readonly ariaLabel: string;
}

/** KPI tiles: one per status, each doubling as a toggle for the status filter. */
@Component({
  selector: 'app-status-summary',
  imports: [MatIconModule],
  templateUrl: './status-summary.html',
  styleUrl: './status-summary.scss',
  host: { role: 'group', 'aria-label': 'Applications by status' },
})
export class StatusSummary {
  readonly tiles = input.required<readonly StatusTile[]>();
  readonly total = input.required<number>();
  readonly statusToggle = output<ApplicationStatus>();
}
