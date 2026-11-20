import { AuthUser } from '../domain/user.model';

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch ms */
  readonly expiresAt: number;
}

export interface AuthSession {
  readonly tokens: AuthTokens;
  readonly user: AuthUser;
}

export interface LoginRequest {
  readonly username: string;
  readonly password: string;
}

export interface RefreshRequest {
  readonly refreshToken: string;
}
