import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject, of, throwError } from 'rxjs';
import { ApplicationDetail } from '../../../../core/domain/application.model';
import { ApplicationsService } from '../../services/applications.service';
import { AssignDialog, AssignDialogData } from './assign-dialog';

describe('AssignDialog', () => {
  const close = vi.fn();
  const assign = vi.fn();

  async function render(data: AssignDialogData) {
    close.mockReset();
    assign.mockReset();
    TestBed.configureTestingModule({
      imports: [AssignDialog],
      providers: [
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: ApplicationsService,
          useValue: {
            assign,
            reviewers: () =>
              of([
                { id: 'r1', name: 'Emily' },
                { id: 'r2', name: 'Michael' },
              ]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AssignDialog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    return { fixture, el, button };
  }

  it('reassigns once even when clicked twice, then closes with the result', async () => {
    const response$ = new Subject<ApplicationDetail>();
    const { fixture, button } = await render({
      applicationId: 'APP-1',
      legalName: 'Acme',
      currentReviewer: { id: 'r1', name: 'Emily' },
    });
    assign.mockReturnValue(response$);
    // Pick the other reviewer via the component's state (the select itself is Material's concern).
    (
      fixture.componentInstance as unknown as { selectedReviewerId: { set(v: string): void } }
    ).selectedReviewerId.set('r2');
    await fixture.whenStable();

    button('Reassign')?.click();
    button('Reassign')?.click();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('APP-1', 'r2');

    const updated = { id: 'APP-1' } as ApplicationDetail;
    response$.next(updated);
    expect(close).toHaveBeenCalledWith(updated);
  });

  it('unassigns and shows server errors without closing', async () => {
    const { fixture, el, button } = await render({
      applicationId: 'APP-1',
      legalName: 'Acme',
      currentReviewer: { id: 'r1', name: 'Emily' },
    });
    assign.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { message: 'Already decided.' } }),
      ),
    );
    button('Unassign')?.click();
    await fixture.whenStable();
    expect(assign).toHaveBeenCalledWith('APP-1', null);
    expect(close).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Already decided.');
  });

  it('disables Assign until a reviewer is chosen', async () => {
    const { button } = await render({
      applicationId: 'APP-1',
      legalName: 'Acme',
      currentReviewer: null,
    });
    expect(button('Assign')?.disabled).toBe(true);
    expect(button('Unassign')).toBeUndefined();
  });
});
