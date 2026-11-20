import {
  filterPatch,
  fromIsoDate,
  hasActiveFilters,
  pagePatch,
  parseApplicationQuery,
  sortPatch,
  toIsoDate,
} from './application-query.model';

describe('application query', () => {
  describe('parseApplicationQuery', () => {
    it('uses defaults when the URL has no params', () => {
      expect(parseApplicationQuery({})).toEqual({
        page: 0,
        size: 10,
        q: '',
        status: '',
        reviewerId: '',
        from: '',
        to: '',
        sort: 'createdAt',
        direction: 'desc',
      });
    });

    it('reads valid params', () => {
      expect(
        parseApplicationQuery({
          page: '2',
          size: '25',
          q: 'lotus',
          status: 'SUBMITTED',
          reviewerId: 'u-rev-1',
          from: '2026-01-01',
          to: '2026-02-01',
          sort: 'legalName',
          direction: 'asc',
        }),
      ).toEqual({
        page: 2,
        size: 25,
        q: 'lotus',
        status: 'SUBMITTED',
        reviewerId: 'u-rev-1',
        from: '2026-01-01',
        to: '2026-02-01',
        sort: 'legalName',
        direction: 'asc',
      });
    });

    it('falls back to defaults for hand-edited or malformed params', () => {
      const query = parseApplicationQuery({
        page: '-3',
        size: '1000',
        status: 'HACKED',
        from: 'yesterday',
        to: '2026-1-1',
        sort: 'password',
        direction: 'sideways',
      });
      expect(query).toMatchObject({
        page: 0,
        size: 10,
        status: '',
        from: '',
        to: '',
        sort: 'createdAt',
        direction: 'desc',
      });
      expect(parseApplicationQuery({ page: 'abc' }).page).toBe(0);
      expect(parseApplicationQuery({ page: '1.7' }).page).toBe(1);
    });
  });

  it('detects active filters but ignores paging and sorting', () => {
    const base = parseApplicationQuery({ page: '3', sort: 'status', direction: 'asc' });
    expect(hasActiveFilters(base)).toBe(false);
    expect(hasActiveFilters({ ...base, q: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...base, to: '2026-01-01' })).toBe(true);
  });

  it('clears an empty filter and returns to the first page', () => {
    expect(filterPatch('status', 'DRAFT')).toEqual({ status: 'DRAFT', page: null });
    expect(filterPatch('q', '')).toEqual({ q: null, page: null });
  });

  describe('sortPatch', () => {
    it('stores a non-default sort', () => {
      expect(sortPatch('legalName', 'asc')).toEqual({
        sort: 'legalName',
        direction: 'asc',
        page: null,
      });
    });

    it.each([
      ['createdAt', 'desc'],
      ['legalName', ''],
      ['unknownColumn', 'asc'],
    ] as const)('clears the params for %s / "%s"', (active, direction) => {
      expect(sortPatch(active, direction)).toEqual({ sort: null, direction: null, page: null });
    });
  });

  it('leaves the first page and the default size out of the URL', () => {
    expect(pagePatch(0, 10)).toEqual({ page: null, size: null });
    expect(pagePatch(4, 50)).toEqual({ page: 4, size: 50 });
  });

  it('round-trips local dates through yyyy-mm-dd', () => {
    const date = new Date(2026, 0, 5);
    expect(toIsoDate(date)).toBe('2026-01-05');
    expect(fromIsoDate('2026-01-05')?.getTime()).toBe(date.getTime());
    expect(toIsoDate(null)).toBe('');
    expect(fromIsoDate('05/01/2026')).toBeNull();
  });
});
