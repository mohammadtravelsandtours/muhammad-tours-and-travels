export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  /** Phase 14: mandatory for new registrations — see the User.phoneNumber schema comment for why existing accounts can still have it unset. */
  phoneNumber: string;
  address?: string;
  /** Which actor record to create alongside the user — Phase 1 supports these two self-serve paths. */
  accountType: 'B2C_CUSTOMER' | 'B2B_AGENT';
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

/** Returned by POST /auth/login in place of tokens when the account has 2FA enabled — the caller must complete POST /auth/2fa/verify with this token + a code before it gets real tokens. */
export interface TwoFactorChallengeResponse {
  twoFactorRequired: true;
  twoFactorToken: string;
}

export type LoginResult = (AuthTokens & { user: AuthenticatedUser }) | TwoFactorChallengeResponse;

export interface TwoFactorSetup {
  secret: string;
  /** otpauth:// URI for a QR-code app — this codebase has no QR-image library, so setup UIs show this as text plus `secret` for manual entry. */
  otpauthUri: string;
  /** Shown to the operator exactly once, at setup time — only hashed copies are kept server-side afterward. */
  backupCodes: string[];
}

export interface SessionRow {
  id: string;
  deviceLabel: string | null;
  issuedAt: string;
  expiresAt: string;
}
