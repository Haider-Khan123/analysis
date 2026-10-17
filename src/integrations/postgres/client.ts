// Browser-side auth + file upload client (replaces the Supabase JS client).
// Sessions are kept in localStorage; the access token is attached to every
// server-function call by ./auth-attacher.ts.
import {
  exchangeRecoveryTokenFn,
  requestPasswordResetFn,
  signInWithPasswordFn,
  signUpFn,
  updatePasswordFn,
} from "@/lib/auth.functions";

export type User = {
  id: string;
  email: string;
  user_metadata: Record<string, string | number | boolean | null>;
  created_at: string;
};
export type Session = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: User;
};
export type AuthChangeEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED" | "PASSWORD_RECOVERY";
type Listener = (event: AuthChangeEvent, session: Session | null) => void;

const STORAGE_KEY = "classflow.auth.session";
const listeners = new Set<Listener>();
let recoveryPromise: Promise<void> | null = null;

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.expires_at || s.expires_at * 1000 < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  if (typeof window === "undefined") return;
  try {
    if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function emit(event: AuthChangeEvent, session: Session | null) {
  for (const l of listeners) {
    try {
      l(event, session);
    } catch (e) {
      console.error(e);
    }
  }
}

/** Invite / recovery links land on /reset-password#type=...&recovery_token=... */
function handleRecoveryLink(): Promise<void> {
  if (recoveryPromise) return recoveryPromise;
  recoveryPromise = (async () => {
    if (typeof window === "undefined") return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("recovery_token");
    if (!token) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const res = await exchangeRecoveryTokenFn({ data: { token } });
    if (res.session) {
      writeSession(res.session as Session);
      emit("PASSWORD_RECOVERY", res.session as Session);
    }
  })();
  return recoveryPromise;
}

const err = (message: string | null) => (message ? { message, name: "AuthError" } : null);

export const auth = {
  async getSession() {
    await handleRecoveryLink();
    return { data: { session: readSession() }, error: null };
  },

  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    void handleRecoveryLink();
    return { data: { subscription: { unsubscribe: () => { listeners.delete(cb); } } } };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const res = await signInWithPasswordFn({ data: { email, password } });
      if (!res.session) return { data: { session: null, user: null }, error: err(res.error ?? "Unable to sign in") };
      const session = res.session as Session;
      writeSession(session);
      emit("SIGNED_IN", session);
      return { data: { session, user: session.user }, error: null };
    } catch (e) {
      return { data: { session: null, user: null }, error: err(e instanceof Error ? e.message : String(e)) };
    }
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { full_name?: string }; emailRedirectTo?: string } }) {
    try {
      const res = await signUpFn({ data: { email, password, fullName: options?.data?.full_name } });
      if (!res.session) return { data: { session: null, user: null }, error: err(res.error ?? "Unable to sign up") };
      const session = res.session as Session;
      writeSession(session);
      emit("SIGNED_IN", session);
      return { data: { session, user: session.user }, error: null };
    } catch (e) {
      return { data: { session: null, user: null }, error: err(e instanceof Error ? e.message : String(e)) };
    }
  },

  async signOut() {
    writeSession(null);
    emit("SIGNED_OUT", null);
    return { error: null };
  },

  async updateUser({ password }: { password: string }) {
    try {
      const res = await updatePasswordFn({ data: { password } });
      if (res.error) return { data: { user: null }, error: err(res.error) };
      const s = readSession();
      emit("USER_UPDATED", s);
      return { data: { user: res.user }, error: null };
    } catch (e) {
      return { data: { user: null }, error: err(e instanceof Error ? e.message : String(e)) };
    }
  },

  async resetPasswordForEmail(email: string, opts?: { redirectTo?: string }) {
    try {
      await requestPasswordResetFn({ data: { email, redirectTo: opts?.redirectTo } });
      return { data: {}, error: null };
    } catch (e) {
      return { data: null, error: err(e instanceof Error ? e.message : String(e)) };
    }
  },
};

export function getAccessToken(): string | null {
  return readSession()?.access_token ?? null;
}

/** Upload / remove files in a storage bucket via /api/storage. */
export const storage = {
  from(bucket: string) {
    const headers = (): Record<string, string> => {
      const t = getAccessToken();
      return t ? { Authorization: `Bearer ${t}` } : {};
    };
    const url = (name: string) => `/api/storage/${bucket}/${name.split("/").map(encodeURIComponent).join("/")}`;
    return {
      async upload(name: string, file: Blob, opts?: { contentType?: string; upsert?: boolean }) {
        const res = await fetch(url(name), {
          method: "POST",
          headers: { ...headers(), "content-type": opts?.contentType || file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) return { data: null, error: { message: (await res.text()) || "Upload failed" } };
        return { data: { path: name }, error: null };
      },
      async remove(names: string[]) {
        for (const n of names) await fetch(url(n), { method: "DELETE", headers: headers() });
        return { data: null, error: null };
      },
    };
  },
};
