import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatRadioGroupHarness } from '@angular/material/radio/testing';
import { of, throwError } from 'rxjs';
import { ApplicationDetail } from '../../../../core/domain/application.model';
import { ApplicationsService } from '../../services/applications.service';
import { DecisionPanel } from './decision-panel';

describe('DecisionPanel', () => {
  const decide = vi.fn();
  const open = vi.fn();

  async function render(confirmed = true) {
    decide
      .mockReset()
      .mockReturnValue(of({ id: 'APP-1', status: 'APPROVED' } as ApplicationDetail));
    open.mockReset().mockReturnValue({ afterClosed: () => of(confirmed) });
    TestBed.configureTestingModule({
      imports: [DecisionPanel],
      providers: [
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: ApplicationsService, useValue: { decide } },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const fixture = TestBed.createComponent(DecisionPanel);
    fixture.componentRef.setInput('applicationId', 'APP-1');
    await fixture.whenStable();
    const decided: ApplicationDetail[] = [];
    fixture.componentInstance.decided.subscribe((d) => decided.push(d));

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const button = (text: string) => loader.getHarness(MatButtonHarness.with({ text }));
    const press = async (text: string) => (await button(text)).click();
    const riskGroup = () => loader.getHarness(MatRadioGroupHarness);
    const pickRisk = async (label: string) => (await riskGroup()).checkRadioButton({ label });
    const typeComment = async (text: string) =>
      (await loader.getHarness(MatInputHarness.with({ selector: 'textarea' }))).setValue(text);
    const commentErrors = async () =>
      (
        await loader.getHarness(MatFormFieldHarness.with({ floatingLabelText: 'Comment' }))
      ).getTextErrors();

    return {
      el: fixture.nativeElement as HTMLElement,
      button,
      press,
      riskGroup,
      pickRisk,
      typeComment,
      commentErrors,
      decided,
    };
  }

  it('offers Low / Medium / High risk levels, none selected', async () => {
    const { riskGroup } = await render();
    const group = await riskGroup();
    const buttons = await group.getRadioButtons();
    expect(await Promise.all(buttons.map((radio) => radio.getLabelText()))).toEqual([
      'Low',
      'Medium',
      'High',
    ]);
    expect(await group.getCheckedValue()).toBeNull();
  });

  it('requires a risk level before deciding', async () => {
    const { el, press } = await render();
    await press('Approve');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Select a risk level.');
    expect(open).not.toHaveBeenCalled();
  });

  it('requires a comment when rejecting, but not when approving', async () => {
    const { press, pickRisk, commentErrors } = await render();
    await pickRisk('High');
    await press('Reject');
    expect(await commentErrors()).toEqual(['A comment is required when rejecting.']);
    expect(decide).not.toHaveBeenCalled();

    await press('Approve');
    expect(decide).toHaveBeenCalledWith('APP-1', {
      decision: 'APPROVED',
      riskLevel: 'HIGH',
      comment: '',
    });
  });

  it('rejects with a comment after confirmation and emits the updated application', async () => {
    const { press, pickRisk, typeComment, commentErrors, decided } = await render();
    await pickRisk('High');
    await typeComment('Chargeback history');
    await press('Reject');
    expect(await commentErrors()).toEqual([]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledWith('APP-1', {
      decision: 'REJECTED',
      riskLevel: 'HIGH',
      comment: 'Chargeback history',
    });
    expect(decided).toHaveLength(1);
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const { press, pickRisk, decided } = await render(false);
    await pickRisk('Low');
    await press('Approve');
    expect(decide).not.toHaveBeenCalled();
    expect(decided).toHaveLength(0);
  });

  it('shows server errors (e.g. already decided) and stays usable', async () => {
    const { el, button, press, pickRisk } = await render();
    decide.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { message: 'Already decided.' } }),
      ),
    );
    await pickRisk('Low');
    await press('Approve');
    expect(el.textContent).toContain('Already decided.');
    expect(await (await button('Approve')).isDisabled()).toBe(false);
    await press('Approve');
    expect(decide).toHaveBeenCalledTimes(2);
  });
});
