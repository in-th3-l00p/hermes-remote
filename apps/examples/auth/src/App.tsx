import { useEffect, useMemo, useState } from "react";
import { HermesClient, HermesApiError } from "@intheloop-studio/hermes-remote-client";
import { API_KEY, baseUrl, demoFetch } from "./lib/client.ts";
import { Panel, Shell } from "./lib/ui.tsx";

type PrincipalKind = "anonymous" | "user" | "api_key";

interface UserSession {
  token: string;
  sub: string;
  email: string;
}

/**
 * A signed-in user is a bearer JWT. A real deployment gets this token from an
 * identity provider (Supabase, Clerk, or any JWT issuer) through the client's
 * tokenProvider. This example mints one in the browser so it runs on its own,
 * with no provider to sign up for; the in-page backend reads the same sub and
 * email claims a real server would verify.
 */
function mintUserToken(sub: string, email: string): string {
  const encode = (value: unknown): string =>
    btoa(JSON.stringify(value)).replace(/=+$/, "");
  const header = encode({ alg: "none", typ: "JWT" });
  const payload = encode({ sub, email });
  return `${header}.${payload}.demo`;
}

// The signed-in token, read live by the user client's tokenProvider.
let currentToken = "";

interface ProbeResult {
  path: string;
  status: number | "…";
}

const PROBES = ["/v1/auth/whoami", "/v1/models", "/v1/memory", "/v1/agent/status", "/v1/jobs"];

function clientFor(kind: PrincipalKind): HermesClient {
  if (kind === "anonymous") {
    return new HermesClient({ baseUrl, fetch: demoFetch });
  }
  if (kind === "api_key") {
    return new HermesClient({ baseUrl, token: API_KEY, fetch: demoFetch });
  }
  return new HermesClient({
    baseUrl,
    fetch: demoFetch,
    tokenProvider: async () => currentToken,
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

const DEMO_USER = { sub: "user_9f2c1a", email: "developer@example.com" };

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [kind, setKind] = useState<PrincipalKind>("anonymous");
  const [refreshKey, setRefreshKey] = useState(0);

  const signIn = () => {
    const token = mintUserToken(DEMO_USER.sub, DEMO_USER.email);
    currentToken = token;
    setSession({ token, ...DEMO_USER });
    setKind("user");
    setRefreshKey((k) => k + 1);
  };

  const signOut = () => {
    currentToken = "";
    setSession(null);
    setKind("anonymous");
    setRefreshKey((k) => k + 1);
  };

  const claims = session === null ? null : { sub: session.sub, email: session.email };

  return (
    <Shell
      title="auth"
      slug="auth"
      blurb="Three principals (anonymous, signed-in user, API key) and what each may touch."
    >
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
                ? "no token, per-IP identity, tier 1"
                : option === "user"
                  ? "user JWT via tokenProvider, tier 1 plus owned sessions"
                  : "API key with management scopes"}
            </p>
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="sign in">
          {session === null ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-zinc-500 text-xs">
                Signs you in as a demo user. The client attaches the token
                through its tokenProvider on every request.
              </p>
              <div>
                <button className="btn btn-primary" onClick={signIn}>
                  sign in as a user
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-zinc-300">
                signed in as{" "}
                <span className="font-mono text-xs">{session.email}</span>
              </p>
              <div>
                <button className="btn" onClick={signOut}>
                  sign out
                </button>
              </div>
              {claims === null ? null : (
                <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
                  {JSON.stringify(claims, null, 2)}
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
