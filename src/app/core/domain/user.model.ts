// Canonical user model. Framework-independent: shared by the UI, the policies and the mock API.

export const ROLES = ['SALES', 'REVIEWER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** The signed-in user, as the server describes them. */
export interface AuthUser {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
}

/** A lightweight reference to a user (actor, creator, reviewer). */
export interface UserRef {
  readonly id: string;
  readonly name: string;
}
