import { HermesClient } from "@in-th3-l00p/hermes-remote-client";

export const SANDBOX_KEY = "hk_sandb0x.live-examples-public-token";

export const baseUrl: string =
  (import.meta.env["VITE_HERMES_API_URL"] as string | undefined) ??
  "/api/hermes";

/** Anonymous client: chat, own sessions, runs. */
export const client = new HermesClient({ baseUrl });

/** Sandbox-key client: management surfaces (public demo credential). */
export const keyedClient = new HermesClient({ baseUrl, token: SANDBOX_KEY });
