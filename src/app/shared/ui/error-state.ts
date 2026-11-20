import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-error-state',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="error-state" role="alert">
      <span class="error-state__icon"><mat-icon aria-hidden="true">cloud_off</mat-icon></span>
      <div class="error-state__text">
        <p class="error-state__title">Something didn't load</p>
        <p class="error-state__message">{{ message() }}</p>
      </div>
      <button mat-stroked-button type="button" (click)="retry.emit()">Retry</button>
    </div>
  `,
  styles: `
    .error-state {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      border: 1px solid color-mix(in srgb, var(--mat-sys-error) 35%, transparent);
      border-radius: var(--mat-sys-corner-large);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .error-state__icon {
      display: grid;
      place-items: center;
      inline-size: 40px;
      block-size: 40px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--mat-sys-error) 15%, transparent);
    }
    .error-state__text {
      flex: 1;
      min-width: 12rem;
    }
    p {
      margin: 0;
    }
    .error-state__title {
      font: var(--mat-sys-title-small);
    }
    .error-state__message {
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class ErrorState {
  readonly message = input('Something went wrong.');
  readonly retry = output();
}
