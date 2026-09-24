import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Star } from "./Star.tsx";

type Result = { error: { message: string } | null };

/** Sign-in: GitHub, an emailed code, or a guest identity. */
export function AuthGate({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<Result>) => {
    setBusy(true);
    setError(null);
    const { error: failure } = await action();
    setBusy(false);
    if (failure !== null) {
      setError(failure.message);
    }
  };

  return (
    <main className="gate">
      <div className="gate-card">
        <h1 className="gate-title">
          <Star /> Sign in to chat
        </h1>
        <p className="muted">The agent is told who it's talking to, so it needs an identity.</p>
        <button
          type="button"
          className="button primary wide"
          disabled={busy}
          onClick={() =>
            void run(() =>
              supabase.auth.signInWithOAuth({
                provider: "github",
                options: { redirectTo: window.location.origin },
              }),
            )
          }
        >
          Continue with GitHub
        </button>
        <form
          className="gate-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (!codeSent) {
                const res = await supabase.auth.signInWithOtp({ email });
                if (res.error === null) {
                  setCodeSent(true);
                }
                return res;
              }
              return supabase.auth.verifyOtp({ email, token: code, type: "email" });
            });
          }}
        >
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            disabled={codeSent}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {codeSent && (
            <>
              <label htmlFor="code">The code we emailed you</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </>
          )}
          <button type="submit" className="button wide" disabled={busy || !email.includes("@")}>
            {codeSent ? "Sign in" : "Email me a code"}
          </button>
          {codeSent && (
            <button type="button" className="link" onClick={() => setCodeSent(false)}>
              Use a different email
            </button>
          )}
        </form>
        <button
          type="button"
          className="link"
          disabled={busy}
          onClick={() => void run(() => supabase.auth.signInAnonymously())}
        >
          Continue as a guest
        </button>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
