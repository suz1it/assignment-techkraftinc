# Merchant Onboarding Portal

A single-page Angular application built as a take-home assessment. It runs entirely in the browser: an in-app mock backend (an HTTP interceptor) serves every `/auth/*` and `/api/*` request, so no server or database is needed.

## Table of contents

- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [Mock credentials](#mock-credentials)
- [Developer tools](#developer-tools)
- [Project structure](#project-structure)
- [Technical requirements coverage](#technical-requirements-coverage)
- [Testing](#testing)
- [Code quality](#code-quality)
- [Build and deployment](#build-and-deployment)
- [Configuration](#configuration)
- [Security notes](#security-notes)
- [Known limitations](#known-limitations)

## Tech stack

| Area             | Technology                                                                            |
| ---------------- | ------------------------------------------------------------------------------------- |
| Framework        | Angular 22.3: standalone components, zoneless change detection, signals               |
| UI               | Angular Material 22 (Material 3 theme) + Angular CDK, SCSS                            |
| Forms            | Typed Reactive Forms (`NonNullableFormBuilder`) with custom sync and async validators |
| Async / reactive | RxJS 7.8, bridged to signals with `rxResource` / `toSignal`                           |
| Routing          | Angular Router: lazy-loaded features, functional guards, component input binding      |
| HTTP             | `HttpClient` with functional interceptors (auth → error → mock backend)               |
| Testing          | Vitest 5 via `@angular/build:unit-test`, Angular TestBed, jsdom, Material harnesses   |
| Coverage         | `@vitest/coverage-v8`                                                                 |
| Linting          | ESLint 10 + angular-eslint 22 + typescript-eslint                                     |
| Formatting       | Prettier 3                                                                            |
| Language         | TypeScript 6.0 (strict mode)                                                          |

### Packages

**Runtime dependencies**

| Package                     | Version | Purpose                                       |
| --------------------------- | ------- | --------------------------------------------- |
| `@angular/core`             | ^22.3.0 | Framework core                                |
| `@angular/common`           | ^22.3.0 | Common utilities, `HttpClient`                |
| `@angular/compiler`         | ^22.3.0 | Template compiler                             |
| `@angular/platform-browser` | ^22.3.0 | Browser platform / bootstrap                  |
| `@angular/router`           | ^22.3.0 | Routing                                       |
| `@angular/forms`            | ^22.3.0 | Reactive Forms                                |
| `@angular/material`         | ^22.3.0 | Material Design components                    |
| `@angular/cdk`              | ^22.3.0 | Layout (`BreakpointObserver`), a11y, overlays |
| `rxjs`                      | ~7.8.0  | Reactive streams                              |
| `tslib`                     | ^2.3.0  | TypeScript runtime helpers                    |

**Development dependencies**

| Package                          | Version | Purpose                              |
| -------------------------------- | ------- | ------------------------------------ |
| `@angular/cli`, `@angular/build` | ^22.3.0 | CLI, dev server, build, test builder |
| `@angular/compiler-cli`          | ^22.3.0 | AOT compilation                      |
| `typescript`                     | ~6.0.2  | Type checking                        |
| `vitest`                         | ^5.0.0  | Test runner                          |
| `@vitest/coverage-v8`            | ^5.1.1  | Code coverage                        |
| `jsdom`                          | ^31.0.0 | DOM environment for tests            |
| `eslint`, `@eslint/js`           | ^10     | Linting                              |
| `angular-eslint`                 | 22.8.0  | Angular-specific lint rules          |
| `typescript-eslint`              | 8.72.2  | TypeScript lint rules                |
| `prettier`                       | ^3.8.1  | Code formatting                      |

Fonts (Roboto and Material Symbols) are loaded from Google Fonts.

## Prerequisites

| Tool    | Version                                              |
| ------- | ---------------------------------------------------- |
| Node.js | **24.22.3** (pinned in `.nvmrc`)                     |
| npm     | **11.x** (`packageManager: npm@11.19.1`)             |
| Browser | A current version of Chrome, Edge, Firefox or Safari |

Angular 22 rejects Node versions older than 22.22.3 and odd-numbered releases. With nvm:

```bash
nvm install 24.22.3
nvm use 24.22.3
```

> npm 10.9 is known to crash while installing this dependency tree. Use npm 11.

## Getting started

```bash
# 1. Clone and enter the project
git clone <repository-url>
cd assignment-techkraftinc

# 2. Install dependencies (uses package-lock.json)
npm ci

# 3. Start the dev server
npm start
```

Open <http://localhost:4200> and sign in with one of the [mock credentials](#mock-credentials).

The mock data is held in memory and **resets when you reload the page**. Auth tokens are also kept in memory only, so a reload means signing in again.

## Available scripts

| Command                | Description                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `npm start`            | Start the dev server at `http://localhost:4200` with live reload                       |
| `npm run build`        | Production build to `dist/`                                                            |
| `npm run watch`        | Development build in watch mode                                                        |
| `npm test`             | Run unit tests with Vitest in watch mode                                               |
| `npm run test:ci`      | Run tests once with coverage and enforce coverage thresholds                           |
| `npm run lint`         | Run ESLint (angular-eslint rules)                                                      |
| `npm run format`       | Format `src/` with Prettier                                                            |
| `npm run format:check` | Check formatting without writing changes                                               |
| `npm run typecheck`    | Type-check app and spec sources with `tsc --noEmit`                                    |
| `npm run csp:check`    | Check the production build in `dist/` against the Content Security Policy              |
| `npm run verify`       | Full pipeline: lint → format check → type-check → tests + coverage → build → CSP check |

## Mock credentials

All accounts use the password **`Passw0rd!`**.

| Username                 | Role     |
| ------------------------ | -------- |
| `sales1`, `sales2`       | SALES    |
| `reviewer1`, `reviewer2` | REVIEWER |
| `admin`                  | ADMIN    |

All seed data is synthetic (fictional names, `example.com` emails, deliberately invalid identifiers). There is no real personal or payment data.

## Developer tools

In development builds (`npm start`) the toolbar shows a **Developer tools** button (wrench icon). It controls the mock backend so you can trigger edge cases on demand:

| Action                   | Effect                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| **Expire access token**  | Invalidates the current access token. The next requests get 401 and go through token refresh. |
| **Fail next 3 requests** | The mock server returns errors for the next three API calls, to show error and retry states.  |

Access tokens also expire on their own after 30 seconds. The menu is hidden in production builds.

### Seeing the single token refresh

1. Sign in as `admin`.
2. Developer tools → **Expire access token**.
3. Change any dashboard filter. Several requests are sent at once with the expired token.
4. They all get 401, share **one** `POST /auth/refresh`, and are retried with the new token. The page loads normally.

The mock backend answers in-process, so these calls don't appear in the browser's Network tab. The behaviour is covered by `src/app/core/auth/auth.interceptor.spec.ts`.

## Project structure

```
.
├── .github/workflows/ci.yml      CI pipeline
├── public/                       Static assets copied as-is
├── scripts/check-csp.mjs         CSP check for the production build
├── src/
│   ├── index.html                Entry HTML (includes the CSP meta tag)
│   ├── main.ts                   Application bootstrap
│   ├── styles.scss               Global styles and Material 3 theme
│   ├── styles/                   SCSS breakpoints and utilities
│   ├── environments/             Build-time configuration
│   └── app/
│       ├── app.config.ts         Providers: router, HttpClient, interceptors, zoneless CD
│       ├── app.routes.ts         Top-level routes (lazy-loaded)
│       ├── core/
│       │   ├── auth/             AuthStore, auth interceptor, guards, auth service
│       │   ├── domain/           Framework-free models and policy functions
│       │   ├── http/             Error interceptor, API envelope types
│       │   ├── layout/           App shell, viewport (BreakpointObserver), 404 page
│       │   ├── mock/             In-memory DB, request handlers, mock backend interceptor
│       │   ├── notifications/    Snackbar service (lazy-loaded)
│       │   └── permissions/      Permission service
│       ├── shared/               Validators, form helpers, reusable UI components
│       └── features/
│           ├── auth/login/       Login page
│           └── applications/     Lazy feature: routes, pages, components, services, wizard logic
├── angular.json                  Workspace, build, test and budget configuration
├── eslint.config.js              ESLint flat config
├── vitest-base.config.mts        Vitest coverage settings
└── tsconfig*.json                TypeScript configuration (strict)
```

Naming conventions: one component per folder (`name.ts`, `name.html`, `name.scss`, `name.spec.ts`); HTTP calls only in `*.service.ts` files, which return `Observable`s; tests live next to the code they cover.

## Technical requirements coverage

| Requirement                                                                           | Implementation                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Angular 20+, standalone components, `@if` / `@for`                                    | No NgModules or structural directives. Enforced by `prefer-standalone` and `prefer-control-flow` lint rules                                                          |
| Signals, `inject()`, RxJS                                                             | Signals for state; RxJS for token refresh (`shareReplay`), debounced search, autosave queue (`debounceTime` → `concatMap`), async validation (`timer` + `switchMap`) |
| Reactive Forms with custom validation and draft saving                                | `shared/validators/merchant-validators.ts` (sync, cross-field, async); `features/applications/wizard/` (debounced autosave, restore, discard)                        |
| Angular Material with responsive SCSS                                                 | M3 theme in `src/styles.scss`, breakpoints in `src/styles/_breakpoints.scss` (600 / 960 / 1280 px), CDK `BreakpointObserver` in `core/layout/viewport.ts`            |
| Router with lazy-loaded features and guards                                           | `app.routes.ts`, `features/applications/applications.routes.ts`; `authGuard`, `guestGuard`, `roleGuard` (`canMatch`), `unsavedChangesGuard` (`canDeactivate`)        |
| HTTP interceptor: bearer token, single `POST /auth/refresh` on concurrent 401s, retry | `core/auth/auth.interceptor.ts`, `core/auth/auth-store.ts`; mock endpoints in `core/mock/mock-backend.interceptor.ts`                                                |
| Vitest + Angular TestBed                                                              | `*.spec.ts` files run through `@angular/build:unit-test`                                                                                                             |

## Testing

```bash
npm test            # watch mode
npm run test:ci     # single run with coverage
```

- Runner: Vitest via the Angular unit-test builder, with jsdom and zoneless TestBed.
- Material components are driven through the official component harnesses (`MatTableHarness`, `MatSelectHarness`, `MatStepperHarness`, …).
- HTTP is tested with `HttpTestingController` and against the mock backend for integration specs.
- Coverage reports are written to `coverage/` (text summary, HTML, lcov).

**Coverage thresholds** (the run fails below these):

| Scope           | Lines | Statements | Functions | Branches |
| --------------- | :---: | :--------: | :-------: | :------: |
| Overall         | 80 %  |    80 %    |   80 %    |   75 %   |
| `src/app/core/` | 90 %  |    90 %    |   90 %    |   85 %   |

Key specs:

| File                                                         | Covers                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `core/auth/auth.interceptor.spec.ts`                         | Concurrent 401s → exactly one refresh → all retried; refresh failure → logout |
| `core/auth/auth.guards.spec.ts`                              | Auth, guest and role guards                                                   |
| `shared/validators/merchant-validators.spec.ts`              | Sync, cross-field and async validators                                        |
| `features/applications/wizard/draft-save-queue.spec.ts`      | Serialized autosave, coalescing, retry, flush                                 |
| `features/applications/wizard/unsaved-changes.guard.spec.ts` | `canDeactivate` behaviour                                                     |
| `core/mock/application-handlers.spec.ts`                     | Mock API contract                                                             |

## Code quality

- **TypeScript strict mode**; `any` is banned by lint.
- **ESLint** (`eslint.config.js`) with angular-eslint and typescript-eslint, including bans on `*ngIf` / `*ngFor`, decorator-based inputs and outputs, and non-standalone components.
- **Prettier** (`.prettierrc`) for formatting; **EditorConfig** for editor defaults.
- **CI** (`.github/workflows/ci.yml`) runs lint, format check, type-check, tests with coverage and the production build on pushes to `main` and on pull requests.

Run everything locally before committing:

```bash
npm run verify
```

## Build and deployment

```bash
npm run build       # output in dist/
npm run csp:check   # optional: confirm the build is CSP-compliant
```

The output is a static site. Serve the browser build folder in `dist/` from any static host, with a fallback to `index.html` for client-side routes.

Production build notes:

- Initial bundle budget: warning at 500 kB, error at 1 MB. Component styles: warning at 4 kB.
- Critical-CSS and font inlining are turned off in production so the build emits no inline scripts and works under a strict `script-src 'self'` policy.

## Configuration

Build-time settings live in `src/environments/`:

| File                         | Used by                        | `production` | `useMockBackend` |
| ---------------------------- | ------------------------------ | :----------: | :--------------: |
| `environment.development.ts` | `ng serve`, development builds |   `false`    |      `true`      |
| `environment.ts`             | production builds              |    `true`    |      `true`      |

`apiBaseUrl` is empty because the mock backend serves all requests. To point the app at a real API, set `apiBaseUrl` and `useMockBackend: false`. No `.env` files or secrets are needed.

## Security notes

- **Content Security Policy** is set in a meta tag in `src/index.html`: `script-src 'self'` with no `unsafe-inline` or `unsafe-eval`. `style-src` allows `'unsafe-inline'` because Angular and Material inject component styles at runtime. Behind a real server the CSP should be sent as an HTTP header with a nonce (`ngCspNonce`).
- **Tokens** are kept in memory only and attached by the auth interceptor to the app's own `/api` requests. A production app should keep the refresh token in an httpOnly, SameSite cookie.
- **The mock backend runs in the browser**, so it is not a security boundary. Route guards are UX only; a real API must enforce the same rules.

## Known limitations

- No end-to-end tests (for example Playwright) and no automated accessibility scan.
- Data and sessions reset on page reload because the mock backend is in memory.
- Token refresh is reactive (on 401) only; there is no proactive refresh before expiry.
- No internationalisation; dates use the browser locale.
