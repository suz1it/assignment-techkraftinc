import { TestBed } from '@angular/core/testing';
import { ApplicationStatus } from '../../../../core/domain/application.model';
import { StatusSummary, StatusTile } from './status-summary';

const tile = (status: ApplicationStatus, count: number, active = false): StatusTile => ({
  status,
  label: status.charAt(0) + status.slice(1).toLowerCase(),
  icon: 'circle',
  count,
  share: Math.round((count / 10) * 100),
  active,
  ariaLabel: `${status}: ${count}`,
});

describe('StatusSummary', () => {
  async function render(tiles: StatusTile[]) {
    const fixture = TestBed.createComponent(StatusSummary);
    fixture.componentRef.setInput('tiles', tiles);
    fixture.componentRef.setInput('total', 10);
    await fixture.whenStable();
    const toggled: ApplicationStatus[] = [];
    fixture.componentInstance.statusToggle.subscribe((status) => toggled.push(status));
    const el = fixture.nativeElement as HTMLElement;
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button')];
    return { el, buttons, toggled };
  }

  it('is a labelled group with one toggle button per status', async () => {
    const { el, buttons } = await render([tile('DRAFT', 4), tile('SUBMITTED', 6)]);
    expect(el.getAttribute('role')).toBe('group');
    expect(el.getAttribute('aria-label')).toBe('Applications by status');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['DRAFT: 4', 'SUBMITTED: 6']);
    expect(buttons[0].textContent).toContain('40% of 10');
  });

  it('marks the active filter as pressed and explains how to clear it', async () => {
    const { buttons } = await render([tile('DRAFT', 4, true), tile('SUBMITTED', 6)]);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].textContent).toContain('Filter on · click to clear');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('emits the status when a tile is pressed', async () => {
    const { buttons, toggled } = await render([tile('DRAFT', 4), tile('SUBMITTED', 6)]);
    buttons[1].click();
    expect(toggled).toEqual(['SUBMITTED']);
  });
});
