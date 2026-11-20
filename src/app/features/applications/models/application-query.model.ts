import {
  APPLICATION_STATUSES,
  ApplicationStatus,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  SORT_FIELDS,
  SortField,
} from '../../../core/domain/application.model';

export type SortDirection = 'asc' | 'desc';

/** Dashboard list query (paging, filters, sort). Lives in the URL; sent as query params. */
export interface ApplicationQuery {
  page: number;
  size: number;
  q: string;
  status: ApplicationStatus | '';
  reviewerId: string;
  /** ISO dates (yyyy-mm-dd), inclusive, on createdAt */
  from: string;
  to: string;
  sort: SortField;
  direction: SortDirection;
}

/** Raw query-param strings as the router hands them over (any of them may be missing). */
export type RawApplicationQuery = Partial<Record<keyof ApplicationQuery, string>>;

/** A change to the URL: `null` removes the param, so defaults never clutter the address bar. */
export type QueryParamsPatch = Partial<Record<keyof ApplicationQuery, string | number | null>>;

export const DEFAULT_SORT: SortField = 'createdAt';
export const DEFAULT_DIRECTION: SortDirection = 'desc';

/**
 * Turns untrusted URL strings into a valid query. Anything unknown or malformed falls back to
 * its default, so a hand-edited URL can never produce a request the API would reject.
 */
export function parseApplicationQuery(raw: RawApplicationQuery): ApplicationQuery {
  const size = Number(raw.size);
  return {
    page: Math.max(0, Math.trunc(Number(raw.page)) || 0),
    size: PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE,
    q: raw.q ?? '',
    status: APPLICATION_STATUSES.find((status) => status === raw.status) ?? '',
    reviewerId: raw.reviewerId ?? '',
    from: isIsoDate(raw.from) ? raw.from : '',
    to: isIsoDate(raw.to) ? raw.to : '',
    sort: SORT_FIELDS.find((field) => field === raw.sort) ?? DEFAULT_SORT,
    direction: raw.direction === 'asc' ? 'asc' : DEFAULT_DIRECTION,
  };
}

/** True when any user-chosen filter (not paging or sorting) is active. */
export function hasActiveFilters({ q, status, reviewerId, from, to }: ApplicationQuery): boolean {
  return Boolean(q || status || reviewerId || from || to);
}

/** URL change for a filter: clears the param when empty and returns to the first page. */
export function filterPatch(
  key: 'q' | 'status' | 'reviewerId' | 'from' | 'to',
  value: string,
): QueryParamsPatch {
  return { [key]: value || null, page: null };
}

/**
 * URL change for a column sort. The default order (newest first) and "no sort" both clear the
 * params; sorting always returns to the first page.
 */
export function sortPatch(active: string, direction: SortDirection | ''): QueryParamsPatch {
  const field = SORT_FIELDS.find((candidate) => candidate === active);
  const isDefault =
    !field || !direction || (field === DEFAULT_SORT && direction === DEFAULT_DIRECTION);
  return {
    sort: isDefault ? null : field,
    direction: isDefault ? null : direction,
    page: null,
  };
}

/** URL change for the paginator; the first page and the default size are left out of the URL. */
export function pagePatch(pageIndex: number, pageSize: number): QueryParamsPatch {
  return {
    page: pageIndex || null,
    size: pageSize === DEFAULT_PAGE_SIZE ? null : pageSize,
  };
}

/** yyyy-mm-dd in local time, for date filters in the URL. */
export function toIsoDate(date: Date | null): string {
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local-midnight Date for a yyyy-mm-dd string, or null when it isn't one. */
export function fromIsoDate(value: string): Date | null {
  return isIsoDate(value) ? new Date(`${value}T00:00:00`) : null;
}

function isIsoDate(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
