import { createClient } from "@supabase/supabase-js";
import { HermesClient } from "@intheloop-studio/hermes-remote-react";
import { createDemoFetch } from "@intheloop-studio/hermes-remote-examples-demo";

const API_URL = import.meta.env["VITE_HERMES_API_URL"] as string | undefined;
const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

/**
 * Without VITE_HERMES_API_URL the app runs on built-in demo data: a fake
 * server in the browser with canned replies. It says so on screen.
 */
export const DEMO = API_URL === undefined || API_URL === "";

export const supabase =
  !DEMO && SUPABASE_URL !== undefined && SUPABASE_ANON_KEY !== undefined
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

export const client = new HermesClient({
  baseUrl: DEMO ? "https://demo.invalid" : (API_URL as string),
  ...(DEMO ? { fetch: createDemoFetch() } : {}),
  ...(supabase === null
    ? {}
    : {
        tokenProvider: async () =>
          (await supabase.auth.getSession()).data.session?.access_token ?? "",
      }),
});
