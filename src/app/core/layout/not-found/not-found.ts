import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule],
  template: `
    <main class="not-found">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist or you do not have access to it.</p>
      <a mat-flat-button routerLink="/applications">Go to applications</a>
    </main>
  `,
  styles: `
    .not-found {
      display: grid;
      gap: 16px;
      justify-items: start;
      max-width: 560px;
      margin: 64px auto;
      padding: 0 16px;
    }
  `,
})
export default class NotFound {}
