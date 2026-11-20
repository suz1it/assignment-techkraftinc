import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  async function render(message?: string) {
    const fixture = TestBed.createComponent(ErrorState);
    if (message) fixture.componentRef.setInput('message', message);
    await fixture.whenStable();
    const retries: unknown[] = [];
    fixture.componentInstance.retry.subscribe(() => retries.push(true));
    const loader = TestbedHarnessEnvironment.loader(fixture);
    return { el: fixture.nativeElement as HTMLElement, loader, retries };
  }

  it('announces the failure as an alert with a default message', async () => {
    const { el } = await render();
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Something didn't load");
    expect(alert?.textContent).toContain('Something went wrong.');
  });

  it('shows the given message and emits retry when Retry is pressed', async () => {
    const { el, loader, retries } = await render('Server is unavailable.');
    expect(el.textContent).toContain('Server is unavailable.');
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Retry' }))).click();
    expect(retries).toHaveLength(1);
  });
});
