import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, skip } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { provideOutlinedFormFields } from '../../../shared/forms/form-field-defaults';
import { Avatar } from '../../../shared/ui/avatar';
import { AuthStore } from '../../auth/auth-store';
import { MockDb } from '../../mock/mock-db';
import { Notifier } from '../../notifications/notifier';
import { PermissionService } from '../../permissions/permission-service';
import { Viewport } from '../viewport';
import { ROLE_LABELS } from '../../domain/labels';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    Avatar,
  ],
  providers: [provideOutlinedFormFields()],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export default class Shell {
  private readonly auth = inject(AuthStore);
  private readonly mockDb = inject(MockDb);
  private readonly notifier = inject(Notifier);
  protected readonly permissions = inject(PermissionService);
  protected readonly isCompact = inject(Viewport).isCompact;
  protected readonly showDevTools = !environment.production && environment.useMockBackend;

  protected readonly user = this.auth.user;
  protected readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  constructor() {
    // After in-app navigation, move focus to the main region so keyboard and screen-reader
    // users start at the new page's content (the first load keeps the browser default).
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        skip(1),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.main().nativeElement.focus({ preventScroll: true }));
  }

  /** On compact screens the drawer overlays content, so close it after choosing a page. */
  protected closeNavIfCompact(sidenav: MatSidenav): void {
    if (this.isCompact()) void sidenav.close();
  }

  protected logout(): void {
    this.auth.logout();
  }

  protected expireToken(): void {
    this.mockDb.expireAllAccessTokens();
    this.notifier.notify('Access token expired. The next API calls will refresh it once.');
  }

  protected failNextRequests(): void {
    this.mockDb.failNextRequests(3);
    this.notifier.notify('The next 3 API requests will fail with a 500.');
  }
}
