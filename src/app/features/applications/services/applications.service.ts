import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { SensitiveField } from '../../../core/domain/application.model';
import {
  ApplicationDetail,
  ApplicationSummary,
  DecisionRequest,
  DraftPatch,
  RevealResponse,
  StatusCounts,
} from '../../../core/domain/application.model';
import { ApplicationQuery } from '../models/application-query.model';
import { Page } from '../../../core/http/api.models';
import { UserRef } from '../../../core/domain/user.model';

const BASE = '/api/applications';

/** The only place that knows application URLs. Sensitive values go in request bodies, never URLs. */
@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  private readonly http = inject(HttpClient);

  list(query: ApplicationQuery): Observable<Page<ApplicationSummary>> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('size', query.size)
      .set('sort', query.sort)
      .set('direction', query.direction);
    for (const key of ['q', 'status', 'reviewerId', 'from', 'to'] as const) {
      if (query[key]) params = params.set(key, query[key]);
    }
    return this.http.get<Page<ApplicationSummary>>(BASE, { params });
  }

  counts(): Observable<StatusCounts> {
    return this.http.get<StatusCounts>(`${BASE}/counts`);
  }

  get(id: string): Observable<ApplicationDetail> {
    return this.http.get<ApplicationDetail>(`${BASE}/${encodeURIComponent(id)}`);
  }

  create(): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(BASE, {});
  }

  saveDraft(id: string, patch: DraftPatch): Observable<ApplicationDetail> {
    return this.http.patch<ApplicationDetail>(`${BASE}/${encodeURIComponent(id)}/draft`, patch);
  }

  submit(id: string): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(`${BASE}/${encodeURIComponent(id)}/submit`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${encodeURIComponent(id)}`);
  }

  assign(id: string, reviewerId: string | null): Observable<ApplicationDetail> {
    return this.http.put<ApplicationDetail>(`${BASE}/${encodeURIComponent(id)}/assignment`, {
      reviewerId,
    });
  }

  decide(id: string, decision: DecisionRequest): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(
      `${BASE}/${encodeURIComponent(id)}/decision`,
      decision,
    );
  }

  reveal(id: string, field: SensitiveField): Observable<string> {
    return this.http
      .post<RevealResponse>(`${BASE}/${encodeURIComponent(id)}/reveal`, { field })
      .pipe(map((response) => response.value));
  }

  reviewers(): Observable<UserRef[]> {
    return this.http.get<UserRef[]>('/api/reviewers');
  }

  isTaxIdUnique(taxId: string, applicationId: string): Observable<boolean> {
    return this.http
      .post<{ unique: boolean }>('/api/validate/tax-id', { taxId, applicationId })
      .pipe(map((response) => response.unique));
  }
}
