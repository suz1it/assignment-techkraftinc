import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/auth.guards';
import { unsavedChangesGuard } from './wizard/unsaved-changes.guard';

export default [
  {
    path: '',
    title: 'Applications',
    loadComponent: () => import('./pages/dashboard/dashboard'),
  },
  {
    path: 'new',
    title: 'New application',
    canMatch: [roleGuard('SALES')],
    loadComponent: () => import('./pages/new-application/new-application'),
  },
  {
    path: ':id/edit',
    title: 'Edit application',
    canMatch: [roleGuard('SALES')],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./pages/application-wizard/application-wizard'),
  },
  {
    path: ':id',
    title: 'Application details',
    loadComponent: () => import('./pages/application-detail/application-detail'),
  },
] satisfies Routes;
