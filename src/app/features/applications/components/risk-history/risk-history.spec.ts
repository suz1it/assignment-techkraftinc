import { TestBed } from '@angular/core/testing';
import { HistoryEvent } from '../../../../core/domain/application.model';
import { RiskHistory } from './risk-history';

const admin = { id: 'u-admin', name: 'Amanda' };
const sales = { id: 'u-sales', name: 'Sarah' };
const emily = { id: 'u-rev-1', name: 'Emily' };
const michael = { id: 'u-rev-2', name: 'Michael' };

const event = (fields: Omit<HistoryEvent, 'id' | 'at'>, n: number): HistoryEvent => ({
  id: `evt-${n}`,
  at: `2026-01-0${n}T10:00:00Z`,
  ...fields,
});

describe('RiskHistory', () => {
  async function render(events: readonly HistoryEvent[]) {
    const fixture = TestBed.createComponent(RiskHistory);
    fixture.componentRef.setInput('events', events);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const items = [...el.querySelectorAll('li')];
    return { el, items };
  }

  it('says so when there is no history', async () => {
    const { el, items } = await render([]);
    expect(el.textContent).toContain('No history yet.');
    expect(items).toHaveLength(0);
  });

  it('describes every event type in plain language, in the given order', async () => {
    const { items } = await render([
      event({ type: 'REJECTED', actor: michael, riskLevel: 'HIGH', comment: 'Bad KYC' }, 9),
      event({ type: 'APPROVED', actor: emily, riskLevel: 'LOW' }, 8),
      event({ type: 'REVEALED', actor: admin, field: 'accountNumber' }, 7),
      event({ type: 'REVEALED', actor: admin }, 6),
      event({ type: 'UNASSIGNED', actor: admin, reviewer: michael }, 5),
      event({ type: 'REASSIGNED', actor: admin, reviewer: michael }, 4),
      event({ type: 'ASSIGNED', actor: admin }, 3),
      event({ type: 'SUBMITTED', actor: sales }, 2),
      event({ type: 'CREATED', actor: sales }, 1),
    ]);
    expect(items.map((item) => item.querySelector('.timeline__summary')?.textContent)).toEqual([
      'Michael rejected the application',
      'Emily approved the application',
      'Amanda revealed the bank account number',
      'Amanda revealed the sensitive field',
      'Amanda unassigned Michael',
      'Amanda reassigned to Michael',
      'Amanda assigned a reviewer',
      'Sarah submitted the application',
      'Sarah created the application',
    ]);
  });

  it('shows the risk level, comment and decision marker for decisions only', async () => {
    const { items } = await render([
      event({ type: 'REJECTED', actor: michael, riskLevel: 'HIGH', comment: 'Bad KYC' }, 2),
      event({ type: 'SUBMITTED', actor: sales }, 1),
    ]);
    const [rejected, submitted] = items;
    expect(rejected.textContent).toContain('Risk: High');
    expect(rejected.querySelector('blockquote')?.textContent).toBe('Bad KYC');
    expect(rejected.getAttribute('data-decision')).toBe('REJECTED');

    expect(submitted.textContent).not.toContain('Risk:');
    expect(submitted.querySelector('blockquote')).toBeNull();
    expect(submitted.hasAttribute('data-decision')).toBe(false);
  });

  it('gives each entry a machine-readable time', async () => {
    const { items } = await render([event({ type: 'CREATED', actor: sales }, 1)]);
    expect(items[0].querySelector('time')?.getAttribute('datetime')).toBe('2026-01-01T10:00:00Z');
  });
});
