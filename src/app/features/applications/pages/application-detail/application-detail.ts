import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { PermissionService } from '../../../../core/permissions/permission-service';
import { errorMessage } from '../../../../shared/http/error-message';
import { ErrorState } from '../../../../shared/ui/error-state';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { AssignDialog, AssignDialogData } from '../../components/assign-dialog/assign-dialog';
import { ApplicationDetail as ApplicationDetailModel } from '../../../../core/domain/application.model';
import { ApplicationsService } from '../../services/applications.service';
import { toPolicySubject } from '../../../../core/domain/policy.models';
import { DecisionPanel } from '../../components/decision-panel/decision-panel';
import { MaskedField } from '../../components/masked-field/masked-field';
import { RiskHistory } from '../../components/risk-history/risk-history';
import { BUSINESS_TYPE_LABELS, RISK_LABELS } from '../../../../core/domain/labels';

interface DetailPermissions {
  readonly canEdit: boolean;
  readonly canAssign: boolean;
  readonly canDecide: boolean;
  readonly canReveal: boolean;
}

@Component({
  selector: 'app-application-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    ErrorState,
    StatusChip,
    MaskedField,
    RiskHistory,
    DecisionPanel,
  ],
  templateUrl: './application-detail.html',
  styleUrl: './application-detail.scss',
})
export default class ApplicationDetail {
  private readonly api = inject(ApplicationsService);
  private readonly dialog = inject(MatDialog);
  private readonly permissions = inject(PermissionService);

  /** Route param, bound by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly application = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  /** The loaded application, or null while loading / on error (resource.value() throws on error). */
  private readonly loaded = computed(() =>
    this.application.hasValue() ? this.application.value() : null,
  );

  protected readonly notFound = computed(() => {
    const error = this.application.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });
  protected readonly loadError = computed(() =>
    this.application.error() && !this.notFound() ? errorMessage(this.application.error()) : null,
  );

  protected readonly allowed = computed<DetailPermissions | null>(() => {
    if (!this.application.hasValue()) return null;
    const subject = toPolicySubject(this.application.value());
    return {
      canEdit: this.permissions.canEditDraft(subject),
      canAssign: this.permissions.canAssign(subject),
      canDecide: this.permissions.canDecide(subject),
      canReveal: this.permissions.canReveal(subject),
    };
  });

  protected readonly businessTypeLabel = computed(() => {
    const type = this.loaded()?.businessType;
    return type ? BUSINESS_TYPE_LABELS[type] : '—';
  });
  protected readonly riskLabel = computed(() => {
    const risk = this.loaded()?.riskLevel;
    return risk ? RISK_LABELS[risk] : 'Not assessed';
  });

  protected reload(): void {
    this.application.reload();
  }

  protected onDecided(updated: ApplicationDetailModel): void {
    this.application.set(updated);
  }

  protected openAssign(app: ApplicationDetailModel): void {
    const data: AssignDialogData = {
      applicationId: app.id,
      legalName: app.legalName,
      currentReviewer: app.assignedReviewer,
    };
    this.dialog
      .open<AssignDialog, AssignDialogData, ApplicationDetailModel>(AssignDialog, {
        data,
        width: '28rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((updated) => {
        if (updated) this.application.set(updated);
      });
  }
}
