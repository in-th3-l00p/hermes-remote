import { useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import { HermesClient, HermesApiError } from "@in-th3-l00p/hermes-remote-client";
import { baseUrl, SANDBOX_KEY } from "./lib/client.ts";
import { ErrorNote, Panel, Shell } from "./lib/ui.tsx";

const supabase = createClient(
  import.meta.env["VITE_SUPABASE_URL"] as string,
  import.meta.env["VITE_SUPABASE_ANON_KEY"] as string,
);

type PrincipalKind = "anonymous" | "user" | "api_key";

interface ProbeResult {
  path: string;
  status: number | "…";
}

const PROBES = ["/v1/auth/whoami", "/v1/models", "/v1/memory", "/v1/agent/status", "/v1/jobs"];

function clientFor(kind: PrincipalKind): HermesClient {
  if (kind === "anonymous") {
    return new HermesClient({ baseUrl });
  }
  if (kind === "api_key") {
    return new HermesClient({ baseUrl, token: SANDBOX_KEY });
  }
  return new HermesClient({
    baseUrl,
    tokenProvider: async () =>
      (await supabase.auth.getSession()).data.session?.access_token ?? "",
  });
}

function ScopeTable(props: { kind: PrincipalKind; enabled: boolean }) {
  const [rows, setRows] = useState<ProbeResult[]>([]);
  const probe = useMemo(() => clientFor(props.kind), [props.kind]);

  useEffect(() => {
    if (!props.enabled) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(PROBES.map((path) => ({ path, status: "…" })));
    void Promise.all(
      PROBES.map(async (path): Promise<ProbeResult> => {
        try {
          await probe.request("GET", path);
          return { path, status: 200 };
        } catch (cause) {
          return {
            path,
            status: cause instanceof HermesApiError ? cause.status : 0,
          };
        }
      }),
    ).then((results) => {
      if (!cancelled) {
        setRows(results);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [probe, props.enabled]);

  return (
    <table className="w-full text-left text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.path} className="border-b border-zinc-800/60">
            <td className="py-1 font-mono text-xs text-zinc-400">{row.path}</td>
            <td
              className={
                "py-1 text-right font-mono text-xs " +
                (row.status === 200
                  ? "text-emerald-400"
                  : row.status === "…"
                    ? "text-zinc-500"
                    : "text-red-400")
              }
            >
              {row.status === 200 ? "200 allowed" : row.status === "…" ? "…" : `${row.status} denied`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Whoami(props: { kind: PrincipalKind; refreshKey: number }) {
  const [body, setBody] = useState<string>("…");
  useEffect(() => {
    void clientFor(props.kind)
      .request("GET", "/v1/auth/whoami")
      .then((value) => setBody(JSON.stringify(value, null, 2)))
      .catch((cause) => setBody(String(cause)));
  }, [props.kind, props.refreshKey]);
  return (
    <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
      {body}
    </pre>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [kind, setKind] = useState<PrincipalKind>("anonymous");
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setRefreshKey((k) => k + 1);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signInAnonymously = async () => {
    setError(null);
    const { error: cause } = await supabase.auth.signInAnonymously();
    if (cause !== null) {
      setError(cause.message);
    } else {
      setKind("user");
    }
  };

  const signInGithub = async () => {
    setError(null);
    const { error: cause } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.href },
    });
    if (cause !== null) {
      setError(cause.message);
    }
  };

  const claims = session?.access_token
    ? JSON.parse(atob(session.access_token.split(".")[1] ?? "")) as Record<string, unknown>
    : null;

  return (
    <Shell
      title="auth"
      slug="auth"
      blurb="Three principals — anonymous, Supabase user, API key — and what each may touch."
    >
      <ErrorNote error={error} />
      <div className="grid gap-4 md:grid-cols-3">
        {(["anonymous", "user", "api_key"] as const).map((option) => (
          <button
            key={option}
            className={
              "card p-4 text-left transition-colors " +
              (kind === option ? "border-zinc-400" : "hover:border-zinc-600")
            }
            onClick={() => setKind(option)}
          >
            <p className="font-medium">{option.replace("_", " ")}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {option === "anonymous"
                ? "no token — per-IP identity, tier 1"
                : option === "user"
                  ? "Supabase JWT via tokenProvider, tier 1 + owned sessions"
                  : "public sandbox key with management scopes"}
            </p>
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="sign in (supabase)">
          {session === null ? (
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => void signInAnonymously()}>
                anonymous sign-in
              </button>
              <button className="btn" onClick={() => void signInGithub()}>
                github oauth
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-zinc-300">
                signed in as{" "}
                <span className="font-mono text-xs">
                  {session.user.email ?? session.user.id}
                </span>
              </p>
              <div className="flex gap-2">
                <button className="btn" onClick={() => void supabase.auth.signOut()}>
                  sign out
                </button>
              </div>
              {claims === null ? null : (
                <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
                  {JSON.stringify(
                    { sub: claims["sub"], email: claims["email"], is_anonymous: claims["is_anonymous"], exp: claims["exp"] },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          )}
        </Panel>
        <Panel title={`whoami as ${kind.replace("_", " ")}`}>
          <Whoami kind={kind} refreshKey={refreshKey} />
        </Panel>
      </div>
      <Panel title={`scope probes as ${kind.replace("_", " ")}`}>
        <p className="text-xs text-zinc-500">
          The same five requests, replayed with the selected principal. Tier-1
          reads pass for everyone; management surfaces demand an API key with
          the exact scope.
        </p>
        <ScopeTable kind={kind} enabled />
      </Panel>
    </Shell>
  );
}
