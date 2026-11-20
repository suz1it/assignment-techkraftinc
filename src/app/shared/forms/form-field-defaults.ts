import { Provider } from '@angular/core';
import {
  MAT_FORM_FIELD_DEFAULT_OPTIONS,
  MatFormFieldDefaultOptions,
} from '@angular/material/form-field';

/**
 * Outlined form fields read more clearly on the app's white panels than Material's filled default.
 * Provided on lazy components (shell, login, dialogs) rather than in app.config.ts, so the
 * form-field package stays out of the initial bundle.
 */
export function provideOutlinedFormFields(): Provider {
  return {
    provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
    useValue: { appearance: 'outline' } satisfies MatFormFieldDefaultOptions,
  };
}
