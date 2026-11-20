import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule, Sort, SortDirection } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { PermissionService } from '../../../../core/permissions/permission-service';
import { Avatar } from '../../../../shared/ui/avatar';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { ApplicationSummary } from '../../../../core/domain/application.model';
import { toPolicySubject } from '../../../../core/domain/policy.models';

interface ApplicationRow {
  readonly app: ApplicationSummary;
  readonly displayName: string;
  readonly canResume: boolean;
  readonly canAssign: boolean;
}

/** Table on wide screens, cards on compact screens. Row actions follow the shared policy. */
@Component({
  selector: 'app-application-list',
  imports: [
    DatePipe,
    MatSortModule,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    StatusChip,
    Avatar,
  ],
  templateUrl: './application-list.html',
  styleUrl: './application-list.scss',
})
export class ApplicationList {
  private readonly permissions = inject(PermissionService);

  readonly applications = input.required<readonly ApplicationSummary[]>();
  readonly compact = input(false);
  /** Current server-side sort, for the header arrows. */
  readonly sort = input('createdAt');
  readonly direction = input<SortDirection>('desc');
  readonly assign = output<ApplicationSummary>();
  readonly sortChange = output<Sort>();

  protected readonly columns = [
    'legalName',
    'status',
    'reviewer',
    'createdAt',
    'updatedAt',
    'actions',
  ];
  protected readonly rows = computed<ApplicationRow[]>(() =>
    this.applications().map((app) => {
      const subject = toPolicySubject(app);
      return {
        app,
        displayName: app.legalName || 'Untitled draft',
        canResume: this.permissions.canEditDraft(subject),
        canAssign: this.permissions.canAssign(subject),
      };
    }),
  );
}
