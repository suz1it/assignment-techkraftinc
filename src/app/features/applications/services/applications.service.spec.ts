import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApplicationsService } from './applications.service';
import { ApplicationQuery } from '../models/application-query.model';

describe('ApplicationsService', () => {
  let api: ApplicationsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApplicationsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('sends list filters as query params and omits empty ones', () => {
    const query: ApplicationQuery = {
      page: 2,
      size: 25,
      q: 'acme',
      status: 'SUBMITTED',
      reviewerId: '',
      from: '2026-01-01',
      to: '',
      sort: 'legalName',
      direction: 'asc',
    };
    api.list(query).subscribe();
    const req = httpTesting.expectOne((r) => r.url === '/api/applications');
    expect(req.request.params.toString()).toBe(
      'page=2&size=25&sort=legalName&direction=asc&q=acme&status=SUBMITTED&from=2026-01-01',
    );
    req.flush({ items: [], total: 0, page: 2, size: 25 });
  });

  it('keeps sensitive values out of URLs', () => {
    api.isTaxIdUnique('ABCDE1234F', 'APP-1').subscribe((unique) => expect(unique).toBe(true));
    const check = httpTesting.expectOne('/api/validate/tax-id');
    expect(check.request.method).toBe('POST');
    expect(check.request.body).toEqual({ taxId: 'ABCDE1234F', applicationId: 'APP-1' });
    check.flush({ unique: true });

    api.reveal('APP-1', 'taxId').subscribe((value) => expect(value).toBe('ABCDE1234F'));
    const reveal = httpTesting.expectOne('/api/applications/APP-1/reveal');
    expect(reveal.request.body).toEqual({ field: 'taxId' });
    reveal.flush({ field: 'taxId', value: 'ABCDE1234F' });
  });

  it('maps every write to its endpoint', () => {
    api.counts().subscribe();
    api.get('APP-1').subscribe();
    api.create().subscribe();
    api.saveDraft('APP-1', { legalName: 'X' }).subscribe();
    api.submit('APP-1').subscribe();
    api.delete('APP-1').subscribe();
    api.assign('APP-1', null).subscribe();
    api.decide('APP-1', { decision: 'APPROVED', riskLevel: 'LOW', comment: '' }).subscribe();
    api.reviewers().subscribe();

    const expectations: [string, string][] = [
      ['GET', '/api/applications/counts'],
      ['GET', '/api/applications/APP-1'],
      ['POST', '/api/applications'],
      ['PATCH', '/api/applications/APP-1/draft'],
      ['POST', '/api/applications/APP-1/submit'],
      ['DELETE', '/api/applications/APP-1'],
      ['PUT', '/api/applications/APP-1/assignment'],
      ['POST', '/api/applications/APP-1/decision'],
      ['GET', '/api/reviewers'],
    ];
    for (const [method, url] of expectations) {
      httpTesting.expectOne({ method, url }).flush({});
    }
  });
});
