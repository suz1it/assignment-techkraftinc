// Generic HTTP API envelopes, independent of any one resource.

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly size: number;
}

/** Error body returned by the API (400/403/404/409). */
export interface ApiErrorBody {
  readonly message: string;
  readonly errors?: readonly string[];
}
