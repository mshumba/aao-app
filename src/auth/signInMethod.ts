import type { Session, UserIdentity } from "@supabase/supabase-js";
import type { Provider } from "./types";

// Token methods that mean an email address: a password, an emailed code or
// link, or the code that confirmed a sign-up or reset. Apple and Google are
// both "oauth".
const EMAIL_METHODS = ["password", "otp", "magiclink", "email/signup", "recovery", "invite"];

type Method = { method: string; at: number | null };

/** The newest sign-in method in the session's access token, if it can be read. */
function tokenMethod(token: string): Method | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { amr } = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))) as {
      amr?: ({ method: string; timestamp?: number } | string)[];
    };
    const methods: Method[] = (amr ?? []).map((entry) =>
      typeof entry === "string"
        ? { method: entry, at: null }
        : { method: entry.method, at: entry.timestamp ? entry.timestamp * 1000 : null },
    );
    return methods.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0] ?? null;
  } catch {
    return null;
  }
}

const usedAt = (identity: UserIdentity) =>
  Date.parse(identity.last_sign_in_at ?? identity.updated_at ?? identity.created_at ?? "") || 0;

const asProvider = (name: string | undefined): Provider =>
  name === "apple" || name === "google" ? name : "email";

/**
 * How this session signed in, for "Signed in with Apple". One account can
 * have several ways in (made with Google on the web, then Apple on an iPhone
 * with the same email), and app_metadata.provider only names the first. The
 * access token says whether this session used email or Apple/Google, and
 * when; of the account's linked identities, the one last used nearest that
 * moment says which (the latest, without a time). app_metadata.provider is
 * the last resort.
 */
export function signInMethod(session: Pick<Session, "access_token" | "user">): Provider {
  const { user } = session;
  const token = tokenMethod(session.access_token);
  if (token && EMAIL_METHODS.includes(token.method)) return "email";
  const identities = (user.identities ?? []).filter(
    (identity) => token?.method !== "oauth" || identity.provider !== "email",
  );
  const distance = (identity: UserIdentity) =>
    token?.at ? Math.abs(usedAt(identity) - token.at) : -usedAt(identity);
  const [nearest] = [...identities].sort((a, b) => distance(a) - distance(b));
  return asProvider(nearest?.provider ?? (user.app_metadata?.provider as string | undefined));
}
