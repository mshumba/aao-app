import { AuthError, AuthErrorCode } from "./types";

/** What went wrong and what to do next, in the viewer's terms. */
const messages: Record<AuthErrorCode, string> = {
  invalid_credentials: "That email and password don’t match. Check them, or sign in with a code instead.",
  email_taken: "An account already uses this email. Sign in instead.",
  email_not_confirmed: "Confirm your email first. We can send you a new code.",
  weak_password: "Choose a stronger password: at least 8 characters.",
  same_password: "That’s already your password. Choose a different one.",
  invalid_email: "Enter an email address like name@example.com.",
  invalid_code: "That code isn’t right. Check the latest email and try again.",
  expired_code: "That code has expired. Send a new one.",
  other_device:
    "This link only works on the device where you asked for it. Open it there, or enter the 6-digit code from the email instead.",
  rate_limited: "Too many attempts. Wait a minute, then try again.",
  network: "You seem to be offline. Check your connection and try again.",
  provider_unavailable: "That sign-in option isn’t available right now. Try another way.",
  not_configured: "Accounts aren’t available in this build yet.",
  unknown: "Something went wrong. Try again in a moment.",
};

export function authMessage(error: unknown) {
  const code = error instanceof AuthError ? error.code : "unknown";
  return messages[code];
}

export function errorCode(error: unknown): AuthErrorCode {
  return error instanceof AuthError ? error.code : "unknown";
}

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
