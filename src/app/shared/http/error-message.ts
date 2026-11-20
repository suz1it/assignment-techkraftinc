import { HttpErrorResponse } from '@angular/common/http';

/** A user-facing message for a failed request, preferring the server's own explanation. */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
    if (error.status === 0) return 'Network error. Check your connection.';
  }
  return fallback;
}

/** Field-level errors returned with a 400 (e.g. submit validation). */
export function errorList(error: unknown): string[] {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (
      typeof body === 'object' &&
      body !== null &&
      'errors' in body &&
      Array.isArray(body.errors)
    ) {
      return body.errors.filter((item): item is string => typeof item === 'string');
    }
  }
  return [];
}
