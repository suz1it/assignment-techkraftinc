import { Component, computed, effect, inject, input } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Sort } from '@angular/material/sort';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Viewport } from '../../../../core/layout/viewport';
import { PermissionService } from '../../../../core/permissions/permission-service';
import {
  APPLICATION_STATUSES,
  ApplicationStatus,
  ApplicationSummary,
  PAGE_SIZES,
} from '../../../../core/domain/application.model';
import { Role } from '../../../../core/domain/user.model';
import { errorMessage } from '../../../../shared/http/error-message';
import { ErrorState } from '../../../../shared/ui/error-state';
import { ListSkeleton } from '../../../../shared/ui/list-skeleton';
import { STATUS_LABELS } from '../../../../core/domain/labels';
import { AssignDialog, AssignDialogData } from '../../components/assign-dialog/assign-dialog';
import {
  QueryParamsPatch,
  filterPatch,
  fromIsoDate,
  hasActiveFilters,
  pagePatch,
  parseApplicationQuery,
  sortPatch,
  toIsoDate,
} from '../../models/application-query.model';
import { ApplicationsService } from '../../services/applications.service';
import { ApplicationList } from '../../components/application-list/application-list';
import { StatusSummary, StatusTile } from '../../components/status-summary/status-summary';

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_ICONS: Record<ApplicationStatus, string> = {
  DRAFT: 'edit_note',
  SUBMITTED: 'pending_actions',
  APPROVED: 'verified',
  REJECTED: 'block',
};

/** What this list contains for each role, so users know why they see what they see. */
const SCOPE_DESCRIPTIONS: Record<Role, string> = {
  SALES: 'Merchant applications you have created. Drafts save automatically as you type.',
  REVIEWER: 'Applications waiting on your risk review, plus the ones you have decided.',
  ADMIN: 'Every merchant application across the team. Submitted ones need a reviewer.',
};

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

