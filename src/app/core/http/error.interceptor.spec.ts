import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Notifier } from '../notifications/notifier';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Notifier, useValue: { notify } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  const failWith = (status: number) => {
    let received = -1;
    http
      .get('/api/x')
      .subscribe({ error: (error: { status: number }) => (received = error.status) });
    const req = httpTesting.expectOne('/api/x');
    if (status === 0) req.error(new ProgressEvent('error'));
    else req.flush(null, { status, statusText: 'x' });
    return received;
  };

  it('notifies on 403 and rethrows', () => {
    expect(failWith(403)).toBe(403);
    expect(notify).toHaveBeenCalledWith('You do not have permission to do that.');
  });

  it('notifies on network errors', () => {
    expect(failWith(0)).toBe(0);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Network error'));
  });

  it.each([401, 404, 409, 500])(
    'stays silent for %s so screens and auth can handle it',
    (status) => {
      expect(failWith(status)).toBe(status);
      expect(notify).not.toHaveBeenCalled();
    },
  );
});
