import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApplicationDetail } from '../../../../core/domain/application.model';
import { ApplicationsService } from '../../services/applications.service';
import NewApplication from './new-application';

describe('NewApplication', () => {
  const create = vi.fn();

  function render() {
    TestBed.configureTestingModule({
      imports: [NewApplication],
      providers: [provideRouter([]), { provide: ApplicationsService, useValue: { create } }],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NewApplication);
    fixture.detectChanges();
    return { fixture, navigate, el: fixture.nativeElement as HTMLElement };
  }

  it('creates a draft and opens it in the wizard', () => {
    create.mockReset().mockReturnValue(of({ id: 'APP-77' } as ApplicationDetail));
    const { navigate } = render();
    expect(navigate).toHaveBeenCalledWith(['/applications', 'APP-77', 'edit'], {
      replaceUrl: true,
    });
  });

  it('shows an error with Retry when creation fails', () => {
    create
      .mockReset()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
      .mockReturnValueOnce(of({ id: 'APP-78' } as ApplicationDetail));
    const { fixture, el, navigate } = render();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    (el.querySelector('app-error-state button') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/applications', 'APP-78', 'edit'], {
      replaceUrl: true,
    });
  });
});
