import { HermesClient } from "@intheloop-studio/hermes-remote-client";
import { createDemoFetch } from "@intheloop-studio/hermes-remote-examples-demo";

/** One in-page backend per page load; every client shares its state. */
export const demoFetch: typeof fetch = createDemoFetch();

export const baseUrl = "https://hermes.local";

/** API key for the management surfaces (verified by the in-page backend). */
export const API_KEY = "hk_wkstn.4f8c02d9b1e6a375";

/** Anonymous client: chat, own sessions, runs. */
export const client = new HermesClient({ baseUrl, fetch: demoFetch });

/** Keyed client: management surfaces. */
export const keyedClient = new HermesClient({
  baseUrl,
  token: API_KEY,
  fetch: demoFetch,
});
