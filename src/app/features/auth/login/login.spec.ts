import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { AuthUser } from '../../../core/domain/user.model';
import Login, { safeReturnUrl } from './login';

describe('Login', () => {
  let login$: Subject<AuthUser>;
  const loginSpy = vi.fn();

  beforeEach(() => {
    login$ = new Subject<AuthUser>();
    loginSpy.mockReset().mockReturnValue(login$);
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: AuthStore, useValue: { login: loginSpy } }],
    });
  });

  async function render(returnUrl?: string) {
    const fixture = TestBed.createComponent(Login);
    if (returnUrl) fixture.componentRef.setInput('returnUrl', returnUrl);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const type = (name: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`);
      if (!input) throw new Error(`missing ${name}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      el.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
      await fixture.whenStable();
    };
    return { fixture, el, type, submit };
  }

  it('shows required errors and does not call the API when empty', async () => {
    const { el, submit } = await render();
    await submit();
    expect(loginSpy).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Username is required.');
  });

  it('signs in and navigates to the safe return URL', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const { type, submit } = await render('/applications/APP-1');
    type('username', 'admin');
    type('password', 'pw');
    await submit();
    expect(loginSpy).toHaveBeenCalledWith({ username: 'admin', password: 'pw' });
    login$.next({ id: 'a', name: 'A', role: 'ADMIN' });
    expect(navigate).toHaveBeenCalledWith('/applications/APP-1');
  });

  it('shows an error message on invalid credentials', async () => {
    const { fixture, el, type, submit } = await render();
    type('username', 'admin');
    type('password', 'bad');
    await submit();
    login$.error(new HttpErrorResponse({ status: 401 }));
    await fixture.whenStable();
    expect(el.textContent).toContain('Invalid username or password.');
  });

  it('only accepts same-app return URLs', () => {
    expect(safeReturnUrl('/applications/1')).toBe('/applications/1');
    expect(safeReturnUrl('//evil.example.com')).toBe('/applications');
    expect(safeReturnUrl('https://evil.example.com')).toBe('/applications');
    expect(safeReturnUrl('/login')).toBe('/applications');
    expect(safeReturnUrl(undefined)).toBe('/applications');
  });
});
