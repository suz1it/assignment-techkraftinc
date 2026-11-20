import { HttpContextToken } from '@angular/common/http';

/** Marks requests that must never get a bearer token or trigger a refresh (login, refresh itself). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