@Component({
  selector: 'app-dashboard',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    ErrorState,
    ApplicationList,
    StatusSummary,
    ListSkeleton,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export default class Dashboard {
  private readonly api = inject(ApplicationsService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly user = inject(AuthStore).user;
  protected readonly permissions = inject(PermissionService);
  protected readonly isCompact = inject(Viewport).isCompact;

  // Query params, bound by withComponentInputBinding(). The URL is the source of truth for filters.
  readonly page = input<string>();
  readonly size = input<string>();
  readonly q = input<string>();
  readonly status = input<string>();
  readonly reviewerId = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  readonly sort = input<string>();
  readonly direction = input<string>();

  protected readonly statuses = APPLICATION_STATUSES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly pageSizes = PAGE_SIZES;

  private readonly greetingPrefix = greetingFor(new Date().getHours());
  protected readonly greeting = computed(() => {
    const firstName = this.user()?.name.split(' ')[0];
    return firstName ? `${this.greetingPrefix}, ${firstName}` : this.greetingPrefix;
  });
  protected readonly scopeDescription = computed(() => {
    const role = this.user()?.role;
    return role ? SCOPE_DESCRIPTIONS[role] : '';
  });

  protected readonly query = computed(() =>
    parseApplicationQuery({
      page: this.page(),
      size: this.size(),
      q: this.q(),
      status: this.status(),
      reviewerId: this.reviewerId(),
      from: this.from(),
      to: this.to(),
      sort: this.sort(),
      direction: this.direction(),
    }),
  );
  protected readonly fromDate = computed(() => fromIsoDate(this.query().from));
  protected readonly toDate = computed(() => fromIsoDate(this.query().to));
  protected readonly hasFilters = computed(() => hasActiveFilters(this.query()));

  /** Server-side paging and filtering; a new query cancels the previous request. */
  protected readonly applications = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly loadError = computed(() =>
    this.applications.error() ? errorMessage(this.applications.error()) : null,
  );

  /** Optional: per-status totals, scoped to what this user may see. */
  protected readonly counts = rxResource({ stream: () => this.api.counts() });
  /** Counts are optional: if they fail to load, the tiles simply don't render (value() would throw). */
  private readonly countsValue = computed(() =>
    this.counts.hasValue() ? this.counts.value() : null,
  );
  protected readonly totalCount = computed(() => {
    const counts = this.countsValue();
    return counts ? APPLICATION_STATUSES.reduce((sum, status) => sum + counts[status], 0) : 0;
  });
  protected readonly countCards = computed<StatusTile[]>(() => {
    const counts = this.countsValue();
    const total = this.totalCount();
    const active = this.query().status;
    return counts
      ? APPLICATION_STATUSES.map((status) => ({
          status,
          label: STATUS_LABELS[status],
          icon: STATUS_ICONS[status],
          count: counts[status],
          share: total > 0 ? Math.round((counts[status] / total) * 100) : 0,
          active: active === status,
          ariaLabel: `${STATUS_LABELS[status]}: ${counts[status]}`,
        }))
      : [];
  });

  protected readonly resultsTitle = computed(() => {
    const status = this.query().status;
    return status ? `${STATUS_LABELS[status]} applications` : 'All applications';
  });
  /** First load has nothing to show yet: render placeholder rows instead of an empty panel. */
  protected readonly showSkeleton = computed(
    () => this.applications.isLoading() && !this.applications.hasValue(),
  );

  protected readonly reviewers = rxResource({
    params: () => this.permissions.canFilterByReviewer() || undefined,
    stream: ({ params }) => (params ? this.api.reviewers() : EMPTY),
  });
  /** Empty when the reviewers list is unavailable, so a failed request can't break the filters. */
  protected readonly reviewerOptions = computed(() =>
    this.reviewers.hasValue() ? this.reviewers.value() : [],
  );

  protected readonly search = new FormControl('', { nonNullable: true });

  constructor() {
    // Keep the search box in sync when the URL changes (back/forward, "clear filters").
    effect(() => {
      const q = this.query().q;
      if (this.search.value !== q) this.search.setValue(q, { emitEvent: false });
    });

    this.search.valueChanges
      .pipe(
        map((value) => value.trim()),
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => this.updateQuery(filterPatch('q', q)));
  }

  protected onStatusChange(status: ApplicationStatus | ''): void {
    this.updateQuery(filterPatch('status', status));
  }

  protected onReviewerChange(reviewerId: string): void {
    this.updateQuery(filterPatch('reviewerId', reviewerId));
  }

  protected onFromChange(event: MatDatepickerInputEvent<Date>): void {
    this.updateQuery(filterPatch('from', toIsoDate(event.value)));
  }

  protected onToChange(event: MatDatepickerInputEvent<Date>): void {
    this.updateQuery(filterPatch('to', toIsoDate(event.value)));
  }

  protected onCountCard(status: ApplicationStatus): void {
    this.onStatusChange(this.query().status === status ? '' : status);
  }

  protected onSort(sort: Sort): void {
    this.updateQuery(sortPatch(sort.active, sort.direction));
  }

  protected onPage(event: PageEvent): void {
    this.updateQuery(pagePatch(event.pageIndex, event.pageSize));
  }

  protected clearFilters(): void {
    void this.router.navigate([], { queryParams: {} });
  }

  protected retry(): void {
    this.applications.reload();
    this.counts.reload();
  }

  protected openAssign(app: ApplicationSummary): void {
    const data: AssignDialogData = {
      applicationId: app.id,
      legalName: app.legalName,
      currentReviewer: app.assignedReviewer,
    };
    this.dialog
      .open(AssignDialog, { data, width: '28rem', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((updated) => {
        if (updated) {
          this.applications.reload();
          this.counts.reload();
        }
      });
  }

  private updateQuery(patch: QueryParamsPatch): void {
    void this.router.navigate([], { queryParams: patch, queryParamsHandling: 'merge' });
  }
}
