import type { CategoryId } from "../data/categories";

export type Provider = "apple" | "google" | "email";

export type AuthUser = {
  id: string;
  email: string | null;
  /** How this session signed in (an account may have other ways in). */
  provider: Provider;
  /** An Apple ID is linked to the account, however this session signed in. */
  appleLinked: boolean;
};

export type Profile = {
  displayName: string | null;
  interests: CategoryId[];
  /** ISO time onboarding was finished on this account, if it was. */
  onboardedAt: string | null;
};

export type ProfileChanges = Partial<Profile>;

/** How far the viewer got through a sermon, kept with their account. */
export type WatchProgress = {
  sermonId: string;
  /** Where to resume, in whole seconds. */
  positionSeconds: number;
  /** The video's length when last saved, in whole seconds. */
  durationSeconds: number;
  /** Watched to (or near) the end, so it starts from the beginning again. */
  finished: boolean;
  /** ISO time of the last save. */
  updatedAt: string;
};

export type ProgressUpdate = Omit<WatchProgress, "updatedAt">;

/**
 * What guests may watch without an account, set remotely so it can change
 * without a new build (for example if App Review asks for open playback):
 * "shared" — only sermons opened from a shared link (the default);
 * "all" — everything; "none" — nothing.
 */
export type GuestWatch = "shared" | "all" | "none";

/** What a sign-in or sign-up step led to. */
export type AuthResult =
  /**
   * Signed in. `recovery` marks a sign-in from a password-reset link, which
   * should go on to choosing a new password. `name` is the name Apple shares
   * on the first sign-in only, for the account's profile.
   */
  | { status: "signedIn"; recovery?: boolean; name?: string }
  /** An email with a 6-digit code was sent; verify it to finish. */
  | { status: "codeSent"; email: string; purpose: CodePurpose }
  /** The viewer closed Apple's or Google's sheet. Not an error. */
  | { status: "cancelled" };

/**
 * Why a code was emailed. Supabase verifies each with a matching OTP type:
 * sign-in (passwordless), confirming a new password account, or a reset.
 */
export type CodePurpose = "sign-in" | "confirm" | "recovery";

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "email_not_confirmed"
  | "weak_password"
  | "same_password"
  | "invalid_email"
  | "invalid_code"
  | "expired_code"
  /** An email link opened on another device or browser than it was asked for on. */
  | "other_device"
  | "rate_limited"
  | "network"
  | "provider_unavailable"
  | "not_configured"
  | "unknown";

export class AuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

/**
 * Everything the app needs from an account service. Supabase implements it
 * for real accounts; a local stand-in implements it for development and the
 * automated tests when no Supabase project is configured.
 */
export interface AuthBackend {
  kind: "supabase" | "local";
  /** The signed-in user from storage, if a session survives. */
  restore(): Promise<AuthUser | null>;
  /** Called on every sign-in, sign-out and token refresh. */
  subscribe(listener: (user: AuthUser | null) => void): () => void;

  signUpWithPassword(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<AuthResult>;
  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  /** Emails a 6-digit sign-in code, creating the account when needed. */
  sendEmailCode(email: string): Promise<AuthResult>;
  verifyCode(email: string, code: string, purpose: CodePurpose): Promise<AuthResult>;
  resendCode(email: string, purpose: CodePurpose): Promise<void>;
  signInWithApple(): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult>;
  /**
   * Finishes a sign-in that came back through a link (an email link, or a
   * web redirect from Apple/Google) carrying a PKCE code. Says when the link
   * was a password reset.
   */
  exchangeCode(code: string): Promise<AuthResult>;
  /** Emails a reset code. Succeeds whether or not the address has an account. */
  sendPasswordReset(email: string): Promise<AuthResult>;
  /** Needs a recent sign-in (a verified recovery code counts). */
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Permanently deletes the account and everything stored with it. */
  deleteAccount(): Promise<void>;

  /** The remote guest-watch setting, or null when it isn't set. */
  getGuestWatch(): Promise<GuestWatch | null>;
  getProfile(userId: string): Promise<Profile>;
  updateProfile(userId: string, changes: ProfileChanges): Promise<void>;
  listSaved(userId: string): Promise<string[]>;
  setSaved(userId: string, sermonId: string, saved: boolean): Promise<void>;
  /** The account's watch progress, most recently watched first. */
  listProgress(userId: string): Promise<WatchProgress[]>;
  /** Records where the viewer is in a sermon, replacing what was there. */
  saveProgress(userId: string, progress: ProgressUpdate): Promise<void>;
}
