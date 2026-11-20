import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import NotFound from './not-found';

describe('NotFound', () => {
  it('explains the page is missing and links back to the applications list', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFound);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('main h1')?.textContent).toBe('Page not found');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/applications');
  });
});
